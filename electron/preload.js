const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File system operations
  getDirectory: () => ipcRenderer.invoke('file:get-directory'),
  setDirectory: () => ipcRenderer.invoke('file:set-directory'),
  listFiles: (directory) => ipcRenderer.invoke('file:list', directory),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
  deleteFile: (filePath) => ipcRenderer.invoke('file:delete', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('file:exists', filePath),
});