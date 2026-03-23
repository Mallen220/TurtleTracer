import { ipcMain, BrowserWindow, dialog } from "electron";
import fs from "fs/promises";
import path from "path";
import simpleGit from "simple-git";
import { isProjectFilePath } from "../utils.js";

export function registerFileHandlers() {
  ipcMain.handle("file:copy", async (event, srcPath, destPath) => {
    try {
      await fs.copyFile(srcPath, destPath);
      return true;
    } catch (error) {
      console.error("Error copying file:", error);
      throw error;
    }
  });

  ipcMain.handle("file:rename", async (event, oldPath, newPath) => {
    try {
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
    try {
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
      const dirents = await fs.readdir(directory, { withFileTypes: true });
      const projectFilesAndDirs = dirents.filter(
        (dirent) => dirent.isDirectory() || isProjectFilePath(dirent.name),
      );

      let gitStatuses = {};
      try {
        const git = simpleGit(directory);
        if (await git.checkIsRepo()) {
          const status = await git.status();
          const rootDir = await git.revparse(["--show-toplevel"]);

          status.files.forEach((fileStatus) => {
            const absPath = path.resolve(rootDir.trim(), fileStatus.path);
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
          const filePath = path.join(directory, dirent.name);
          const stats = await fs.stat(filePath);
          const resolvedPath = path.resolve(filePath);
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
      try {
        const buffer = Buffer.from(base64Content, "base64");
        await fs.writeFile(filePath, buffer);
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
        await fs.writeFile(result.filePath, content, "utf-8");
        return result.filePath;
      } catch (error) {
        console.error("Error exporting legacy .pp file:", error);
        throw error;
      }
    },
  );

  ipcMain.handle("file:delete", async (event, filePath) => {
    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.unlink(filePath);
      }
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
