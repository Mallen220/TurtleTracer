// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  saveDirectorySettings,
  loadDirectorySettings,
  getSavedAutoPathsDirectory,
  saveAutoPathsDirectory,
} from "../utils/directorySettings";

describe("Directory Settings", () => {
  const mockElectronAPI = {
    getAppDataPath: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    fileExists: vi.fn(),
  };

  const DEFAULT_DIRECTORY_SETTINGS = {
    autoPathsDirectory: "",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("electronAPI", mockElectronAPI);

    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("loadDirectorySettings", () => {
    it("returns defaults if API is missing", async () => {
      vi.stubGlobal("electronAPI", undefined);
      const settings = await loadDirectorySettings();
      expect(settings).toEqual(DEFAULT_DIRECTORY_SETTINGS);
    });

    it("returns defaults if file does not exist", async () => {
      mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
      mockElectronAPI.fileExists.mockResolvedValue(false);

      const settings = await loadDirectorySettings();
      expect(settings).toEqual(DEFAULT_DIRECTORY_SETTINGS);
    });

    it("loads and parses settings correctly", async () => {
      mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
      mockElectronAPI.fileExists.mockResolvedValue(true);
      const storedSettings = { autoPathsDirectory: "/some/path" };
      mockElectronAPI.readFile.mockResolvedValue(
        JSON.stringify(storedSettings),
      );

      const settings = await loadDirectorySettings();
      expect(settings).toEqual(storedSettings);
    });

    it("handles errors gracefully and returns defaults", async () => {
      mockElectronAPI.getAppDataPath.mockRejectedValue(new Error("Failed"));
      const settings = await loadDirectorySettings();
      expect(settings).toEqual(DEFAULT_DIRECTORY_SETTINGS);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("saveDirectorySettings", () => {
    it("saves settings correctly", async () => {
      mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
      const settings = { autoPathsDirectory: "/new/path" };

      await saveDirectorySettings(settings);

      expect(mockElectronAPI.writeFile).toHaveBeenCalledWith(
        "/app/data/directory-settings.json",
        JSON.stringify(settings, null, 2),
      );
    });

    it("does nothing if API is missing", async () => {
      vi.stubGlobal("electronAPI", undefined);
      await saveDirectorySettings({ autoPathsDirectory: "" });
      // Should verify no error is thrown
    });

    it("logs error if save fails", async () => {
      mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
      mockElectronAPI.writeFile.mockRejectedValue(new Error("Write failed"));

      await saveDirectorySettings({ autoPathsDirectory: "" });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("getSavedAutoPathsDirectory", () => {
    it("returns the directory from loaded settings", async () => {
      mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
      mockElectronAPI.fileExists.mockResolvedValue(true);
      mockElectronAPI.readFile.mockResolvedValue(
        JSON.stringify({ autoPathsDirectory: "/custom/path" }),
      );

      const dir = await getSavedAutoPathsDirectory();
      expect(dir).toBe("/custom/path");
    });
  });

  describe("saveAutoPathsDirectory", () => {
    it("updates and saves the directory", async () => {
      mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
      mockElectronAPI.fileExists.mockResolvedValue(true);
      // Initial state
      mockElectronAPI.readFile.mockResolvedValue(
        JSON.stringify({ autoPathsDirectory: "/old/path" }),
      );

      await saveAutoPathsDirectory("/new/path");

      // Verify it tried to write the updated settings
      expect(mockElectronAPI.writeFile).toHaveBeenCalledWith(
        "/app/data/directory-settings.json",
        expect.stringContaining('"/new/path"'),
      );
    });
  });
});
