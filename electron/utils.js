// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import path from "path";
import fs from "fs/promises";
import { app } from "electron";

/**
 * Validates that a path is safe and within a base directory.
 * @param {string} inputPath
 * @param {string} basePath
 * @returns {string} The normalized path.
 */
export function validateSafePath(inputPath, basePath) {
  if (typeof inputPath !== "string") {
    throw new Error("Invalid path: must be a string");
  }
  if (inputPath.indexOf("\0") !== -1) {
    throw new Error("Invalid path: contains null bytes");
  }
  const normalized = path.normalize(inputPath);
  const resolvedBase = basePath ? path.resolve(basePath) : null;
  if (resolvedBase) {
    const baseWithSep = resolvedBase.endsWith(path.sep) ? resolvedBase : `${resolvedBase}${path.sep}`;
    if (!normalized.startsWith(baseWithSep) && normalized !== resolvedBase) {
      throw new Error("Invalid path: traversal detected");
    }
  }
  return normalized;
}

/**
 * Validates an arbitrary absolute path.
 * @param {string} inputPath
 * @returns {string} The normalized absolute path.
 */
export function validateArbitraryPath(inputPath) {
  if (typeof inputPath !== "string") {
    throw new Error("Invalid path: must be a string");
  }
  if (inputPath.indexOf("\0") !== -1) {
    throw new Error("Invalid path: contains null bytes");
  }
  if (inputPath.includes("..")) {
    throw new Error("Invalid path: contains traversal sequences");
  }
  const normalized = path.normalize(inputPath);
  if (!path.isAbsolute(normalized)) {
    throw new Error("Invalid path: must be absolute");
  }
  return normalized;
}

export const PROJECT_EXTENSIONS = [".turt", ".pp"];

/**
 * Checks if a file path is a project file.
 * @param {string} filePath
 * @returns {boolean} True if it's a project file.
 */
export function isProjectFilePath(filePath) {
  if (!filePath || typeof filePath !== "string") return false;
  const lower = filePath.toLowerCase();
  return PROJECT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export const getDirectorySettingsPath = () => {
  const basePath = app.getPath("userData");
  const settingsPath = path.resolve(basePath, "directory-settings.json");
  return validateSafePath(settingsPath, basePath);
};

export const loadDirectorySettings = async () => {
  const settingsPath = getDirectorySettingsPath();
  try {
    // nosemgrep: codacy.tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
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

/**
 * Saves directory settings.
 * @param {any} settings
 * @returns {Promise<boolean>} True if successful.
 */
export const saveDirectorySettings = async (settings) => {
  const settingsPath = getDirectorySettingsPath();
  try {
    // nosemgrep: codacy.tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
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
  const basePath = app.getPath("userData");
  const pluginsDir = path.join(basePath, "plugins");
  return validateSafePath(pluginsDir, basePath);
};
