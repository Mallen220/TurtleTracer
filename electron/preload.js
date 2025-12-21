const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // File system operations
  getAppDataPath: () => ipcRenderer.invoke("app:get-app-data-path"),
  getDirectory: () => ipcRenderer.invoke("file:get-directory"),
  setDirectory: () => ipcRenderer.invoke("file:set-directory"),
  listFiles: (directory) => ipcRenderer.invoke("file:list", directory),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke("file:write", filePath, content),
  deleteFile: (filePath) => ipcRenderer.invoke("file:delete", filePath),
  fileExists: (filePath) => ipcRenderer.invoke("file:exists", filePath),

  // Directory settings operations
  getDirectorySettings: () => ipcRenderer.invoke("directory:get-settings"),
  saveDirectorySettings: (settings) =>
    ipcRenderer.invoke("directory:save-settings", settings),
  getSavedDirectory: () => ipcRenderer.invoke("directory:get-saved-directory"),

  // Enhanced file operations
  createDirectory: (dirPath) =>
    ipcRenderer.invoke("file:create-directory", dirPath),
  getDirectoryStats: (dirPath) =>
    ipcRenderer.invoke("file:get-directory-stats", dirPath),

  // Rename operation
  renameFile: (oldPath, newPath) =>
    ipcRenderer.invoke("file:rename", oldPath, newPath),

  // Show native save dialog. Options follow Electron's showSaveDialog options
  showSaveDialog: (options) =>
    ipcRenderer.invoke("file:show-save-dialog", options),

  // Write binary content encoded as base64 to disk
  writeFileBase64: (filePath, base64Content) =>
    ipcRenderer.invoke("file:write-base64", filePath, base64Content),
});
