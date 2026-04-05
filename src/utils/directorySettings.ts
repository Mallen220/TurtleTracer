// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { DirectorySettings } from "../types";

// Default directory settings
const DEFAULT_DIRECTORY_SETTINGS: DirectorySettings = {
  autoPathsDirectory: "",
};

// Get the path for the directory settings file
async function getDirectorySettingsPath(): Promise<string> {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI && !electronAPI.isVirtual) {
    const appDataPath = await electronAPI.getAppDataPath();
    return `${appDataPath}/directory-settings.json`;
  }
  return "";
}

// Save directory settings
export async function saveDirectorySettings(
  settings: DirectorySettings,
): Promise<void> {
  try {
    const electronAPI = (window as any).electronAPI;

    // Use localStorage for browser environment
    if (!electronAPI || electronAPI.isVirtual) {
      localStorage.setItem(
        "turtle-tracer-directory-settings",
        JSON.stringify(settings),
      );
      return;
    }

    const settingsPath = await getDirectorySettingsPath();
    if (settingsPath) {
      await electronAPI.writeFile(
        settingsPath,
        JSON.stringify(settings, null, 2),
      );
    }
  } catch (error) {
    console.error("Error saving directory settings:", error);
  }
}

// Parse directory settings safely
export function parseDirectorySettings(json: string): DirectorySettings {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === "object" && parsed !== null) {
      return { ...DEFAULT_DIRECTORY_SETTINGS, ...parsed };
    }
  } catch (error) {
    console.error("Error parsing directory settings:", error);
  }
  return DEFAULT_DIRECTORY_SETTINGS;
}

// Load directory settings
export async function loadDirectorySettings(): Promise<DirectorySettings> {
  try {
    const electronAPI = (window as any).electronAPI;

    // Use localStorage for browser environment
    if (!electronAPI || electronAPI.isVirtual) {
      const local = localStorage.getItem("turtle-tracer-directory-settings");
      if (local) {
        return parseDirectorySettings(local);
      }
      return DEFAULT_DIRECTORY_SETTINGS;
    }

    const settingsPath = await getDirectorySettingsPath();
    if (settingsPath) {
      const exists = await electronAPI.fileExists(settingsPath);
      if (exists) {
        const content = await electronAPI.readFile(settingsPath);
        return parseDirectorySettings(content);
      }
    }
  } catch (error) {
    console.error("Error loading directory settings:", error);
  }

  return DEFAULT_DIRECTORY_SETTINGS;
}

// Get the saved AutoPaths directory
export async function getSavedAutoPathsDirectory(): Promise<string> {
  const settings = await loadDirectorySettings();
  return settings.autoPathsDirectory;
}

// Save the AutoPaths directory
export async function saveAutoPathsDirectory(directory: string): Promise<void> {
  const settings = await loadDirectorySettings();
  settings.autoPathsDirectory = directory;
  await saveDirectorySettings(settings);
}
