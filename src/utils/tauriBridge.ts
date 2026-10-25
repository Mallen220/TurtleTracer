// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The desktop app's window.electronAPI. Each call goes to a Rust command in
// src-tauri/src, named after the Electron IPC channel it replaced, and each
// listener to the events the app sends this window.
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { ElectronAPI, FileInfo } from "../types";

export { isTauri } from "@tauri-apps/api/core";

/** Listeners still being set up; the app is told the page is ready after. */
const settingUp = new Set<Promise<unknown>>();

/** Listens for an event sent to this window; returns a function to stop. */
function on<T>(event: string, callback: (payload: T) => void): () => void {
  const listening = getCurrentWebviewWindow().listen<T>(event, (e) =>
    callback(e.payload),
  );
  settingUp.add(listening);
  void listening.finally(() => settingUp.delete(listening));
  return () => {
    void listening.then((stop) => stop());
  };
}

type Listed = Omit<FileInfo, "modified"> & { modified: number };

async function transpilePlugin(code: string): Promise<string> {
  try {
    // Loaded only when a TypeScript plugin is turned on.
    const { default: ts } = await import("typescript");
    return ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.None,
      },
    }).outputText;
  } catch (error) {
    console.error("Error transpiling plugin:", error);
    throw new Error(
      `Transpilation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function createTauriBridge(): ElectronAPI {
  return {
    // File system operations
    getAppDataPath: () => invoke("app_get_app_data_path"),
    getDirectory: () => invoke("file_get_directory"),
    setDirectory: () => invoke("file_set_directory"),
    selectDirectory: () => invoke("file_select_directory"),
    listFiles: async (directory) => {
      const files = await invoke<Listed[]>("file_list", { directory });
      return files.map((f) => ({ ...f, modified: new Date(f.modified) }));
    },
    readFile: (filePath) => invoke("file_read", { filePath }),
    writeFile: (filePath, content) =>
      invoke("file_write", { filePath, content }),
    deleteFile: (filePath) => invoke("file_delete", { filePath }),
    fileExists: (filePath) => invoke("file_exists", { filePath }),
    findFiles: (root, endings, options) =>
      invoke("project_find_files", { root, endings, options }),
    resolvePath: (base, relative) =>
      invoke("file_resolve_path", { base, relative }),
    makeRelativePath: (base, target) =>
      invoke("file_make_relative_path", { base, target }),

    // Directory settings operations
    getDirectorySettings: () => invoke("directory_get_settings"),
    saveDirectorySettings: (settings) =>
      invoke("directory_save_settings", { settings }),
    getSavedDirectory: () => invoke("directory_get_saved_directory"),

    // Enhanced file operations
    createDirectory: (dirPath) => invoke("file_create_directory", { dirPath }),
    getDirectoryStats: async (dirPath) => {
      const stats = await invoke<{ lastModified: number }>(
        "file_get_directory_stats",
        { dirPath },
      );
      return { ...stats, lastModified: new Date(stats.lastModified) };
    },
    renameFile: (oldPath, newPath) =>
      invoke("file_rename", { oldPath, newPath }),
    showSaveDialog: (options) =>
      invoke("file_show_save_dialog", { options: options ?? null }),
    writeFileBase64: (filePath, base64Content) =>
      invoke("file_write_base64", { filePath, base64Content }),
    exportPP: (content, defaultName) =>
      invoke("export_pp", { content, defaultName }),
    copyFile: (srcPath, destPath) => invoke("file_copy", { srcPath, destPath }),
    chooseProjectFile: () => invoke("file_choose_project"),

    // Git operations
    gitShow: (filePath) => invoke("git_show", { filePath }),
    gitStatus: (directory) => invoke("git_status", { directory }),

    // GitHub: the token stays in the app, which makes the requests.
    githubToken: {
      status: () => invoke("github_token_status"),
      set: (token, remember, login) =>
        invoke("github_token_set", { token, remember, login }),
      clear: () => invoke("github_token_clear"),
    },
    githubFetch: (url, init) => invoke("github_fetch", { url, init }),

    // Following a Java or Kotlin file: told each time it's saved in an editor.
    chooseJavaFile: () => invoke("java_choose_file"),
    followJavaFile: (filePath) => invoke("java_follow", { filePath }),
    unfollowJavaFile: () => invoke("java_unfollow"),
    onJavaFileChanged: (callback) => on<string>("java:changed", callback),

    // Files dragged onto the window, by path (macOS and Linux; Windows
    // leaves file drops to the page).
    onFileDrag: (callback) => {
      const listening = getCurrentWebview().onDragDropEvent(({ payload }) =>
        callback({
          type: payload.type,
          paths: "paths" in payload ? payload.paths : [],
        }),
      );
      return () => {
        void listening.then((stop) => stop());
      };
    },

    // The app sends a file opened from the OS (and close requests) as soon
    // as it hears this, so first finish setting up the listeners registered
    // alongside it, in the same task.
    rendererReady: async () => {
      await null;
      await Promise.allSettled([...settingUp]);
      await invoke("renderer_ready");
    },
    onOpenFilePath: (callback) => {
      on<string>("open-file-path", callback);
    },
    onAppCloseRequested: (callback) => {
      on<null>("app-close-requested", () => callback());
    },
    sendCloseApproved: () => invoke("app_close_approved"),
    onMenuAction: (callback) => {
      on<string>("menu-action", callback);
    },

    getAppVersion: () => invoke("app_get_version"),
    isWindowsStore: () => invoke("app_is_windows_store"),
    openExternal: (url) => invoke("app_open_external", { url }),

    // Plugin System
    listPlugins: () => invoke("plugins_list"),
    readPlugin: (filename) => invoke("plugins_read", { filename }),
    deletePlugin: (filename) => invoke("plugins_delete", { filename }),
    openPluginsFolder: () => invoke("plugins_open_folder"),
    transpilePlugin,

    // Telemetry
    telemetry: {
      connect: (ip, port, protocol) =>
        invoke("telemetry_connect", { ip, port: Number(port), protocol }),
      disconnect: () => invoke("telemetry_disconnect"),
      onData: (callback) => on("telemetry:data", callback),
      onStatus: (callback) => on("telemetry:status", callback),
    },

    // Update
    onUpdateAvailable: (callback) => {
      on("update-available", callback);
    },
    onStoreUpdateAvailable: (callback) => {
      on("store-update-available", callback);
    },
    downloadUpdate: (version, url) =>
      invoke("update_download", { version, url }),
    skipUpdate: (version) => invoke("update_skip", { version }),
    checkForUpdates: () => invoke("update_check"),
  };
}

const isMacPlatform = () => /Mac/.test(navigator.platform);

/**
 * Keys a browser would act on that lose work in an editor: reload, close the
 * window, open the developer tools. Electron blocked these the same way.
 */
export function isBlockedShortcut(e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  const cmdOrCtrl = isMacPlatform() ? e.metaKey : e.ctrlKey;
  return (
    key === "f5" ||
    (cmdOrCtrl && (key === "r" || key === "w")) ||
    (e.ctrlKey && key === "f4") ||
    (cmdOrCtrl && e.shiftKey && key === "i")
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement &&
      !["button", "checkbox", "radio", "range", "submit"].includes(target.type))
  );
}

/**
 * Turns off the webview's own reload shortcuts and its right-click menu
 * (which offers Reload) outside text fields. The app's own context menus
 * call preventDefault themselves and are unaffected.
 */
export function installDesktopGuards(target: Window = globalThis.window): void {
  target.addEventListener(
    "keydown",
    (e) => {
      if (isBlockedShortcut(e)) e.preventDefault();
    },
    { capture: true },
  );
  target.addEventListener("contextmenu", (e) => {
    if (!isEditable(e.target)) e.preventDefault();
  });
}

interface LegacyStorage {
  storage: Record<string, string>;
  notice: string | null;
}

/**
 * On the first launch after the move from Electron, brings over what the old
 * app kept in localStorage (robot profiles, recents, plugin switches).
 * Returns a message about anything that couldn't come along, to show once.
 */
export async function importLegacyWebStorage(): Promise<string | null> {
  let legacy: LegacyStorage | null;
  try {
    legacy = await invoke<LegacyStorage | null>("take_legacy_web_storage");
  } catch (e) {
    console.warn("Couldn't read the previous version's data:", e);
    return null;
  }
  if (!legacy) return null;
  for (const [key, value] of Object.entries(legacy.storage)) {
    try {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    } catch (e) {
      console.warn("Couldn't bring over", key, e);
    }
  }
  await invoke("finish_legacy_migration").catch((e) =>
    console.warn("Couldn't record the data import:", e),
  );
  return legacy.notice;
}
