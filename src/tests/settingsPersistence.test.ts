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

// --- Migration, recovery and browser storage ---

/** A minimal in-memory localStorage. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    removeItem: vi.fn((k: string) => void data.delete(k)),
  };
}

const wrap = (settings: unknown) =>
  JSON.stringify({ version: "1.0.0", settings, lastUpdated: "2024-01-01" });

describe("mergeSettings", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns a fresh copy of the defaults for anything that isn't an object", () => {
    for (const bad of [null, undefined, "text", 42]) {
      const merged = mergeSettings(bad);
      expect(merged).toEqual(DEFAULT_SETTINGS);
      expect(merged).not.toBe(DEFAULT_SETTINGS);
    }
  });

  it("drops unknown keys and ignores null or undefined values", () => {
    const merged = mergeSettings({
      xVelocity: 12,
      notASetting: "x",
      yVelocity: null,
      aVelocity: undefined,
    }) as unknown as Record<string, unknown>;
    expect(merged.xVelocity).toBe(12);
    expect(merged.notASetting).toBeUndefined();
    expect(merged.yVelocity).toBe(DEFAULT_SETTINGS.yVelocity);
    expect(merged.aVelocity).toBe(DEFAULT_SETTINGS.aVelocity);
  });

  it("ignores a value of the wrong type and keeps the default", () => {
    const merged = mergeSettings({ xVelocity: "fast", showRobotArrows: "yes" });
    expect(merged.xVelocity).toBe(DEFAULT_SETTINGS.xVelocity);
    expect(merged.showRobotArrows).toBe(DEFAULT_SETTINGS.showRobotArrows);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("type mismatch"),
    );
  });

  it("ignores a non-array where a list is expected", () => {
    const listKey = Object.entries(DEFAULT_SETTINGS).find(
      ([k, v]) =>
        Array.isArray(v) && k !== "obstaclePresets" && k !== "keyBindings",
    )?.[0];
    expect(listKey).toBeDefined(); // customMaps is a list-valued setting
    const merged = mergeSettings({
      [listKey!]: { not: "a list" },
    }) as unknown as Record<string, unknown>;
    expect(merged[listKey!]).toEqual((DEFAULT_SETTINGS as any)[listKey!]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("expected array"),
    );
  });

  it("converts the old robot size fields (rWidth was length, rHeight was width)", () => {
    const merged = mergeSettings({ rWidth: 18, rHeight: 14 });
    expect(merged.rLength).toBe(18);
    expect(merged.rWidth).toBe(14);
    expect((merged as any).rHeight).toBeUndefined();
  });

  it("leaves robot size alone once it has been converted", () => {
    const merged = mergeSettings({ rLength: 15, rWidth: 13, rHeight: 99 });
    expect(merged.rLength).toBe(15);
    expect(merged.rWidth).toBe(13);
  });

  it("keeps the user's remapped keys and custom bindings, and adds new defaults", () => {
    const defaults = DEFAULT_SETTINGS.keyBindings!;
    const first = defaults[0];
    const merged = mergeSettings({
      keyBindings: [
        { ...first, key: "F9" },
        { id: "my-own", action: "custom", key: "F10" },
      ],
    }).keyBindings!;
    expect(merged.find((b) => b.id === first.id)?.key).toBe("F9");
    expect(merged.find((b) => b.id === "my-own")).toMatchObject({ key: "F10" });
    // Every default is still there, even those the stored list didn't mention.
    for (const d of defaults)
      expect(merged.some((b) => b.id === d.id)).toBe(true);
    expect(merged).toHaveLength(defaults.length + 1);
  });

  it("ignores malformed obstacle presets", () => {
    const merged = mergeSettings({
      obstaclePresets: [
        null,
        "x",
        { name: "no id" },
        { id: "mine", name: "Mine", shapes: [] },
      ],
    }).obstaclePresets!;
    const custom = merged.filter(
      (p) => !DEFAULT_SETTINGS.obstaclePresets!.some((d) => d.id === p.id),
    );
    expect(custom.map((p) => p.id)).toEqual(["mine"]);
  });
});

describe("loadSettings and saveSettings in the browser", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("electronAPI", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("saves to and loads from localStorage", async () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);

    expect(await saveSettings({ ...DEFAULT_SETTINGS, xVelocity: 77 })).toBe(
      true,
    );
    const saved = JSON.parse(storage.data.get("turtle-tracer-settings")!);
    expect(saved.version).toBe("1.0.0");
    expect(saved.settings.xVelocity).toBe(77);

    expect((await loadSettings()).xVelocity).toBe(77);
  });

  it("moves settings saved under the old key to the new one", async () => {
    const storage = fakeStorage({ "pedro-settings": wrap({ xVelocity: 55 }) });
    vi.stubGlobal("localStorage", storage);

    expect((await loadSettings()).xVelocity).toBe(55);
    expect(storage.data.has("pedro-settings")).toBe(false);
    expect(
      JSON.parse(storage.data.get("turtle-tracer-settings")!).settings
        .xVelocity,
    ).toBe(55);
  });

  it("falls back to the defaults when the stored text is corrupt", async () => {
    vi.stubGlobal(
      "localStorage",
      fakeStorage({ "turtle-tracer-settings": "{not json" }),
    );
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("returns the defaults when nothing has been saved", async () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("reports failure if the browser refuses to store the settings", async () => {
    const storage = fakeStorage();
    storage.setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.stubGlobal("localStorage", storage);
    expect(await saveSettings(DEFAULT_SETTINGS)).toBe(false);
  });

  it("treats a virtual (browser) file API as no desktop API at all", async () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("electronAPI", { isVirtual: true, writeFile: vi.fn() });
    await saveSettings(DEFAULT_SETTINGS);
    expect(storage.setItem).toHaveBeenCalled();
  });
});

describe("loadSettings and saveSettings in the desktop app", () => {
  const api = {
    getAppDataPath: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    fileExists: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    api.getAppDataPath.mockResolvedValue("/data");
    vi.stubGlobal("electronAPI", api);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("migrates the old settings file to the new name", async () => {
    api.fileExists.mockImplementation(
      async (p: string) => p === "/data/pedro-settings.json",
    );
    api.readFile.mockResolvedValue(
      wrap({ xVelocity: 66, rWidth: 17, rHeight: 11 }),
    );

    const settings = await loadSettings();

    expect(settings).toMatchObject({ xVelocity: 66, rLength: 17, rWidth: 11 });
    const [path, text] = api.writeFile.mock.calls[0];
    expect(path).toBe("/data/turtle-tracer-settings.json");
    expect(JSON.parse(text).settings).toMatchObject({
      xVelocity: 66,
      rLength: 17,
    });
  });

  it("uses the defaults if the settings file is corrupt", async () => {
    api.fileExists.mockResolvedValue(true);
    api.readFile.mockResolvedValue("{broken");
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("uses the defaults when the app data folder can't be found", async () => {
    api.getAppDataPath.mockRejectedValue(new Error("no folder"));
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(api.readFile).not.toHaveBeenCalled();

    vi.stubGlobal("electronAPI", { readFile: api.readFile }); // no getAppDataPath
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("won't save when there is nowhere to save to", async () => {
    api.getAppDataPath.mockRejectedValue(new Error("no folder"));
    expect(await saveSettings(DEFAULT_SETTINGS)).toBe(false);
    expect(api.writeFile).not.toHaveBeenCalled();
  });
});
