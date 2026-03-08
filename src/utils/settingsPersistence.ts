// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Settings } from "../types";

// Versioning for settings schema
const SETTINGS_VERSION = "1.0.0";

interface StoredSettings {
  version: string;
  settings: Settings;
  lastUpdated: string;
}

// Helper to get electronAPI safely (allows mocking in tests)
function getElectronAPI() {
  return (
    ((window as any).electronAPI as {
      getAppDataPath: () => Promise<string>;
      readFile: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, content: string) => Promise<boolean>;
      fileExists: (filePath: string) => Promise<boolean>;
    }) || undefined
  );
}

// Get the settings file path
async function getSettingsFilePath(): Promise<string> {
  const api = getElectronAPI();
  if (!api) {
    console.warn("Electron API not available, using default settings");
    return "";
  }

  try {
    const appDataPath = await api.getAppDataPath();
    return `${appDataPath}/pedro-settings.json`;
  } catch (error) {
    console.error("Error getting app data path:", error);
    return "";
  }
}

export function mergeSettings(source: any): Settings {
  const defaults = { ...DEFAULT_SETTINGS };

  if (!source) {
    return defaults;
  }

  // Manual migration for rWidth/rHeight -> rLength/rWidth
  // If stored settings has rHeight (Old Width) and rWidth (Old Length)
  const sourceSettings = { ...source } as any;
  if ("rHeight" in sourceSettings && !("rLength" in sourceSettings)) {
    console.log("Migrating rWidth/rHeight to rLength/rWidth");
    sourceSettings.rLength = sourceSettings.rWidth; // Old rWidth was Length
    sourceSettings.rWidth = sourceSettings.rHeight; // Old rHeight was Width
    delete sourceSettings.rHeight;
  }

  // Always merge with defaults to ensure new settings are included
  // and removed settings are not persisted
  const migrated: Settings = { ...defaults };

  // Copy only the properties that exist in both objects
  Object.keys(sourceSettings).forEach((key) => {
    if (key in migrated) {
      // Type checking to avoid illegal values
      // We check against the default value type if it's not null/undefined
      const defaultVal = (defaults as any)[key];
      const sourceVal = sourceSettings[key];

      // Skip if source value is undefined/null (will use default)
      if (sourceVal === undefined || sourceVal === null) return;

      // Special-case merging for keyBindings so newly added defaults appear
      if (key === "keyBindings" && Array.isArray(sourceVal)) {
        const defaultBindings = defaults.keyBindings || [];
        const storedBindings = sourceVal as any[];

        // Map stored bindings by id for quick lookup
        const storedMap = new Map<string, any>();
        storedBindings.forEach((b) => storedMap.set(b.id, b));

        // Start with defaults, override with stored values when ids match
        const merged = defaultBindings.map((d) => {
          const s = storedMap.get(d.id);
          return s ? { ...d, ...s } : d;
        });

        // Append any stored-only bindings (user added) that aren't in defaults
        storedBindings.forEach((b) => {
          if (!defaultBindings.find((d) => d.id === b.id)) merged.push(b);
        });

        // @ts-ignore
        migrated.keyBindings = merged;
      } else {
        // General type check
        if (defaultVal !== undefined && defaultVal !== null) {
          const defaultType = typeof defaultVal;
          const sourceType = typeof sourceVal;

          if (defaultType !== sourceType) {
            console.warn(
              `Ignoring setting ${key} due to type mismatch: expected ${defaultType}, got ${sourceType}`,
            );
            return;
          }

          // Additional check for arrays (typeof returns 'object' for both)
          if (Array.isArray(defaultVal) && !Array.isArray(sourceVal)) {
            console.warn(`Ignoring setting ${key}: expected array`);
            return;
          }
        }

        // @ts-ignore - We know the key exists in Settings
        migrated[key] = sourceVal;
      }
    }
  });

  return migrated;
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
      const local = localStorage.getItem("pedro-settings");
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
    const filePath = await getSettingsFilePath();

    if (!filePath || !(await api.fileExists(filePath))) {
      console.log("Settings file does not exist, using defaults");
      return { ...DEFAULT_SETTINGS };
    }

    const fileContent = await api.readFile(filePath);
    const stored: StoredSettings = JSON.parse(fileContent);

    // Migrate if version differs
    if (stored.version !== SETTINGS_VERSION) {
      console.log(
        `Migrating settings from version ${stored.version} to ${SETTINGS_VERSION}`,
      );
    }

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
      localStorage.setItem("pedro-settings", JSON.stringify(stored));
      return true;
    } catch (e) {
      console.error("Error saving settings to localStorage:", e);
    }
    console.warn("Electron API not available, cannot save settings");
    return false;
  }

  try {
    const filePath = await getSettingsFilePath();

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

// Check if settings file exists
export async function settingsFileExists(): Promise<boolean> {
  const api = getElectronAPI();
  if (!api) return false;

  try {
    const filePath = await getSettingsFilePath();
    return filePath ? await api.fileExists(filePath) : false;
  } catch (error) {
    console.error("Error checking settings file:", error);
    return false;
  }
}
