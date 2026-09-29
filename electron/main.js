// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { app, BrowserWindow, Menu, shell } from "electron";
import path from "node:path";
import express from "express";
import http from "node:http";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import rateLimit from "express-rate-limit";
import AppUpdater from "./updater.js";
import { isProjectFilePath, getPluginsDirectory } from "./utils.js";
import { registerIpcHandlers } from "./ipc/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const windows = new Set();
let server;
let serverPort = 17218;
let appUpdater;

// Keep menus referenced globally; otherwise they can be garbage collected on
// macOS while still in use.
globalThis.appMenu = null;
globalThis.dockMenu = null;

// Stale service worker caches from a previous version can stop the UI from
// loading, so they're cleared once per launch.
let cachesCleared = false;

// A file the OS asked us to open before a window was ready to receive it.
let pendingFilePath = null;

// Handle macOS open-file event (triggered when app is launching or running)
app.on("open-file", (event, path) => {
  event.preventDefault();
  handleOpenedFile(path);
});

// Microsoft Store updates wipe LocalCache, so keep user data in LocalState.
if (process.windowsStore) {
  const oldUserDataPath = app.getPath("userData");
  if (oldUserDataPath.includes("LocalCache")) {
    const newUserDataPath = oldUserDataPath.replaceAll(
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

if (gotTheLock) {
  app.on("second-instance", (event, commandLine, _workingDirectory) => {
    // Someone tried to run a second instance. Prefer focusing an existing window
    // to avoid racing with the local server or creating orphan windows.
    try {
      const focused = BrowserWindow.getFocusedWindow();
      if (focused) {
        if (focused.isMinimized()) focused.restore();
        focused.focus();
      } else if (windows.size > 0) {
        const arr = Array.from(windows);
        const last = arr.at(-1);
        if (last) {
          if (last.isMinimized()) last.restore();
          last.focus();
        } else {
          openWindow();
        }
      } else {
        openWindow();
      }

      // Check for file arguments in the second instance command line
      // Windows/Linux: The file path is usually the last argument or specifically passed
      const lastArg = commandLine.at(-1);
      if (isProjectFilePath(lastArg)) {
        handleOpenedFile(lastArg);
      }
    } catch (err) {
      console.error("Error in second-instance handler:", err);
      openWindow();
    }
  });

  // App initialization
  app.on("ready", async () => {
    // Check for file arguments on initial launch (Windows/Linux)
    if (process.platform !== "darwin" && process.argv.length >= 2) {
      const lastArg = process.argv.at(-1);
      if (isProjectFilePath(lastArg)) {
        pendingFilePath = lastArg;
      }
    }

    await startServer();
    openWindow();
    createMenu();
    updateDockMenu();
    updateJumpList();
    // Logs its own failures.
    void ensureDefaultPlugins();

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
} else {
  app.quit();
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
 * Serves the built UI from dist/ on localhost. If the preferred port is taken,
 * tries the following ports until one is free.
 */
const startServer = async () => {
  const expressApp = express();
  const distPath = path.join(__dirname, "../dist");

  expressApp.use(express.static(distPath));

  // Everything else gets the single-page app.
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  expressApp.get("*", limiter, (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  const maxAttempts = 100;
  await new Promise((resolve, reject) => {
    let attempt = 0;
    let port = serverPort;

    const tryListen = () => {
      attempt += 1;
      // Use a fresh server for each attempt so a failed listen doesn't linger.
      const candidate = http.createServer(expressApp);
      candidate.once("error", (err) => {
        if (err?.code === "EADDRINUSE" && attempt < maxAttempts) {
          port += 1;
          setTimeout(tryListen, 10);
        } else {
          reject(err);
        }
      });
      candidate.once("listening", () => {
        server = candidate;
        serverPort = port;
        resolve();
      });
      candidate.listen(port, "127.0.0.1");
    };

    tryListen();
  });
};

const isWebUrl = (url) => {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const createWindow = async () => {
  let newWindow = new BrowserWindow({
    width: 1360,
    height: 800,
    title: "Turtle Tracer",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  windows.add(newWindow);

  // The preload script exposes file system access, so this window must only
  // ever show our own UI. Links to anywhere else open in the user's browser.
  const appOrigin = `http://localhost:${serverPort}`;
  newWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  newWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${appOrigin}/`) || url === appOrigin) return;
    event.preventDefault();
    if (isWebUrl(url)) shell.openExternal(url);
  });

  if (!cachesCleared) {
    try {
      const { session } = newWindow.webContents;
      await session.clearCache();
      // Only caches: localStorage holds robot profiles and other user data.
      await session.clearStorageData({
        storages: ["serviceworkers", "cachestorage"],
      });
      cachesCleared = true;
    } catch (err) {
      console.warn("Failed to clear cached app data:", err);
    }
  }

  newWindow.loadURL(appOrigin);

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

  // Let the renderer check for unsaved changes first. It replies through the
  // "app-close-approved" IPC handler, which sets isCloseApproved.
  newWindow.on("close", (e) => {
    if (newWindow.isCloseApproved) return;
    e.preventDefault();
    newWindow.webContents.send("app-close-requested");
  });

  newWindow.on("closed", () => {
    windows.delete(newWindow);
    newWindow = null;
  });
};

/** Opens a window from code that can't wait for it; a failure is logged. */
const openWindow = () =>
  createWindow().catch((err) => console.error("Failed to create window:", err));

const updateDockMenu = () => {
  if (process.platform === "darwin") {
    globalThis.dockMenu = Menu.buildFromTemplate([
      {
        label: "New Window",
        click() {
          openWindow();
        },
      },
    ]);
    app.dock.setMenu(globalThis.dockMenu);
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

// Menu clicks go to the focused window, or the only window if none has focus.
const sendToFocusedWindow = (channel, ...args) => {
  const win =
    BrowserWindow.getFocusedWindow() ??
    (windows.size === 1 ? windows.values().next().value : null);
  win?.webContents.send(channel, ...args);
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
          click: () => openWindow(),
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

  globalThis.appMenu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(globalThis.appMenu);
};

// Quit when the last window closes, on every platform (including macOS).
app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  if (server) {
    server.close();
  }
});

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

/** Copies the bundled plugins into the user's plugins folder if missing. */
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
