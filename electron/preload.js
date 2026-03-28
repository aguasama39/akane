const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadCollection: () => ipcRenderer.invoke('load-collection'),
  syncCollection: (c) => ipcRenderer.invoke('sync-collection', c),
  saveCollection: (c) => ipcRenderer.invoke('save-collection', c),
  addSeries: () => ipcRenderer.invoke('add-series'),
  addCbz: () => ipcRenderer.invoke('add-cbz'),
  scanLibrary: () => ipcRenderer.invoke('scan-library'),
  onLibraryFileAdded: (cb) => ipcRenderer.on('library-file-added', (_e, data) => cb(data)),
  openVolume: (cbzPath) => ipcRenderer.invoke('open-volume', cbzPath),
  getCover: (cbzPath) => ipcRenderer.invoke('get-cover', cbzPath),
  getCoversBatch: (paths) => ipcRenderer.invoke('get-covers-batch', paths),
  loadProgress: () => ipcRenderer.invoke('load-progress'),
  saveProgress: (cbzPath, page, total) => ipcRenderer.invoke('save-progress', cbzPath, page, total),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowFullscreen: () => ipcRenderer.send('window-fullscreen'),
  onFullscreenChange: (cb) => ipcRenderer.on('fullscreen-change', (_e, isFs) => cb(isFs)),
});
