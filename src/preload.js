const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Radial menu
  sendConvert:     (fp, fmt)  => ipcRenderer.send('convert', { filePath: fp, targetFormat: fmt }),
  openTool:        (fp, action) => ipcRenderer.send('open-tool', { filePath: fp, action }),
  closeTool:       () => ipcRenderer.send('close-tool'),
  applyTool:       (payload) => ipcRenderer.send('apply-tool', payload),
  onInitTool:      (cb) => ipcRenderer.on('init-tool', (_, d) => cb(d)),
  onToolProgress:  (cb) => ipcRenderer.on('tool-progress', (_, p) => cb(p)),
  onToolError:     (cb) => ipcRenderer.on('tool-error', (_, message) => cb(message)),
  sendCloseRadial: ()         => ipcRenderer.send('close-radial'),
  onInitRadial:    (cb) => ipcRenderer.on('init-radial', (_, d) => cb(d)),

  // Settings / History windows
  openSettings:    ()         => ipcRenderer.send('open-settings'),
  openHistory:     ()         => ipcRenderer.send('open-history'),
  openFile:        (fp)       => ipcRenderer.send('open-file', { filePath: fp }),
  revealFile:      (fp)       => ipcRenderer.send('reveal-file', { filePath: fp }),
  onHistoryUpdate: (cb) => ipcRenderer.on('history-update', (_, d) => cb(d)),
  getSettings:     ()    => ipcRenderer.invoke('get-settings'),
  saveSettings:    (s)   => ipcRenderer.invoke('save-settings', s),
  pickFolder:      ()    => ipcRenderer.invoke('pick-folder'),
});
