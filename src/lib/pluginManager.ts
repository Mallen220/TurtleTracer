// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  pluginsStore,
  customExportersStore,
  themesStore,
} from "./pluginsStore";
import type { PluginInfo, CustomExporter } from "./pluginsStore";
import {
  startPointStore,
  linesStore,
  shapesStore,
  sequenceStore,
} from "./projectStore";

export class PluginManager {
  static async init() {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || !electronAPI.listPlugins) return;

    try {
      const files = await electronAPI.listPlugins();
      const plugins: PluginInfo[] = [];

      for (const file of files) {
        try {
          const code = await electronAPI.readPlugin(file);
          this.executePlugin(file, code);
          plugins.push({ name: file, loaded: true });
        } catch (error) {
          console.error(`Failed to load plugin ${file}:`, error);
          plugins.push({ name: file, loaded: false, error: String(error) });
        }
      }
      pluginsStore.set(plugins);
    } catch (err) {
      console.error("Failed to init plugins:", err);
    }
  }

  static executePlugin(filename: string, code: string) {
    // Restricted API exposed to plugins
    const pedroAPI = {
      registerExporter: (name: string, handler: (data: any) => string) => {
        customExportersStore.update((exporters) => {
          // Remove existing if any (override)
          const filtered = exporters.filter((e) => e.name !== name);
          return [...filtered, { name, handler }];
        });
      },
      registerTheme: (name: string, css: string) => {
        themesStore.update((themes) => {
          const filtered = themes.filter((t) => t.name !== name);
          return [...filtered, { name, css }];
        });
      },
      getData: () => {
        // Expose current state read-only
        return {
          startPoint: get(startPointStore),
          lines: get(linesStore),
          shapes: get(shapesStore),
          sequence: get(sequenceStore),
        };
      },
    };

    // Execute safely-ish
    try {
      // We pass 'pedro' as the argument name
      const fn = new Function("pedro", code);
      fn(pedroAPI);
    } catch (e) {
      throw new Error(`Execution failed: ${e}`);
    }
  }

  static async openPluginsFolder() {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && electronAPI.openPluginsFolder) {
      await electronAPI.openPluginsFolder();
    }
  }

  static async reloadPlugins() {
    customExportersStore.set([]);
    themesStore.set([]);
    await this.init();
  }
}
