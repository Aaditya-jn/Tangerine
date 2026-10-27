const { app, BrowserWindow, ipcMain, screen, shell, dialog, Tray, Menu, globalShortcut, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const settings = require('./settings');
const { getOptions, convert, mergePdfs } = require('./converter');

// Must match the StartupWMClass in the .desktop file (see build.sh) so the
// dock/taskbar can match the running window to the pinned launcher icon
// and show the "app is running" indicator dot.
app.setName('Tangerine');

const HOTKEY = 'CommandOrControl+Space';

// Electron's globalShortcut (used below) only works on X11 — Wayland's
// security model deliberately blocks background apps from grabbing
// system-wide keypresses, so on Wayland that registration silently does
// nothing useful. As a second, Wayland-compatible path: GNOME's own
// Settings → Keyboard → Custom Shortcuts *is* privileged enough to run an
// arbitrary command on a keypress, so we write our PID to a known file and
// listen for SIGUSR1. The GNOME shortcut then just runs
// `kill -USR1 $(cat ~/.config/tangerine/tangerine.pid)`.
const PID_DIR  = path.join(os.homedir(), '.config', 'tangerine');
const PID_FILE = path.join(PID_DIR, 'tangerine.pid');

let tray       = null;
let radialWin  = null;
let settingsWin= null;
let historyWin = null;
let toolWin    = null;
let history    = [];   // last 10 conversions

// Some conversions produce a single file (showItemInFolder highlights it in
// the file manager); others produce a folder of pages (pdf→img, split,
// extract) where there's nothing to highlight — just open that folder.
function revealOutput(p) {
  try {
    if (fs.statSync(p).isDirectory()) shell.openPath(p);
    else shell.showItemInFolder(p);
  } catch { /* path no longer exists — nothing to reveal */ }
}

// `revealPath` is optional: when given, clicking the notification locates
// the output (see revealOutput above), so you don't have to go hunting for
// where a conversion landed — this is the main fix for "we don't know
// where converted files are".
function notify(title, body, revealPath) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  if (revealPath) n.on('click', () => revealOutput(revealPath));
  n.show();
}

// ── Selected-file detection ─────────────────────────────────────
// There is no universal, stable D-Bus API across file managers (Nautilus,
// Nemo, Thunar, etc.) for "give me the currently selected file" — that
// doesn't actually exist as a reliable cross-desktop feature, so this
// doesn't pretend to call one. What *does* work reliably: file managers
// write a file reference to the clipboard the moment you press Ctrl+C on
// a file, in one of two standard formats. We read those; if neither is
// present (nothing was ever copied, or the clipboard holds something
// else), we fall back to a normal file picker.
function getSelectedFilePath() {
  // Format used by Nautilus/GNOME Files and several others:
  //   "copy\nfile:///home/user/thing.pdf"
  try {
    const buf = clipboard.readBuffer('x-special/gnome-copied-files');
    if (buf && buf.length) {
      const line = buf.toString('utf8').split('\n').find((l) => l.startsWith('file://'));
      if (line) {
        const p = decodeURIComponent(line.replace('file://', '').trim());
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* not present — fine, try the next format */ }

  // Standard freedesktop format (Thunar, Nemo, PCManFM, etc.):
  //   "file:///home/user/thing.pdf\r\n"
  try {
    const buf = clipboard.readBuffer('text/uri-list');
    if (buf && buf.length) {
      const line = buf.toString('utf8').split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('file://'));
      if (line) {
        const p = decodeURIComponent(line.replace('file://', ''));
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* not present — fall through to plain text / dialog */ }

  // Last resort: maybe a plain path/string was copied.
  const text = (clipboard.readText() || '').trim();
  if (text && fs.existsSync(text) && fs.statSync(text).isFile()) return text;

  return null;
}

// ── Global hotkey ────────────────────────────────────────────────
function onHotkey() {
  const cursor = screen.getCursorScreenPoint();
  const detected = getSelectedFilePath();

  if (detected) {
    createRadialWindow(cursor.x, cursor.y, detected);
    return;
  }

  // Nothing usable on the clipboard. This is almost always because a file
  // was clicked/selected but never actually copied — selecting a file
  // doesn't touch the clipboard, only Ctrl+C does. Say so explicitly
  // instead of just popping an unexplained file picker, which otherwise
  // looks like the app lost track of what you already picked.
  notify('No file copied', 'Press Ctrl+C on a file first, then Ctrl+Space — or pick one now.');
  dialog.showOpenDialog({ properties: ['openFile'] }).then((result) => {
    if (!result.canceled && result.filePaths[0]) {
      createRadialWindow(cursor.x, cursor.y, result.filePaths[0]);
    }
  });
}

// ── Tray ─────────────────────────────────────────────────────────
function createTray() {
  tray = new Tray(path.join(__dirname, '../assets/icon.png'));
  tray.setToolTip(`Tangerine — select a file, then press ${HOTKEY.replace('CommandOrControl', 'Ctrl')}`);
  const menu = Menu.buildFromTemplate([
    { label: 'Tangerine', enabled: false },
    { label: `Convert selected file (${HOTKEY.replace('CommandOrControl', 'Ctrl')})`, click: onHotkey },
    { type: 'separator' },
    { label: 'History', click: () => createHistoryWindow() },
    { label: 'Settings', click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}


// ── Radial menu ────────────────────────────────────────────────
function createRadialWindow(x, y, filePath) {
  if (radialWin) { radialWin.close(); radialWin = null; }

  const opts    = getOptions(path.extname(filePath).toLowerCase().replace('.', ''));
  const theme   = settings.load().radialTheme;
  const winSize = 520;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const wx = Math.min(Math.max(x - winSize / 2, 0), sw - winSize);
  const wy = Math.min(Math.max(y - winSize / 2, 0), sh - winSize);

  radialWin = new BrowserWindow({
    width: winSize, height: winSize, x: wx, y: wy,
    frame: false, alwaysOnTop: true, resizable: false,
    skipTaskbar: true, transparent: true,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  radialWin.loadFile(path.join(__dirname, 'renderer', 'radial.html'));
  radialWin.once('ready-to-show', () => {
    radialWin.webContents.send('init-radial', { filePath, options: opts.slice(0, 22), theme });
  });
  radialWin.on('blur',   () => { if (radialWin) { radialWin.close(); radialWin = null; } });
  radialWin.on('closed', () => { radialWin = null; });
}

// ── Focused image/PDF tools ─────────────────────────────────────
function createToolWindow(filePath, action) {
  if (toolWin) { toolWin.close(); toolWin = null; }
  if (radialWin) { radialWin.close(); radialWin = null; }

  const allowed = new Set(['__crop__', '__resize__', '__rotate__', '__compress__', '__pdfcompress__']);
  if (!allowed.has(action)) return;

  const pdfAction = action === '__pdfcompress__';
  const width = 820, height = 750;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const x = Math.round(area.x + Math.max(0, (area.width - width) / 2));
  const y = Math.round(area.y + Math.max(0, (area.height - height) / 2));
  let sizeBytes = 0;
  try { sizeBytes = fs.statSync(filePath).size; } catch { /* display size as unavailable */ }

  toolWin = new BrowserWindow({
    width, height, x, y, frame: false, alwaysOnTop: true,
    resizable: false, minimizable: false, maximizable: false,
    skipTaskbar: false, backgroundColor: '#201e24', show: false,
    title: pdfAction ? 'Tangerine — Compress PDF' : 'Tangerine — Image tools',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  toolWin.loadFile(path.join(__dirname, 'renderer', 'tool.html'));
  toolWin.webContents.once('did-finish-load', () => {
    toolWin.webContents.send('init-tool', {
      filePath,
      action,
      fileName: path.basename(filePath),
      sizeBytes,
      previewUrl: pdfAction ? null : pathToFileURL(filePath).href,
    });
    toolWin.show();
  });
  toolWin.on('closed', () => { toolWin = null; });
}

function friendlyToolName(action) {
  return ({
    '__crop__': 'Crop image', '__resize__': 'Resize image',
    '__rotate__': 'Rotate image', '__compress__': 'Compress image',
    '__pdfcompress__': 'Compress PDF'
  })[action] || action.replace(/__/g, '').replace(/_/g, ' ');
}

// ── Settings window ────────────────────────────────────────────
function createSettingsWindow() {
  if (settingsWin) { settingsWin.focus(); return; }

  settingsWin = new BrowserWindow({
    width: 360, height: 460,
    title: 'Tangerine Settings',
    resizable: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ── History window ─────────────────────────────────────────────
// A real, independently-sized window instead of an inline panel inside the
// fixed-size drop zone — the inline version's expanded content exceeded the
// drop window's bounds and was simply clipped off (looked "broken").
function createHistoryWindow() {
  if (historyWin) { historyWin.focus(); historyWin.webContents.send('history-update', history); return; }

  historyWin = new BrowserWindow({
    width: 340, height: 420,
    title: 'Tangerine — Recent Conversions',
    resizable: true,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  historyWin.loadFile(path.join(__dirname, 'renderer', 'history.html'));
  historyWin.webContents.once('did-finish-load', () => {
    historyWin.webContents.send('history-update', history);
  });
  historyWin.on('closed', () => { historyWin = null; });
}

// ── IPC ────────────────────────────────────────────────────────
ipcMain.on('convert', async (_, { filePath, targetFormat }) => {
  if (radialWin) { radialWin.close(); radialWin = null; }

  const cfg = settings.load();
  settings.ensureOutputFolder(cfg.outputFolder);

  const filename = path.basename(filePath);

  // Merge needs a second input before it can run at all — ask for the
  // other PDF(s) first, then merge for real with Ghostscript.
  if (targetFormat === '__pdfmerge__') {
    const result = await dialog.showOpenDialog({
      title: 'Choose PDF(s) to merge with ' + filename,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePaths.length) return; // user backed out, no error needed

    try {
      const outPath = await mergePdfs(filePath, result.filePaths, cfg.outputFolder);
      history.unshift({ filename, target: 'merge', outPath, time: Date.now() });
      if (history.length > 10) history.pop();
      if (historyWin) historyWin.webContents.send('history-update', history);
      notify('✓ Merged — click to locate', `${result.filePaths.length + 1} PDFs → ${path.basename(outPath)}\nSaved in ${path.dirname(outPath)}`, outPath);
      if (cfg.autoOpen) shell.openPath(outPath);
    } catch (err) {
      notify('✗ Merge failed', err.message);
    }
    return;
  }

  try {
    const outPath = await convert(filePath, targetFormat, cfg.outputFolder, cfg.imageQuality, () => {});

    history.unshift({
      filename,
      target: targetFormat.replace('__', '').replace('__', ''),
      outPath,
      time: Date.now()
    });
    if (history.length > 10) history.pop();

    if (historyWin) historyWin.webContents.send('history-update', history);
    notify(
      '✓ Converted — click to locate',
      `${filename} → ${path.basename(outPath)}\nSaved in ${path.dirname(outPath)}`,
      outPath
    );
    if (cfg.autoOpen) shell.openPath(outPath);

  } catch (err) {
    notify('✗ Conversion failed', `${filename}: ${err.message}`);
  }
});

ipcMain.on('open-tool', (_, { filePath, action }) => {
  if (!filePath || !fs.existsSync(filePath)) {
    notify('Tangerine', 'The selected file could not be found.');
    return;
  }
  createToolWindow(filePath, action);
});

ipcMain.on('close-tool', () => {
  if (toolWin) { toolWin.close(); toolWin = null; }
});

ipcMain.on('apply-tool', async (_, payload) => {
  const { filePath, action, options = {} } = payload || {};
  const allowed = new Set(['__crop__', '__resize__', '__rotate__', '__compress__', '__pdfcompress__']);
  if (!filePath || !fs.existsSync(filePath) || !allowed.has(action)) {
    if (toolWin) toolWin.webContents.send('tool-error', 'Invalid operation or missing input file.');
    return;
  }

  const inputExt = path.extname(filePath).toLowerCase();
  if (action === '__pdfcompress__' && inputExt !== '.pdf') {
    if (toolWin) toolWin.webContents.send('tool-error', 'PDF compression only works with PDF files.');
    return;
  }
  if (action !== '__pdfcompress__' && !['.jpg','.jpeg','.png','.webp','.gif','.bmp','.tiff','.ico','.avif'].includes(inputExt)) {
    if (toolWin) toolWin.webContents.send('tool-error', 'This tool does not support the selected file type.');
    return;
  }

  const cfg = settings.load();
  settings.ensureOutputFolder(cfg.outputFolder);
  const filename = path.basename(filePath);
  try {
    const outPath = await convert(
      filePath, action, cfg.outputFolder, cfg.imageQuality,
      pct => { if (toolWin && !toolWin.isDestroyed()) toolWin.webContents.send('tool-progress', pct); },
      options
    );
    const targetLabel = friendlyToolName(action);
    history.unshift({ filename, target: targetLabel, outPath, time: Date.now() });
    if (history.length > 10) history.pop();
    if (historyWin) historyWin.webContents.send('history-update', history);

    let details = `${filename} → ${path.basename(outPath)}\nSaved in ${path.dirname(outPath)}`;
    if (action === '__compress__' || action === '__pdfcompress__') {
      try {
        const before = fs.statSync(filePath).size, after = fs.statSync(outPath).size;
        const delta = before > 0 ? Math.round((1 - after / before) * 100) : 0;
        const verb = delta > 0 ? `${delta}% smaller` : delta < 0 ? `${Math.abs(delta)}% larger` : 'about the same size';
        details = `${bytesForNotice(before)} → ${bytesForNotice(after)} (${verb})\nSaved in ${path.dirname(outPath)}`;
      } catch { /* output still succeeded; size comparison is optional */ }
    }
    if (toolWin && !toolWin.isDestroyed()) { toolWin.close(); toolWin = null; }
    notify(`✓ ${targetLabel} complete`, details, outPath);
    if (cfg.autoOpen) shell.openPath(outPath);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (toolWin && !toolWin.isDestroyed()) toolWin.webContents.send('tool-error', message);
    notify(`✗ ${friendlyToolName(action)} failed`, message);
  }
});

function bytesForNotice(value) {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB']; let n = value / 1024, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

ipcMain.on('close-radial', () => {
  if (radialWin) { radialWin.close(); radialWin = null; }
});

ipcMain.on('open-settings', () => createSettingsWindow());
ipcMain.on('open-history', () => createHistoryWindow());

ipcMain.on('open-file', (_, { filePath }) => shell.openPath(filePath));
ipcMain.on('reveal-file', (_, { filePath }) => revealOutput(filePath));

ipcMain.handle('get-settings', () => settings.load());

ipcMain.handle('save-settings', (_, data) => {
  settings.save(data);
  return true;
});

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

// ── Wayland-compatible trigger: PID file + SIGUSR1 ──────────────
function writePidFile() {
  try {
    fs.mkdirSync(PID_DIR, { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch (err) {
    notify('Tangerine', `Couldn't write PID file for the keyboard-shortcut trigger: ${err.message}`);
  }
}

function removePidFile() {
  try { fs.unlinkSync(PID_FILE); } catch { /* already gone, fine */ }
}

// Fires when GNOME's custom keyboard shortcut runs
// `kill -USR1 $(cat ~/.config/tangerine/tangerine.pid)`.
process.on('SIGUSR1', onHotkey);

// ── App lifecycle ──────────────────────────────────────────────
app.whenReady().then(() => {
  createTray();
  writePidFile();

  // Works on X11; on Wayland this registration silently does nothing
  // (see the comment near PID_FILE above), which is why SIGUSR1 exists as
  // the real trigger path for Wayland users via a GNOME custom shortcut.
  globalShortcut.register(HOTKEY, onHotkey);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  removePidFile();
});

// This is now a background/tray app, not a window-based one. Electron's
// default is to quit once every window closes (on Linux/Windows); simply
// having a listener here — even an empty one — suppresses that, so closing
// Settings/History doesn't take the whole app down with it.
app.on('window-all-closed', () => {});
