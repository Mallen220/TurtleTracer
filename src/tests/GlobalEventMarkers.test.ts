// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { render, screen } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import GlobalEventMarkers from "../lib/components/GlobalEventMarkers.svelte";
import type {
  SequenceItem,
  Line,
  SequencePathItem,
  SequenceMacroItem,
} from "../types";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";

// Ensure core actions available for kind resolution
registerCoreUI();

const pathKind = (): SequencePathItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isPath)
    ?.kind as SequencePathItem["kind"]) ?? "path";
const macroKind = (): SequenceMacroItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isMacro)
    ?.kind as SequenceMacroItem["kind"]) ?? "macro";

const isPathItem = (s: SequenceItem): s is SequencePathItem =>
  s.kind === pathKind();
const isMacroItem = (s: SequenceItem): s is SequenceMacroItem =>
  s.kind === macroKind();

// Mock stores
vi.mock("../stores", () => ({
  selectedLineId: { subscribe: vi.fn() },
  selectedPointId: { subscribe: vi.fn() },
  hoveredMarkerId: { set: vi.fn(), subscribe: vi.fn() },
  diskEventNamesStore: {
    subscribe: (run: any) => {
      run([]);
      return () => {};
    },
  },
}));

describe("GlobalEventMarkers", () => {
  it("skips macros in global position calculation", () => {
    const lines: Line[] = [
      {
        id: "line-1",
        endPoint: { x: 0, y: 0, heading: "tangential", reverse: false },
        controlPoints: [],
        color: "red",
      },
      {
        id: "line-2",
        endPoint: { x: 0, y: 0, heading: "tangential", reverse: false },
        controlPoints: [],
        color: "blue",
        eventMarkers: [{ id: "m1", name: "Marker 1", position: 0.5 }],
      },
    ];

    const sequence: SequenceItem[] = [
      { kind: pathKind(), lineId: "line-1" },
      {
        kind: macroKind(),
        id: "macro-1",
        filePath: "test.pp",
        name: "Macro",
        sequence: [],
      },
      { kind: pathKind(), lineId: "line-2" },
    ];

    render(GlobalEventMarkers, {
      sequence,
      lines,
      collapsedMarkers: false,
    });

    // Line 1 is index 0.
    // Macro is skipped.
    // Line 2 is index 1.
    // Marker on Line 2 at 0.5 should be at 1.5.

    expect(screen.getByText("Global: 1.50")).toBeTruthy();
  });

  it("calculates correctly without macros", () => {
    const lines: Line[] = [
      {
        id: "line-1",
        endPoint: { x: 0, y: 0, heading: "tangential", reverse: false },
        controlPoints: [],
        color: "red",
      },
      {
        id: "line-2",
        endPoint: { x: 0, y: 0, heading: "tangential", reverse: false },
        controlPoints: [],
        color: "blue",
        eventMarkers: [{ id: "m1", name: "Marker 1", position: 0.5 }],
      },
    ];

    const sequence: SequenceItem[] = [
      { kind: pathKind(), lineId: "line-1" },
      { kind: pathKind(), lineId: "line-2" },
    ];

    render(GlobalEventMarkers, {
      sequence,
      lines,
      collapsedMarkers: false,
    });

    // Line 1 is index 0.
    // Line 2 is index 1.
    // Marker on Line 2 at 0.5 should be at 1.5.

    expect(screen.getByText("Global: 1.50")).toBeTruthy();
  });
});
