// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { ipcMain } from "electron";
import path from "path";
import simpleGit from "simple-git";

export function registerGitHandlers() {
  ipcMain.handle("git:show", async (event, filePath) => {
    try {
      const git = simpleGit(path.dirname(filePath));
      const isRepo = await git.checkIsRepo();
      if (!isRepo) return null;

      const root = await git.revparse(["--show-toplevel"]);
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
    return gitStatuses;
  });
}
