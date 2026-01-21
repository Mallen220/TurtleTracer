// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Utils
  getPathForFile: (file) => webUtils.getPathForFile(file),

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
  resolvePath: (base, relative) =>
    ipcRenderer.invoke("file:resolve-path", base, relative),
  makeRelativePath: (base, target) =>
    ipcRenderer.invoke("file:make-relative-path", base, target),

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

  // Export .pp convenience wrapper
  exportPP: (content, defaultName) =>
    ipcRenderer.invoke("export:pp", { content, defaultName }),

  // File Copy
  copyFile: (srcPath, destPath) =>
    ipcRenderer.invoke("file:copy", srcPath, destPath),

  // Git operations
  gitShow: (filePath) => ipcRenderer.invoke("git:show", filePath),

  // Renderer ready signal
  rendererReady: () => ipcRenderer.invoke("renderer-ready"),

  // Open file path listener
  onOpenFilePath: (callback) =>
    ipcRenderer.on("open-file-path", (_event, filePath) => callback(filePath)),

  // App close request listener
  onAppCloseRequested: (callback) =>
    ipcRenderer.on("app-close-requested", (_event) => callback()),

  // Send app close approved signal
  sendCloseApproved: () => ipcRenderer.invoke("app-close-approved"),

  // Menu action listener
  onMenuAction: (callback) =>
    ipcRenderer.on("menu-action", (_event, action) => callback(action)),

  // Get app version
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  // Open external URL in the user's default browser
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),

  // Plugin System
  listPlugins: () => ipcRenderer.invoke("plugins:list"),
  readPlugin: (filename) => ipcRenderer.invoke("plugins:read", filename),
  deletePlugin: (filename) => ipcRenderer.invoke("plugins:delete", filename),
  openPluginsFolder: () => ipcRenderer.invoke("plugins:open-folder"),
  transpilePlugin: (code) => ipcRenderer.invoke("plugins:transpile", code),
});
