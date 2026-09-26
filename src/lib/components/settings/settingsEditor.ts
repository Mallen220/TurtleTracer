// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { DEFAULT_SETTINGS } from "../../../config/defaults";
import type { Settings } from "../../../types";

/**
 * Helpers for a settings tab. The tabs' `settings` prop is bound to the
 * settings store, so changes must replace the object (not mutate it) for
 * the store to see them.
 */
export function settingsEditor(
  read: () => Settings,
  write: (next: Settings) => void,
) {
  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    write({ ...read(), [key]: value });
  }

  /**
   * Sets a number setting from an input's text, clamped to [min, max].
   * Clearing the input restores the default.
   */
  function setNumber(
    key: keyof Settings,
    text: string,
    min = -Infinity,
    max = Infinity,
  ) {
    if (text === "") {
      set(key, DEFAULT_SETTINGS[key]);
      return;
    }
    const num = Number.parseFloat(text);
    set(key, Math.min(max, Math.max(min, Number.isNaN(num) ? 0 : num)) as any);
  }

  /** `isModified` and `onReset` for a SettingsItem that edits one setting. */
  function resettable(key: keyof Settings) {
    return {
      isModified: read()[key] !== DEFAULT_SETTINGS[key],
      onReset: () => set(key, DEFAULT_SETTINGS[key]),
    };
  }

  return { set, setNumber, resettable };
}
