
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginManager } from "../lib/pluginManager";
import {
  componentRegistry,
  tabRegistry,
  navbarActionRegistry,
  hookRegistry,
} from "../lib/registries";
import { get } from "svelte/store";

describe("Expanded Plugin API", () => {
  beforeEach(() => {
    // Reset registries
    componentRegistry.reset();
    tabRegistry.reset();
    navbarActionRegistry.reset();
    hookRegistry.clear();
    vi.clearAllMocks();
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
});
