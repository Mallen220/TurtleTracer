// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import * as fileHandlers from "../utils/fileHandlers";
import {
  currentFilePath,
  projectMetadataStore,
  isUnsaved,
  notification,
} from "../stores";
import {
  startPointStore,
  linesStore,
  sequenceStore,
  shapesStore,
  settingsStore,
} from "../lib/projectStore";
import { DEFAULT_SETTINGS } from "../config/defaults";

// Mock Svelte stores
vi.mock("../stores", async () => {
  const { writable } = await import("svelte/store");
  return {
    currentFilePath: writable(""),
    isUnsaved: writable(false),
    notification: writable(null),
    projectMetadataStore: writable({}),
    // settingsStore removed from here as it should be in projectStore
  };
});

vi.mock("../lib/projectStore", async () => {
  const { writable } = await import("svelte/store");
  return {
    startPointStore: writable({ x: 0, y: 0, heading: 0 }),
    linesStore: writable([]),
    sequenceStore: writable([]),
    shapesStore: writable([]),
    settingsStore: writable({}), // Re-export if needed, but usually main stores handles it
  };
});

describe("fileHandlers", () => {
  const mockElectronAPI = {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    fileExists: vi.fn(),
    saveFile: vi.fn(),
    showSaveDialog: vi.fn(),
    getSavedDirectory: vi.fn(),
    copyFile: vi.fn(),
  };

  beforeEach(() => {
    // Don't replace the entire window object, just extend it
    (window as any).electronAPI = mockElectronAPI;

    vi.stubGlobal("alert", vi.fn());
    vi.stubGlobal("confirm", vi.fn());
    vi.clearAllMocks();

    // Reset stores
    currentFilePath.set("");
    settingsStore.set({ ...DEFAULT_SETTINGS, recentFiles: [] });
    linesStore.set([]);
    sequenceStore.set([]);
  });

  describe("loadProjectData", () => {
    it("restores linked names by stripping suffixes", () => {
      const data = {
        lines: [
          {
            id: "1",
            name: "Path 1",
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 10, y: 10 },
          },
          {
            id: "2",
            name: "Path 1 (2)",
            startPoint: { x: 10, y: 10 },
            endPoint: { x: 20, y: 20 },
          },
        ],
        sequence: [],
      };

      fileHandlers.loadProjectData(data);
      const lines = get(linesStore);

      expect(lines[0].name).toBe("Path 1");
      expect(lines[1].name).toBe("Path 1"); // Suffix stripped
    });

    it("restores linked names from _linkedName metadata", () => {
      const data = {
        lines: [
          { id: "1", name: "Unique Name 1", _linkedName: "Shared Name" },
          { id: "2", name: "Unique Name 2", _linkedName: "Shared Name" },
        ],
        sequence: [],
      };

      fileHandlers.loadProjectData(data);
      const lines = get(linesStore);

      expect(lines[0].name).toBe("Shared Name");
      expect(lines[1].name).toBe("Shared Name");
    });
  });

  describe("loadRecentFile", () => {
    it("should alert if electronAPI is missing", async () => {
      delete (window as any).electronAPI;
      const { loadRecentFile } = await import("../utils/fileHandlers");
      const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});

      await loadRecentFile("test.pp");
      expect(alertMock).toHaveBeenCalledWith(
        "Cannot load files in this environment",
      );
    });

    it("loads file if it exists", async () => {
      mockElectronAPI.fileExists.mockResolvedValue(true);
      mockElectronAPI.readFile.mockResolvedValue(
        JSON.stringify({ lines: [], sequence: [] }),
      );

      await fileHandlers.loadRecentFile("/path/to/file.pp");

      expect(mockElectronAPI.readFile).toHaveBeenCalledWith("/path/to/file.pp");
      expect(get(currentFilePath)).toBe("/path/to/file.pp");
    });

    it("removes file from recent list if it does not exist and user confirms", async () => {
      // Setup
      mockElectronAPI.fileExists.mockResolvedValue(false);
      const confirmMock = vi.fn().mockReturnValue(true);
      vi.stubGlobal("confirm", confirmMock);

      // Initialize store
      settingsStore.set({
        ...DEFAULT_SETTINGS,
        recentFiles: ["/path/to/file.pp", "/other.pp"],
      });

      // Act
      await fileHandlers.loadRecentFile("/path/to/file.pp");

      // Verify confirm was called
      expect(confirmMock).toHaveBeenCalled();

      // Assert removal
      const currentFiles = get(settingsStore).recentFiles;
      expect(currentFiles).not.toContain("/path/to/file.pp");
      expect(currentFiles).toContain("/other.pp");
    });
  });

  describe("saveProject", () => {
    it("uses saveFile API when available", async () => {
      mockElectronAPI.saveFile.mockResolvedValue({
        success: true,
        filepath: "/saved/file.pp",
      });
      // Ensure we have some data
      linesStore.set([{ id: "1", name: "Line 1" } as any]);

      await fileHandlers.saveProject();

      expect(mockElectronAPI.saveFile).toHaveBeenCalled();
      expect(get(currentFilePath)).toBe("/saved/file.pp");
      expect(get(isUnsaved)).toBe(false);
    });

    it("handles save failures", async () => {
      mockElectronAPI.saveFile.mockResolvedValue({
        success: false,
        error: "Permission denied",
      });

      await fileHandlers.saveProject();

      const notif = get(notification);
      expect(notif?.type).toBe("error");
    });
  });

  describe("handleExternalFileOpen", () => {
    it("loads file directly if no saved directory configured", async () => {
      mockElectronAPI.readFile.mockResolvedValue(JSON.stringify({}));
      mockElectronAPI.getSavedDirectory.mockResolvedValue("");

      await fileHandlers.handleExternalFileOpen("/external/file.pp");

      expect(get(currentFilePath)).toBe("/external/file.pp");
    });

    it("prompts to copy if file is outside saved directory", async () => {
      mockElectronAPI.readFile.mockResolvedValue(JSON.stringify({}));
      mockElectronAPI.getSavedDirectory.mockResolvedValue("/my/projects");
      mockElectronAPI.fileExists.mockResolvedValue(false); // Dest doesn't exist
      (global.confirm as any).mockReturnValue(true); // User says yes to copy

      await fileHandlers.handleExternalFileOpen("/external/file.pp");

      // Should check if it copies to /my/projects/file.pp
      // Depending on separator logic in implementation
      expect(mockElectronAPI.copyFile).toHaveBeenCalled();
      // We can't easily check exact string due to separator logic, but we verify copyFile was called
    });

    it("should just load if in saved directory", async () => {
      mockElectronAPI.readFile.mockResolvedValue("{}");
      mockElectronAPI.getSavedDirectory.mockResolvedValue("/project/dir");

      const { handleExternalFileOpen } = await import("../utils/fileHandlers");
      const confirmMock = vi.spyOn(window, "confirm");

      // Simulate file path being inside the project dir
      await handleExternalFileOpen("/project/dir/file.pp");

      expect(confirmMock).not.toHaveBeenCalled();
    });
  });
});
