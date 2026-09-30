// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  expandMacro,
  wouldCreateCycle,
  regenerateProjectMacros,
  MAX_MACRO_DEPTH,
} from "../lib/macroUtils";
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

// --- Helpers for the tests below ---

const macroItem = (
  over: Partial<SequenceMacroItem> = {},
): SequenceMacroItem => ({
  kind: "macro",
  id: "m",
  name: "M",
  filePath: "/m.turt",
  ...over,
});

const dataWith = (
  lines: Line[],
  sequence?: TurtleData["sequence"],
  startPoint: Point = start,
): TurtleData => ({
  startPoint,
  lines,
  shapes: [],
  sequence: sequence ?? lines.map((l) => ({ kind: "path", lineId: l.id! })),
});

/** Expands a macro from a point far away, so the last line is always the macro's own. */
function expandData(
  data: TurtleData,
  transformations: Transformation[] = [],
  macros = new Map<string, TurtleData>(),
) {
  return expandMacro(
    macroItem({ transformations }),
    { x: 0, y: 0, heading: "constant", degrees: 0 },
    0,
    data,
    macros,
    new Set(),
  );
}

describe("expandMacro transformations", () => {
  const target = (
    endPoint: Point,
    t: Transformation,
    controlPoints: Point[] = [],
  ) =>
    expandData(dataWith([{ ...line("a", endPoint), controlPoints }]), [
      t,
    ]).lines.at(-1)!;

  it("rotates about the field centre by default", () => {
    const moved = target(
      { x: 82, y: 72, heading: "constant", degrees: 0 },
      { type: "rotate", degrees: 90 },
    );
    expect(moved.endPoint.x).toBeCloseTo(72);
    expect(moved.endPoint.y).toBeCloseTo(82);
    expect(moved.endPoint).toMatchObject({ heading: "constant" });
    expect((moved.endPoint as any).degrees).toBe(90);
  });

  it("rotates about the macro's own centre when asked", () => {
    // The macro spans (0,0)-(10,20), so its centre is (5,10).
    const moved = target(
      { x: 10, y: 20, heading: "constant", degrees: 0 },
      { type: "rotate", degrees: 180, pivot: "center" },
    );
    expect(moved.endPoint.x).toBeCloseTo(0);
    expect(moved.endPoint.y).toBeCloseTo(0);
  });

  it("rotates about a custom pivot and moves control points too", () => {
    const moved = target(
      { x: 10, y: 0, heading: "constant", degrees: 0 },
      { type: "rotate", degrees: 90, pivot: { x: 0, y: 0 } },
      [{ x: 4, y: 0, heading: "tangential" } as Point],
    );
    expect(moved.endPoint.x).toBeCloseTo(0);
    expect(moved.endPoint.y).toBeCloseTo(10);
    expect(moved.controlPoints[0].x).toBeCloseTo(0);
    expect(moved.controlPoints[0].y).toBeCloseTo(4);
  });

  it("ignores a rotation of zero degrees", () => {
    const moved = target(
      { x: 10, y: 3, heading: "constant", degrees: 20 },
      { type: "rotate", degrees: 0 },
    );
    expect(moved.endPoint).toMatchObject({ x: 10, y: 3, degrees: 20 });
  });

  it("flips horizontally, mirroring x and the heading", () => {
    // Centre is (5,10): x becomes 10 - x, and a heading of 30 becomes 150.
    const moved = target(
      { x: 10, y: 20, heading: "constant", degrees: 30 },
      { type: "flip", axis: "horizontal", pivot: "center" },
    );
    expect(moved.endPoint).toMatchObject({ x: 0, y: 20, degrees: 150 });
  });

  it("flips vertically, mirroring y and negating the heading", () => {
    const moved = target(
      { x: 10, y: 20, heading: "constant", degrees: 30 },
      { type: "flip", axis: "vertical", pivot: "center" },
    );
    expect(moved.endPoint).toMatchObject({ x: 10, y: 0, degrees: -30 });
  });

  it("translates by dx and dy, treating missing values as zero", () => {
    const moved = target(
      { x: 10, y: 20, heading: "constant", degrees: 30 },
      { type: "translate", dx: 5 },
    );
    expect(moved.endPoint).toMatchObject({ x: 15, y: 20, degrees: 30 });
  });

  it("applies several transformations in order", () => {
    const moved = expandData(
      dataWith([line("a", { x: 10, y: 0, heading: "constant", degrees: 0 })]),
      [
        { type: "translate", dx: 10, dy: 0 },
        { type: "flip", axis: "horizontal", pivot: { x: 0, y: 0 } },
      ],
    ).lines.at(-1)!;
    expect(moved.endPoint.x).toBe(-20);
  });

  it("does not modify the macro's original data", () => {
    const original = dataWith([
      line("a", { x: 10, y: 0, heading: "constant", degrees: 0 }),
    ]);
    const snapshot = structuredClone(original);
    expandData(original, [{ type: "translate", dx: 50, dy: 50 }]);
    expect(original).toEqual(snapshot);
  });

  it("turns linear headings and each piece of a piecewise heading", () => {
    const linear = target(
      { x: 10, y: 0, heading: "linear", startDeg: 10, endDeg: 50 },
      { type: "flip", axis: "vertical" },
    );
    expect(linear.endPoint).toMatchObject({ startDeg: -10, endDeg: -50 });

    const piecewise = target(
      {
        x: 10,
        y: 0,
        heading: "piecewise",
        segments: [
          { heading: "constant", degrees: 5 },
          { heading: "linear", startDeg: 15, endDeg: 25 },
        ],
      } as Point,
      { type: "rotate", degrees: 90 },
    );
    const segments = (piecewise.endPoint as any).segments;
    expect(segments[0].degrees).toBe(95);
    expect(segments[1]).toMatchObject({ startDeg: 105, endDeg: 115 });
  });

  it("turns the chain's global heading", () => {
    const base = line("a", { x: 10, y: 0, heading: "tangential" } as Point);
    const run = (global: Partial<Line>, t: Transformation) =>
      expandData(dataWith([{ ...base, ...global }]), [t]).lines.at(-1)!;

    expect(
      run(
        { globalHeading: "constant", globalDegrees: 20 },
        { type: "rotate", degrees: 90 },
      ).globalDegrees,
    ).toBe(110);

    const facing = run(
      { globalHeading: "facingPoint", globalTargetX: 10, globalTargetY: 0 },
      { type: "translate", dx: 1, dy: 2 },
    );
    expect(facing).toMatchObject({ globalTargetX: 11, globalTargetY: 2 });

    // No global heading: nothing is invented.
    const none = run(
      { globalHeading: "none" },
      { type: "rotate", degrees: 90 },
    );
    expect(none.globalDegrees).toBeUndefined();
  });

  it("turns the degrees of rotate steps inside the macro", () => {
    const data = dataWith(
      [line("a", { x: 10, y: 0, heading: "constant", degrees: 0 })],
      [
        { kind: "rotate", id: "r1", name: "Turn", degrees: 30 },
        { kind: "path", lineId: "a" },
      ],
    );
    const result = expandData(data, [{ type: "rotate", degrees: 90 }]);
    const turn = result.sequence.find(
      (s) => s.kind === "rotate" && s.id === "macro-m-r1",
    );
    expect(turn).toMatchObject({ degrees: 120, locked: true });
  });
});

describe("expandMacro steps", () => {
  it("adds a bridge from the robot to the macro's start, keeping a constant heading", () => {
    const data = dataWith(
      [line("a", { x: 60, y: 60, heading: "constant", degrees: 0 })],
      undefined,
      { x: 50, y: 50, heading: "constant", degrees: 45 },
    );
    const result = expandMacro(
      macroItem(),
      { x: 0, y: 0, heading: "constant", degrees: 0 },
      0,
      data,
      new Map(),
      new Set(),
    );
    const bridge = result.lines[0];
    expect(bridge).toMatchObject({
      id: "bridge-m",
      name: "Bridge to M",
      isMacroElement: true,
    });
    expect(bridge.endPoint).toMatchObject({
      x: 50,
      y: 50,
      heading: "constant",
      degrees: 45,
    });
    expect(result.sequence[0]).toEqual({ kind: "path", lineId: "bridge-m" });
  });

  it("drives the bridge forward, or backward only if the macro starts reversed", () => {
    const bridgeTo = (startPoint: Point) =>
      expandMacro(
        macroItem(),
        { x: 0, y: 0, heading: "constant", degrees: 0 },
        0,
        dataWith([], [], startPoint),
        new Map(),
        new Set(),
      ).lines[0].endPoint as any;

    expect(
      bridgeTo({ x: 30, y: 0, heading: "tangential", reverse: true } as Point)
        .reverse,
    ).toBe(true);
    expect(
      bridgeTo({ x: 30, y: 0, heading: "tangential" } as Point).reverse,
    ).toBe(false);
    expect(
      bridgeTo({ x: 30, y: 0, heading: "linear", startDeg: 0, endDeg: 90 })
        .reverse,
    ).toBe(false);
  });

  it("adds no bridge when the robot is already at the macro's start", () => {
    const data = dataWith([
      line("a", { x: 10, y: 0, heading: "constant", degrees: 0 }),
    ]);
    const result = expandMacro(
      macroItem(),
      start,
      0,
      data,
      new Map(),
      new Set(),
    );
    expect(result.lines.map((l) => l.id)).toEqual(["macro-m-a"]);
  });

  it("marks the macro's own lines as locked copies of the originals", () => {
    const result = expandData(
      dataWith([
        {
          ...line("a", { x: 10, y: 0, heading: "constant", degrees: 0 }),
          controlPoints: [{ x: 5, y: 5, heading: "tangential" } as Point],
        },
      ]),
    );
    const copy = result.lines.at(-1)!;
    expect(copy).toMatchObject({
      id: "macro-m-a",
      originalId: "a",
      locked: true,
      macroId: "m",
    });
    expect(copy.endPoint).toMatchObject({ locked: true, macroId: "m" });
    expect(copy.controlPoints[0]).toMatchObject({ locked: true, macroId: "m" });
  });

  it("falls back to every line in order when the macro has no sequence", () => {
    const data = dataWith(
      [
        line("a", { x: 10, y: 0, heading: "constant", degrees: 0 }),
        line("b", { x: 20, y: 0, heading: "constant", degrees: 0 }),
      ],
      [],
    );
    const result = expandData(data);
    expect(
      result.sequence
        .filter((s) => s.kind === "path")
        .map((s: any) => s.lineId),
    ).toEqual(expect.arrayContaining(["macro-m-a", "macro-m-b"]));
  });

  it("turns in place before a path that starts facing another way", () => {
    // The robot faces 0 degrees, but the path heads straight up (90).
    const data = dataWith([
      line("a", { x: 0, y: 10, heading: "tangential" } as Point),
    ]);
    const result = expandMacro(
      macroItem(),
      { x: 0, y: 0, heading: "constant", degrees: 0 },
      0,
      data,
      new Map(),
      new Set(),
    );
    const kinds = result.sequence.map((s) => s.kind);
    expect(kinds).toEqual(["rotate", "path"]);
    expect(result.sequence[0]).toMatchObject({
      name: "Align Rotation",
      locked: true,
    });
    expect((result.sequence[0] as any).degrees).toBeCloseTo(90);
  });

  it("scopes wait and rotate step ids to the macro, and follows rotations", () => {
    const data = dataWith(
      [line("a", { x: 10, y: 0, heading: "constant", degrees: 0 })],
      [
        { kind: "wait", id: "w1", name: "Pause", durationMs: 500 } as any,
        { kind: "rotate", id: "r1", name: "Turn", degrees: 135 },
      ],
    );
    const result = expandData(data);
    expect(result.sequence.map((s: any) => s.id)).toEqual([
      "macro-m-w1",
      "macro-m-r1",
    ]);
    expect(result.sequence.every((s: any) => s.locked)).toBe(true);
    expect(result.endHeading).toBe(135);
  });

  it("skips steps that refer to a line the macro doesn't have", () => {
    const data = dataWith(
      [line("a", { x: 10, y: 0, heading: "constant", degrees: 0 })],
      [{ kind: "path", lineId: "ghost" }],
    );
    expect(expandData(data).sequence).toEqual([]);
  });
});

describe("expandMacro nesting and limits", () => {
  const inner = dataWith([
    line("x", { x: 10, y: 0, heading: "constant", degrees: 0 }),
  ]);
  const outer = dataWith(
    [],
    [{ kind: "macro", id: "n", name: "N", filePath: "/n.turt" }],
  );

  it("expands nested macros and moves them with the parent's transformations", () => {
    const result = expandData(
      outer,
      [{ type: "translate", dx: 100, dy: 0 }],
      new Map([["/n.turt", inner]]),
    );
    const nestedLine = result.lines.find((l) => l.id === "macro-macro-m-n-x")!;
    expect(nestedLine.endPoint.x).toBe(110);
    const nestedItem: any = result.sequence.find((s) => s.kind === "macro");
    expect(nestedItem).toMatchObject({ id: "macro-m-n", locked: true });
    expect(nestedItem.sequence.map((s: any) => s.lineId)).toContain(
      "macro-macro-m-n-x",
    );
    expect(result.endPoint.x).toBe(110);
  });

  it("keeps a nested macro as a reference when its file isn't loaded", () => {
    const result = expandData(outer, [], new Map());
    expect(result.lines).toEqual([]);
    expect(result.sequence).toEqual([
      expect.objectContaining({ kind: "macro", id: "macro-m-n", locked: true }),
    ]);
  });

  it("rejects a macro that is already being expanded, however its path is written", () => {
    expect(() =>
      expandMacro(
        macroItem({ filePath: String.raw`C:\Macros\M.TURT` }),
        start,
        0,
        inner,
        new Map(),
        new Set(["c:/macros/m.turt"]),
      ),
    ).toThrow(/Recursion detected/);
  });

  it("rejects nesting deeper than the limit", () => {
    expect(() =>
      expandMacro(
        macroItem(),
        start,
        0,
        inner,
        new Map(),
        new Set(),
        MAX_MACRO_DEPTH + 1,
      ),
    ).toThrow(/Maximum macro depth/);
    // Exactly at the limit is still allowed.
    expect(() =>
      expandMacro(
        macroItem(),
        start,
        0,
        inner,
        new Map(),
        new Set(),
        MAX_MACRO_DEPTH,
      ),
    ).not.toThrow();
  });
});

describe("wouldCreateCycle", () => {
  const withMacros = (...filePaths: string[]): TurtleData =>
    dataWith(
      [],
      filePaths.map((filePath, i) => ({
        kind: "macro" as const,
        id: `m${i}`,
        name: filePath,
        filePath,
      })),
    );

  it("is true when a file would include itself", () => {
    expect(wouldCreateCycle("/a.turt", "/a.turt", new Map())).toBe(true);
  });

  it("finds cycles through other macros", () => {
    const macros = new Map([
      ["/b.turt", withMacros("/c.turt")],
      ["/c.turt", withMacros("/a.turt")],
    ]);
    expect(wouldCreateCycle("/b.turt", "/a.turt", macros)).toBe(true);
  });

  it("ignores case and slash direction", () => {
    const macros = new Map([
      [String.raw`C:\Macros\B.turt`, withMacros("c:/macros/A.TURT")],
    ]);
    expect(
      wouldCreateCycle(
        "c:/macros/b.turt",
        String.raw`C:\Macros\a.turt`,
        macros,
      ),
    ).toBe(true);
  });

  it("is false for a harmless chain, including one that shares a macro twice", () => {
    // a -> (b, c), and both b and c include d: a diamond, not a cycle.
    const macros = new Map([
      ["/b.turt", withMacros("/d.turt")],
      ["/c.turt", withMacros("/d.turt")],
      ["/d.turt", withMacros()],
    ]);
    expect(wouldCreateCycle("/b.turt", "/a.turt", macros)).toBe(false);
    expect(wouldCreateCycle("/c.turt", "/a.turt", macros)).toBe(false);
  });

  it("visits a macro shared by two branches only once", () => {
    // x includes b and c, which both include d: d is reached twice, and
    // neither path leads back to a.
    const macros = new Map([
      ["/x.turt", withMacros("/b.turt", "/c.turt")],
      ["/b.turt", withMacros("/d.turt")],
      ["/c.turt", withMacros("/d.turt")],
      ["/d.turt", withMacros()],
    ]);
    expect(wouldCreateCycle("/x.turt", "/a.turt", macros)).toBe(false);
  });

  it("stops at a cycle that doesn't involve the file being edited", () => {
    const macros = new Map([
      ["/b.turt", withMacros("/c.turt")],
      ["/c.turt", withMacros("/b.turt")],
    ]);
    // Adding b to a would pull in an already-broken b <-> c loop.
    expect(wouldCreateCycle("/b.turt", "/a.turt", macros)).toBe(true);
  });
});

describe("regenerateProjectMacros", () => {
  const userLine = line("u", { x: 20, y: 0, heading: "constant", degrees: 0 });
  const macroFile = dataWith([
    line("a", { x: 40, y: 0, heading: "constant", degrees: 0 }),
  ]);
  const macroStep = (over: Partial<SequenceMacroItem> = {}) => macroItem(over);

  it("keeps the user's lines and steps and rebuilds the macro's", () => {
    const stale = {
      ...line("macro-m-old", { x: 1, y: 1, heading: "constant", degrees: 0 }),
      isMacroElement: true,
      macroId: "m",
    };
    const result = regenerateProjectMacros(
      start,
      [userLine, stale],
      [
        { kind: "path", lineId: "u" },
        { kind: "wait", id: "w", name: "Wait", durationMs: 100 } as any,
        { kind: "rotate", id: "r", name: "Turn", degrees: 10 },
        macroStep(),
      ],
      new Map([["/m.turt", macroFile]]),
    );
    const ids = result.lines.map((l) => l.id);
    expect(ids).toContain("u");
    expect(ids).toContain("macro-m-a");
    expect(ids).not.toContain("macro-m-old");
    expect(result.sequence.map((s) => s.kind)).toEqual([
      "path",
      "wait",
      "rotate",
      "macro",
    ]);
    expect((result.sequence[3] as any).sequence.length).toBeGreaterThan(0);
  });

  it("reuses the lines from last time while the macro file isn't loaded", () => {
    const kept = [
      {
        ...line("bridge-m", { x: 5, y: 5, heading: "tangential" } as Point),
        isMacroElement: true,
        macroId: "m",
      },
      {
        ...line("macro-m-a", { x: 9, y: 9, heading: "constant", degrees: 90 }),
        isMacroElement: true,
        macroId: "m",
      },
    ];
    const result = regenerateProjectMacros(
      start,
      [userLine, ...kept],
      [{ kind: "path", lineId: "u" }, macroStep()],
      new Map(),
    );
    expect(result.lines.map((l) => l.id)).toEqual([
      "u",
      "bridge-m",
      "macro-m-a",
    ]);
    const item: any = result.sequence[1];
    expect(item.sequence).toEqual([
      { kind: "path", lineId: "bridge-m" },
      { kind: "path", lineId: "macro-m-a" },
    ]);
  });

  it("keeps the macro's existing steps instead of rebuilding them", () => {
    const existing = [{ kind: "path" as const, lineId: "macro-m-a" }];
    const result = regenerateProjectMacros(
      start,
      [
        {
          ...line("macro-m-a", { x: 9, y: 9, heading: "constant", degrees: 0 }),
          isMacroElement: true,
          macroId: "m",
        },
      ],
      [macroStep({ sequence: existing })],
      new Map(),
    );
    expect((result.sequence[0] as any).sequence).toBe(existing);
  });

  it("leaves a never-expanded macro in the sequence untouched", () => {
    const item = macroStep();
    const result = regenerateProjectMacros(start, [], [item], new Map());
    expect(result).toEqual({ lines: [], sequence: [item] });
  });

  it("refuses to expand the file that is currently open", () => {
    expect(() =>
      regenerateProjectMacros(
        start,
        [],
        [macroStep()],
        new Map([["/m.turt", macroFile]]),
        "/M.turt",
      ),
    ).toThrow(/Recursion detected/);
  });
});
