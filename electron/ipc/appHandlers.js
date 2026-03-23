import { ipcMain, BrowserWindow, shell, app } from "electron";
import AppUpdater from "../updater.js";

export function registerAppHandlers(state) {
  ipcMain.handle("renderer-ready", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const pendingFilePath = state.pendingFilePath;
    if (pendingFilePath) {
      win.webContents.send("open-file-path", pendingFilePath);
      state.pendingFilePath = null;
    }
    return true;
  });

  ipcMain.handle("app:open-external", async (event, url) => {
    try {
      await shell.openExternal(url);
      return true;
    } catch (err) {
      console.warn("Failed to open external url", url, err);
      return false;
    }
  });

  ipcMain.handle("app-close-approved", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.isCloseApproved = true;
      win.close();
    }
  });

  ipcMain.handle("app:get-app-data-path", () => {
    return app.getPath("userData");
  });

  ipcMain.handle("app:get-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("app:is-windows-store", () => {
    return process.windowsStore || false;
  });

  ipcMain.handle("update:download", (event, version, url) => {
    if (state.appUpdater) {
      state.appUpdater.handleDownloadAndInstall(version, url);
    }
  });

  ipcMain.handle("update:skip", (event, version) => {
    if (state.appUpdater) {
      state.appUpdater.skipVersion(version);
    }
  });

  ipcMain.handle("update:check", async (event) => {
    try {
      if (!state.appUpdater) {
        const win =
          BrowserWindow.getFocusedWindow() ||
          state.windows.values().next().value;
        if (win) state.appUpdater = new AppUpdater(win);
      }
      if (state.appUpdater) {
        const result = await state.appUpdater.checkForUpdates(true);
        return { success: true, ...result };
      }
      return { success: false, message: "no-updater" };
    } catch (err) {
      console.error("Error during manual update check:", err);
      return {
        success: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  });
}
