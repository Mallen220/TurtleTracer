// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Finding files inside a plugin's folder, and never outside it.
import fs from "node:fs/promises";
import path from "node:path";

/** Plugin ids name a folder: lower-case letters, digits and dashes. */
export const PLUGIN_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** @param {unknown} id */
export function isPluginId(id) {
  return typeof id === "string" && PLUGIN_ID.test(id);
}

/**
 * Whether `child` is `parent` or somewhere inside it. Both must already be
 * absolute and resolved.
 * @param {string} parent
 * @param {string} child
 */
export function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

/**
 * Checks a relative path from a manifest or a URL: forward slashes, no
 * leading slash, no `..` and no empty or `.` parts.
 * @param {unknown} relativePath
 */
export function isSafeRelativePath(relativePath) {
  if (typeof relativePath !== "string") return false;
  if (relativePath.length === 0 || relativePath.length > 300) return false;
  if (relativePath.includes("\0") || relativePath.includes("\\")) return false;
  return relativePath
    .split("/")
    .every((part) => part !== "" && part !== "." && part !== "..");
}

/**
 * The real path of a plugin's folder. Throws if the id is bad or the folder
 * doesn't exist.
 * @param {string} pluginsDir
 * @param {string} id
 */
export async function pluginFolder(pluginsDir, id) {
  if (!isPluginId(id)) throw new Error(`Invalid plugin id "${id}"`);
  const realBase = await fs.realpath(pluginsDir);
  const folder = await fs.realpath(path.join(realBase, id));
  if (path.dirname(folder) !== realBase) {
    throw new Error(`Plugin "${id}" is not in the plugins folder`);
  }
  return folder;
}

/**
 * The real path of a file inside a plugin's folder. Symbolic links that lead
 * out of the folder are refused, like `..`. Returns null if there's no such
 * file.
 * @param {string} folder The plugin folder's real path.
 * @param {string} relativePath
 * @returns {Promise<string | null>}
 */
export async function fileInPlugin(folder, relativePath) {
  if (!isSafeRelativePath(relativePath)) return null;
  let real;
  try {
    real = await fs.realpath(path.join(folder, ...relativePath.split("/")));
  } catch {
    return null;
  }
  if (!isInside(folder, real)) return null;
  const stat = await fs.stat(real);
  return stat.isFile() ? real : null;
}
