// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  pluginsStore,
  customExportersStore,
  themesStore,
  type PluginInfo,
  type CustomExporter,
  type CustomTheme,
} from "./pluginsStore";
import * as projectStore from "./projectStore";
import * as appStores from "../stores";
import {
  componentRegistry,
  tabRegistry,
  navbarActionRegistry,
  hookRegistry,
  fieldContextMenuRegistry,
} from "./registries";
import { registerCoreUI } from "./coreRegistrations";

const { startPointStore, linesStore, shapesStore, sequenceStore } =
  projectStore;

export class PluginManager {
  private static allExporters: CustomExporter[] = [];
  private static allThemes: CustomTheme[] = [];

  static async init() {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || !electronAPI.listPlugins) return;

    // Reset internal lists
    this.allExporters = [];
    this.allThemes = [];

    try {
      const files = await electronAPI.listPlugins();
      const plugins: PluginInfo[] = [];

      for (const file of files) {
        const enabled = this.getEnabledState(file);

        try {
          if (enabled) {
            let code = await electronAPI.readPlugin(file);
            if (file.endsWith(".ts")) {
              code = await electronAPI.transpilePlugin(code);
            }
            this.executePlugin(file, code);
          }
          // "loaded" means we successfully discovered and (if enabled) executed the plugin
          // Disabled plugins should still appear as loaded to avoid showing a false error state in the UI
          plugins.push({ name: file, loaded: true, enabled });
        } catch (error: any) {
          console.error(`Failed to load plugin ${file}:`, error);
          const errorMessage = error?.message || String(error);
          plugins.push({
            name: file,
            loaded: false,
            error: errorMessage,
            enabled: enabled,
          });
        }
      }
      pluginsStore.set(plugins);
      this.refreshActiveResources();
    } catch (err) {
      console.error("Failed to init plugins:", err);
    }
  }

  private static getEnabledState(name: string): boolean {
    try {
      const key = `plugin_enabled_${name}`;
      const val = localStorage.getItem(key);
      // StickyNotes is enabled by default, others are disabled
      if (val === null) {
        return name === "StickyNotes.ts" || name === "StickyNotes.js";
      }
      return val === "true";
    } catch {
      return false;
    }
  }

  static togglePlugin(name: string, enabled: boolean) {
    try {
      localStorage.setItem(`plugin_enabled_${name}`, String(enabled));
    } catch {}

    pluginsStore.update((plugins) =>
      plugins.map((p) => (p.name === name ? { ...p, enabled } : p)),
    );

    // Reload all plugins to ensure proper cleanup/registration
    this.reloadPlugins();
  }

  private static refreshActiveResources() {
    const plugins = get(pluginsStore);
    const enabledPlugins = new Set(
      plugins.filter((p) => p.enabled).map((p) => p.name),
    );

    const activeExporters = this.allExporters.filter(
      (e) => e.pluginName && enabledPlugins.has(e.pluginName),
    );
    customExportersStore.set(activeExporters);

    const activeThemes = this.allThemes.filter(
      (t) => t.pluginName && enabledPlugins.has(t.pluginName),
    );
    themesStore.set(activeThemes);
  }

  static executePlugin(filename: string, code: string) {
    let codeToExecute = code;

    // Restricted API exposed to plugins
    const pedroAPI = {
      registerExporter: (name: string, handler: (data: any) => string) => {
        // Add to internal list
        this.allExporters = this.allExporters.filter((e) => e.name !== name); // unique by name
        this.allExporters.push({ name, handler, pluginName: filename });
      },
      registerTheme: (name: string, css: string) => {
        this.allThemes = this.allThemes.filter((t) => t.name !== name);
        this.allThemes.push({ name, css, pluginName: filename });
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
      // Expanded API
      registries: {
        components: componentRegistry,
        tabs: tabRegistry,
        navbarActions: navbarActionRegistry,
        hooks: hookRegistry,
        contextMenuItems: fieldContextMenuRegistry,
      },
      stores: {
        project: projectStore,
        app: appStores,
        get: get,
      },
    };

    // Execute safely-ish
    try {
      // We pass 'pedro' as the argument name
      const fn = new Function("pedro", codeToExecute);
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

  static async deletePlugin(name: string) {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && electronAPI.deletePlugin) {
      await electronAPI.deletePlugin(name);
      await this.reloadPlugins();
    }
  }

  static async reloadPlugins() {
    // Reset stores and re-init
    customExportersStore.set([]);
    themesStore.set([]);

    // Clear registries
    componentRegistry.reset();
    tabRegistry.reset();
    navbarActionRegistry.reset();
    hookRegistry.reset();
    fieldContextMenuRegistry.reset();

    // Restore built-in components/tabs before loading plugins so the UI baseline persists
    registerCoreUI();

    await this.init();
  }
}
