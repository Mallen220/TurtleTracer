// src/tests/diffStore.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import {
  compareWithFile,
  diffResult,
  diffMode,
  isLoadingDiff,
  committedData,
} from "../lib/diffStore";
import {
  linesStore,
  startPointStore,
  sequenceStore,
  shapesStore,
  settingsStore,
} from "../lib/projectStore";

describe("diffStore", () => {
  beforeEach(() => {
    // Reset stores
    diffResult.set(null);
    diffMode.set(false);
    committedData.set(null);
    isLoadingDiff.set(false);

    // Mock electronAPI
    (window as any).electronAPI = {
      readFile: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("compareWithFile should load file and compute diff", async () => {
    // Setup current project state
    startPointStore.set({ x: 0, y: 0, heading: "tangential", reverse: false });
    linesStore.set([
      {
        id: "line1",
        name: "",
        endPoint: { x: 10, y: 10, heading: "tangential", reverse: false },
        controlPoints: [],
        color: "red",
      },
    ]);
    sequenceStore.set([{ kind: "path", lineId: "line1" }]);
    shapesStore.set([]);
    settingsStore.set({} as any);

    // Mock file content (target state)
    // Target has an extra line
    const targetData = {
      startPoint: { x: 0, y: 0, heading: "tangential", reverse: false },
      lines: [
        {
          id: "line1",
          name: "",
          endPoint: { x: 10, y: 10, heading: "tangential", reverse: false },
          controlPoints: [],
          color: "red",
        },
        {
          id: "line2",
          name: "",
          endPoint: { x: 20, y: 20, heading: "tangential", reverse: false },
          controlPoints: [],
          color: "blue",
        },
      ],
      sequence: [
        { kind: "path", lineId: "line1" },
        { kind: "path", lineId: "line2" },
      ],
      shapes: [],
      settings: {},
    };

    const readFileMock = (window as any).electronAPI.readFile as any;
    readFileMock.mockResolvedValue(JSON.stringify(targetData));

    // Call compareWithFile
    await compareWithFile("path/to/target.pp");

    // Verify readFile was called
    expect(readFileMock).toHaveBeenCalledWith("path/to/target.pp");

    // Verify diffResult
    const result = get(diffResult);
    expect(result).not.toBeNull();
    // In diff logic: "current" vs "old" (target).
    // computeDiff(current, normalizedTarget)
    // "Added lines" means present in current but not in target?
    // Let's check computeDiff logic in diffStore.ts:
    // current.lines.forEach(line => { if (!oldLine) addedLines.push(line) })
    // So "Added" means "In Current, Not in Target".
    // "Removed" means "In Target, Not in Current".

    // In our case: Current has line1. Target has line1, line2.
    // So line2 is in Target but not Current.
    // It should be in "removedLines".

    expect(result!.removedLines).toHaveLength(1);
    expect(result!.removedLines[0].id).toBe("line2");
    expect(result!.addedLines).toHaveLength(0);
    expect(result!.sameLines).toHaveLength(1);

    // Verify diffMode is true
    expect(get(diffMode)).toBe(true);

    // Verify committedData is set
    const committed = get(committedData);
    expect(committed).not.toBeNull();
    expect(committed!.lines).toHaveLength(2);
  });

  it("compareWithFile should handle missing file gracefully", async () => {
    const readFileMock = (window as any).electronAPI.readFile as any;
    readFileMock.mockResolvedValue(null);

    await compareWithFile("invalid/path.pp");

    expect(get(diffResult)).toBeNull();
    expect(get(diffMode)).toBe(false);
    expect(get(isLoadingDiff)).toBe(false);
  });

  it("compareWithFile should handle invalid JSON gracefully", async () => {
    const readFileMock = (window as any).electronAPI.readFile as any;
    readFileMock.mockResolvedValue("{ invalid json }");

    // Silence console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await compareWithFile("path/to/bad.pp");

    expect(get(diffResult)).toBeNull();
    expect(get(diffMode)).toBe(false);
    expect(get(isLoadingDiff)).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
  });
});
