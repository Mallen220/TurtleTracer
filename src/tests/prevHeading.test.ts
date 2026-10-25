// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Prev: a blank start angle takes the heading the robot has at that point.
import { describe, it, expect, beforeAll } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import { startingHeading } from "../utils/timeCalculator/startingHeading";
import {
  materializePrevHeadings,
  isPrev,
  firstPathStartsPrev,
} from "../utils/prevHeading";
import { expandMacro } from "../lib/macroUtils";
import {
  mirrorPathData,
  rotatePathData,
  flipPathData,
  reversePathData,
} from "../utils/pathTransform";
import { getUpdatedLinearStartHeading } from "../lib/components/renderer/LinearHeadingSync";
import { actionRegistry } from "../lib/actionRegistry";
import { WaitAction } from "../lib/actions/WaitAction";
import { RotateAction } from "../lib/actions/RotateAction";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line, Point, SequenceItem } from "../types";

beforeAll(() => {
  actionRegistry.register(WaitAction);
  actionRegistry.register(RotateAction);
});

const start: Point = { x: 10, y: 10, heading: "constant", degrees: 30 };

function line(id: string, x: number, endPoint: Partial<Point> = {}): Line {
  return {
    id,
    name: id,
    endPoint: { x, y: 10, heading: "tangential", ...endPoint } as Point,
    controlPoints: [],
    color: "#000",
  } as Line;
}

const path = (lineId: string): SequenceItem => ({ kind: "path", lineId });

describe("isPrev", () => {
  it("is true for a missing angle and false for zero", () => {
    expect(isPrev(undefined)).toBe(true);
    expect(isPrev(null)).toBe(true);
    expect(isPrev(0)).toBe(false);
  });
});

describe("materializePrevHeadings", () => {
  it("hands back the same lines when nothing is blank", () => {
    const lines = [
      line("a", 30, { heading: "linear", startDeg: 0, endDeg: 90 }),
    ];
    expect(materializePrevHeadings(start, lines)).toBe(lines);
  });

  it("starts a linear heading where the path before it ended", () => {
    const lines = [
      line("a", 30, { heading: "linear", startDeg: 30, endDeg: 90 }),
      line("b", 50, { heading: "linear", endDeg: 180 }),
    ];
    const [a, b] = materializePrevHeadings(start, lines);
    expect(a).toBe(lines[0]);
    expect(b.endPoint).toMatchObject({ startDeg: 90, endDeg: 180 });
    expect(lines[1].endPoint.startDeg).toBeUndefined();
  });

  it("follows the heading a tangential path ends with", () => {
    const lines = [
      line("a", 30, { heading: "tangential" }),
      line("b", 50, { heading: "linear", endDeg: 45 }),
    ];
    const [, b] = materializePrevHeadings(start, lines);
    expect(b.endPoint.startDeg).toBeCloseTo(0);
  });

  it("takes the heading a turn leaves the robot facing", () => {
    const lines = [
      line("a", 30, { heading: "linear", startDeg: 30, endDeg: 90 }),
      line("b", 50, { heading: "linear", endDeg: 180 }),
    ];
    const sequence: SequenceItem[] = [
      path("a"),
      { kind: "rotate", id: "r", name: "Turn", degrees: 120 },
      path("b"),
    ];
    const [, b] = materializePrevHeadings(start, lines, sequence);
    expect(b.endPoint.startDeg).toBe(120);
  });

  it("follows the order of the sequence rather than the lines", () => {
    const lines = [
      line("a", 30, { heading: "linear", startDeg: 0, endDeg: 60 }),
      line("b", 50, { heading: "linear", startDeg: 0, endDeg: 150 }),
      line("c", 70, { heading: "constant" }),
    ];
    const sequence = [path("a"), path("b"), path("c")];
    const reordered = [path("b"), path("a"), path("c")];
    expect(
      materializePrevHeadings(start, lines, sequence)[2].endPoint.degrees,
    ).toBe(150);
    expect(
      materializePrevHeadings(start, lines, reordered)[2].endPoint.degrees,
    ).toBe(60);
  });

  it("fills in a chain's global start from the heading before the chain", () => {
    const lines = [
      line("a", 30, { heading: "linear", startDeg: 30, endDeg: 75 }),
      {
        ...line("b", 50),
        globalHeading: "linear" as const,
        globalEndDeg: 200,
      },
      { ...line("c", 70), isChain: true },
    ];
    const [, b] = materializePrevHeadings(start, lines, [
      path("a"),
      path("b"),
      path("c"),
    ]);
    expect(b.globalStartDeg).toBe(75);
  });

  it("starts each piecewise segment where the one before ended", () => {
    const lines = [
      line("a", 30, { heading: "linear", startDeg: 30, endDeg: 75 }),
      line("b", 50, {
        heading: "piecewise",
        segments: [
          { tStart: 0, tEnd: 0.5, heading: "linear", endDeg: 100 },
          { tStart: 0.5, tEnd: 0.8, heading: "constant" },
          { tStart: 0.8, tEnd: 1, heading: "linear", endDeg: 10 },
        ],
      }),
    ];
    const [, b] = materializePrevHeadings(start, lines);
    expect(b.endPoint.segments).toMatchObject([
      { startDeg: 75, endDeg: 100 },
      { degrees: 100 },
      { startDeg: 100, endDeg: 10 },
    ]);
  });

  it("lets a macro's first path start from wherever it is placed", () => {
    const lines = [
      line("a", 30, { heading: "linear", startDeg: 30, endDeg: 75 }),
      {
        ...line("m", 50, { heading: "linear", endDeg: 10 }),
        isMacroElement: true,
      },
    ];
    const sequence: SequenceItem[] = [
      path("a"),
      {
        kind: "macro",
        id: "x",
        filePath: "x",
        name: "x",
        sequence: [path("m")],
      },
    ];
    const [, m] = materializePrevHeadings(start, lines, sequence);
    expect(m.endPoint.startDeg).toBe(75);
  });
});

describe("the first path", () => {
  it("starts from the start point's own heading when it is blank", () => {
    const lines = [line("a", 30, { heading: "linear", endDeg: 90 })];
    expect(startingHeading(start, lines)).toBe(30);
    const [a] = materializePrevHeadings(start, lines);
    expect(a.endPoint.startDeg).toBe(30);
  });
});

describe("timing", () => {
  it("never turns in place for a path that starts blank", () => {
    const lines = [
      line("a", 30, { heading: "linear", startDeg: 30, endDeg: 90 }),
      line("b", 60, { heading: "linear", endDeg: 150 }),
    ];
    const { timeline } = calculatePathTime(start, lines, DEFAULT_SETTINGS);
    expect(timeline.some((e) => e.type === "wait")).toBe(false);
  });

  it("times the same as writing the heading out", () => {
    const blank = [
      line("a", 30, { heading: "linear", startDeg: 30, endDeg: 90 }),
      line("b", 60, { heading: "linear", endDeg: 150 }),
    ];
    const written = [
      blank[0],
      line("b", 60, { heading: "linear", startDeg: 90, endDeg: 150 }),
    ];
    const a = calculatePathTime(start, blank, DEFAULT_SETTINGS);
    const b = calculatePathTime(start, written, DEFAULT_SETTINGS);
    expect(a.totalTime).toBeCloseTo(b.totalTime, 6);
  });
});

describe("macros", () => {
  const macroData = {
    startPoint: { x: 50, y: 10, heading: "constant", degrees: 0 } as Point,
    lines: [
      line("m1", 70, { heading: "linear", endDeg: 10 }),
      line("m2", 90, { heading: "linear", startDeg: 10, endDeg: 20 }),
    ],
    shapes: [],
    sequence: [path("m1"), path("m2")],
  };
  const item = {
    kind: "macro" as const,
    id: "x",
    filePath: "x.pp",
    name: "x",
  };
  const here = { x: 50, y: 10, heading: "constant", degrees: 75 } as Point;

  it("starts a blank first path from wherever the macro is placed", () => {
    const placed = expandMacro(item, here, 75, macroData, new Map(), new Set());
    expect(placed.sequence.map((s) => s.kind)).toEqual(["path", "path"]);
    expect(placed.lines[0].endPoint.startDeg).toBeUndefined();

    const other = expandMacro(item, here, 200, macroData, new Map(), new Set());
    expect(other.sequence.map((s) => s.kind)).toEqual(["path", "path"]);
  });

  it("starts the macro from the heading before it when timed", () => {
    const before = line("a", 50, {
      heading: "linear",
      startDeg: 0,
      endDeg: 75,
    });
    const placed = expandMacro(item, here, 75, macroData, new Map(), new Set());
    const sequence: SequenceItem[] = [
      path("a"),
      { ...item, sequence: placed.sequence },
    ];
    const lines = [before, ...placed.lines];
    const [, m1] = materializePrevHeadings(start, lines, sequence);
    expect(m1.endPoint.startDeg).toBe(75);
  });

  it("keeps a blank angle blank when the macro is rotated or flipped", () => {
    const placed = expandMacro(
      { ...item, transformations: [{ type: "rotate", degrees: 30 } as any] },
      here,
      75,
      macroData,
      new Map(),
      new Set(),
    );
    const [m1, m2] = ["m1", "m2"].map(
      (id) => placed.lines.find((l) => l.originalId === id)!,
    );
    expect(m1.endPoint.startDeg).toBeUndefined();
    expect(m1.endPoint.endDeg).toBe(40);
    expect(m2.endPoint.startDeg).toBe(40);

    const flipped = expandMacro(
      {
        ...item,
        transformations: [{ type: "flip", axis: "horizontal" } as any],
      },
      here,
      75,
      macroData,
      new Map(),
      new Set(),
    );
    expect(
      flipped.lines.find((l) => l.originalId === "m1")!.endPoint.startDeg,
    ).toBeUndefined();
  });
});

describe("editing a path with a blank start", () => {
  const data = {
    startPoint: start,
    lines: [
      line("a", 30, { heading: "linear", startDeg: 0, endDeg: 90 }),
      line("b", 50, { heading: "linear", endDeg: 180 }),
    ],
  };

  it("keeps the blank angle when mirroring, rotating and flipping", () => {
    expect(mirrorPathData(data).lines[1].endPoint.startDeg).toBeUndefined();
    expect(
      rotatePathData(data, 90, 72, 72).lines[1].endPoint.startDeg,
    ).toBeUndefined();
    expect(
      flipPathData(data, true, true, 72, 72).lines[1].endPoint.startDeg,
    ).toBeUndefined();
    expect(mirrorPathData(data).lines[1].endPoint.endDeg).toBe(0);
  });

  it("fills the angle in when the path is reversed", () => {
    const reversed = reversePathData(data);
    const linear = reversed.lines
      .map((l) => l.endPoint)
      .filter((p) => p.heading === "linear");
    expect(linear.length).toBeGreaterThan(0);
    expect(linear.every((p) => typeof p.startDeg === "number")).toBe(true);
  });
});

describe("the first path's start heading", () => {
  it("is left alone by the start point sync when blank", () => {
    const lines = [line("a", 30, { heading: "linear", endDeg: 90 })];
    const point = { ...start, heading: "linear", startDeg: 45, endDeg: 45 };
    expect(getUpdatedLinearStartHeading(point as Point, lines)).toBeNull();
  });

  it("knows when the first path starts blank", () => {
    const blankFirst = [line("a", 30, { heading: "linear", endDeg: 90 })];
    expect(firstPathStartsPrev(start, blankFirst)).toBe(true);
    const written = [
      line("a", 30, { heading: "linear", startDeg: 0, endDeg: 90 }),
    ];
    expect(firstPathStartsPrev(start, written)).toBe(false);
  });
});
