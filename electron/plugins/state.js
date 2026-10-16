// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What the user has decided about each plugin (on or off, which permissions
// they allowed, its settings) and what plugins store for themselves. Kept in
// the main process, in the app's data folder.
import fs from "node:fs/promises";
import path from "node:path";
import { isPluginId } from "./files.js";

/** The most a plugin may keep in its storage, as JSON. */
export const STORAGE_LIMIT_BYTES = 1024 * 1024;

/**
 * @typedef {object} PluginRecord
 * @property {boolean} [enabled]
 * @property {string} [grant] What the user agreed to (see the app's consent dialog).
 * @property {Record<string, string | number | boolean>} [settings]
 */

/**
 * Reads and writes `plugin-state.json` and the per-plugin storage files.
 * Writes are queued so two quick changes can't interleave.
 * @param {string} dataDir The app's data folder.
 */
export function createPluginState(dataDir) {
  const stateFile = path.join(dataDir, "plugin-state.json");
  const storageDir = path.join(dataDir, "plugin-data");
  let queue = Promise.resolve();

  /** @returns {Promise<Record<string, PluginRecord>>} */
  async function readAll() {
    try {
      const data = JSON.parse(await fs.readFile(stateFile, "utf8"));
      return data && typeof data.plugins === "object" && data.plugins
        ? data.plugins
        : {};
    } catch {
      return {};
    }
  }

  function serialized(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  /**
   * Changes one plugin's record.
   * @param {string} id
   * @param {(record: PluginRecord) => PluginRecord} change
   */
  function update(id, change) {
    if (!isPluginId(id)) throw new Error(`Invalid plugin id "${id}"`);
    return serialized(async () => {
      const plugins = await readAll();
      plugins[id] = change({ ...plugins[id] });
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(
        stateFile,
        JSON.stringify({ version: 1, plugins }, null, 2),
      );
      return plugins[id];
    });
  }

  function storageFile(id) {
    if (!isPluginId(id)) throw new Error(`Invalid plugin id "${id}"`);
    return path.join(storageDir, `${id}.json`);
  }

  async function readStorage(id) {
    try {
      const data = JSON.parse(await fs.readFile(storageFile(id), "utf8"));
      return data && typeof data === "object" && !Array.isArray(data)
        ? data
        : {};
    } catch {
      return {};
    }
  }

  return {
    readAll,
    update,

    /** @param {string} id @param {string} key */
    async storageGet(id, key) {
      const data = await readStorage(id);
      return Object.hasOwn(data, key) ? data[key] : undefined;
    },

    /** @param {string} id @param {string} key @param {unknown} value */
    storageSet(id, key, value) {
      return serialized(async () => {
        const data = await readStorage(id);
        if (value === undefined) delete data[key];
        else data[key] = value;
        const json = JSON.stringify(data);
        if (json.length > STORAGE_LIMIT_BYTES) {
          throw new Error(
            `Plugin storage is limited to ${STORAGE_LIMIT_BYTES / 1024} KB.`,
          );
        }
        await fs.mkdir(storageDir, { recursive: true });
        await fs.writeFile(storageFile(id), json);
      });
    },

    /** Forgets everything about a plugin, when it's removed. */
    forget(id) {
      return serialized(async () => {
        const plugins = await readAll();
        delete plugins[id];
        await fs.mkdir(dataDir, { recursive: true });
        await fs.writeFile(
          stateFile,
          JSON.stringify({ version: 1, plugins }, null, 2),
        );
        await fs.rm(storageFile(id), { force: true });
      });
    },
  };
}
