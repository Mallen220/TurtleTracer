// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { ipcMain, BrowserWindow, dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import simpleGit from "simple-git";
import { isProjectFilePath, validateArbitraryPath } from "../utils.js";

export function registerFileHandlers() {
  ipcMain.handle("file:copy", async (event, srcPath, destPath) => {
    const resolvedSrc = validateArbitraryPath(srcPath);
    const resolvedDest = validateArbitraryPath(destPath);
    try {
      await fs.copyFile(resolvedSrc, resolvedDest);
      return true;
    } catch (error) {
      console.error("Error copying file:", error);
      throw error;
    }
  });

  ipcMain.handle("file:rename", async (event, oldPath, newPath) => {
    const resolvedOld = validateArbitraryPath(oldPath);
    const resolvedNew = validateArbitraryPath(newPath);
    try {
      const exists = await fs
        .access(resolvedNew)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        throw new Error(`File "${path.basename(resolvedNew)}" already exists`);
      }
      await fs.rename(resolvedOld, resolvedNew);
      return { success: true, newPath: resolvedNew };
    } catch (error) {
      console.error("Error renaming file:", error);
      throw error;
    }
  });

  ipcMain.handle("file:list", async (event, directory) => {
    if (
      !directory ||
      typeof directory !== "string" ||
      directory.trim() === ""
    ) {
      return [];
    }
    let resolvedDir;
    try {
      resolvedDir = validateArbitraryPath(directory);
    } catch (e) {
      console.warn("file:list called with invalid directory:", e.message);
      return [];
    }
    try {
      await fs.access(resolvedDir);
    } catch (err) {
      console.warn(
        "Directory not accessible in file:list:",
        resolvedDir,
        err?.code,
      );
      return [];
    }

    try {
      const dirents = await fs.readdir(resolvedDir, { withFileTypes: true });
      const projectFilesAndDirs = dirents.filter(
        (dirent) => dirent.isDirectory() || isProjectFilePath(dirent.name),
      );

      let gitStatuses = {};
      try {
        const git = simpleGit(directory);
        if (await git.checkIsRepo()) {
          const status = await git.status();
          const rawRoot = await git.revparse(["--show-toplevel"]);
          const rootDir = await fs.realpath(rawRoot.trim());

          for (const fileStatus of status.files) {
            const absPath = path.resolve(rootDir, fileStatus.path);
            let realAbsPath = absPath;
            try {
              realAbsPath = await fs.realpath(absPath);
            } catch {
              // File might be deleted
            }
            let statusStr = "clean";
            if (
              fileStatus.working_dir === "?" ||
              fileStatus.working_dir === "U"
            )
              statusStr = "untracked";
            else if (
              fileStatus.working_dir !== " " &&
              fileStatus.working_dir !== "?"
            )
              statusStr = "modified";
            else if (fileStatus.index !== " " && fileStatus.index !== "?")
              statusStr = "staged";
            gitStatuses[realAbsPath] = statusStr;
          }
        }
      } catch (e) {
        console.warn("Error checking git status:", e);
      }

      const fileDetails = await Promise.all(
        projectFilesAndDirs.map(async (dirent) => {
          const filePath = path.join(directory, dirent.name);

          const stats = await fs.stat(filePath);
          const resolvedPath = await fs.realpath(filePath);
          return {
            name: dirent.name,
            path: filePath,
            size: dirent.isDirectory() ? 0 : stats.size,
            modified: stats.mtime,
            gitStatus: gitStatuses[resolvedPath] || "clean",
            isDirectory: dirent.isDirectory(),
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
    const resolvedPath = validateArbitraryPath(filePath);
    try {
      const content = await fs.readFile(resolvedPath, "utf-8");
      return content;
    } catch (error) {
      console.error("Error reading file:", error);
      throw error;
    }
  });

  ipcMain.handle("file:write", async (event, filePath, content) => {
    const resolvedPath = validateArbitraryPath(filePath);
    try {
      await fs.writeFile(resolvedPath, content, "utf-8");
      return true;
    } catch (error) {
      console.error("Error writing file:", error);
      throw error;
    }
  });

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

  ipcMain.handle(
    "file:write-base64",
    async (event, filePath, base64Content) => {
      const resolvedPath = validateArbitraryPath(filePath);
      try {
        const buffer = Buffer.from(base64Content, "base64");
        await fs.writeFile(resolvedPath, buffer);
        return true;
      } catch (error) {
        console.error("Error writing base64 file:", error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "export:pp",
    async (event, { content, defaultName = "trajectory.pp" } = {}) => {
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        const options = {
          title: "Export .pp File (Legacy)",
          defaultPath: defaultName?.endsWith(".pp")
            ? defaultName
            : `${defaultName}.pp`,
          filters: [{ name: "Turtle Tracer Path", extensions: ["pp"] }],
        };
        const result = await dialog.showSaveDialog(win, options);
        if (result.canceled || !result.filePath) return null;
        const resolvedPath = validateArbitraryPath(result.filePath);
        await fs.writeFile(resolvedPath, content, "utf-8");
        return result.filePath;
      } catch (error) {
        console.error("Error exporting legacy .pp file:", error);
        throw error;
      }
    },
  );

  ipcMain.handle("file:delete", async (event, filePath) => {
    const resolvedPath = validateArbitraryPath(filePath);
    try {
      const stats = await fs.stat(resolvedPath);
      if (stats.isDirectory()) {
        await fs.rm(resolvedPath, { recursive: true, force: true });
      } else {
        await fs.unlink(resolvedPath);
      }
      return true;
    } catch (error) {
      console.error("Error deleting file:", error);
      throw error;
    }
  });

  ipcMain.handle("file:exists", async (event, filePath) => {
    let resolvedPath;
    try {
      resolvedPath = validateArbitraryPath(filePath);
    } catch {
      return false;
    }
    try {
      await fs.access(resolvedPath);
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

  ipcMain.handle("file:make-relative-path", (event, base, target) => {
    if (!base || !target) return target;
    try {
      return path.relative(path.dirname(base), target);
    } catch (e) {
      console.error("Error making relative path:", base, target, e);
      return target;
    }
  });
}
