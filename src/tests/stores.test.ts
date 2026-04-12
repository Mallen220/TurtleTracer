// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, afterEach } from "vitest";
import { get } from "svelte/store";
import * as stores from "../stores";

describe("Global Stores", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Simple primitive stores", () => {
    it("should initialize with default values", () => {
      expect(get(stores.showRuler)).toBe(false);
      expect(get(stores.showRobot)).toBe(true);
      expect(get(stores.gridSize)).toBe(12);
      expect(get(stores.isDrawingMode)).toBe(false);
    });

    it("should accept updates", () => {
      stores.showRuler.set(true);
      expect(get(stores.showRuler)).toBe(true);

      stores.gridSize.update((size) => size * 2);
      expect(get(stores.gridSize)).toBe(24);

      // Reset
      stores.showRuler.set(false);
      stores.gridSize.set(12);
    });
  });

  describe("Complex stores", () => {
    it("exportDialogState should initialize and update correctly", () => {
      const initialState = get(stores.exportDialogState);
      expect(initialState.isOpen).toBe(false);
      expect(initialState.format).toBe("java");

      stores.exportDialogState.set({
        isOpen: true,
        format: "json",
        exporterName: "testExporter",
      });

      const updatedState = get(stores.exportDialogState);
      expect(updatedState.isOpen).toBe(true);
      expect(updatedState.format).toBe("json");
      expect(updatedState.exporterName).toBe("testExporter");

      // Reset
      stores.exportDialogState.set(initialState);
    });

    it("projectMetadataStore should initialize and update correctly", () => {
      const initialState = get(stores.projectMetadataStore);
      expect(initialState.filepath).toBe("");
      expect(initialState.lastSaved).toBeUndefined();

      const testDate = new Date();
      stores.projectMetadataStore.set({
        filepath: "/test/path.json",
        lastSaved: testDate,
      });

      const updatedState = get(stores.projectMetadataStore);
      expect(updatedState.filepath).toBe("/test/path.json");
      expect(updatedState.lastSaved).toEqual(testDate);

      // Reset
      stores.projectMetadataStore.set(initialState);
    });

    it("fileManagerSessionState should initialize and update correctly", () => {
      const initialState = get(stores.fileManagerSessionState);
      expect(initialState.searchQuery).toBe("");
      expect(initialState.viewMode).toBe("grid");
      expect(initialState.sortMode).toBe("date");

      stores.fileManagerSessionState.set({
        searchQuery: "test",
        viewMode: "list",
        sortMode: "name",
      });

      const updatedState = get(stores.fileManagerSessionState);
      expect(updatedState.searchQuery).toBe("test");
      expect(updatedState.viewMode).toBe("list");
      expect(updatedState.sortMode).toBe("name");

      // Reset
      stores.fileManagerSessionState.set(initialState);
    });

    it("fieldViewStore should initialize and update correctly", () => {
      const initialState = get(stores.fieldViewStore);
      expect(initialState.width).toBe(0);
      expect(initialState.height).toBe(0);
      expect(initialState.xScale(5)).toBe(5);
      expect(initialState.yScale(10)).toBe(10);

      stores.fieldViewStore.set({
        width: 100,
        height: 200,
        xScale: (v) => v * 2,
        yScale: (v) => v * 3,
      });

      const updatedState = get(stores.fieldViewStore);
      expect(updatedState.width).toBe(100);
      expect(updatedState.height).toBe(200);
      expect(updatedState.xScale(5)).toBe(10);
      expect(updatedState.yScale(10)).toBe(30);

      // Reset
      stores.fieldViewStore.set(initialState);
    });
  });

  describe("Fallback block", () => {
    it("should assign showUpdateAvailableDialog to window if window is defined", async () => {
      vi.stubGlobal("window", {});
      vi.resetModules();

      const dynamicStores = await import("../stores");
      const windowMock = globalThis.window as any;

      expect(windowMock.showUpdateAvailableDialog).toBeDefined();
      expect(windowMock.showUpdateAvailableDialog).toBe(
        dynamicStores.showUpdateAvailableDialog,
      );
    });
  });
});
