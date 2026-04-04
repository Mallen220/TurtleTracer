// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.

export function platform(): string {
  if (typeof process !== "undefined" && process.platform) {
    return process.platform;
  }
  if (typeof navigator !== "undefined" && navigator.platform) {
    return navigator.platform;
  }
  return "unknown";
}

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? "Cmd" : "Ctrl";
export const altKey = isMac ? "Opt" : "Alt";

export const isBrowser =
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  !/Electron/i.test(navigator.userAgent);
