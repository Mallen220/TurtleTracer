// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The handlers give the page the file system, so only the app's own page may
// call them, not another frame or a page that got loaded in the window.

/** Whether an IPC call came from a frame served from the app's own address. */
export function isFromApp(event, appOrigin) {
  try {
    return new URL(event.senderFrame?.url).origin === appOrigin;
  } catch {
    return false;
  }
}

/**
 * Runs `register`, which adds handlers with `ipcMain.handle`, so that each one
 * refuses a call that doesn't come from the app. `appOrigin` is read at each
 * call, because the port isn't known until the server has started.
 */
export function registerOnlyForApp(ipcMain, appOrigin, register) {
  const handle = ipcMain.handle;
  ipcMain.handle = (channel, listener) =>
    handle.call(ipcMain, channel, (event, ...args) => {
      if (!isFromApp(event, appOrigin())) {
        throw new Error(`Refused ${channel}: not called from the app's page.`);
      }
      return listener(event, ...args);
    });
  try {
    register();
  } finally {
    ipcMain.handle = handle;
  }
}
