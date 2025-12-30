import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from "electron";
import path from "path";
import express from "express";
import http from "http";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import AppUpdater from "./updater.js";
import rateLimit from "express-rate-limit";

// Handle __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Replace single mainWindow with a Set of windows
const windows = new Set();
let server;
let serverPort = 34567;
let appUpdater;

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should create a new window
    createWindow();
  });

  // App initialization
  app.on("ready", async () => {
    await startServer();
    createWindow();
    createMenu();
    updateDockMenu();
    updateJumpList();

    // Check for updates (only once)
    // We pass the first window for dialogs if needed, or handle it inside AppUpdater
    // Since AppUpdater takes a window in constructor, let's defer it or pick the first one.
    // For now, let's attach it to the first window created.
    setTimeout(() => {
      if (windows.size > 0) {
        // Use the first available window
        const firstWindow = windows.values().next().value;
        if (!appUpdater) {
          appUpdater = new AppUpdater(firstWindow);
        }
        appUpdater.checkForUpdates();
      }
    }, 3000);
  });
}

/**
 * Try to start the HTTP server on `serverPort`, and if it's already in use
 * try subsequent ports up to `maxAttempts` times. When successful, set the
 * global `server` and `serverPort` to the listening instance/port.
 */
const startServer = async () => {
  const expressApp = express();

  const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Limit to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: "Too many requests from this client, please try again later.",
  });

  let distPath;

  if (app.isPackaged) {
    // In production: files are in app.asar at root
    distPath = path.join(process.resourcesPath, "app.asar", "dist");
  } else {
    // In development
    distPath = path.join(__dirname, "../dist");
  }

  console.log("Serving static files from:", distPath);

  // Serve static files
  expressApp.use(express.static(distPath));

  // SPA fallback
  expressApp.get("*", limiter, (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  // Helper to attempt listening on ports starting at `startPort`.
  const tryListenOnPortRange = (startPort, maxAttempts = 50) => {
    return new Promise((resolve, reject) => {
      let attempt = 0;
      let port = startPort;

      const attemptListen = () => {
        attempt += 1;
        // Create a new server instance for each attempt so errors don't persist
        const candidate = http.createServer(expressApp);

        candidate.once("error", (err) => {
          if (err && err.code === "EADDRINUSE" && attempt < maxAttempts) {
            console.warn(`Port ${port} in use, trying ${port + 1}`);
            port += 1;
            // Give a tiny delay to avoid busy-looping
            setTimeout(attemptListen, 10);
          } else {
            reject(err);
          }
        });

        candidate.once("listening", () => {
          server = candidate;
          serverPort = port;
          console.log(`Local server running on port ${serverPort}`);
          resolve();
        });

        candidate.listen(port);
      };

      attemptListen();
    });
  };

  // Try to listen, allowing fallback ports if needed
  await tryListenOnPortRange(serverPort, 100);
};

const createWindow = () => {
  let newWindow = new BrowserWindow({
    width: 1360,
    height: 800,
    title: "Pedro Pathing Visualizer",
    webPreferences: {
      nodeIntegration: false, // Security: Sandbox the web code
      contextIsolation: true, // Security: Sandbox the web code
      preload: path.join(__dirname, "preload.js"),
    },
  });

  windows.add(newWindow);

  // Force clear the cache to ensure we load the latest build
  newWindow.webContents.session.clearCache();
  newWindow.webContents.session.clearStorageData();

  // Load the app from the local server
  newWindow.loadURL(`http://localhost:${serverPort}`);

  // Handle "Save As" dialog native behavior
  newWindow.webContents.session.on(
    "will-download",
    (event, item, webContents) => {
      item.on("updated", (event, state) => {
        if (state === "interrupted") {
          console.log("Download is interrupted but can be resumed");
        }
      });
    },
  );

  newWindow.on("closed", () => {
    windows.delete(newWindow);
    newWindow = null;
    // Quit if no windows are left, unless on macOS (optional, but typical for this app structure is to quit)
    // However, the original code had `app.quit()` on closed.
    // If we want multiple windows, we should only quit when all are closed.
    // But on macOS, traditionally apps stay open.
    // Let's mimic the original behavior: "when the project closes it should auto close" was a comment.
    // But standard behavior:
    // If not Mac, quit when all windows closed.
    // `app.on("window-all-closed", ...)` handles this.
  });
};

const updateDockMenu = () => {
  if (process.platform === "darwin") {
    app.dock.setMenu(
      Menu.buildFromTemplate([
        {
          label: "New Window",
          click() {
            createWindow();
          },
        },
      ]),
    );
  }
};

const updateJumpList = () => {
  if (process.platform === "win32") {
    app.setUserTasks([
      {
        program: process.execPath,
        arguments: "", // Just launching again triggers second-instance -> createWindow
        iconPath: process.execPath,
        iconIndex: 0,
        title: "New Window",
        description: "Create a new window",
      },
    ]);
  }
};

// Helper to send menu action to the focused window
const sendToFocusedWindow = (channel, ...args) => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.webContents.send(channel, ...args);
  } else {
    // Fallback: if only one window, send to it?
    // Or if no window is focused (rare when clicking menu), send to most recently created?
    // Usually Menu click focuses the app, so a window should be focused or last active.
    // Let's try to find the last active one if getFocusedWindow is null.
    if (windows.size === 1) {
      const first = windows.values().next().value;
      if (first) first.webContents.send(channel, ...args);
    }
  }
};

const createMenu = () => {
  const isMac = process.platform === "darwin";

  const template = [
    // App Menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    // File Menu
    {
      label: "File",
      submenu: [
        {
          label: "New Path",
          accelerator: "CmdOrCtrl+N",
          click: () => sendToFocusedWindow("menu-action", "new-path"),
        },
        {
          label: "New Window",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => createWindow(),
        },
        {
          label: "Open...",
          accelerator: "CmdOrCtrl+O",
          click: () => sendToFocusedWindow("menu-action", "open-file"),
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => sendToFocusedWindow("menu-action", "save-project"),
        },
        {
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendToFocusedWindow("menu-action", "save-as"),
        },
        { type: "separator" },
        {
          label: "Export",
          submenu: [
            {
              label: "Export as Java Code...",
              click: () => sendToFocusedWindow("menu-action", "export-java"),
            },
            {
              label: "Export as Points Array...",
              click: () => sendToFocusedWindow("menu-action", "export-points"),
            },
            {
              label: "Export as Sequential Command...",
              click: () =>
                sendToFocusedWindow("menu-action", "export-sequential"),
            },
            { type: "separator" },
            {
              label: "Export GIF...",
              click: () => sendToFocusedWindow("menu-action", "export-gif"),
            },
          ],
        },
        { type: "separator" },
        { role: isMac ? "close" : "quit" },
      ],
    },
    // Edit Menu
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          accelerator: "CmdOrCtrl+Z",
          click: () => sendToFocusedWindow("menu-action", "undo"),
        },
        {
          label: "Redo",
          accelerator: "CmdOrCtrl+Y", // or Cmd+Shift+Z depending on OS preference, but Y is common
          click: () => sendToFocusedWindow("menu-action", "redo"),
        },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    // View Menu
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => sendToFocusedWindow("menu-action", "open-settings"),
        },
      ],
    },
    // Window Menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
      ],
    },
    // Help Menu
    {
      role: "help",
      submenu: [
        {
          label: "Keyboard Shortcuts",
          accelerator: "CmdOrCtrl+/",
          click: () => sendToFocusedWindow("menu-action", "open-shortcuts"),
        },
        { type: "separator" },
        {
          label: "See Project on GitHub",
          click: async () => {
            await shell.openExternal(
              "https://github.com/Mallen220/PedroPathingVisualizer",
            );
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

// CRITICAL: Satisfies "when the project closes it should auto close"
app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  if (server) {
    server.close();
  }
});

// Add these functions at the top, after the imports
const getDirectorySettingsPath = () => {
  return path.join(app.getPath("userData"), "directory-settings.json");
};

const loadDirectorySettings = async () => {
  const settingsPath = getDirectorySettingsPath();
  try {
    const data = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // Return default settings if file doesn't exist
    return { autoPathsDirectory: "" };
  }
};

const saveDirectorySettings = async (settings) => {
  const settingsPath = getDirectorySettingsPath();
  try {
    await fs.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2),
      "utf-8",
    );
    return true;
  } catch (error) {
    console.error("Error saving directory settings:", error);
    return false;
  }
};

// Update the existing ipcMain.handle for "file:get-directory"
ipcMain.handle("file:get-directory", async () => {
  // Load saved directory settings
  const settings = await loadDirectorySettings();

  // If we have a saved directory, use it
  if (
    settings.autoPathsDirectory &&
    settings.autoPathsDirectory.trim() !== ""
  ) {
    try {
      await fs.access(settings.autoPathsDirectory);
      return settings.autoPathsDirectory;
    } catch (error) {
      console.log(
        "Saved directory no longer accessible, falling back to default",
      );
    }
  }

  // Fallback to default directory
  const defaultDir = path.join(
    process.env.HOME,
    "Documents",
    "GitHub",
    "BBots2025-26",
    "TeamCode",
    "src",
    "main",
    "assets",
    "AutoPaths",
  );

  try {
    await fs.access(defaultDir);
    return defaultDir;
  } catch {
    // Create directory if it doesn't exist
    await fs.mkdir(defaultDir, { recursive: true });
    return defaultDir;
  }
});

// Update the existing ipcMain.handle for "file:set-directory"
ipcMain.handle("file:set-directory", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
    title: "Select AutoPaths Directory",
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedDir = result.filePaths[0];

    // Save the directory to settings
    const settings = await loadDirectorySettings();
    settings.autoPathsDirectory = selectedDir;
    await saveDirectorySettings(settings);

    return selectedDir;
  }
  return null;
});

// Add new IPC handlers for directory settings
ipcMain.handle("directory:get-settings", async () => {
  return await loadDirectorySettings();
});

ipcMain.handle("directory:save-settings", async (event, settings) => {
  return await saveDirectorySettings(settings);
});

// Add a handler to get the saved directory directly
ipcMain.handle("directory:get-saved-directory", async () => {
  const settings = await loadDirectorySettings();
  return settings.autoPathsDirectory || "";
});

// Add to existing IPC handlers
ipcMain.handle("file:create-directory", async (event, dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error("Error creating directory:", error);
    throw error;
  }
});

ipcMain.handle("file:get-directory-stats", async (event, dirPath) => {
  // Validate input
  if (!dirPath || typeof dirPath !== "string" || dirPath.trim() === "") {
    console.warn(
      "file:get-directory-stats called with empty or invalid dirPath:",
      JSON.stringify(dirPath),
    );
    return {
      totalFiles: 0,
      totalSize: 0,
      lastModified: new Date(0),
    };
  }

  try {
    // Ensure directory exists and is accessible
    await fs.access(dirPath);
  } catch (err) {
    console.warn(
      "Directory not accessible in file:get-directory-stats:",
      dirPath,
      err && err.code,
    );
    return {
      totalFiles: 0,
      totalSize: 0,
      lastModified: new Date(0),
    };
  }

  try {
    const files = await fs.readdir(dirPath);
    const ppFiles = files.filter((file) => file.endsWith(".pp"));

    let totalSize = 0;
    let latestModified = new Date(0);

    for (const file of ppFiles) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
      if (stats.mtime > latestModified) {
        latestModified = stats.mtime;
      }
    }

    return {
      totalFiles: ppFiles.length,
      totalSize,
      lastModified: latestModified,
    };
  } catch (error) {
    console.error("Error getting directory stats for path", dirPath, error);
    return {
      totalFiles: 0,
      totalSize: 0,
      lastModified: new Date(0),
    };
  }
});

ipcMain.handle("app:get-app-data-path", () => {
  return app.getPath("userData");
});

ipcMain.handle("app:get-version", () => {
  return app.getVersion();
});

// Add to existing IPC handlers
ipcMain.handle("file:rename", async (event, oldPath, newPath) => {
  try {
    // Check if new path already exists
    const exists = await fs
      .access(newPath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      throw new Error(`File "${path.basename(newPath)}" already exists`);
    }

    await fs.rename(oldPath, newPath);
    return { success: true, newPath };
  } catch (error) {
    console.error("Error renaming file:", error);
    throw error;
  }
});

ipcMain.handle("file:list", async (event, directory) => {
  // Validate input
  if (!directory || typeof directory !== "string" || directory.trim() === "") {
    console.warn(
      "file:list called with empty or invalid directory:",
      JSON.stringify(directory),
    );
    return [];
  }

  try {
    // Ensure directory exists
    await fs.access(directory);
  } catch (err) {
    console.warn(
      "Directory not accessible in file:list:",
      directory,
      err && err.code,
    );
    return [];
  }

  try {
    const files = await fs.readdir(directory);
    const ppFiles = files.filter((file) => file.endsWith(".pp"));

    const fileDetails = await Promise.all(
      ppFiles.map(async (file) => {
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
        };
      }),
    );

    return fileDetails;
  } catch (error) {
    console.error("Error reading directory:", directory, error);
    return [];
  }
});

ipcMain.handle("file:read", async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    console.error("Error reading file:", error);
    throw error;
  }
});

ipcMain.handle("file:write", async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, "utf-8");
    return true;
  } catch (error) {
    console.error("Error writing file:", error);
    throw error;
  }
});

// Save dialog (returns file path or null if cancelled)
ipcMain.handle("file:show-save-dialog", async (event, options) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, options || {});
    if (result.canceled) return null;
    return result.filePath;
  } catch (error) {
    console.error("Error showing save dialog:", error);
    throw error;
  }
});

// Write base64-encoded content to disk (binary)
ipcMain.handle("file:write-base64", async (event, filePath, base64Content) => {
  try {
    const buffer = Buffer.from(base64Content, "base64");
    await fs.writeFile(filePath, buffer);
    return true;
  } catch (error) {
    console.error("Error writing base64 file:", error);
    throw error;
  }
});

ipcMain.handle("file:delete", async (event, filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error("Error deleting file:", error);
    throw error;
  }
});

ipcMain.handle("file:exists", async (event, filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});
