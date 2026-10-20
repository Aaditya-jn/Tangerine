const { app, BrowserWindow, ipcMain, ipcRenderer, screen, shell, dialog } = require('electron');
const path = require('path');
const settings = require('./settings');
const { getOptions, convert } = require('./converter');

let dropWin    = null;
let radialWin  = null;
let settingsWin= null;
let history    = [];   // last 10 conversions

// ── Drop zone ──────────────────────────────────────────────────
function createDropWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  dropWin = new BrowserWindow({
    width: 170,
    height: 270,
    x: Math.round(width / 2 - 85),
    y: Math.round(height / 2 - 135),
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    transparent: true,
    focusable: true,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  dropWin.loadFile(path.join(__dirname, 'renderer', 'drop.html'));
  dropWin.setAlwaysOnTop(true, 'screen-saver');

  dropWin.on('focus', () => dropWin.blur());

  dropWin.on('closed', () => { dropWin = null; });
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

// ── IPC ────────────────────────────────────────────────────────
ipcMain.on('file-dropped', (_, { filePath }) => {
  const cursor = screen.getCursorScreenPoint();
  createRadialWindow(cursor.x, cursor.y, filePath);
});

ipcMain.on('convert', async (_, { filePath, targetFormat }) => {
  if (radialWin) { radialWin.close(); radialWin = null; }

  const cfg = settings.load();
  settings.ensureOutputFolder(cfg.outputFolder);

  const sendProgress = (pct) => {
    if (dropWin) dropWin.webContents.send('convert-progress', { pct });
  };

  // Signal start
  sendProgress(0);

  try {
    const outPath = await convert(filePath, targetFormat, cfg.outputFolder, cfg.imageQuality, sendProgress);
    sendProgress(100);

    // History
    history.unshift({
      filename: path.basename(filePath),
      target: targetFormat.replace('__','').replace('__',''),
      outPath,
      time: Date.now()
    });
    if (history.length > 10) history.pop();

    if (dropWin) {
      dropWin.webContents.send('convert-result', { success: true, outPath });
      dropWin.webContents.send('history-update', history);
    }

    if (cfg.autoOpen) shell.openPath(outPath);

  } catch (err) {
    sendProgress(-1);
    if (dropWin) dropWin.webContents.send('convert-result', { success: false, error: err.message });
  }
});

// IPC drag: renderer sends mouse deltas, we move the window
ipcMain.on('drag-move', (_, { dx, dy }) => {
  if (!dropWin) return;
  const [x, y] = dropWin.getPosition();
  dropWin.setPosition(x + dx, y + dy);
});

ipcMain.on('close-radial', () => {
  if (radialWin) { radialWin.close(); radialWin = null; }
});

ipcMain.on('open-settings', () => createSettingsWindow());

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
app.whenReady().then(createDropWindow);
app.on('window-all-closed', () => app.quit());
