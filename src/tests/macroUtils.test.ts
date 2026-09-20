// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { expandMacro } from "../lib/macroUtils";
import type {
  Line,
  Point,
  SequenceMacroItem,
  Transformation,
  TurtleData,
} from "../types";

const start: Point = { x: 0, y: 0, heading: "constant", degrees: 0 };

const line = (id: string, endPoint: Point): Line => ({
  id,
  endPoint,
  controlPoints: [],
  color: "red",
});

function expand(lines: Line[], transformations: Transformation[] = []) {
  const macro: SequenceMacroItem = {
    kind: "macro",
    id: "m",
    name: "M",
    filePath: "/m.turt",
    transformations,
  };
  const data: TurtleData = {
    startPoint: start,
    lines,
    shapes: [],
    sequence: lines.map((l) => ({ kind: "path", lineId: l.id! })),
  };
  return expandMacro(macro, start, 0, data, new Map(), new Set());
}

const rotations = (result: ReturnType<typeof expand>) =>
  result.sequence.filter((s) => s.kind === "rotate");

describe("expandMacro headings", () => {
  it("ends facing along a tangential path", () => {
    const result = expand([
      line("a", { x: 10, y: 10, heading: "tangential", reverse: false }),
    ]);
    expect(result.endHeading).toBeCloseTo(45);
  });

  it("ends at a constant or linear path's final heading", () => {
    expect(
      expand([line("a", { x: 10, y: 0, heading: "constant", degrees: 135 })])
        .endHeading,
    ).toBe(135);
    expect(
      expand([
        line("a", {
          x: 10,
          y: 0,
          heading: "linear",
          startDeg: 0,
          endDeg: 180,
        }),
      ]).endHeading,
    ).toBe(180);
  });

  it("tracks the heading through a facingPoint path", () => {
    // Facing (10, 20) from (10, 0) ends at 90 degrees; the next path starts
    // at 90, so no turn in place is needed between them.
    const result = expand([
      line("a", {
        x: 10,
        y: 0,
        heading: "facingPoint",
        targetX: 10,
        targetY: 20,
      }),
      line("b", { x: 20, y: 0, heading: "constant", degrees: 90 }),
    ]);
    expect(result.endHeading).toBe(90);
    expect(rotations(result).map((r) => r.id)).not.toContain(
      "rotate-align-macro-m-b",
    );
  });

  it("moves a facingPoint target with the macro", () => {
    const result = expand(
      [
        line("a", {
          x: 10,
          y: 0,
          heading: "facingPoint",
          targetX: 30,
          targetY: 5,
        }),
      ],
      [{ type: "translate", dx: 5, dy: 7 }],
    );
    expect(result.lines.at(-1)!.endPoint).toMatchObject({
      x: 15,
      y: 7,
      targetX: 35,
      targetY: 12,
    });
  });
});
