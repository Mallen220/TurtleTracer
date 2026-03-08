// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach } from "vitest";
import { expandMacro, regenerateProjectMacros } from "../lib/macroUtils";
import type {
  Line,
  Point,
  SequenceItem,
  PedroData,
  SequenceMacroItem,
  SequencePathItem,
} from "../types";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";

beforeEach(() => {
  actionRegistry.reset();
  registerCoreUI();
});

const pathKind = (): SequencePathItem["kind"] =>
  (actionRegistry.getAll().find((a) => a.isPath)
    ?.kind as SequencePathItem["kind"]) ?? "path";
const macroKind = (): SequenceMacroItem["kind"] =>
  (actionRegistry.getAll().find((a) => a.isMacro)
    ?.kind as SequenceMacroItem["kind"]) ?? "macro";

describe("Nested Macros and Recursion", () => {
  const startPoint: Point = {
    x: 0,
    y: 0,
    heading: "tangential",
    reverse: false,
  };
  const prevPoint: Point = {
    x: 10,
    y: 10,
    heading: "tangential",
    reverse: false,
  };

  const macroLine1: Line = {
    id: "m1-line",
    endPoint: { x: 20, y: 20, heading: "tangential", reverse: false },
    controlPoints: [],
    color: "#000000",
    name: "Macro1 Line",
  };

  const macroData1: PedroData = {
    startPoint: { x: 15, y: 15, heading: "tangential", reverse: false },
    lines: [macroLine1],
    shapes: [],
    sequence: [{ kind: pathKind(), lineId: "m1-line" }],
    extraData: {},
  };

  const macroItem1: SequenceMacroItem = {
    kind: macroKind(),
    id: "macro-1",
    filePath: "macro1.pp",
    name: "Macro 1",
    locked: false,
  };

  const macroData2: PedroData = {
    startPoint: { x: 25, y: 25, heading: "tangential", reverse: false },
    lines: [],
    shapes: [],
    sequence: [macroItem1], // Nested macro 1 inside macro 2
    extraData: {},
  };

  const macroItem2: SequenceMacroItem = {
    kind: macroKind(),
    id: "macro-2",
    filePath: "macro2.pp",
    name: "Macro 2",
    locked: false,
  };

  it("should expand nested macros", () => {
    const macrosMap = new Map<string, PedroData>();
    macrosMap.set("macro1.pp", macroData1);
    macrosMap.set("macro2.pp", macroData2);

    const result = expandMacro(
      macroItem2,
      prevPoint,
      0,
      macroData2,
      macrosMap,
      new Set(),
    );

    // Should contain expanded content from macro 1 (which is nested in macro 2)
    // Macro 2 has no lines of its own, so all lines come from Macro 1 via expansion
    expect(result.lines.length).toBeGreaterThan(0);

    // Check sequence structure
    // Top level sequence of Macro 2 has 1 item (macro1)
    // After expansion, it should be a SequenceMacroItem for Macro 1, which in turn has a sequence
    // A bridge path is also generated because start points differ
    expect(result.sequence.length).toBeGreaterThanOrEqual(1);

    const expandedMacro1 = result.sequence.find(
      (s) => s.kind === macroKind(),
    ) as SequenceMacroItem;
    expect(expandedMacro1).toBeDefined();
    expect(expandedMacro1.kind).toBe(macroKind());
    expect(expandedMacro1.sequence).toBeDefined();
    expect(expandedMacro1.sequence!.length).toBeGreaterThan(0);
  });

  it("should detect recursion loops", () => {
    const macrosMap = new Map<string, PedroData>();

    // Macro A includes Macro B
    const macroDataA: PedroData = {
      startPoint: { x: 0, y: 0, heading: "tangential", reverse: false },
      lines: [],
      shapes: [],
      sequence: [
        { kind: macroKind(), id: "m-b", filePath: "macroB.pp", name: "B" },
      ],
      extraData: {},
    };

    // Macro B includes Macro A
    const macroDataB: PedroData = {
      startPoint: { x: 0, y: 0, heading: "tangential", reverse: false },
      lines: [],
      shapes: [],
      sequence: [
        { kind: macroKind(), id: "m-a", filePath: "macroA.pp", name: "A" },
      ],
      extraData: {},
    };

    macrosMap.set("macroA.pp", macroDataA);
    macrosMap.set("macroB.pp", macroDataB);

    const macroItemA: SequenceMacroItem = {
      kind: macroKind(),
      id: "root",
      filePath: "macroA.pp",
      name: "A",
    };

    expect(() => {
      expandMacro(macroItemA, prevPoint, 0, macroDataA, macrosMap, new Set());
    }).toThrow("Recursion detected");
  });
});
