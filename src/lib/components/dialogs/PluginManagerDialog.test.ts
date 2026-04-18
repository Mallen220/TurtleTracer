import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";
import PluginManagerDialog from "./PluginManagerDialog.svelte";

vi.mock("../../pluginManager", () => ({
  PluginManager: {
    getInstance: () => ({
      getPlugins: vi.fn(() => []),
      discoverPlugins: vi.fn(() => []),
      loadPlugin: vi.fn(),
      enablePlugin: vi.fn(),
      disablePlugin: vi.fn(),
      removePlugin: vi.fn(),
      installFromUrl: vi.fn(),
    }),
  },
}));

vi.mock("../../pluginsStore", () => ({
  pluginsStore: {
    subscribe: vi.fn((fn) => {
      fn([]);
      return () => {};
    }),
  },
}));

describe("PluginManagerDialog", () => {
  it("renders when isOpen is true", () => {
    const { getByText } = render(PluginManagerDialog, {
      isOpen: true,
    });

    expect(getByText("Plugin Manager", { selector: "h2" })).toBeInTheDocument();
  });
});
