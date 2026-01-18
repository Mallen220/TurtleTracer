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
} from "./registries";
import * as ts from "typescript";

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
        try {
          const code = await electronAPI.readPlugin(file);
          this.executePlugin(file, code);

          const enabled = this.getEnabledState(file);
          plugins.push({ name: file, loaded: true, enabled });
        } catch (error) {
          console.error(`Failed to load plugin ${file}:`, error);
          plugins.push({
            name: file,
            loaded: false,
            error: String(error),
            enabled: false,
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
      // Default to false (disabled) if not explicitly enabled
      return val === null ? false : val === "true";
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

    this.refreshActiveResources();
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

    // Transpile TypeScript if needed
    if (filename.endsWith(".ts")) {
      try {
        const result = ts.transpileModule(code, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.None,
          },
        });
        codeToExecute = result.outputText;
      } catch (e) {
        throw new Error(`Transpilation failed: ${e}`);
      }
    }

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

  static async reloadPlugins() {
    // Reset stores and re-init
    customExportersStore.set([]);
    themesStore.set([]);
    await this.init();
  }
}
