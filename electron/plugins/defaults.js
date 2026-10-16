// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Puts the plugins that ship with the app into the user's plugins folder.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TYPES_FILE } from "./catalog.js";

/** Hashes of every version of the single-file plugins earlier versions bundled. */
const LEGACY_BUNDLED = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "legacy-bundled.json",
);

/**
 * Records which version of a bundled plugin was copied and what its files
 * hashed to, so an unmodified copy can be updated with the app.
 */
const MARKER = ".turtle-bundled.json";

/** Hashes a plugin folder's own files (not its packages or our marker). */
async function hashFolder(folder) {
  const hash = crypto.createHash("sha256");
  async function walk(dir, prefix) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === MARKER || entry.name === "node_modules") continue;
      if (entry.name === "turtle-lock.json") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, `${prefix}${entry.name}/`);
      else if (entry.isFile()) {
        hash.update(`${prefix}${entry.name}\0`);
        hash.update(await fs.readFile(full));
      }
    }
  }
  await walk(folder, "");
  return hash.digest("hex");
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Copies a bundled plugin unless the user already has it. A copy the user
 * hasn't changed is replaced when the bundled version is different.
 */
async function installBundled(source, dest) {
  const bundled = await readJson(path.join(source, "plugin.json"));
  if (!bundled) return;

  const marker = await readJson(path.join(dest, MARKER));
  const exists = await fs
    .access(dest)
    .then(() => true)
    .catch(() => false);
  if (exists) {
    if (!marker || marker.version === bundled.version) return;
    if ((await hashFolder(dest)) !== marker.hash) return; // edited by the user
    // Keep its downloaded packages; they're reinstalled if the manifest changed.
    for (const entry of await fs.readdir(dest)) {
      if (entry === "node_modules" || entry === "turtle-lock.json") continue;
      await fs.rm(path.join(dest, entry), { recursive: true, force: true });
    }
  }

  await fs.cp(source, dest, { recursive: true });
  await fs.writeFile(
    path.join(dest, MARKER),
    JSON.stringify({ version: bundled.version, hash: await hashFolder(dest) }),
  );
}

/**
 * Removes unmodified copies of the single-file plugins earlier versions
 * bundled. They can't run any more; a copy the user changed is left alone
 * and shows in the plugin manager as an old-format plugin.
 */
async function removeOldBundledFiles(pluginsDir) {
  const legacyBundled = (await readJson(LEGACY_BUNDLED)) ?? {};
  for (const [name, hashes] of Object.entries(legacyBundled)) {
    const file = path.join(pluginsDir, name);
    let contents;
    try {
      contents = await fs.readFile(file);
    } catch {
      continue;
    }
    const hash = crypto.createHash("sha256").update(contents).digest("hex");
    if (hashes.includes(hash)) await fs.rm(file, { force: true });
  }
}

/**
 * Brings the plugins folder up to date with the app: bundled plugins and
 * the type definitions plugin authors use.
 * @param {string} pluginsDir The user's plugins folder.
 * @param {string} bundledDir The app's own plugins folder.
 */
export async function ensureDefaultPlugins(pluginsDir, bundledDir) {
  await fs.mkdir(pluginsDir, { recursive: true });
  await removeOldBundledFiles(pluginsDir);

  let entries;
  try {
    entries = await fs.readdir(bundledDir, { withFileTypes: true });
  } catch (e) {
    console.error("Couldn't read the bundled plugins:", e);
    return;
  }
  for (const entry of entries) {
    try {
      if (entry.isDirectory()) {
        await installBundled(
          path.join(bundledDir, entry.name),
          path.join(pluginsDir, entry.name),
        );
      } else if (entry.name === TYPES_FILE) {
        await fs.copyFile(
          path.join(bundledDir, entry.name),
          path.join(pluginsDir, entry.name),
        );
      }
    } catch (e) {
      console.error(`Couldn't install the bundled plugin ${entry.name}:`, e);
    }
  }
}
