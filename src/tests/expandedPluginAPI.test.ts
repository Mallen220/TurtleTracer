// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginManager } from "../lib/pluginManager";
import {
  componentRegistry,
  tabRegistry,
  navbarActionRegistry,
  hookRegistry,
} from "../lib/registries";
import { actionRegistry } from "../lib/actionRegistry";
import { get } from "svelte/store";

describe("Expanded Plugin API", () => {
  beforeEach(() => {
    // Reset registries
    componentRegistry.reset();
    tabRegistry.reset();
    navbarActionRegistry.reset();
    actionRegistry.reset();
    hookRegistry.clear();
    vi.clearAllMocks();

    // Mock localStorage (some tests run without a DOM localStorage)
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

  it("should expose registries in pedro API", async () => {
    const mockListPlugins = vi.fn().mockResolvedValue(["expanded-plugin.js"]);
    const mockReadPlugin = vi.fn().mockResolvedValue(`
      // Verify registries exist
      if (!pedro.registries) throw new Error("registries missing");
      if (!pedro.registries.components) throw new Error("components registry missing");
      if (!pedro.registries.tabs) throw new Error("tabs registry missing");
      if (!pedro.registries.navbarActions) throw new Error("navbarActions registry missing");

      // Register a tab
      pedro.registries.tabs.register({
        id: "plugin-tab",
        label: "Plugin Tab",
        component: {}, // Mock component
        order: 99
      });

      // Register a navbar action
      pedro.registries.navbarActions.register({
        id: "plugin-action",
        icon: "<svg></svg>",
        onClick: () => {}
      });
    `);

    (window as any).electronAPI = {
      listPlugins: mockListPlugins,
      readPlugin: mockReadPlugin,
    };

    localStorage.setItem("plugin_enabled_expanded-plugin.js", "true");

    await PluginManager.init();

    // Verify tab registered
    const tabs = get(tabRegistry);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].id).toBe("plugin-tab");

    // Verify action registered
    const actions = get(navbarActionRegistry);
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe("plugin-action");
  });

  it("should expose action registry and allow registering new action types", async () => {
    const mockListPlugins = vi.fn().mockResolvedValue(["action-plugin.js"]);
    const mockReadPlugin = vi.fn().mockResolvedValue(`
      if (!pedro.registries.actions) throw new Error("actions registry missing");

      pedro.registries.actions.register({
        kind: "custom-action",
        label: "Custom Action",
        component: {},
        toJavaCode: () => ({ code: "// custom", stepsUsed: 1 })
      });
    `);

    (window as any).electronAPI = {
      listPlugins: mockListPlugins,
      readPlugin: mockReadPlugin,
      transpilePlugin: vi.fn((code) => code),
    };

    localStorage.setItem("plugin_enabled_action-plugin.js", "true");

    await PluginManager.init();

    const actions = get(actionRegistry);
    expect(actions["custom-action"]).toBeDefined();
    expect(actions["custom-action"].label).toBe("Custom Action");
  });
});
