// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
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
  dialogRegistry,
  timelineTransformerRegistry,
  fieldRenderRegistry,
} from "./registries";
import { actionRegistry } from "./actionRegistry";
import { registerCoreUI } from "./coreRegistrations";
import PluginPromptDialog from "./components/dialogs/PluginPromptDialog.svelte";
import PluginConfirmDialog from "./components/dialogs/PluginConfirmDialog.svelte";
import type {
  PluginFeature,
  PluginGraphicsContext,
  PluginGraphicsOptions,
} from "../types";

const {
  startPointStore,
  linesStore,
  shapesStore,
  sequenceStore,
  settingsStore,
} = projectStore;

interface PluginMetadata {
  description?: string;
  author?: string;
  version?: string;
}

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
          let description: string | undefined;

          let code = await electronAPI.readPlugin(file);
          if (file.endsWith(".ts")) {
            code = await electronAPI.transpilePlugin(code);
          }

          if (enabled) {
            const meta = this.executePlugin(file, code);
            description = meta?.description;
          } else {
            const meta = this.extractMetadata(file, code);
            description = meta?.description;
          }

          // "loaded" means we successfully discovered and (if enabled) executed the plugin
          // Disabled plugins should still appear as loaded to avoid showing a false error state in the UI
          plugins.push({
            name: file,
            loaded: true,
            enabled,
            description,
          });
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

  static extractMetadata(
    filename: string,
    code: string,
  ): PluginMetadata | undefined {
    let metadata: PluginMetadata | undefined;

    const handler = {
      get(target: any, prop: string) {
        if (prop === "registerMetadata") {
          return (meta: PluginMetadata) => {
            metadata = meta;
          };
        }
        // Return a new proxy for any other property access to handle nested objects
        return new Proxy(() => {}, handler);
      },
      apply(target: any, thisArg: any, argumentsList: any[]) {
        // Return a new proxy when called as a function
        return new Proxy(() => {}, handler);
      },
    };

    const proxyAPI = new Proxy(() => {}, handler);

    try {
      const fn = new Function("pedro", code);
      fn(proxyAPI);
    } catch (e) {
      // Ignore errors during metadata extraction
    }

    return metadata;
  }

  static executePlugin(
    filename: string,
    code: string,
  ): PluginMetadata | undefined {
    let codeToExecute = code;
    let metadata: PluginMetadata | undefined;

    // Restricted API exposed to plugins
    const pedroAPI = {
      registerMetadata: (meta: PluginMetadata) => {
        metadata = meta;
      },
      registerExporter: (name: string, handler: (data: any) => string) => {
        // Add to internal list
        this.allExporters = this.allExporters.filter((e) => e.name !== name); // unique by name
        this.allExporters.push({ name, handler, pluginName: filename });
      },
      registerTheme: (name: string, css: string) => {
        this.allThemes = this.allThemes.filter((t) => t.name !== name);
        this.allThemes.push({ name, css, pluginName: filename });
      },
      registerFeature: (feature: PluginFeature) => {
        try {
          // Unified Registration Logic
          // 1. Navbar Action
          if (feature.navbar) {
            navbarActionRegistry.register({
              id: `${filename}-${feature.name}-navbar`,
              icon: feature.navbar.icon,
              title: feature.navbar.title || feature.name,
              onClick: () => {
                try {
                  feature.navbar!.onClick();
                } catch (e) {
                  console.error(
                    `Error in plugin ${filename} navbar action:`,
                    e,
                  );
                  appStores.notification.set({
                    message: `Error in plugin: ${e}`,
                    type: "error",
                  });
                }
              },
              location: feature.navbar.location,
            });
          }

          // 2. Context Menu
          if (feature.contextMenu) {
            fieldContextMenuRegistry.register({
              id:
                feature.contextMenu.id ||
                `${filename}-${feature.name}-context-menu`,
              label: feature.contextMenu.label,
              icon: feature.contextMenu.icon,
              onClick: (args) => {
                try {
                  feature.contextMenu!.onClick(args);
                } catch (e) {
                  console.error(
                    `Error in plugin ${filename} context menu action:`,
                    e,
                  );
                  appStores.notification.set({
                    message: `Error in plugin: ${e}`,
                    type: "error",
                  });
                }
              },
              condition: (args) => {
                try {
                  return feature.contextMenu!.condition
                    ? feature.contextMenu!.condition(args)
                    : true;
                } catch (e) {
                  return false;
                }
              },
            });
          }

          // 3. Render Callback
          if (feature.render) {
            fieldRenderRegistry.register({
              id: `${filename}-${feature.name}-renderer`,
              fn: (two: any) => {
                try {
                  // Create Graphics Context
                  const fieldView = get(appStores.fieldViewStore);
                  const ctx: PluginGraphicsContext = {
                    two,
                    width: fieldView.width,
                    height: fieldView.height,
                    drawRect: (opts: PluginGraphicsOptions) => {
                      // Convert field coordinates (inches) to screen coordinates (pixels)
                      const px = fieldView.xScale(opts.x);
                      const py = fieldView.yScale(opts.y);
                      const w = Math.abs(
                        fieldView.xScale(opts.width || 0) - fieldView.xScale(0),
                      );
                      const h = Math.abs(
                        fieldView.yScale(opts.height || 0) -
                          fieldView.yScale(0),
                      );

                      const rect = new two.constructor.Rectangle(px, py, w, h);
                      rect.fill = opts.fill || "transparent";
                      rect.stroke = opts.stroke || opts.color || "black";
                      rect.linewidth = opts.strokeWidth || 1;
                      rect.opacity = opts.opacity ?? 1;
                      two.add(rect);
                      return rect;
                    },
                    drawCircle: (opts: PluginGraphicsOptions) => {
                      const px = fieldView.xScale(opts.x);
                      const py = fieldView.yScale(opts.y);
                      const r = Math.abs(
                        fieldView.xScale(opts.radius || 0) -
                          fieldView.xScale(0),
                      );

                      const circle = new two.constructor.Circle(px, py, r);
                      circle.fill = opts.fill || "transparent";
                      circle.stroke = opts.stroke || opts.color || "black";
                      circle.linewidth = opts.strokeWidth || 1;
                      circle.opacity = opts.opacity ?? 1;
                      two.add(circle);
                      return circle;
                    },
                    drawLine: (opts: PluginGraphicsOptions) => {
                      if (opts.points) {
                        const anchors = opts.points.map((pt) => {
                          return new two.constructor.Anchor(
                            fieldView.xScale(pt.x),
                            fieldView.yScale(pt.y),
                          );
                        });
                        const path = new two.constructor.Path(
                          anchors,
                          opts.closed,
                          false,
                        );
                        path.fill = opts.fill || "transparent";
                        path.stroke = opts.stroke || opts.color || "black";
                        path.linewidth = opts.strokeWidth || 1;
                        path.opacity = opts.opacity ?? 1;
                        two.add(path);
                        return path;
                      }
                    },
                    drawText: (opts: PluginGraphicsOptions) => {
                      const px = fieldView.xScale(opts.x);
                      const py = fieldView.yScale(opts.y);
                      const text = new two.constructor.Text(opts.text, px, py);
                      text.fill = opts.fill || opts.color || "black";
                      text.size = opts.fontSize || 12;
                      text.alignment = opts.align || "center";
                      text.baseline = "middle";
                      text.opacity = opts.opacity ?? 1;
                      two.add(text);
                      return text;
                    },
                  };

                  feature.render!(ctx);
                } catch (e) {
                  console.error(
                    `Error in plugin ${filename} render callback:`,
                    e,
                  );
                }
              },
            });
          }
        } catch (e) {
          console.error(
            `Failed to register feature for plugin ${filename}:`,
            e,
          );
        }
      },
      getData: () => {
        // Expose current state read-only
        return {
          startPoint: get(startPointStore),
          lines: get(linesStore),
          shapes: get(shapesStore),
          sequence: get(sequenceStore),
          settings: get(settingsStore),
        };
      },
      // Expanded API
      registries: {
        components: componentRegistry,
        tabs: tabRegistry,
        navbarActions: navbarActionRegistry,
        hooks: hookRegistry,
        contextMenuItems: fieldContextMenuRegistry,
        dialogs: dialogRegistry,
        timelineTransformers: timelineTransformerRegistry,
        fieldRenderers: fieldRenderRegistry,
        actions: actionRegistry,
      },
      stores: {
        project: projectStore,
        app: appStores,
        get: get,
      },
      // UI API
      ui: {
        prompt: (options: {
          title: string;
          message: string;
          defaultText?: string;
        }): Promise<string | null> => {
          return new Promise((resolve) => {
            const id = `plugin-prompt-${Date.now()}-${Math.random()}`;
            dialogRegistry.register({
              id,
              component: PluginPromptDialog,
              props: {
                show: true,
                title: options.title,
                message: options.message,
                defaultText: options.defaultText,
                onConfirm: (val: string) => {
                  resolve(val);
                  dialogRegistry.unregister!(id);
                },
                onCancel: () => {
                  resolve(null);
                  dialogRegistry.unregister!(id);
                },
              },
            });
          });
        },
        confirm: (options: {
          title: string;
          message: string;
          confirmText?: string;
          cancelText?: string;
        }): Promise<boolean> => {
          return new Promise((resolve) => {
            const id = `plugin-confirm-${Date.now()}-${Math.random()}`;
            dialogRegistry.register({
              id,
              component: PluginConfirmDialog,
              props: {
                show: true,
                title: options.title,
                message: options.message,
                confirmText: options.confirmText,
                cancelText: options.cancelText,
                onConfirm: () => {
                  resolve(true);
                  dialogRegistry.unregister!(id);
                },
                onCancel: () => {
                  resolve(false);
                  dialogRegistry.unregister!(id);
                },
              },
            });
          });
        },
        toast: (
          message: string,
          type: "success" | "warning" | "error" | "info" = "info",
          timeout: number = 3000,
        ) => {
          appStores.notification.set({
            message,
            type,
            timeout,
          });
        },
      },
      // Graphics API
      graphics: {
        requestRedraw: () => {
          appStores.pluginRedrawTrigger.update((n) => n + 1);
        },
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

    return metadata;
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
    dialogRegistry.reset();
    timelineTransformerRegistry.reset();
    fieldRenderRegistry.reset();
    actionRegistry.reset();

    // Restore built-in components/tabs before loading plugins so the UI baseline persists
    registerCoreUI();

    await this.init();
  }
}
