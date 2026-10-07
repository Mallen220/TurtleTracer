// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";
import {
  diffMode,
  committedData,
  diffResult,
  isLoadingDiff,
  toggleDiff,
} from "./diffStore";

import { currentFilePath } from "../stores";
import {
  startPointStore,
  linesStore,
  sequenceStore,
  shapesStore,
  settingsStore,
} from "./projectStore";
import { DEFAULT_SETTINGS } from "../config/defaults";

describe("diffStore", () => {
  let gitShowMock: any;

  beforeEach(() => {
    gitShowMock = vi.fn();
    vi.stubGlobal("electronAPI", {
      gitShow: gitShowMock,
    });

    // Reset stores
    diffMode.set(false);
    committedData.set(null);
    diffResult.set(null);
    isLoadingDiff.set(false);
    currentFilePath.set("test-path.json");

    // Default current project data
    startPointStore.set({ x: 0, y: 0, heading: "tangential", reverse: false });
    linesStore.set([]);
    sequenceStore.set([]);
    shapesStore.set([]);
    settingsStore.set({
      ...DEFAULT_SETTINGS,
      rWidth: 18,
      rLength: 18,
      maxVelocity: 50,
      maxAcceleration: 50,
      theme: "dark",
      autosaveMode: "never",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("should have correct initial state", () => {
    expect(get(diffMode)).toBe(false);
    expect(get(committedData)).toBeNull();
    expect(get(diffResult)).toBeNull();
    expect(get(isLoadingDiff)).toBe(false);
  });

  it("should warn and do nothing if no file path", async () => {
    currentFilePath.set(null);
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    await toggleDiff();
    expect(consoleWarnSpy).toHaveBeenCalledWith("No file path to diff against");
    expect(get(diffMode)).toBe(false);
  });

  it("should fetch, parse and compute diff successfully", async () => {
    const mockOldData = {
      startPoint: { x: 1, y: 1, heading: "tangential", reverse: false },
      lines: [],
      sequence: [],
      shapes: [],
      settings: {},
    };
    gitShowMock.mockResolvedValue(JSON.stringify(mockOldData));

    await toggleDiff();

    expect(get(isLoadingDiff)).toBe(false);
    expect(get(diffMode)).toBe(true);
    expect(get(committedData)).toMatchObject({ startPoint: { x: 1, y: 1 } });
    expect(get(diffResult)).not.toBeNull();
  });

  it("should toggle diff mode off and clear data", async () => {
    diffMode.set(true);
    committedData.set({} as any);
    diffResult.set({} as any);

    await toggleDiff();

    expect(get(diffMode)).toBe(false);
    expect(get(committedData)).toBeNull();
    expect(get(diffResult)).toBeNull();
  });
});
