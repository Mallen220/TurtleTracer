// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What the main process tells the app about plugins (electron/ipc/pluginHandlers.js).
import type { FormValues } from "../api";

/** Permissions a plugin can ask for; see electron/plugins/manifest.js. */
export type PluginPermission = "project.write" | "files.pick";

export interface PluginViewManifest {
  entry: string;
  slot: "field" | "panel";
  title: string;
}

/** A checked plugin.json. */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  description?: string;
  author?: string;
  main?: string;
  views?: Record<string, PluginViewManifest>;
  themes?: { name: string; css: string }[];
  /** Form fields; checked by the app before it draws them. */
  settings?: unknown[];
  permissions?: PluginPermission[];
  dependencies?: Record<string, string>;
}

/** One entry in the plugins folder. */
export interface PluginListing {
  id: string;
  manifest?: PluginManifest;
  /** Why it can't run. */
  error?: string;
  /** An old single-file plugin, which no longer runs. */
  legacy?: boolean;
  dependenciesInstalled?: boolean;
}

/** What the user decided about a plugin. */
export interface PluginRecord {
  enabled?: boolean;
  /** What the user agreed to; see host/consent.ts. */
  grant?: string;
  settings?: FormValues;
}

export interface PluginsBridge {
  list(): Promise<{
    plugins: PluginListing[];
    records: Record<string, PluginRecord>;
    safeMode: boolean;
    crashedDuringBoot: boolean;
  }>;
  /** Whether any plugin is on (and the app isn't in safe mode). Cheap. */
  anyEnabled(): Promise<boolean>;
  setEnabled(id: string, enabled: boolean): Promise<PluginRecord>;
  setGrant(id: string, grant: string): Promise<PluginRecord>;
  setSettings(id: string, values: FormValues): Promise<PluginRecord>;
  /** Builds the plugin's main script (throwing if that fails) and reads its themes. */
  load(id: string): Promise<{
    hasMain: boolean;
    themes: { name: string; css: string }[];
  }>;
  installDependencies(id: string): Promise<{ name: string; version: string }[]>;
  storageGet(id: string, key: string): Promise<unknown>;
  storageSet(id: string, key: string, value: unknown): Promise<void>;
  pickProjects(
    multiple: boolean,
  ): Promise<{ name: string; contents: unknown }[]>;
  openFolder(id?: string): Promise<void>;
  install(kind: "folder" | "zip"): Promise<{ id: string } | null>;
  remove(id: string): Promise<void>;
  boot(phase: "start" | "done"): Promise<void>;
}
