// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { ipcMain, BrowserWindow, dialog } from "electron";
import fs from "fs/promises";
import path from "path";
import simpleGit from "simple-git";
import { isProjectFilePath } from "../utils.js";

function normalizeAndValidatePath(inputPath) {
  if (typeof inputPath !== "string") {
    throw new Error("Invalid path provided");
  }
  if (inputPath.includes("\0")) {
    throw new Error("Path contains null bytes");
  }
  return path.normalize(inputPath);
}

export function registerFileHandlers() {
  ipcMain.handle("file:copy", async (event, srcPath, destPath) => {
    try {
      const safeSrc = normalizeAndValidatePath(srcPath);
      const safeDest = normalizeAndValidatePath(destPath);
      await fs.copyFile(safeSrc, safeDest);
      return true;
    } catch (error) {
      console.error("Error copying file:", error);
      throw error;
    }
  });

  ipcMain.handle("file:rename", async (event, oldPath, newPath) => {
    try {
      const safeOld = normalizeAndValidatePath(oldPath);
      const safeNew = normalizeAndValidatePath(newPath);
      const exists = await fs
        .access(safeNew)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        throw new Error(`File "${path.basename(safeNew)}" already exists`);
      }
      await fs.rename(safeOld, safeNew);
      return { success: true, newPath: safeNew };
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
      console.warn(
        "file:list called with empty or invalid directory:",
        JSON.stringify(directory),
      );
      return [];
    }

    let safeDirectory;
    try {
      safeDirectory = normalizeAndValidatePath(directory);
      await fs.access(safeDirectory);
    } catch (err) {
      console.warn(
        "Directory not accessible in file:list:",
        directory,
        err && err.code,
      );
      return [];
    }

    try {
      const dirents = await fs.readdir(safeDirectory, { withFileTypes: true });
      const projectFilesAndDirs = dirents.filter(
        (dirent) => dirent.isDirectory() || isProjectFilePath(dirent.name),
      );

      let gitStatuses = {};
      try {
        const git = simpleGit(safeDirectory);
        if (await git.checkIsRepo()) {
          const status = await git.status();
          const rootDir = await git.revparse(["--show-toplevel"]);

          status.files.forEach((fileStatus) => {
            const absPath = normalizeAndValidatePath(
              path.resolve(rootDir.trim(), fileStatus.path),
            );
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
            gitStatuses[absPath] = statusStr;
          });
        }
      } catch (e) {
        console.warn("Error checking git status:", e);
      }

      const fileDetails = await Promise.all(
        projectFilesAndDirs.map(async (dirent) => {
          const filePath = normalizeAndValidatePath(
            path.join(safeDirectory, dirent.name),
          );
          const stats = await fs.stat(filePath);
          const resolvedPath = normalizeAndValidatePath(path.resolve(filePath));
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
    try {
      const safePath = normalizeAndValidatePath(filePath);
      const content = await fs.readFile(safePath, "utf-8");
      return content;
    } catch (error) {
      console.error("Error reading file:", error);
      throw error;
    }
  });

  ipcMain.handle("file:write", async (event, filePath, content) => {
    try {
      const safePath = normalizeAndValidatePath(filePath);
      await fs.writeFile(safePath, content, "utf-8");
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
      return result.filePath ? normalizeAndValidatePath(result.filePath) : null;
    } catch (error) {
      console.error("Error showing save dialog:", error);
      throw error;
    }
  });

  ipcMain.handle(
    "file:write-base64",
    async (event, filePath, base64Content) => {
      try {
        const safePath = normalizeAndValidatePath(filePath);
        const buffer = Buffer.from(base64Content, "base64");
        await fs.writeFile(safePath, buffer);
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
          defaultPath:
            defaultName && defaultName.endsWith(".pp")
              ? defaultName
              : `${defaultName}.pp`,
          filters: [{ name: "Turtle Tracer Path", extensions: ["pp"] }],
        };
        const result = await dialog.showSaveDialog(win, options);
        if (result.canceled || !result.filePath) return null;
        const safePath = normalizeAndValidatePath(result.filePath);
        await fs.writeFile(safePath, content, "utf-8");
        return safePath;
      } catch (error) {
        console.error("Error exporting legacy .pp file:", error);
        throw error;
      }
    },
  );

  ipcMain.handle("file:delete", async (event, filePath) => {
    try {
      const safePath = normalizeAndValidatePath(filePath);
      const stats = await fs.stat(safePath);
      if (stats.isDirectory()) {
        await fs.rm(safePath, { recursive: true, force: true });
      } else {
        await fs.unlink(safePath);
      }
      return true;
    } catch (error) {
      console.error("Error deleting file:", error);
      throw error;
    }
  });

  ipcMain.handle("file:exists", async (event, filePath) => {
    try {
      const safePath = normalizeAndValidatePath(filePath);
      await fs.access(safePath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("file:resolve-path", (event, base, relative) => {
    if (!base || !relative) return relative;
    try {
      return normalizeAndValidatePath(path.resolve(path.dirname(base), relative));
    } catch (e) {
      console.error("Error resolving path:", base, relative, e);
      return relative;
    }
  });

  ipcMain.handle("file:make-relative-path", (event, base, target) => {
    if (!base || !target) return target;
    try {
      // make-relative-path doesn't strictly access the filesystem, but uses the paths.
      const safeBase = normalizeAndValidatePath(base);
      const safeTarget = normalizeAndValidatePath(target);
      return path.relative(path.dirname(safeBase), safeTarget);
    } catch (e) {
      console.error("Error making relative path:", base, target, e);
      return target;
    }
  });
}
