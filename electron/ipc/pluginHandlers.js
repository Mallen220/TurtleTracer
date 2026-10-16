// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What the app's window can ask about plugins. Plugins themselves never get
// to these: they run in sandboxed frames without the preload.
import { BrowserWindow, dialog, net, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { app, ipcMain } from "electron";
import { getPluginsDirectory } from "../utils.js";
import { bundle, clearBundleCache } from "../plugins/bundler.js";
import { listPlugins } from "../plugins/catalog.js";
import { fileInPlugin, isPluginId, pluginFolder } from "../plugins/files.js";
import { installFromFolder, installFromZip } from "../plugins/install.js";
import { readManifest } from "../plugins/manifest.js";
import { installDependencies } from "../plugins/packages.js";
import { createPluginState } from "../plugins/state.js";

/** Largest project file `pickProjects` will read. */
const MAX_PROJECT_BYTES = 10 * 1024 * 1024;

const BOOT_FLAG = "plugin-boot.flag";

let pluginState;

/** The record of what the user decided about each plugin. */
export function getPluginState() {
  pluginState ??= createPluginState(app.getPath("userData"));
  return pluginState;
}

/** Whether a plugin is turned on; views of plugins that aren't are not served. */
export async function isPluginEnabled(id) {
  const records = await getPluginState().readAll();
  return records[id]?.enabled === true;
}

function checkId(id) {
  if (!isPluginId(id)) throw new Error("Invalid plugin id");
  return id;
}

function checkKey(key) {
  if (typeof key !== "string" || key.length === 0 || key.length > 200) {
    throw new Error("Invalid storage key");
  }
  return key;
}

/** Plain JSON-style values only, with a size limit checked by the store. */
function checkJson(value) {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function checkSettings(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("Invalid settings");
  }
  const clean = {};
  for (const [key, value] of Object.entries(values)) {
    if (["string", "number", "boolean"].includes(typeof value)) {
      clean[checkKey(key)] = value;
    }
  }
  return clean;
}

async function loadedManifest(id) {
  const folder = await pluginFolder(getPluginsDirectory(), id);
  const result = await readManifest(folder);
  if ("error" in result) throw new Error(result.error);
  return { folder, manifest: result.manifest };
}

/**
 * @param {{ safeMode: boolean }} options
 */
export function registerPluginHandlers({ safeMode = false } = {}) {
  const state = getPluginState();
  const bootFlag = path.join(app.getPath("userData"), BOOT_FLAG);
  // Read once: whether the last session stopped while plugins were starting.
  const crashedDuringBoot = fs
    .access(bootFlag)
    .then(() => true)
    .catch(() => false);

  ipcMain.handle("plugins:list", async () => ({
    plugins: await listPlugins(getPluginsDirectory()),
    records: await state.readAll(),
    safeMode,
    crashedDuringBoot: await crashedDuringBoot,
  }));

  // Asked at every launch, so it reads nothing but the saved state.
  ipcMain.handle("plugins:any-enabled", async () => {
    if (safeMode) return false;
    const records = await state.readAll();
    return Object.values(records).some((record) => record?.enabled === true);
  });

  ipcMain.handle("plugins:set-enabled", (_event, id, enabled) =>
    state.update(checkId(id), (r) => ({ ...r, enabled: enabled === true })),
  );

  ipcMain.handle("plugins:set-grant", (_event, id, grant) => {
    if (typeof grant !== "string" || grant.length > 2000) {
      throw new Error("Invalid grant");
    }
    return state.update(checkId(id), (r) => ({ ...r, grant }));
  });

  ipcMain.handle("plugins:set-settings", (_event, id, values) =>
    state.update(checkId(id), (r) => ({
      ...r,
      settings: checkSettings(values),
    })),
  );

  // Gets a plugin ready to start: builds its main script and reads its themes.
  ipcMain.handle("plugins:load", async (_event, id) => {
    checkId(id);
    if (!(await isPluginEnabled(id))) throw new Error("Plugin is turned off");
    const { folder, manifest } = await loadedManifest(id);

    // Built now so a mistake shows as a clear error; the frame the plugin
    // runs in then gets it from the cache.
    if (manifest.main) {
      const entry = await fileInPlugin(folder, manifest.main);
      if (!entry) throw new Error(`Can't find ${manifest.main}.`);
      await bundle(folder, entry, "main");
    }

    const themes = [];
    for (const theme of manifest.themes ?? []) {
      const file = await fileInPlugin(folder, theme.css);
      if (!file) throw new Error(`Can't find ${theme.css}.`);
      themes.push({ name: theme.name, css: await fs.readFile(file, "utf8") });
    }
    return { hasMain: Boolean(manifest.main), themes };
  });

  ipcMain.handle("plugins:install-dependencies", async (_event, id) => {
    const { folder, manifest } = await loadedManifest(checkId(id));
    return installDependencies(folder, manifest.dependencies ?? {}, {
      fetch: net.fetch.bind(net),
    });
  });

  ipcMain.handle("plugins:storage-get", (_event, id, key) =>
    state.storageGet(checkId(id), checkKey(key)),
  );

  ipcMain.handle("plugins:storage-set", (_event, id, key, value) =>
    state.storageSet(checkId(id), checkKey(key), checkJson(value)),
  );

  ipcMain.handle("plugins:pick-projects", async (event, multiple) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: "Choose projects",
      properties:
        multiple === true ? ["openFile", "multiSelections"] : ["openFile"],
      filters: [{ name: "Turtle Tracer projects", extensions: ["turt", "pp"] }],
    });
    if (result.canceled) return [];
    const picked = [];
    for (const file of result.filePaths) {
      const stat = await fs.stat(file);
      if (stat.size > MAX_PROJECT_BYTES) continue;
      try {
        picked.push({
          name: path.basename(file),
          contents: JSON.parse(await fs.readFile(file, "utf8")),
        });
      } catch {
        // Not a project file; leave it out.
      }
    }
    return picked;
  });

  ipcMain.handle("plugins:open-folder", async (_event, id) => {
    const pluginsDir = getPluginsDirectory();
    await fs.mkdir(pluginsDir, { recursive: true });
    const target =
      id === undefined
        ? pluginsDir
        : await pluginFolder(pluginsDir, checkId(id));
    await shell.openPath(target);
  });

  ipcMain.handle("plugins:install", async (event, kind) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const fromZip = kind === "zip";
    const picked = await dialog.showOpenDialog(win, {
      title: fromZip
        ? "Install a plugin from a .zip"
        : "Install a plugin folder",
      properties: fromZip ? ["openFile"] : ["openDirectory"],
      filters: fromZip ? [{ name: "Zip files", extensions: ["zip"] }] : [],
    });
    if (picked.canceled || picked.filePaths.length === 0) return null;

    const confirmReplace = async (manifest) => {
      const answer = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["Replace", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        message: `Replace the installed "${manifest.name}"?`,
        detail: "The plugin's files are replaced. Its settings are kept.",
      });
      return answer.response === 0;
    };
    const pluginsDir = getPluginsDirectory();
    await fs.mkdir(pluginsDir, { recursive: true });
    const installed = fromZip
      ? await installFromZip(pluginsDir, picked.filePaths[0], confirmReplace)
      : await installFromFolder(
          pluginsDir,
          picked.filePaths[0],
          confirmReplace,
        );
    clearBundleCache();
    return installed;
  });

  ipcMain.handle("plugins:remove", async (_event, id) => {
    const pluginsDir = getPluginsDirectory();
    // Old single-file plugins are listed by file name.
    if (typeof id === "string" && /^[\w.-]+\.(js|ts)$/.test(id)) {
      await shell.trashItem(path.join(pluginsDir, path.basename(id)));
      return;
    }
    const folder = await pluginFolder(pluginsDir, checkId(id));
    await shell.trashItem(folder);
    await state.forget(id);
    clearBundleCache();
  });

  // A flag file exists while plugins start up. If the app is closed or
  // crashes before they finish, the next launch offers to skip them.
  ipcMain.handle("plugins:boot", async (_event, phase) => {
    if (phase === "start") await fs.writeFile(bootFlag, String(Date.now()));
    else await fs.rm(bootFlag, { force: true });
  });
}
