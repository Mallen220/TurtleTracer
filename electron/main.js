// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from "electron";
import path from "path";
import express from "express";
import http from "http";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import AppUpdater from "./updater.js";
import rateLimit from "express-rate-limit";
import simpleGit from "simple-git";
import ts from "typescript";

// Handle __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Replace single mainWindow with a Set of windows
const windows = new Set();
let server;
let serverPort = 34567;
let appUpdater;

// Track if we've already cleared the default session storage/cache once
let sessionCleared = false;

// Wait for the local server to become ready (useful when creating windows rapidly)
const waitForServerReady = async (timeoutMs = 5000) => {
  const start = Date.now();
  // Quick shortcut if node server object reports listening
  if (server && server.listening) return;

  while (Date.now() - start < timeoutMs) {
    // If server object exists and is listening, we're done
    if (server && server.listening) return;

    // Try a small HTTP GET to be certain the app is serving
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(
          { hostname: "127.0.0.1", port: serverPort, path: "/", timeout: 2000 },
          (res) => {
            // Drain the response and resolve
            res.resume();
            resolve(true);
          },
        );
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy(new Error("timeout"));
        });
      });
      return;
    } catch (_) {
      // Ignore and retry
    }

    // Small backoff
    await new Promise((r) => setTimeout(r, 100));
  }

  throw new Error("Server did not become ready within timeout");
};
// Variable to store the pending file path if opened before renderer is ready
let pendingFilePath = null;

// Handle macOS open-file event (triggered when app is launching or running)
app.on("open-file", (event, path) => {
  event.preventDefault();
  handleOpenedFile(path);
});

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance. Prefer focusing an existing window
    // to avoid racing with the local server or creating orphan windows.
    try {
      const focused = BrowserWindow.getFocusedWindow();
      if (focused) {
        if (focused.isMinimized()) focused.restore();
        focused.focus();
      } else if (windows.size > 0) {
        const arr = Array.from(windows);
        const last = arr[arr.length - 1];
        if (last) {
          if (last.isMinimized()) last.restore();
          last.focus();
        } else {
          createWindow();
        }
      } else {
        createWindow();
      }

      // Check for file arguments in the second instance command line
      // Windows/Linux: The file path is usually the last argument or specifically passed
      const lastArg = commandLine[commandLine.length - 1];
      if (lastArg && lastArg.endsWith(".pp")) {
        handleOpenedFile(lastArg);
      }
    } catch (err) {
      console.error("Error in second-instance handler:", err);
      createWindow();
    }
  });

  // App initialization
  app.on("ready", async () => {
    // Check for file arguments on initial launch (Windows/Linux)
    if (process.platform !== "darwin" && process.argv.length >= 2) {
      const lastArg = process.argv[process.argv.length - 1];
      if (lastArg && lastArg.endsWith(".pp")) {
        pendingFilePath = lastArg;
      }
    }

    await startServer();
    createWindow();
    createMenu();
    updateDockMenu();
    updateJumpList();
    ensureDefaultPlugins();

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
 * Handle a file path opened from OS
 */
function handleOpenedFile(filePath) {
  if (!filePath) return;

  // If we have windows, send to the focused one or the first one
  const win = BrowserWindow.getFocusedWindow() || windows.values().next().value;
  if (win) {
    // If window exists, send immediately (or check if it's ready? The renderer will just ignore if not hooked up yet,
    // but usually if window is open, it's loaded. To be safe, we can try sending.)
    // However, if the app is just starting, the renderer might not be ready.
    // The robust way is to store it and let the renderer ask for it, OR send it if we know it's ready.
    // For simplicity, we'll store it in pendingFilePath and also try to send it if a window exists.
    pendingFilePath = filePath;
    win.webContents.send("open-file-path", filePath);

    // Focus the window
    if (win.isMinimized()) win.restore();
    win.focus();
  } else {
    // No window yet, store it
    pendingFilePath = filePath;
  }
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
    // But since dist/ is inside app.asar (which is mounted as a file system),
    // and __dirname is inside app.asar/electron,
    // path.join(__dirname, "../dist") should resolve to app.asar/dist.
    // Using process.resourcesPath + "app.asar" works but can be brittle if asar name changes.
    // However, the issue might be that express.static expects a directory.
    // Electron's patched fs allows treating app.asar/dist as a directory.
    // But let's check if the path is correct.
    // If __dirname is /.../resources/app.asar/electron
    // Then ../dist is /.../resources/app.asar/dist.

    // Let's use the relative path approach as it's more standard for ASAR.
    distPath = path.join(__dirname, "../dist");
  } else {
    // In development
    distPath = path.join(__dirname, "../dist");
  }

  console.log("Serving static files from:", distPath);
  console.log("__dirname:", __dirname);
  try {
    const files = await fs.readdir(distPath);
    console.log("Files in distPath:", files);
  } catch (e) {
    console.error("Error reading distPath:", e);
  }

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

        candidate.listen(port, "127.0.0.1");
      };

      attemptListen();
    });
  };

  // Try to listen, allowing fallback ports if needed
  await tryListenOnPortRange(serverPort, 100);
};

const createWindow = async () => {
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

  // Only clear cache/storage once to avoid unexpected race conditions when
  // rapidly creating new windows. Clearing on every new window can interfere
  // with the service worker / static asset caching and cause intermittent
  // load failures.
  if (!sessionCleared) {
    try {
      await newWindow.webContents.session.clearCache();
      await newWindow.webContents.session.clearStorageData();
      sessionCleared = true;
    } catch (err) {
      console.warn("Failed to clear session data for new window:", err);
    }
  }

  // Ensure our local server is actually ready before trying to load the UI.
  // This prevents creating windows that immediately fail to load because the
  // server hasn't bound yet (a common race when creating windows quickly).
  try {
    await waitForServerReady(5000);
  } catch (err) {
    console.error("Server not ready when creating window:", err);
    try {
      const focused = BrowserWindow.getFocusedWindow() || newWindow;
      dialog.showMessageBox(focused, {
        type: "error",
        title: "Load Error",
        message:
          "The local app server did not start in time. The window will attempt to load; if it fails, please try again.",
      });
    } catch (dialogErr) {
      console.warn("Failed to show load error dialog:", dialogErr);
    }
  }

  // Load the app from the local server (retry logic is handled above)
  newWindow.loadURL(`http://localhost:${serverPort}`);

  // Disable certain Chromium keyboard shortcuts that interfere with app UX (reload, close, devtools)
  newWindow.webContents.on("before-input-event", (event, input) => {
    try {
      const key = input.key ? String(input.key).toLowerCase() : "";
      const isCmdOrCtrl = Boolean(input.control || input.meta);
      const isShift = Boolean(input.shift);

      // Prevent reloads: Cmd/Ctrl+R, Cmd/Ctrl+Shift+R, F5
      if (
        (isCmdOrCtrl && key === "r") ||
        key === "f5" ||
        (isCmdOrCtrl && isShift && key === "r")
      ) {
        event.preventDefault();
        return;
      }

      // Prevent window close: Cmd/Ctrl+W, Cmd/Ctrl+Shift+W, Ctrl+F4
      if (
        (isCmdOrCtrl && key === "w") ||
        (isCmdOrCtrl && isShift && key === "w") ||
        (input.control && key === "f4")
      ) {
        event.preventDefault();
        return;
      }

      // Prevent opening devtools via shortcut: Cmd/Ctrl+Shift+I
      if (isCmdOrCtrl && isShift && key === "i") {
        event.preventDefault();
        return;
      }
    } catch (err) {
      console.warn("Error in before-input-event handler:", err);
    }
  });

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

  // Intercept close event to handle unsaved changes
  newWindow.on("close", (e) => {
    // If we have already approved the close, let it proceed
    if (newWindow.isCloseApproved) {
      return;
    }

    // Prevent default closing behavior
    e.preventDefault();

    // Ask the renderer if it's okay to close (check for unsaved changes)
    // We send this to the specific window trying to close
    newWindow.webContents.send("app-close-requested");
  });

  newWindow.on("closed", () => {
    windows.delete(newWindow);
    newWindow = null;
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
            {
              label: "Export as .pp File...",
              click: () => sendToFocusedWindow("menu-action", "export-pp"),
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
        // Removed default reload/forceReload accelerators to prevent accidental webpage reloads
        // Provide a menu-only Toggle DevTools (no accelerator) to avoid opening devtools via keyboard shortcut
        {
          label: "Toggle DevTools",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) win.webContents.toggleDevTools();
          },
        },
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
    return {
      autoPathsDirectory: "",
      plugins: {
        "Example-csv-exporter.js": false,
        "Example-pink-theme.js": false,
      },
    };
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

// IPC Handlers

// Add handler for renderer ready signal
ipcMain.handle("renderer-ready", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (pendingFilePath) {
    win.webContents.send("open-file-path", pendingFilePath);
    pendingFilePath = null;
  }
  return true;
});

// Open a URL in the default system browser (called from renderer via preload)
ipcMain.handle("app:open-external", async (event, url) => {
  try {
    await shell.openExternal(url);
    return true;
  } catch (err) {
    console.warn("Failed to open external url", url, err);
    return false;
  }
});

ipcMain.handle("plugins:transpile", async (event, code) => {
  try {
    const result = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.None,
      },
    });
    return result.outputText;
  } catch (error) {
    console.error("Error transpiling plugin:", error);
    throw new Error(`Transpilation failed: ${error.message}`);
  }
});

ipcMain.handle("git:show", async (event, filePath) => {
  try {
    const git = simpleGit(path.dirname(filePath));
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return null;

    const root = await git.revparse(["--show-toplevel"]);
    // normalize paths for git
    const relativePath = path
      .relative(root.trim(), filePath)
      .replace(/\\/g, "/");
    const content = await git.show([`HEAD:${relativePath}`]);
    return content;
  } catch (error) {
    console.warn("Error running git show:", error);
    return null;
  }
});

async function ensureDefaultPlugins() {
  const pluginsDir = getPluginsDirectory();
  try {
    await fs.mkdir(pluginsDir, { recursive: true });

    const sourcePluginsDir = path.join(__dirname, "../plugins");

    try {
      const files = await fs.readdir(sourcePluginsDir);
      for (const file of files) {
        if (
          !file.endsWith(".js") &&
          !file.endsWith(".ts") &&
          !file.endsWith(".d.ts")
        )
          continue;

        const srcFile = path.join(sourcePluginsDir, file);
        const destFile = path.join(pluginsDir, file);

        try {
          await fs.access(destFile);
        } catch {
          await fs.copyFile(srcFile, destFile);
        }
      }
    } catch (err) {
      console.error(
        "Failed to read source plugins directory:",
        sourcePluginsDir,
        err,
      );
    }
  } catch (err) {
    console.error("Failed to ensure default plugins", err);
  }
}

// Add handler for file copy
ipcMain.handle("file:copy", async (event, srcPath, destPath) => {
  try {
    // Check if new path already exists
    // (Using fs.copyFile triggers overwrite by default, so we might want to check existence if we want to prompt,
    // but the prompt logic is likely in the renderer. The renderer asks user, then calls this.)

    await fs.copyFile(srcPath, destPath);
    return true;
  } catch (error) {
    console.error("Error copying file:", error);
    throw error;
  }
});

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
  const defaultDir = path.join(process.env.HOME, "Documents", "AutoPaths");

  try {
    await fs.access(defaultDir);
    return defaultDir;
  } catch {
    // Create directory if it doesn't exist
    // await fs.mkdir(defaultDir, { recursive: true });
    // return defaultDir;
    return null;
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

// Handle app close approval from renderer
ipcMain.handle("app-close-approved", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.isCloseApproved = true;
    win.close();
  }
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

    // Check git status
    let gitStatuses = {};
    try {
      const git = simpleGit(directory);
      if (await git.checkIsRepo()) {
        const status = await git.status();
        const rootDir = await git.revparse(["--show-toplevel"]);

        status.files.forEach((fileStatus) => {
          const absPath = path.resolve(rootDir.trim(), fileStatus.path);
          let statusStr = "clean";

          if (fileStatus.working_dir === "?" || fileStatus.working_dir === "U")
            statusStr = "untracked";
          else if (
            fileStatus.working_dir !== " " &&
            fileStatus.working_dir !== "?"
          )
            statusStr = "modified";
          else if (fileStatus.index !== " " && fileStatus.index !== "?")
            statusStr = "staged";

          gitStatuses[absPath] = statusStr;
        });
      }
    } catch (e) {
      console.warn("Error checking git status:", e);
    }

    const fileDetails = await Promise.all(
      ppFiles.map(async (file) => {
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);
        // On Windows, paths might differ in normalization, so we resolve to be safe
        const resolvedPath = path.resolve(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
          gitStatus: gitStatuses[resolvedPath] || "clean",
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

// Export a .pp file using native save dialog and write via main process
ipcMain.handle(
  "export:pp",
  async (event, { content, defaultName = "trajectory.pp" } = {}) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: "Export .pp File",
        defaultPath:
          defaultName && defaultName.endsWith(".pp")
            ? defaultName
            : `${defaultName}.pp`,
        filters: [{ name: "Pedro Path", extensions: ["pp"] }],
      };
      const result = await dialog.showSaveDialog(win, options);
      if (result.canceled || !result.filePath) return null;
      await fs.writeFile(result.filePath, content, "utf-8");
      return result.filePath;
    } catch (error) {
      console.error("Error exporting .pp file:", error);
      throw error;
    }
  },
);
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

ipcMain.handle("file:resolve-path", (event, base, relative) => {
  if (!base || !relative) return relative;
  try {
    return path.resolve(path.dirname(base), relative);
  } catch (e) {
    console.error("Error resolving path:", base, relative, e);
    return relative;
  }
});

// Plugin System IPC Handlers
const getPluginsDirectory = () => {
  return path.join(app.getPath("userData"), "plugins");
};

ipcMain.handle("plugins:list", async () => {
  const pluginsDir = getPluginsDirectory();
  try {
    await fs.mkdir(pluginsDir, { recursive: true });
    const files = await fs.readdir(pluginsDir);
    return files.filter(
      (f) =>
        (f.endsWith(".js") || f.endsWith(".ts")) && !f.endsWith("pedro.d.ts"),
    );
  } catch (error) {
    console.error("Error listing plugins:", error);
    return [];
  }
});

ipcMain.handle("plugins:read", async (event, filename) => {
  const pluginsDir = getPluginsDirectory();
  // Security check: ensure filename doesn't contain path separators to prevent traversal
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error("Invalid plugin filename");
  }
  const filePath = path.join(pluginsDir, filename);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    console.error("Error reading plugin:", error);
    throw error;
  }
});

ipcMain.handle("plugins:open-folder", async () => {
  const pluginsDir = getPluginsDirectory();
  try {
    await fs.mkdir(pluginsDir, { recursive: true });
    await shell.openPath(pluginsDir);
    return true;
  } catch (error) {
    console.error("Error opening plugins folder:", error);
    return false;
  }
});

ipcMain.handle("plugins:delete", async (event, filename) => {
  const pluginsDir = getPluginsDirectory();
  // Security check: ensure filename doesn't contain path separators
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error("Invalid plugin filename");
  }
  const filePath = path.join(pluginsDir, filename);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error("Error deleting plugin:", error);
    throw error;
  }
});
