// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What's in the plugins folder.
import fs from "node:fs/promises";
import path from "node:path";
import { readManifest } from "./manifest.js";
import { dependenciesInstalled } from "./packages.js";

/** The generated type definitions plugin authors reference. Not a plugin. */
export const TYPES_FILE = "turtle.d.ts";

/**
 * @typedef {object} PluginListing
 * @property {string} id The folder (or file) name.
 * @property {object} [manifest] Present when plugin.json is valid.
 * @property {string} [error] Why the plugin can't run.
 * @property {boolean} [legacy] An old single-file plugin, which no longer runs.
 * @property {boolean} [dependenciesInstalled] Whether its npm packages are in place.
 */

/**
 * Lists the plugins folder: every folder is a plugin, and loose .js/.ts
 * files are old-style plugins that are listed so the user knows why they
 * stopped working.
 * @param {string} pluginsDir
 * @returns {Promise<PluginListing[]>}
 */
export async function listPlugins(pluginsDir) {
  await fs.mkdir(pluginsDir, { recursive: true });
  const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
  const listings = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      const folder = path.join(pluginsDir, entry.name);
      const result = await readManifest(folder);
      if ("error" in result) {
        listings.push({ id: entry.name, error: result.error });
        continue;
      }
      listings.push({
        id: entry.name,
        manifest: result.manifest,
        dependenciesInstalled: await dependenciesInstalled(
          folder,
          result.manifest.dependencies,
        ),
      });
    } else if (
      entry.isFile() &&
      /\.(js|ts)$/.test(entry.name) &&
      entry.name !== TYPES_FILE
    ) {
      listings.push({
        id: entry.name,
        legacy: true,
        error:
          "This is an old single-file plugin. Plugins are now folders with a plugin.json; see the plugin guide to update it.",
      });
    }
  }

  return listings.sort((a, b) => a.id.localeCompare(b.id));
}
