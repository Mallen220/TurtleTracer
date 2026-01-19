// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginManager } from "../lib/pluginManager";
import {
  customExportersStore,
  pluginsStore,
  themesStore,
} from "../lib/pluginsStore";
import { get } from "svelte/store";

describe("PluginManager", () => {
  beforeEach(() => {
    // Reset stores
    customExportersStore.set([]);
    pluginsStore.set([]);
    themesStore.set([]);
    vi.clearAllMocks();

    // Mock localStorage
    const storage: Record<string, string> = {};
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn((key: string) => storage[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          storage[key] = value;
        }),
        clear: vi.fn(() => {
          for (const key in storage) delete storage[key];
        }),
        removeItem: vi.fn((key: string) => {
          delete storage[key];
        }),
      },
      writable: true,
    });
  });

  it("should load plugins from electronAPI", async () => {
    const mockListPlugins = vi.fn().mockResolvedValue(["test-plugin.js"]);
    const mockReadPlugin = vi.fn().mockResolvedValue(`
      pedro.registerExporter("Test CSV", (data) => {
        return "csv,data";
      });
    `);

    (window as any).electronAPI = {
      listPlugins: mockListPlugins,
      readPlugin: mockReadPlugin,
    };

    localStorage.setItem("plugin_enabled_test-plugin.js", "true");
    await PluginManager.init();

    expect(mockListPlugins).toHaveBeenCalled();
    expect(mockReadPlugin).toHaveBeenCalledWith("test-plugin.js");

    const plugins = get(pluginsStore);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("test-plugin.js");
    expect(plugins[0].loaded).toBe(true);

    const exporters = get(customExportersStore);
    expect(exporters).toHaveLength(1);
    expect(exporters[0].name).toBe("Test CSV");

    // Test the handler
    const result = exporters[0].handler({} as any);
    expect(result).toBe("csv,data");
  });

  it("should handle execution errors", async () => {
    const mockListPlugins = vi.fn().mockResolvedValue(["bad-plugin.js"]);
    const mockReadPlugin = vi.fn().mockResolvedValue(`
      throw new Error("Boom");
    `);

    (window as any).electronAPI = {
      listPlugins: mockListPlugins,
      readPlugin: mockReadPlugin,
    };

    await PluginManager.init();

    const plugins = get(pluginsStore);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].loaded).toBe(false);
    expect(plugins[0].error).toContain("Boom");
  });

  it("should register themes", async () => {
    const mockListPlugins = vi
      .fn()
      .mockResolvedValue(["Example-pink-theme.js"]);
    const mockReadPlugin = vi.fn().mockResolvedValue(`
      pedro.registerTheme("Pink Plugin Theme", ".bg-blue { color: pink; }");
    `);

    (window as any).electronAPI = {
      listPlugins: mockListPlugins,
      readPlugin: mockReadPlugin,
    };

    localStorage.setItem("plugin_enabled_Example-pink-theme.js", "true");
    await PluginManager.init();

    const themes = get(themesStore);
    expect(themes).toHaveLength(1);
    expect(themes[0].name).toBe("Pink Plugin Theme");
    expect(themes[0].css).toBe(".bg-blue { color: pink; }");
  });

  it("should load and transpile TypeScript plugins", async () => {
    const mockListPlugins = vi.fn().mockResolvedValue(["test-ts-plugin.ts"]);
    const mockReadPlugin = vi.fn().mockResolvedValue(`
      // TypeScript syntax
      const handler = (data: any): string => {
        return "ts-result";
      };
      pedro.registerExporter("TS Exporter", handler);
    `);

    (window as any).electronAPI = {
      listPlugins: mockListPlugins,
      readPlugin: mockReadPlugin,
    };

    localStorage.setItem("plugin_enabled_test-ts-plugin.ts", "true");
    await PluginManager.init();

    const exporters = get(customExportersStore);
    expect(exporters).toHaveLength(1);
    expect(exporters[0].name).toBe("TS Exporter");

    const result = exporters[0].handler({} as any);
    expect(result).toBe("ts-result");
  });

  it("should delete plugin and reload", async () => {
    const mockDeletePlugin = vi.fn().mockResolvedValue(true);
    // Reload calls init, which calls listPlugins
    const mockListPlugins = vi
      .fn()
      .mockResolvedValueOnce(["test.js"]) // First call (simulated init or before delete)
      .mockResolvedValueOnce([]); // Second call (after delete)

    const mockReadPlugin = vi.fn().mockResolvedValue("");

    (window as any).electronAPI = {
      listPlugins: mockListPlugins,
      readPlugin: mockReadPlugin,
      deletePlugin: mockDeletePlugin,
    };

    // Simulate initial load
    await PluginManager.init();

    // Call delete
    await PluginManager.deletePlugin("test.js");

    expect(mockDeletePlugin).toHaveBeenCalledWith("test.js");
    // Should have reloaded (called listPlugins again)
    expect(mockListPlugins).toHaveBeenCalledTimes(2);
  });
});
