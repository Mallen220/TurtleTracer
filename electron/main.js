import { isProjectFilePath, getPluginsDirectory } from "./utils.js";
// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from "electron";
import path from "path";
import express from "express";
import http from "http";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import fsSync from "fs";
import AppUpdater from "./updater.js";
import rateLimit from "express-rate-limit";
import simpleGit from "simple-git";
import ts from "typescript";
import { WebSocket } from "ws";
import net from "net";

// Handle __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Replace single mainWindow with a Set of windows
const windows = new Set();
let server;
let serverPort = 17218;
let appUpdater;

// Global references to prevent Electron Menu garbage collection (macOS WeakPtr bug)
let appMenu = null;
let dockMenu = null;

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
// Fix for Microsoft Store updates wiping LocalCache
if (process.windowsStore) {
  const oldUserDataPath = app.getPath("userData");
  if (oldUserDataPath.includes("LocalCache")) {
    const newUserDataPath = oldUserDataPath.replace(
      /LocalCache[\\/]Roaming/,
      "LocalState",
    );
    app.setPath("userData", newUserDataPath);

    // Migrate existing data if needed
    try {
      if (
        fsSync.existsSync(oldUserDataPath) &&
        !fsSync.existsSync(newUserDataPath)
      ) {
        fsSync.cpSync(oldUserDataPath, newUserDataPath, { recursive: true });
      }
    } catch (e) {
      console.error("Failed to migrate userData to LocalState", e);
    }
  }
}

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
      if (isProjectFilePath(lastArg)) {
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
      if (isProjectFilePath(lastArg)) {
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

  // If windows, send to the focused one or the first one
  const win = BrowserWindow.getFocusedWindow() || windows.values().next().value;
  if (win) {
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
    // But check if the path is correct.
    // If __dirname is /.../resources/app.asar/electron
    // Then ../dist is /.../resources/app.asar/dist.

    // Use the relative path approach as it's more standard for ASAR.
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
    title: "Turtle Tracer",
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
    // If approved the close, let it proceed
    if (newWindow.isCloseApproved) {
      return;
    }

    // Prevent default closing behavior
    e.preventDefault();

    // Ask the renderer if it's okay to close (check for unsaved changes)
    // send this to the specific window trying to close
    newWindow.webContents.send("app-close-requested");
  });

  newWindow.on("closed", () => {
    windows.delete(newWindow);
    newWindow = null;
  });
};

const updateDockMenu = () => {
  if (process.platform === "darwin") {
    dockMenu = Menu.buildFromTemplate([
      {
        label: "New Window",
        click() {
          createWindow();
        },
      },
    ]);
    app.dock.setMenu(dockMenu);
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
    // Try to find the last active one if getFocusedWindow is null.
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
              label: "Export as .turt File...",
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
              "https://github.com/Mallen220/TurtleTracer",
            );
          },
        },
      ],
    },
  ];

  appMenu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(appMenu);
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

// Add handler for renderer ready signal

import { registerIpcHandlers } from "./ipc/index.js";

// Call registerIpcHandlers with the needed state
registerIpcHandlers({
  windows,
  get pendingFilePath() {
    return pendingFilePath;
  },
  set pendingFilePath(val) {
    pendingFilePath = val;
  },
  get appUpdater() {
    return appUpdater;
  },
  set appUpdater(val) {
    appUpdater = val;
  },
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
