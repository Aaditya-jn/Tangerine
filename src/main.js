const { app, BrowserWindow, ipcMain, screen, shell, dialog, Tray, Menu, globalShortcut, clipboard, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./settings');
const { getOptions, convert } = require('./converter');

// Must match the StartupWMClass in the .desktop file (see build.sh) so the
// dock/taskbar can match the running window to the pinned launcher icon
// and show the "app is running" indicator dot.
app.setName('Tangerine');

const HOTKEY = 'CommandOrControl+Space';

let tray       = null;
let radialWin  = null;
let settingsWin= null;
let historyWin = null;
let history    = [];   // last 10 conversions

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
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

  // Nothing usable on the clipboard — ask the user to pick a file instead
  // of silently doing nothing.
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
    radialWin.webContents.send('init-radial', { filePath, options: opts.slice(0, 22) });
  });
  radialWin.on('blur',   () => { if (radialWin) { radialWin.close(); radialWin = null; } });
  radialWin.on('closed', () => { radialWin = null; });
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
    notify('✓ Converted', `${filename} → ${path.basename(outPath)}`);
    if (cfg.autoOpen) shell.openPath(outPath);

  } catch (err) {
    notify('✗ Conversion failed', `${filename}: ${err.message}`);
  }
});

ipcMain.on('close-radial', () => {
  if (radialWin) { radialWin.close(); radialWin = null; }
});

ipcMain.on('open-settings', () => createSettingsWindow());
ipcMain.on('open-history', () => createHistoryWindow());

ipcMain.on('open-file', (_, { filePath }) => shell.openPath(filePath));

ipcMain.handle('get-settings', () => settings.load());

ipcMain.handle('save-settings', (_, data) => {
  settings.save(data);
  return true;
});

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

// ── App lifecycle ──────────────────────────────────────────────
app.whenReady().then(() => {
  createTray();

  const ok = globalShortcut.register(HOTKEY, onHotkey);
  if (!ok) {
    // Most likely cause: another app already owns Ctrl+Space (common with
    // some input-method switchers). Tray menu still works as a fallback.
    notify('Tangerine', `Couldn't register ${HOTKEY.replace('CommandOrControl', 'Ctrl')} — it may be taken by another app. Use the tray icon instead.`);
  }
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// This is now a background/tray app, not a window-based one. Electron's
// default is to quit once every window closes (on Linux/Windows); simply
// having a listener here — even an empty one — suppresses that, so closing
// Settings/History doesn't take the whole app down with it.
app.on('window-all-closed', () => {});
