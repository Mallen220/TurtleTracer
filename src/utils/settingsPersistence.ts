// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { DEFAULT_SETTINGS } from "../config/defaults";
import { getElectronAPI as getPlatformElectronAPI } from "./platform";
import type {
  ElectronAPI,
  KeyBinding,
  ObstaclePreset,
  Settings,
} from "../types";

// Versioning for settings schema
const SETTINGS_VERSION = "1.0.0";
const SETTINGS_FILE_NAME = "turtle-tracer-settings.json";
const LEGACY_SETTINGS_FILE_NAME = "pedro-settings.json";
const SETTINGS_STORAGE_KEY = "turtle-tracer-settings";
const LEGACY_SETTINGS_STORAGE_KEY = "pedro-settings";

interface StoredSettings {
  version: string;
  settings: Settings;
  lastUpdated: string;
}

// Helper to get electronAPI safely (disallows virtual in settings persistence)
function getElectronAPI(): ElectronAPI | undefined {
  return getPlatformElectronAPI({ allowVirtual: false });
}

// Get the settings file path
async function getSettingsPaths(): Promise<{
  current: string;
  legacy: string;
}> {
  const api = getElectronAPI();
  if (!api?.getAppDataPath) {
    console.warn("Electron API not available, using default settings");
    return { current: "", legacy: "" };
  }

  try {
    const appDataPath = await api.getAppDataPath();
    return {
      current: `${appDataPath}/${SETTINGS_FILE_NAME}`,
      legacy: `${appDataPath}/${LEGACY_SETTINGS_FILE_NAME}`,
    };
  } catch (error) {
    console.error("Error getting app data path:", error);
    return { current: "", legacy: "" };
  }
}

type StoredValues = Record<string, unknown>;

/** Robot size used to be rWidth (length) and rHeight (width). */
function migrateRobotSize(stored: StoredValues): StoredValues {
  if (!("rHeight" in stored) || "rLength" in stored) return stored;
  const { rHeight, rWidth, ...rest } = stored;
  return { ...rest, rLength: rWidth, rWidth: rHeight };
}

/** The current built-in presets, plus the user's own. */
function mergePresets(stored: unknown[]): ObstaclePreset[] {
  const defaults = DEFAULT_SETTINGS.obstaclePresets ?? [];
  const builtIn = new Set(defaults.map((p) => p.id));
  const custom = stored.filter(
    (p): p is ObstaclePreset =>
      !!p &&
      typeof p === "object" &&
      !!(p as ObstaclePreset).id &&
      !builtIn.has((p as ObstaclePreset).id),
  );
  return [...defaults, ...custom];
}

/** Every default binding, as the user remapped it, plus any they added. */
function mergeKeyBindings(stored: KeyBinding[]): KeyBinding[] {
  const defaults = DEFAULT_SETTINGS.keyBindings ?? [];
  const storedById = new Map(stored.map((b) => [b.id, b]));
  const defaultIds = new Set(defaults.map((d) => d.id));
  return [
    ...defaults.map((d) => ({ ...d, ...storedById.get(d.id) })),
    ...stored.filter((b) => !defaultIds.has(b.id)),
  ];
}

/**
 * Stored settings laid over the defaults. Keys the app no longer has are
 * dropped, and so are values of the wrong type.
 */
export function mergeSettings(source: unknown): Settings {
  const merged: Settings & StoredValues = { ...DEFAULT_SETTINGS };
  if (!source || typeof source !== "object") return merged;

  const stored = migrateRobotSize({ ...(source as StoredValues) });
  for (const [key, value] of Object.entries(stored)) {
    if (!(key in merged) || value === undefined || value === null) continue;
    const defaultValue = merged[key];

    if (key === "obstaclePresets" && Array.isArray(value)) {
      merged[key] = mergePresets(value);
    } else if (key === "keyBindings" && Array.isArray(value)) {
      merged[key] = mergeKeyBindings(value);
    } else if (defaultValue !== undefined && defaultValue !== null) {
      if (typeof defaultValue !== typeof value) {
        console.warn(
          `Ignoring setting ${key} due to type mismatch: expected ${typeof defaultValue}, got ${typeof value}`,
        );
      } else if (Array.isArray(defaultValue) && !Array.isArray(value)) {
        console.warn(`Ignoring setting ${key}: expected array`);
      } else {
        merged[key] = value;
      }
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function migrateSettings(stored: Partial<StoredSettings>): Settings {
  return mergeSettings(stored.settings);
}

// Load settings from file
export async function loadSettings(): Promise<Settings> {
  const api = getElectronAPI();
  if (!api) {
    // Try localStorage if Electron API is not available (browser mode)
    try {
      let local = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!local) {
        const legacyLocal = localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
        if (legacyLocal) {
          local = legacyLocal;
          localStorage.setItem(SETTINGS_STORAGE_KEY, legacyLocal);
          localStorage.removeItem(LEGACY_SETTINGS_STORAGE_KEY);
        }
      }
      if (local) {
        const stored: StoredSettings = JSON.parse(local);
        return migrateSettings(stored);
      }
    } catch (e) {
      console.error("Error loading settings from localStorage:", e);
    }
    console.warn("Electron API not available, returning default settings");
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const paths = await getSettingsPaths();
    const filePath = paths.current;

    if (!filePath) {
      return { ...DEFAULT_SETTINGS };
    }

    const hasCurrent = await api.fileExists(filePath);
    if (!hasCurrent) {
      const legacyPath = paths.legacy;
      if (legacyPath && (await api.fileExists(legacyPath))) {
        const legacyContent = await api.readFile(legacyPath);
        const legacyStored: StoredSettings = JSON.parse(legacyContent);
        const migrated = migrateSettings(legacyStored);
        const stored: StoredSettings = {
          version: SETTINGS_VERSION,
          settings: { ...migrated },
          lastUpdated: new Date().toISOString(),
        };
        await api.writeFile(filePath, JSON.stringify(stored, null, 2));
        return migrated;
      }
      return { ...DEFAULT_SETTINGS };
    }

    const fileContent = await api.readFile(filePath);
    const stored: StoredSettings = JSON.parse(fileContent);

    return migrateSettings(stored);
  } catch (error) {
    console.error("Error loading settings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

// Save settings to file
export async function saveSettings(settings: Settings): Promise<boolean> {
  const api = getElectronAPI();
  if (!api) {
    // Try localStorage if Electron API is not available (browser mode)
    try {
      const stored: StoredSettings = {
        version: SETTINGS_VERSION,
        settings: { ...settings },
        lastUpdated: new Date().toISOString(),
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(stored));
      localStorage.removeItem(LEGACY_SETTINGS_STORAGE_KEY);
      return true;
    } catch (e) {
      console.error("Error saving settings to localStorage:", e);
    }
    console.warn("Electron API not available, cannot save settings");
    return false;
  }

  try {
    const paths = await getSettingsPaths();
    const filePath = paths.current;

    if (!filePath) {
      console.error("Cannot get settings file path");
      return false;
    }

    const stored: StoredSettings = {
      version: SETTINGS_VERSION,
      settings: { ...settings },
      lastUpdated: new Date().toISOString(),
    };

    await api.writeFile(filePath, JSON.stringify(stored, null, 2));
    return true;
  } catch (error) {
    console.error("Error saving settings:", error);
    return false;
  }
}

// Reset settings to defaults
export async function resetSettings(): Promise<Settings> {
  const defaults = { ...DEFAULT_SETTINGS };
  await saveSettings(defaults);
  return defaults;
}
