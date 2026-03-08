// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadSettings,
  saveSettings,
  resetSettings,
  settingsFileExists,
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
    expect(callArgs[0]).toContain("pedro-settings.json");
    expect(JSON.parse(callArgs[1]).settings).toEqual(DEFAULT_SETTINGS);
  });

  it("resetSettings saves default settings", async () => {
    mockElectronAPI.getAppDataPath.mockResolvedValue("/app/data");

    const result = await resetSettings();

    expect(result).toEqual(DEFAULT_SETTINGS);
    expect(mockElectronAPI.writeFile).toHaveBeenCalled();
    const callArgs = mockElectronAPI.writeFile.mock.calls[0];
    expect(JSON.parse(callArgs[1]).settings).toEqual(DEFAULT_SETTINGS);
  });
});
