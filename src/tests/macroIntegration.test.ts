// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { expandMacro, regenerateProjectMacros } from "../lib/macroUtils";
import { generateJavaCode } from "../utils/codeExporter";
import type {
  Line,
  Point,
  SequenceItem,
  PedroData,
  SequenceMacroItem,
} from "../types";

describe("Macro Integration", () => {
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

  const macroLine: Line = {
    id: "m-line-1",
    endPoint: { x: 20, y: 20, heading: "tangential", reverse: false },
    controlPoints: [],
    color: "#000000",
    name: "Macro Line 1",
  };

  const macroData: PedroData = {
    startPoint: { x: 15, y: 15, heading: "tangential", reverse: false },
    lines: [macroLine],
    shapes: [],
    sequence: [{ kind: "path", lineId: "m-line-1" }],
    extraData: {},
  };

  const macroItem: SequenceMacroItem = {
    kind: "macro",
    id: "macro-1",
    filePath: "macro.pp",
    name: "Test Macro",
    locked: false,
  };

  it("expandMacro should generate bridge and expand lines", () => {
    const macrosMap = new Map<string, PedroData>();
    const result = expandMacro(
      macroItem,
      prevPoint,
      0,
      macroData,
      macrosMap,
      new Set(),
    );

    // Check lines
    expect(result.lines.length).toBeGreaterThan(1); // Bridge + Macro Line
    const bridge = result.lines.find((l) => l.id?.startsWith("bridge-"));
    expect(bridge).toBeDefined();
    expect(bridge?.startPoint?.x).toBe(prevPoint.x);
    expect(bridge?.endPoint.x).toBe(macroData.startPoint.x);

    const expandedLine = result.lines.find((l) => l.originalId === "m-line-1");
    expect(expandedLine).toBeDefined();
    expect(expandedLine?.isMacroElement).toBe(true);
    expect(expandedLine?.macroId).toBe(macroItem.id);

    // Check sequence
    expect(result.sequence.length).toBeGreaterThan(1); // Bridge + Path
    const bridgeSeq = result.sequence.find(
      (s) => s.kind === "path" && s.lineId === bridge?.id,
    );
    expect(bridgeSeq).toBeDefined();

    const macroSeq = result.sequence.find(
      (s) => s.kind === "path" && s.lineId === expandedLine?.id,
    );
    expect(macroSeq).toBeDefined();
  });

  it("regenerateProjectMacros should process sequence correctly", () => {
    const lines: Line[] = [
      {
        id: "line-1",
        endPoint: prevPoint,
        controlPoints: [],
        color: "blue",
        name: "Line 1",
      },
    ];

    const sequence: SequenceItem[] = [
      { kind: "path", lineId: "line-1" },
      macroItem,
    ];

    const macrosMap = new Map<string, PedroData>();
    macrosMap.set("macro.pp", macroData);

    const result = regenerateProjectMacros(
      startPoint,
      lines,
      sequence,
      macrosMap,
    );

    expect(result.lines.length).toBeGreaterThan(lines.length);
    expect(result.sequence.length).toBe(2); // Top level sequence length remains same (MacroItem is still there)

    const newMacroItem = result.sequence[1] as SequenceMacroItem;
    expect(newMacroItem.sequence).toBeDefined();
    expect(newMacroItem.sequence!.length).toBeGreaterThan(0);
  });

  it("generateJavaCode should flatten macro sequence", async () => {
    // Setup expanded data
    const lines: Line[] = [
      {
        id: "line-1",
        endPoint: prevPoint,
        controlPoints: [],
        color: "blue",
        name: "Line1",
      },
      // Expanded macro line (mocked)
      {
        id: "macro-line-1",
        endPoint: { x: 20, y: 20, heading: "tangential", reverse: false },
        controlPoints: [],
        color: "red",
        name: "MacroLine1",
        isMacroElement: true,
      },
    ];

    const sequence: SequenceItem[] = [
      { kind: "path", lineId: "line-1" },
      {
        kind: "macro",
        id: "macro-1",
        filePath: "macro.pp",
        name: "Test Macro",
        sequence: [{ kind: "path", lineId: "macro-line-1" }],
      },
    ];

    const code = await generateJavaCode(startPoint, lines, true, sequence);

    // Code should contain followPath for Line1 AND MacroLine1
    expect(code).toContain("follower.followPath(paths.Line1");
    expect(code).toContain("follower.followPath(paths.MacroLine1");
  });
});
