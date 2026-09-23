// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { ElectronAPI } from "../types";

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
 * Access electronAPI safely across Node, browser, Electron and test mock environments.
 */
export function getElectronAPI(options?: {
  allowVirtual?: boolean;
}): ElectronAPI | undefined {
  const allowVirtual = options?.allowVirtual ?? true;
  if (typeof globalThis !== "undefined") {
    const api =
      (globalThis as any).electronAPI ??
      (globalThis as any).window?.electronAPI;
    if (api) {
      if (!allowVirtual && api.isVirtual) {
        return undefined;
      }
      return api as ElectronAPI;
    }
  }
  if (typeof globalThis !== "undefined" && globalThis.electronAPI) {
    if (!allowVirtual && globalThis.electronAPI.isVirtual) {
      return undefined;
    }
    return globalThis.electronAPI;
  }
  return undefined;
}
