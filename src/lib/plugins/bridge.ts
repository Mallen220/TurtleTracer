// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What the app hands the plugin host: the parts of App that live in
// components rather than stores.
export interface AppBridge {
  /** Records an edit for undo and marks the project unsaved. */
  recordChange(description: string): void;
  playback: {
    /** Moves the playhead, as a percentage of the routine. */
    seek(percent: number): void;
    play(): void;
    pause(): void;
    /** Seconds the routine takes. */
    readonly duration: number;
  };
}

let current: AppBridge | null = null;

export function setAppBridge(bridge: AppBridge) {
  current = bridge;
}

/** The app's bridge. Plugins only start after App has set it. */
export function appBridge(): AppBridge {
  if (!current) throw new Error("The plugin host was used before App started.");
  return current;
}
