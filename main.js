// main.js

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true, // For Electron versions < 12
      contextIsolation: false, // For Electron versions >= 12
    },
  });

  win.loadFile('index.html');

  // Open DevTools (optional)
  // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

// Handle folder selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});
