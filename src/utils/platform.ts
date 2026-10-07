// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { ElectronAPI } from "../types";
import { withGitHubRepos } from "./github/router";

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
  typeof globalThis !== "undefined" &&
  typeof navigator !== "undefined" &&
  !/Electron/i.test(navigator.userAgent);

/**
 * The desktop app's preload API, or the in-browser stand-in, with files in
 * GitHub repositories (/@github/...) handled too. Pass `allowVirtual: false`
 * to get only the real desktop API.
 */
export function getElectronAPI(options?: {
  allowVirtual?: boolean;
}): ElectronAPI | undefined {
  const api = globalThis.electronAPI ?? globalThis.window?.electronAPI;
  if (!api || (options?.allowVirtual === false && api.isVirtual)) {
    return undefined;
  }
  return withGitHubRepos(api);
}

/**
 * Where a file the user dropped or picked lives on disk, in the desktop app.
 * Electron 32+ no longer sets `File.path`, so ask the preload API instead.
 */
export function diskPathOf(file: File): string | undefined {
  const legacyPath = (file as File & { path?: string }).path;
  if (legacyPath) return legacyPath;
  try {
    return getElectronAPI()?.getPathForFile?.(file) || undefined;
  } catch (e) {
    console.warn("getPathForFile failed:", e);
    return undefined;
  }
}
