// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import simpleGit from "simple-git";

function classifyStatus({ index, working_dir: workingDir }) {
  if (workingDir === "?" || workingDir === "U") return "untracked";
  if (workingDir !== " ") return "modified";
  if (index !== " " && index !== "?") return "staged";
  return "clean";
}

/**
 * Git status of every changed file in the repository containing `directory`,
 * keyed by real (symlink-resolved) absolute path. Files that aren't listed
 * are clean. Returns {} if the directory isn't in a git repository.
 */
export async function getGitStatuses(directory) {
  const statuses = {};
  try {
    const git = simpleGit(directory);
    if (!(await git.checkIsRepo())) return statuses;

    const status = await git.status();
    const rawRoot = await git.revparse(["--show-toplevel"]);
    const rootDir = await fs.realpath(rawRoot.trim());

    for (const fileStatus of status.files) {
      const absPath = path.resolve(rootDir, fileStatus.path);
      // Deleted files have no real path, so fall back to the plain one.
      const key = await fs.realpath(absPath).catch(() => absPath);
      statuses[key] = classifyStatus(fileStatus);
    }
  } catch (e) {
    console.warn("Error checking git status:", e);
  }
  return statuses;
}

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
    if (typeof directory !== "string" || directory.trim() === "") return {};
    return getGitStatuses(directory);
  });
}
