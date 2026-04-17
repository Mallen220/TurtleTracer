// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import simpleGit from "simple-git";

export function registerGitHandlers() {
  ipcMain.handle("git:show", async (event, filePath) => {
    try {
      const git = simpleGit(path.dirname(filePath));
      const isRepo = await git.checkIsRepo();
      if (!isRepo) return null;

      const rawRoot = await git.revparse(["--show-toplevel"]);
      const root = await fs.realpath(rawRoot.trim());
      const realFilePath = await fs.realpath(filePath);

      const relativePath = path
        .relative(root, realFilePath)
        .replaceAll("\\", "/");
      const content = await git.show([`HEAD:${relativePath}`]);
      return content;
    } catch (error) {
      console.warn("Error running git show:", error);
      return null;
    }
  });

  ipcMain.handle("git:status", async (event, directory) => {
    if (
      !directory ||
      typeof directory !== "string" ||
      directory.trim() === ""
    ) {
      return {};
    }
    let gitStatuses = {};
    try {
      const git = simpleGit(directory);
      if (await git.checkIsRepo()) {
        const status = await git.status();
        const rawRoot = await git.revparse(["--show-toplevel"]);
        const rootDir = await fs.realpath(rawRoot.trim());

        for (const fileStatus of status.files) {
          const absPath = path.resolve(rootDir, fileStatus.path);
          // Ensure we use the realpath for the key to match the app's file paths
          let realAbsPath = absPath;
          try {
            realAbsPath = await fs.realpath(absPath);
          } catch {
            // File might be deleted, use absPath as fallback
          }

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

          gitStatuses[realAbsPath] = statusStr;
        }
      }
    } catch (e) {
      console.warn("Error checking git status:", e);
    }
    return gitStatuses;
  });
}
