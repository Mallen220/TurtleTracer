// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import path from "path";
import fs from "fs/promises";
import { app } from "electron";

export const PROJECT_EXTENSIONS = [".turt", ".pp"];

export function isProjectFilePath(filePath) {
  if (!filePath || typeof filePath !== "string") return false;
  const lower = filePath.toLowerCase();
  return PROJECT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export const getDirectorySettingsPath = () => {
  return path.join(app.getPath("userData"), "directory-settings.json");
};

export const loadDirectorySettings = async () => {
  const settingsPath = getDirectorySettingsPath();
  try {
    const data = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // Return default settings if file doesn't exist
    return {
      autoPathsDirectory: "",
      plugins: {
        "Example-csv-exporter.js": false,
        "Example-pink-theme.js": false,
      },
    };
  }
};

export const saveDirectorySettings = async (settings) => {
  const settingsPath = getDirectorySettingsPath();
  try {
    await fs.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2),
      "utf-8",
    );
    return true;
  } catch (error) {
    console.error("Error saving directory settings:", error);
    return false;
  }
};

export const getPluginsDirectory = () => {
  return path.join(app.getPath("userData"), "plugins");
};
