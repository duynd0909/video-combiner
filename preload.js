// preload.js

const { contextBridge, ipcRenderer } = require('electron');
const { shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectVideos: () => ipcRenderer.invoke('dialog:selectVideos'),
  getVideoFiles: (folderPath) =>
    ipcRenderer.invoke('get-video-files', folderPath),
  startProcessing: (selectedVideos, savePath, maxDuration) =>
    ipcRenderer.invoke(
      'start-processing',
      selectedVideos,
      savePath,
      maxDuration
    ),
  onCombineStatus: (callback) => ipcRenderer.on('combine-status', callback),
  selectSaveFile: (defaultPath) =>
    ipcRenderer.invoke('select-save-file', defaultPath),
  onProcessingProgress: (callback) =>
    ipcRenderer.on('processing-progress', callback),
  openPath: (path) => shell.showItemInFolder(path),
});
