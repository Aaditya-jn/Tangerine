const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Radial menu
  sendConvert:     (fp, fmt)  => ipcRenderer.send('convert', { filePath: fp, targetFormat: fmt }),
  sendCloseRadial: ()         => ipcRenderer.send('close-radial'),
  onInitRadial:    (cb) => ipcRenderer.on('init-radial', (_, d) => cb(d)),

  // Settings / History windows
  openSettings:    ()         => ipcRenderer.send('open-settings'),
  openHistory:     ()         => ipcRenderer.send('open-history'),
  openFile:        (fp)       => ipcRenderer.send('open-file', { filePath: fp }),
  onHistoryUpdate: (cb) => ipcRenderer.on('history-update', (_, d) => cb(d)),
  getSettings:     ()    => ipcRenderer.invoke('get-settings'),
  saveSettings:    (s)   => ipcRenderer.invoke('save-settings', s),
  pickFolder:      ()    => ipcRenderer.invoke('pick-folder'),
});
