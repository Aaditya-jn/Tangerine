const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Drop → radial
  sendFileDrop:    (fp)       => ipcRenderer.send('file-dropped', { filePath: fp }),
  sendConvert:     (fp, fmt)  => ipcRenderer.send('convert', { filePath: fp, targetFormat: fmt }),
  sendCloseRadial: ()         => ipcRenderer.send('close-radial'),
  dragMove:        (dx, dy)   => ipcRenderer.send('drag-move', { dx, dy }),
  openSettings:    ()         => ipcRenderer.send('open-settings'),
  openFile:        (fp)       => ipcRenderer.send('open-file', { filePath: fp }),

  // Radial init
  onInitRadial:    (cb) => ipcRenderer.on('init-radial',     (_, d) => cb(d)),

  // Progress & result → drop window
  onProgress:      (cb) => ipcRenderer.on('convert-progress',(_, d) => cb(d)),
  onConvertResult: (cb) => ipcRenderer.on('convert-result',  (_, d) => cb(d)),

  // History
  onHistoryUpdate: (cb) => ipcRenderer.on('history-update',  (_, d) => cb(d)),

  // Settings
  getSettings:     ()    => ipcRenderer.invoke('get-settings'),
  saveSettings:    (s)   => ipcRenderer.invoke('save-settings', s),
  pickFolder:      ()    => ipcRenderer.invoke('pick-folder'),
});
