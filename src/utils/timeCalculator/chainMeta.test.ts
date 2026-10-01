// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  calculateEndHeadingAndRotation,
  calculateGlobalChainMeta,
  continuesChain,
} from "./chainMeta";
import type { Line, Point, SequenceItem } from "../../types";
import type { PathAnalysis } from "./types";

const origin: Point = { x: 0, y: 0, heading: "tangential" } as Point;

const line = (
  id: string,
  endPoint: Partial<Point>,
  over: Partial<Line> = {},
): Line => ({
  id,
  endPoint: { heading: "tangential", ...endPoint } as Point,
  controlPoints: [],
  color: "red",
  ...over,
});

const path = (lineId: string, isChain?: boolean): SequenceItem => ({
  kind: "path",
  lineId,
  ...(isChain === undefined ? {} : { isChain }),
});

describe("continuesChain", () => {
  const lines = new Map([
    ["a", line("a", {})],
    ["b", line("b", {}, { isChain: true })],
  ]);

  it("is false for the first step and for steps after a non-path", () => {
    expect(continuesChain([path("b", true)], 0, lines)).toBe(false);
    const wait = {
      kind: "wait",
      id: "w",
      name: "Wait",
      durationMs: 1,
    } as SequenceItem;
    expect(continuesChain([path("a"), wait, path("b", true)], 2, lines)).toBe(
      false,
    );
  });

  it("is true when the step or its line is marked as chained", () => {
    expect(continuesChain([path("a"), path("x", true)], 1, lines)).toBe(true);
    expect(continuesChain([path("a"), path("b")], 1, lines)).toBe(true);
  });

  it("is false for an unmarked step, or something that isn't a path", () => {
    expect(continuesChain([path("a"), path("a")], 1, lines)).toBe(false);
    expect(
      continuesChain(
        [path("a"), { kind: "rotate", id: "r", name: "R", degrees: 0 }],
        1,
        lines,
      ),
    ).toBe(false);
  });
});

describe("calculateGlobalChainMeta", () => {
  // Straight 10-inch paths along x, so each has a length of 10.
  const lines = [
    line("a", { x: 10, y: 0 }),
    line("b", { x: 20, y: 0 }),
    line("c", { x: 30, y: 0 }),
    line("d", { x: 40, y: 0 }),
  ];

  it("reports each line's chain root, total length and distance before it", () => {
    const meta = calculateGlobalChainMeta(
      [path("a"), path("b", true), path("c", true), path("d")],
      lines,
      origin,
    );
    expect(meta.get("a")).toMatchObject({ distanceBefore: 0 });
    expect(meta.get("b")!.distanceBefore).toBeCloseTo(10);
    expect(meta.get("c")!.distanceBefore).toBeCloseTo(20);
    // Every member of the first chain knows the chain's full length.
    for (const id of ["a", "b", "c"]) {
      expect(meta.get(id)!.chainTotalLength).toBeCloseTo(30);
      expect(meta.get(id)!.rootLine.id).toBe("a");
    }
    // The next unchained path starts a new chain.
    expect(meta.get("d")).toMatchObject({ distanceBefore: 0 });
    expect(meta.get("d")!.chainTotalLength).toBeCloseTo(10);
    expect(meta.get("d")!.rootLine.id).toBe("d");
  });

  it("skips steps that aren't paths or refer to missing lines", () => {
    const meta = calculateGlobalChainMeta(
      [
        { kind: "wait", id: "w", name: "W", durationMs: 1 } as SequenceItem,
        path("ghost"),
        path("a"),
      ],
      lines,
      origin,
    );
    expect([...meta.keys()]).toEqual(["a"]);
  });
});

describe("calculateEndHeadingAndRotation", () => {
  const prev = { x: 0, y: 0 };
  const analysis = { netRotation: 25, tangentRotation: 30 } as PathAnalysis;

  const endHeading = (
    l: Line,
    opts: {
      currentHeading?: number;
      isChained?: boolean;
      root?: Line;
      meta?: {
        rootLine: Line;
        chainTotalLength: number;
        distanceBefore: number;
      };
      length?: number;
    } = {},
  ) =>
    calculateEndHeadingAndRotation(
      l,
      prev,
      opts.root,
      opts.meta,
      opts.currentHeading ?? 0,
      opts.length ?? 10,
      opts.isChained ?? false,
      analysis,
    );

  it("tangential: an unchained path uses the analysed rotation", () => {
    expect(
      endHeading(line("a", { x: 10, y: 0 }), { currentHeading: 5 }),
    ).toEqual({
      endHeading: 30,
      rotationRequired: 30,
    });
  });

  it("tangential: a chained path ends facing its direction of travel", () => {
    const result = endHeading(line("a", { x: 0, y: 10 }), {
      isChained: true,
      currentHeading: 350,
    });
    expect(result.endHeading).toBeCloseTo(450); // 90, unwrapped near 350
    expect(result.rotationRequired).toBeCloseTo(100);
  });

  it("constant: ends at that heading, half a turn round if reversed", () => {
    const plain = endHeading(
      line("a", { x: 10, y: 0, heading: "constant", degrees: 90 }),
    );
    expect(plain).toEqual({ endHeading: 90, rotationRequired: 90 });

    const reversed = endHeading(
      line("a", {
        x: 10,
        y: 0,
        heading: "constant",
        degrees: 0,
        reverse: true,
      } as Partial<Point>),
    );
    expect(Math.abs(reversed.endHeading)).toBeCloseTo(180);
  });

  it("linear: rotation is the sweep; a reversed sweep ends the long way round", () => {
    const plain = endHeading(
      line("a", { x: 10, y: 0, heading: "linear", startDeg: 0, endDeg: 90 }),
    );
    expect(plain.endHeading).toBeCloseTo(90);
    expect(plain.rotationRequired).toBeCloseTo(90);

    const reversed = endHeading(
      line("a", {
        x: 10,
        y: 0,
        heading: "linear",
        startDeg: 0,
        endDeg: 90,
        reverse: true,
      } as Partial<Point>),
    );
    expect(reversed.endHeading).toBeCloseTo(-270);
    expect(reversed.rotationRequired).toBeCloseTo(270);
  });

  it("facingPoint: ends pointing at the target", () => {
    const result = endHeading(
      line("a", {
        x: 10,
        y: 0,
        heading: "facingPoint",
        targetX: 10,
        targetY: 50,
      } as Partial<Point>),
    );
    expect(result.endHeading).toBeCloseTo(90);

    const reversed = endHeading(
      line("a", {
        x: 10,
        y: 0,
        heading: "facingPoint",
        targetX: 10,
        targetY: 50,
        reverse: true,
      } as Partial<Point>),
    );
    expect(reversed.endHeading).toBeCloseTo(-90);
  });

  describe("piecewise", () => {
    const piecewise = (segments: any[]) =>
      line("a", {
        x: 10,
        y: 0,
        heading: "piecewise",
        segments,
      } as Partial<Point>);

    it("uses the segment that covers the end of the path", () => {
      const l = piecewise([
        { tStart: 0, tEnd: 0.5, heading: "constant", degrees: 10 },
        { tStart: 0.5, tEnd: 1, heading: "constant", degrees: 80 },
      ]);
      expect(endHeading(l).endHeading).toBe(80);
    });

    it("handles each kind of segment", () => {
      const one = (segment: any, opts = {}) =>
        endHeading(piecewise([{ tStart: 0, tEnd: 1, ...segment }]), opts);

      expect(one({ heading: "tangential" }).endHeading).toBeCloseTo(0);
      expect(
        one({ heading: "linear", startDeg: 0, endDeg: 45 }).endHeading,
      ).toBeCloseTo(45);
      expect(
        one({ heading: "linear", startDeg: 0, endDeg: 45, reverse: true })
          .endHeading,
      ).toBeCloseTo(-315);
      expect(
        one({ heading: "facingPoint", targetX: 10, targetY: 20 }).endHeading,
      ).toBeCloseTo(90);
      expect(
        one({ heading: "constant", degrees: 0, reverse: true }).endHeading,
      ).toBeCloseTo(180);
    });

    it("falls back to the last segment, or keeps the heading with none", () => {
      const l = piecewise([
        { tStart: 0, tEnd: 0.2, heading: "constant", degrees: 10 },
        { tStart: 0.2, tEnd: 0.4, heading: "constant", degrees: 20 },
      ]);
      // t is 1 here, past every segment, so the last one applies.
      expect(endHeading(l).endHeading).toBe(20);
      expect(endHeading(piecewise([]), { currentHeading: 77 }).endHeading).toBe(
        77,
      );
    });

    it("evaluates a global piecewise heading along the whole chain", () => {
      const root = line(
        "root",
        { x: 10, y: 0 },
        {
          globalHeading: "piecewise",
          globalSegments: [
            { tStart: 0, tEnd: 0.5, heading: "constant", degrees: 15 },
            { tStart: 0.5, tEnd: 1, heading: "constant", degrees: 60 },
          ],
        },
      );
      const second = line("b", { x: 20, y: 0 });
      const meta = { rootLine: root, chainTotalLength: 20, distanceBefore: 10 };
      // This path ends at the end of the chain (t = 1), in the last segment.
      expect(
        endHeading(second, { root, meta, isChained: true }).endHeading,
      ).toBe(60);
      const firstMeta = {
        rootLine: root,
        chainTotalLength: 20,
        distanceBefore: 0,
      };
      expect(endHeading(root, { root, meta: firstMeta }).endHeading).toBe(15);
    });
  });

  it("falls back to the current heading if the analysed rotation isn't a number", () => {
    const result = calculateEndHeadingAndRotation(
      line("a", { x: 10, y: 0 }),
      prev,
      undefined,
      undefined,
      12,
      10,
      false,
      { netRotation: Number.NaN, tangentRotation: 0 } as PathAnalysis,
    );
    expect(result.endHeading).toBe(12);
  });
});
