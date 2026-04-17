// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { ipcMain, BrowserWindow, dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import {
  loadDirectorySettings,
  saveDirectorySettings,
  isProjectFilePath,
  validateArbitraryPath,
} from "../utils.js";

export function registerDirectoryHandlers() {
  ipcMain.handle("file:get-directory", async () => {
    const settings = await loadDirectorySettings();
    if (
      settings.autoPathsDirectory &&
      settings.autoPathsDirectory.trim() !== ""
    ) {
      try {
        await fs.access(settings.autoPathsDirectory);
        return settings.autoPathsDirectory;
      } catch {
        console.log(
          "Saved directory no longer accessible, falling back to default",
        );
      }
    }
    const defaultDir = path.join(process.env.HOME, "Documents", "AutoPaths");
    try {
      await fs.access(defaultDir);
      return defaultDir;
    } catch {
      return null;
    }
  });

  ipcMain.handle("file:set-directory", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Select AutoPaths Directory",
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedDir = result.filePaths[0];
      const settings = await loadDirectorySettings();
      settings.autoPathsDirectory = selectedDir;
      await saveDirectorySettings(settings);
      return selectedDir;
    }
    return null;
  });

  ipcMain.handle("file:select-directory", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
      title: "Select Directory",
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle("directory:get-settings", async () => {
    return await loadDirectorySettings();
  });

  ipcMain.handle("directory:save-settings", async (event, settings) => {
    return await saveDirectorySettings(settings);
  });

  ipcMain.handle("directory:get-saved-directory", async () => {
    const settings = await loadDirectorySettings();
    return settings.autoPathsDirectory || "";
  });

  ipcMain.handle("file:create-directory", async (event, dirPath) => {
    if (!dirPath || typeof dirPath !== "string" || dirPath.trim() === "") {
      throw new Error("Invalid directory path");
    }
    const resolvedPath = validateArbitraryPath(dirPath);
    try {
      await fs.mkdir(resolvedPath, { recursive: true });
      return true;
    } catch (error) {
      console.error("Error creating directory:", error);
      throw error;
    }
  });

  ipcMain.handle("file:get-directory-stats", async (event, dirPath) => {
    if (!dirPath || typeof dirPath !== "string" || dirPath.trim() === "") {
      return {
        totalFiles: 0,
        totalSize: 0,
        lastModified: new Date(0),
      };
    }
    let resolvedPath;
    try {
      resolvedPath = validateArbitraryPath(dirPath);
    } catch {
      // Catch for not a valid path
      return {
        totalFiles: 0,
        totalSize: 0,
        lastModified: new Date(0),
      };
    }
    try {
      await fs.access(resolvedPath);
    } catch (err) {
      console.warn(
        "Directory not accessible in file:get-directory-stats:",
        resolvedPath,
        err?.code,
      );
      return {
        totalFiles: 0,
        totalSize: 0,
        lastModified: new Date(0),
      };
    }
    try {
      const files = await fs.readdir(resolvedPath);
      const projectFiles = files.filter((file) => isProjectFilePath(file));

      let totalSize = 0;
      let latestModified = new Date(0);

      for (const file of projectFiles) {
        const filePath = path.join(dirPath, file);

        const stats = await fs.stat(filePath);
        totalSize += stats.size;
        if (stats.mtime > latestModified) {
          latestModified = stats.mtime;
        }
      }

      return {
        totalFiles: projectFiles.length,
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
}
