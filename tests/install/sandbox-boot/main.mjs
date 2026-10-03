// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Boots a sandboxed Electron window the way the packaged app does. On a system where Chromium's
// sandbox cannot work (no setuid helper, user namespaces blocked) it only starts with --no-sandbox,
// and that decision has to be made before Electron starts: app code runs too late to change it.
import { app, BrowserWindow } from "electron";

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true },
  });
  await win.loadURL("data:text/html,<title>ok</title>hello");
  console.log("BOOT_OK");
  app.quit();
});
