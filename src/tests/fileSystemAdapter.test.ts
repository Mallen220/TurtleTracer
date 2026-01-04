// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";

// Mock global window.electronAPI
const mockElectronAPI = {
  getAppDataPath: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  fileExists: vi.fn(),
  getSavedDirectory: vi.fn(),
  copyFile: vi.fn(),
  showSaveDialog: vi.fn(),
};

// Mock Stores
vi.mock("svelte/store", async () => {
  const actual = await vi.importActual("svelte/store");
  return {
    ...actual,
    get: vi.fn((store) => store.value), // Simple mock implementation
  };
});

// Mock projectStore
vi.mock("../lib/projectStore", () => ({
  startPointStore: { value: { x: 0, y: 0 } },
  linesStore: { value: [] },
  shapesStore: { value: [] },
  sequenceStore: { value: [] },
  settingsStore: { value: { recentFiles: [] }, set: vi.fn() },
  loadProjectData: vi.fn(),
}));

// Mock stores
vi.mock("../stores", () => ({
  currentFilePath: { value: "", set: vi.fn(), subscribe: vi.fn() },
  isUnsaved: { value: false, set: vi.fn(), subscribe: vi.fn() },
}));

describe("Directory Settings & File Handlers", () => {
  beforeEach(() => {
    vi.resetModules(); // Reset modules to ensure top-level code re-runs
    vi.resetAllMocks();
    (window as any).electronAPI = mockElectronAPI;

    // Reset store mocks default behavior
    (get as any).mockImplementation((store: any) => store.value);
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  describe("directorySettings", () => {
    it("should load directory settings correctly when file exists", async () => {
      mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
      mockElectronAPI.fileExists.mockResolvedValue(true);
      mockElectronAPI.readFile.mockResolvedValue(
        JSON.stringify({ autoPathsDirectory: "/test/dir" }),
      );

      // Dynamic import
      const { loadDirectorySettings } =
        await import("../utils/directorySettings");

      const settings = await loadDirectorySettings();
      expect(settings.autoPathsDirectory).toBe("/test/dir");
      expect(mockElectronAPI.getAppDataPath).toHaveBeenCalled();
      expect(mockElectronAPI.readFile).toHaveBeenCalledWith(
        "/app/data/directory-settings.json",
      );
    });

    it("should return default settings if file does not exist", async () => {
      mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
      mockElectronAPI.fileExists.mockResolvedValue(false);

      const { loadDirectorySettings } =
        await import("../utils/directorySettings");
      const settings = await loadDirectorySettings();
      expect(settings.autoPathsDirectory).toBe("");
    });

    it("should return default settings if electronAPI is missing", async () => {
      delete (window as any).electronAPI;
      const { loadDirectorySettings } =
        await import("../utils/directorySettings");
      const settings = await loadDirectorySettings();
      expect(settings.autoPathsDirectory).toBe("");
    });

    it("should save directory settings correctly", async () => {
      mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");

      const { saveDirectorySettings } =
        await import("../utils/directorySettings");
      await saveDirectorySettings({ autoPathsDirectory: "/new/dir" });

      expect(mockElectronAPI.writeFile).toHaveBeenCalledWith(
        "/app/data/directory-settings.json",
        JSON.stringify({ autoPathsDirectory: "/new/dir" }, null, 2),
      );
    });

    it("should get saved auto paths directory", async () => {
      mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
      mockElectronAPI.fileExists.mockResolvedValue(true);
      mockElectronAPI.readFile.mockResolvedValue(
        JSON.stringify({ autoPathsDirectory: "/saved/dir" }),
      );

      const { getSavedAutoPathsDirectory } =
        await import("../utils/directorySettings");
      const dir = await getSavedAutoPathsDirectory();
      expect(dir).toBe("/saved/dir");
    });

    it("should save auto paths directory", async () => {
      mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
      mockElectronAPI.fileExists.mockResolvedValue(true);
      mockElectronAPI.readFile.mockResolvedValue(
        JSON.stringify({ autoPathsDirectory: "/old/dir" }),
      );

      const { saveAutoPathsDirectory } =
        await import("../utils/directorySettings");
      await saveAutoPathsDirectory("/updated/dir");

      expect(mockElectronAPI.writeFile).toHaveBeenCalledWith(
        "/app/data/directory-settings.json",
        expect.stringContaining('"/updated/dir"'),
      );
    });
  });

  describe("fileHandlers", () => {
    describe("loadRecentFile", () => {
      it("should alert if electronAPI is missing", async () => {
        delete (window as any).electronAPI;
        const { loadRecentFile } = await import("../utils/fileHandlers");
        const alertMock = vi
          .spyOn(window, "alert")
          .mockImplementation(() => {});

        await loadRecentFile("test.pp");
        expect(alertMock).toHaveBeenCalledWith(
          "Cannot load files in this environment",
        );
      });

      it("should prompt to remove if file does not exist", async () => {
        mockElectronAPI.fileExists.mockResolvedValue(false);
        const { loadRecentFile } = await import("../utils/fileHandlers");
        const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

        await loadRecentFile("test.pp");

        expect(confirmMock).toHaveBeenCalled();
      });

      it("should load file if it exists", async () => {
        mockElectronAPI.fileExists.mockResolvedValue(true);
        mockElectronAPI.readFile.mockResolvedValue(
          '{"startPoint": { "x":0, "y":0 }}',
        );
        const { loadRecentFile } = await import("../utils/fileHandlers");

        await loadRecentFile("test.pp");

        expect(mockElectronAPI.readFile).toHaveBeenCalledWith("test.pp");
      });
    });

    describe("handleExternalFileOpen", () => {
      it("should copy file if not in saved directory and user confirms", async () => {
        mockElectronAPI.readFile.mockResolvedValue("{}");
        mockElectronAPI.getSavedDirectory.mockResolvedValue("/project/dir");
        mockElectronAPI.fileExists.mockResolvedValue(false); // Destination doesn't exist
        mockElectronAPI.copyFile.mockResolvedValue(true);

        const { handleExternalFileOpen } =
          await import("../utils/fileHandlers");
        const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(true);

        await handleExternalFileOpen("/downloads/external.pp");

        expect(confirmMock).toHaveBeenCalled();
        expect(mockElectronAPI.copyFile).toHaveBeenCalledWith(
          "/downloads/external.pp",
          expect.stringContaining("/project/dir"),
        );
      });

      it("should just load if in saved directory", async () => {
        mockElectronAPI.readFile.mockResolvedValue("{}");
        mockElectronAPI.getSavedDirectory.mockResolvedValue("/project/dir");

        const { handleExternalFileOpen } =
          await import("../utils/fileHandlers");
        const confirmMock = vi.spyOn(window, "confirm");

        // Simulate file path being inside the project dir
        await handleExternalFileOpen("/project/dir/file.pp");

        expect(confirmMock).not.toHaveBeenCalled();
      });
    });
  });
});
