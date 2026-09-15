// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadSettings,
  saveSettings,
  resetSettings,
  mergeSettings,
} from "../utils/settingsPersistence";
import { DEFAULT_SETTINGS } from "../config/defaults";

describe("Settings Persistence", () => {
  // Mock electronAPI
  const mockElectronAPI = {
    getAppDataPath: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    fileExists: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    // Use stubGlobal to ensure it's available globally in the test environment
    vi.stubGlobal("electronAPI", mockElectronAPI);

    // Suppress console logs during tests
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loadSettings returns defaults if API is missing", async () => {
    // Temporarily remove global mock
    vi.stubGlobal("electronAPI", undefined);
    const settings = await loadSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("loadSettings returns defaults if file does not exist", async () => {
    mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
    mockElectronAPI.fileExists.mockResolvedValue(false);

    const settings = await loadSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("loadSettings loads and parses settings correctly", async () => {
    mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
    mockElectronAPI.fileExists.mockResolvedValue(true);

    const storedSettings = {
      version: "1.0.0",
      settings: { ...DEFAULT_SETTINGS, xVelocity: 999 }, // Use a valid property
      lastUpdated: "2023-01-01",
    };

    mockElectronAPI.readFile.mockResolvedValue(JSON.stringify(storedSettings));

    const settings = await loadSettings();

    expect(mockElectronAPI.readFile).toHaveBeenCalled();
    expect(settings.xVelocity).toBe(999);
  });

  it("saveSettings writes to file", async () => {
    mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");

    const result = await saveSettings(DEFAULT_SETTINGS);

    expect(result).toBe(true);
    expect(mockElectronAPI.writeFile).toHaveBeenCalled();
    const callArgs = mockElectronAPI.writeFile.mock.calls[0];
    expect(callArgs[0]).toContain("turtle-tracer-settings.json");
    expect(JSON.parse(callArgs[1]).settings).toEqual(DEFAULT_SETTINGS);
  });

  it("saveSettings handles write failure gracefully", async () => {
    mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");
    const testError = new Error("Disk full");
    mockElectronAPI.writeFile.mockRejectedValue(testError);

    const result = await saveSettings(DEFAULT_SETTINGS);

    expect(result).toBe(false);
    expect(mockElectronAPI.writeFile).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "Error saving settings:",
      testError,
    );
  });

  it("resetSettings saves default settings", async () => {
    mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");

    const result = await resetSettings();

    expect(result).toEqual(DEFAULT_SETTINGS);
    expect(mockElectronAPI.writeFile).toHaveBeenCalled();
    const callArgs = mockElectronAPI.writeFile.mock.calls[0];
    expect(JSON.parse(callArgs[1]).settings).toEqual(DEFAULT_SETTINGS);
  });

  it("mergeSettings ensures all default obstaclePresets are present and updated while preserving custom presets", () => {
    const customPreset = {
      id: "preset-custom-myteam",
      name: "My Custom Obstacles",
      shapes: [],
    };
    const outdatedBiobuzz = {
      id: "preset-biobuzz-2026",
      name: "BioBuzz Field (2026-2027)",
      shapes: [
        {
          id: "biobuzz-hive-red",
          name: "HiveRedSide",
          vertices: [{ x: 52, y: 46.75 }],
          color: "#3f3f3f",
          fillColor: "#fca5a5",
          type: "obstacle",
        },
      ],
    };

    // Stored settings missing DECODE and having outdated BioBuzz
    const stored = {
      obstaclePresets: [outdatedBiobuzz, customPreset],
    };

    const merged = mergeSettings(stored);

    // All 4 default presets should be present with latest definitions
    const ids = merged.obstaclePresets?.map((p) => p.id);
    expect(ids).toContain("preset-biobuzz-2026");
    expect(ids).toContain("preset-decode-2025");
    expect(ids).toContain("preset-intothedeep-2024");
    expect(ids).toContain("preset-centerstage-2023");

    // Custom preset should also be preserved
    expect(ids).toContain("preset-custom-myteam");

    // BioBuzz should have the latest default vertices, not the outdated ones
    const biobuzz = merged.obstaclePresets?.find(
      (p) => p.id === "preset-biobuzz-2026",
    );
    expect(biobuzz?.shapes[0].vertices).toEqual([
      { x: 46.5, y: 92 },
      { x: 46.5, y: 52 },
      { x: 49, y: 52 },
      { x: 49, y: 92 },
    ]);
  });
});
