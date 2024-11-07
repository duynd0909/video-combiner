// preload.js

const { contextBridge, ipcRenderer } = require('electron');
const { shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectVideos: () => ipcRenderer.invoke('dialog:selectVideos'),
  getVideoFiles: (folderPath) =>
    ipcRenderer.invoke('get-video-files', folderPath),
  // Method to start processing
  startProcessing: (selectedVideos, saveDirectory, numOutputs, maxDuration) =>
    ipcRenderer.invoke(
      'start-processing',
      selectedVideos,
      saveDirectory,
      numOutputs,
      maxDuration
    ),
  onCombineStatus: (callback) => ipcRenderer.on('combine-status', callback),
  selectSaveDirectory: () => ipcRenderer.invoke('select-save-directory'),

  onProcessingProgress: (callback) =>
    ipcRenderer.on('processing-progress', callback),
  openPath: (path) => shell.showItemInFolder(path),
});
