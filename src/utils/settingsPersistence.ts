import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Settings } from "../types";

// Versioning for settings schema
const SETTINGS_VERSION = "1.0.0";

interface StoredSettings {
  version: string;
  settings: Settings;
  lastUpdated: string;
}

declare const electronAPI: {
  getAppDataPath: () => Promise<string>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  fileExists: (filePath: string) => Promise<boolean>;
};

// Get the settings file path
async function getSettingsFilePath(): Promise<string> {
  if (!electronAPI) {
    console.warn("Electron API not available, using default settings");
    return "";
  }

  try {
    const appDataPath = await electronAPI.getAppDataPath();
    return `${appDataPath}/pedro-settings.json`;
  } catch (error) {
    console.error("Error getting app data path:", error);
    return "";
  }
}

function migrateSettings(stored: Partial<StoredSettings>): Settings {
  const defaults = { ...DEFAULT_SETTINGS };

  if (!stored.settings) {
    return defaults;
  }

  // Always merge with defaults to ensure new settings are included
  // and removed settings are not persisted
  const migrated: Settings = { ...defaults };

  // Copy only the properties that exist in both objects
  Object.keys(stored.settings).forEach((key) => {
    if (key in migrated) {
      // Special-case merging for keyBindings so newly added defaults appear
      if (key === "keyBindings" && Array.isArray(stored.settings.keyBindings)) {
        const defaultBindings = defaults.keyBindings || [];
        const storedBindings = stored.settings.keyBindings as any[];

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
        // @ts-ignore - We know the key exists in Settings
        migrated[key] = stored.settings[key];
      }
    }
  });

  return migrated;
}

// Load settings from file
export async function loadSettings(): Promise<Settings> {
  if (!electronAPI) {
    console.warn("Electron API not available, returning default settings");
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const filePath = await getSettingsFilePath();

    if (!filePath || !(await electronAPI.fileExists(filePath))) {
      console.log("Settings file does not exist, using defaults");
      return { ...DEFAULT_SETTINGS };
    }

    const fileContent = await electronAPI.readFile(filePath);
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
  if (!electronAPI) {
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

    await electronAPI.writeFile(filePath, JSON.stringify(stored, null, 2));
    console.log("Settings saved successfully");
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
  if (!electronAPI) return false;

  try {
    const filePath = await getSettingsFilePath();
    return filePath ? await electronAPI.fileExists(filePath) : false;
  } catch (error) {
    console.error("Error checking settings file:", error);
    return false;
  }
}
