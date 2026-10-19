// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { nearestSnap, snapTargets } from "../utils/smartSnap";
import type { Line, Point, Shape } from "../types";

const point = (x: number, y: number) => ({ x, y }) as Point;
const lineEndingAt = (x: number, y: number) =>
  ({ endPoint: point(x, y) }) as Line;
const shape = (visible: boolean | undefined, ...corners: [number, number][]) =>
  ({
    visible,
    vertices: corners.map(([x, y]) => ({ x, y })),
  }) as Shape;

describe("snapTargets", () => {
  it("lists the start point, path ends, field corners, then visible obstacle corners", () => {
    const targets = snapTargets(
      point(1, 2),
      [lineEndingAt(10, 20), lineEndingAt(30, 40)],
      [shape(true, [5, 6]), shape(undefined, [7, 8])],
      144,
      100,
    );
    expect(targets.map((t) => [t.x, t.y])).toEqual([
      [1, 2],
      [10, 20],
      [30, 40],
      [0, 0],
      [144, 0],
      [0, 100],
      [144, 100],
      [5, 6],
      [7, 8],
    ]);
  });

  it("leaves out hidden obstacles and paths without an end point", () => {
    const targets = snapTargets(
      point(1, 2),
      [{} as Line, lineEndingAt(10, 20)],
      [shape(false, [5, 6])],
      10,
      10,
    );
    expect(targets.map((t) => [t.x, t.y])).toEqual([
      [1, 2],
      [10, 20],
      [0, 0],
      [10, 0],
      [0, 10],
      [10, 10],
    ]);
  });
});

describe("nearestSnap", () => {
  const targets = [point(10, 10), point(10.5, 30), point(40, 10.4)];

  it("snaps each axis to its own nearest target within an inch", () => {
    // x is nearest to 10.5 and y to 10.4, from different targets
    expect(nearestSnap(targets, 10.4, 10.3)).toEqual({ x: 10.5, y: 10.4 });
  });

  it("returns null on an axis with nothing close", () => {
    expect(nearestSnap(targets, 20, 20)).toEqual({ x: null, y: null });
    expect(nearestSnap(targets, 10.2, 25)).toEqual({ x: 10, y: null });
  });

  it("keeps the first of two equally close targets", () => {
    expect(nearestSnap([point(9.5, 0), point(10.5, 0)], 10, 50).x).toBe(9.5);
  });

  it("doesn't snap to exactly one inch away", () => {
    expect(nearestSnap([point(11, 11)], 10, 10)).toEqual({ x: null, y: null });
  });

  it("ignores the targets skip picks", () => {
    expect(nearestSnap(targets, 10.4, 10.3, (i) => i === 0).x).toBe(10.5);
    expect(nearestSnap([point(10, 10)], 10, 10, () => true)).toEqual({
      x: null,
      y: null,
    });
  });
});
