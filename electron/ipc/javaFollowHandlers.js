// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Following a Java file: the page picks one and is told each time it's saved,
// so the field shows what the code in the team's editor says.
import { ipcMain, BrowserWindow, dialog } from "electron";
import fs from "node:fs";
import { validateArbitraryPath } from "../utils.js";

/** How often the file is checked for a save, in milliseconds. */
const CHECK_INTERVAL = 250;

/**
 * Watches one Java file per window. The file is checked by its modification
 * time rather than watched for events, because editors such as Android
 * Studio save by writing a new file and renaming it over the old one.
 */
export function createJavaFollower({
  watchFile = fs.watchFile,
  unwatchFile = fs.unwatchFile,
} = {}) {
  /** What each window follows: the file and its listener, by sender id. */
  const following = new Map();
  /** Windows already set to stop following when they close. */
  const closing = new Set();

  function stop(sender) {
    const current = following.get(sender.id);
    if (!current) return;
    unwatchFile(current.path, current.listener);
    following.delete(sender.id);
  }

  function follow(sender, filePath) {
    const resolved = validateArbitraryPath(filePath);
    if (!resolved.toLowerCase().endsWith(".java")) {
      throw new Error("Only Java files can be followed.");
    }
    stop(sender);
    const listener = (current, previous) => {
      if (
        current.mtimeMs === previous.mtimeMs &&
        current.size === previous.size
      )
        return;
      if (!sender.isDestroyed()) sender.send("java:changed", filePath);
    };
    watchFile(resolved, { interval: CHECK_INTERVAL }, listener);
    following.set(sender.id, { path: resolved, listener });
    if (!closing.has(sender.id)) {
      closing.add(sender.id);
      sender.once("destroyed", () => {
        stop(sender);
        closing.delete(sender.id);
      });
    }
    return true;
  }

  return { follow, stop, following };
}

export function registerJavaFollowHandlers() {
  const follower = createJavaFollower();
  ipcMain.handle("java:choose-file", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: "Follow a Java file",
      properties: ["openFile"],
      filters: [{ name: "Java", extensions: ["java"] }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("java:follow", (event, filePath) =>
    follower.follow(event.sender, filePath),
  );
  ipcMain.handle("java:unfollow", (event) => {
    follower.stop(event.sender);
    return true;
  });
}
