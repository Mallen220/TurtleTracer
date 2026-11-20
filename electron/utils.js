// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import path from "node:path";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { app } from "electron";

/**
 * Validates that a path is safe and within a base directory.
 * @param {string} inputPath
 * @param {string} basePath
 * @returns {string} The normalized path.
 */
export function validateSafePath(inputPath, basePath) {
  if (typeof inputPath !== "string") {
    throw new TypeError("Invalid path: must be a string");
  }
  if (inputPath.includes("\0")) {
    throw new Error("Invalid path: contains null bytes");
  }
  const normalized = path.normalize(inputPath);
  const resolvedBase = basePath ? path.resolve(basePath) : null;
  if (resolvedBase) {
    const baseWithSep = resolvedBase.endsWith(path.sep)
      ? resolvedBase
      : `${resolvedBase}${path.sep}`;
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
    throw new TypeError("Invalid path: must be a string");
  }
  if (inputPath.includes("\0")) {
    throw new Error("Invalid path: contains null bytes");
  }
  // normalize() resolves any ".." segments, so a name like "a..b.turt" is fine.
  const normalized = path.normalize(inputPath);
  if (!path.isAbsolute(normalized)) {
    throw new Error("Invalid path: must be absolute");
  }
  return normalized;
}

/**
 * Writes a file so a crash, a full disk or a killed app can't leave it empty
 * or half-written: the data goes to a temporary file next to it, which then
 * replaces the original in one step. A symlink is written through, not
 * replaced.
 * @param {string} filePath
 * @param {string | Buffer} data
 * @param {BufferEncoding} [encoding] For string data.
 */
export async function writeFileAtomic(filePath, data, encoding) {
  const target = await fs.realpath(filePath).catch(() => filePath);
  const temp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temp, data, encoding);
    try {
      await fs.rename(temp, target);
    } catch (error) {
      // Windows can refuse to replace a file another program (a sync client,
      // a virus scanner) has open, and a rename can't cross drives. Writing
      // in place is the old behaviour, which is better than failing.
      const { code } = /** @type {NodeJS.ErrnoException} */ (error);
      if (!["EPERM", "EBUSY", "EXDEV"].includes(code ?? "")) throw error;
      await fs.writeFile(target, data, encoding);
      await fs.rm(temp, { force: true });
    }
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

const PROJECT_EXTENSIONS = [".turt", ".pp"];

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
    const data = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(data);
  } catch {
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
    await writeFileAtomic(
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
