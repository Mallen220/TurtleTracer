// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { writable } from "svelte/store";

export interface PluginInfo {
  name: string;
  loaded: boolean;
  error?: string;
  enabled: boolean;
  description?: string;
}

export interface CustomExporter {
  name: string;
  handler: (data: any) => string;
  pluginName?: string;
}

export interface CustomTheme {
  name: string;
  css: string;
  pluginName?: string;
}

export const pluginsStore = writable<PluginInfo[]>([]);
export const customExportersStore = writable<CustomExporter[]>([]);
export const themesStore = writable<CustomTheme[]>([]);
