// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import PluginManagerDialog from "./PluginManagerDialog.svelte";

const mocks = vi.hoisted(() => ({
  plugins: [] as { name: string; loaded: boolean; enabled: boolean }[],
  togglePlugin: vi.fn(),
}));

vi.mock("../../pluginManager", () => ({
  PluginManager: {
    togglePlugin: mocks.togglePlugin,
    deletePlugin: vi.fn(),
    openPluginsFolder: vi.fn(),
  },
}));

vi.mock("../../pluginsStore", () => ({
  pluginsStore: {
    subscribe: vi.fn((fn) => {
      fn(mocks.plugins);
      return () => {};
    }),
  },
}));

beforeEach(() => {
  mocks.plugins = [];
  mocks.togglePlugin.mockClear();
});

describe("PluginManagerDialog", () => {
  it("renders when isOpen is true", () => {
    const { getByText } = render(PluginManagerDialog, {
      isOpen: true,
    });

    expect(getByText("Plugin Manager", { selector: "h2" })).toBeInTheDocument();
  });

  describe("turning plugins on and off", () => {
    it("asks before enabling, and enables only once confirmed", async () => {
      mocks.plugins = [{ name: "tool.js", loaded: true, enabled: false }];
      const { getByRole, getByText } = render(PluginManagerDialog, {
        isOpen: true,
      });
      const toggle = getByRole("checkbox") as HTMLInputElement;

      await fireEvent.click(toggle);
      expect(getByText("Enable Plugin?")).toBeInTheDocument();
      expect(getByText(/can read, change/)).toBeInTheDocument();
      expect(mocks.togglePlugin).not.toHaveBeenCalled();
      expect(toggle.checked).toBe(false);

      await fireEvent.click(getByText("Enable", { selector: "button" }));
      expect(mocks.togglePlugin).toHaveBeenCalledWith("tool.js", true);
    });

    it("leaves the plugin off when the question is cancelled", async () => {
      mocks.plugins = [{ name: "tool.js", loaded: true, enabled: false }];
      const { getByRole, getByText } = render(PluginManagerDialog, {
        isOpen: true,
      });

      await fireEvent.click(getByRole("checkbox"));
      await fireEvent.click(getByText("Cancel", { selector: "button" }));
      expect(mocks.togglePlugin).not.toHaveBeenCalled();
      expect((getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    });

    it("turns a plugin off straight away", async () => {
      mocks.plugins = [{ name: "tool.js", loaded: true, enabled: true }];
      const { getByRole, queryByText } = render(PluginManagerDialog, {
        isOpen: true,
      });

      await fireEvent.click(getByRole("checkbox"));
      expect(mocks.togglePlugin).toHaveBeenCalledWith("tool.js", false);
      expect(queryByText("Enable Plugin?")).toBeNull();
    });
  });
});
