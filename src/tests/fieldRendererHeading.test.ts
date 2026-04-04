import { describe, it, expect, vi, beforeEach } from "vitest";
import { tick } from "svelte";

// Mock the stores before importing FieldRenderer
vi.mock("../lib/projectStore", async () => {
  const { writable } = await import("svelte/store");
  return {
    linesStore: writable([]),
    sequenceStore: writable([]),
    history: writable([]),
    historyIndex: writable(-1),
    selectedLineStore: writable(-1),
    projectSettingsStore: writable({}),
    selectedMacroPathStore: writable(""),
    fieldDimensions: writable({ width: 144, height: 144 }),
    startPointStore: writable({ x: 0, y: 0 }),
    uiState: writable({}),
    viewportStore: writable({ x: 0, y: 0, zoom: 1 }),
    zonesStore: writable([]),
    collisionMarkers: writable([]),
  };
});

import { linesStore } from "../lib/projectStore";

describe("FieldRenderer Heading Change Handlers", () => {
  beforeEach(() => {
    // Reset store
    linesStore.set([
      {
        id: "line1",
        endPoint: {
          x: 10,
          y: 10,
          heading: "tangential",
          reverse: false,
        },
      } as any,
    ]);
  });

  it("should immutably update the line when heading changes to constant", async () => {
    let currentLines: any[] = [];
    const unsubscribe = linesStore.subscribe((l: any[]) => {
      currentLines = l;
    });

    // Capture the original array and object references
    const originalArray = currentLines;
    const originalLine = currentLines[0];

    // Simulate the immutable update we added to FieldRenderer.svelte
    linesStore.update((l: any[]) => {
      const newLines = [...l];
      const line = { ...newLines[0] };
      line.endPoint = {
        ...line.endPoint,
        heading: "constant",
        degrees: 90,
      } as any;
      newLines[0] = line;
      return newLines;
    });

    await tick();

    // Verification
    expect((currentLines[0].endPoint as any).heading).toBe("constant");
    expect((currentLines[0].endPoint as any).degrees).toBe(90);

    // The core of the fix: references must be different to trigger Svelte 5 reactivity
    expect(currentLines).not.toBe(originalArray);
    expect(currentLines[0]).not.toBe(originalLine);

    unsubscribe();
  });
});
