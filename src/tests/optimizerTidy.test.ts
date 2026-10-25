// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PathOptimizer } from "../utils/pathOptimizer";
import { calculatePathTime } from "../utils/timeCalculator";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { SCENARIO_MOTION } from "./helpers/motion";
import { registerCoreUI } from "../lib/coreRegistrations";
import { normalizeLines } from "../lib/projectStore";
import { getCurvePoint } from "../utils/math";
import blueton from "./fixtures/Blueton.turt.json";
import type { Line, Point, SequenceItem, Settings, Shape } from "../types";

beforeAll(() => registerCoreUI());
afterEach(() => vi.restoreAllMocks());

// The optimizer is random; a seeded generator makes each run repeatable.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const optimize = async (
  start: Point,
  lines: Line[],
  sequence: SequenceItem[],
  settings: Settings,
  seed: number,
  shapes: Shape[] = [],
) => {
  vi.spyOn(Math, "random").mockImplementation(seeded(seed));
  const result = await new PathOptimizer(
    start,
    lines,
    settings,
    sequence,
    shapes,
  ).optimize(() => {});
  vi.restoreAllMocks();
  return result;
};

const line = (
  id: string,
  x: number,
  y: number,
  over: Partial<Line> = {},
): Line => ({
  id,
  name: id,
  endPoint: { x, y, heading: "tangential", reverse: false } as Point,
  controlPoints: [],
  color: "#000",
  ...over,
});
const pathItem = (l: Line): SequenceItem => ({
  kind: "path",
  lineId: l.id!,
  ...(l.isChain ? { isChain: true } : {}),
});

const quick: Settings = {
  ...DEFAULT_SETTINGS,
  ...SCENARIO_MOTION,
  optimizationIterations: 60,
  optimizationPopulationSize: 40,
} as Settings;
// The paths with something to find take a little longer.
const medium: Settings = {
  ...DEFAULT_SETTINGS,
  ...SCENARIO_MOTION,
  optimizationIterations: 150,
  optimizationPopulationSize: 60,
} as Settings;
const LONG = 60000;
const seeds = [1, 2, 3, 4, 5, 6];

describe("the optimizer leaves a path alone when it has no reason to change it", () => {
  const start = {
    x: 10,
    y: 20,
    heading: "tangential",
    reverse: false,
  } as Point;

  it.each(seeds)("keeps a straight path straight (seed %i)", async (seed) => {
    const lines = [line("a", 100, 20)];
    const { lines: best } = await optimize(
      start,
      lines,
      lines.map(pathItem),
      quick,
      seed,
    );
    // Bending it can't get it there any sooner; the search used to add a
    // control point anyway, because it cost nothing.
    expect(best[0].controlPoints).toHaveLength(0);
  });

  it.each(seeds)(
    "doesn't redraw a path just to drop a control point that does nothing (seed %i)",
    async (seed) => {
      const lines = [line("a", 100, 20, { controlPoints: [{ x: 55, y: 20 }] })];
      const result = await optimize(
        start,
        lines,
        lines.map(pathItem),
        quick,
        seed,
      );
      // The point sits on the line, so it changes nothing: not worth touching.
      expect(result.improved).toBe(false);
      expect(result.lines).toEqual(lines);
    },
  );
});

describe("the optimizer doesn't skip the point two chained paths join at", () => {
  const start = { x: 9, y: 25, heading: "tangential", reverse: false } as Point;
  const lines = [
    line("a", 60, 25),
    line("b", 27.3, 32.9, {
      isChain: true,
      controlPoints: [{ x: 58.1, y: 52 }],
    }),
  ];
  const sequence = lines.map(pathItem);

  it.each([1, 2, 3, 4])(
    "gets close to it (seed %i)",
    async (seed) => {
      const { lines: best } = await optimize(
        start,
        lines,
        sequence,
        medium,
        seed,
      );
      const timeline = calculatePathTime(
        start,
        best,
        medium,
        sequence,
      ).timeline;
      const missed = Math.max(
        0,
        ...timeline
          .filter((e) => e.type === "recovery")
          .map((e) => e.missedBy ?? 0),
      );
      // It used to settle on just under the three inches it is allowed.
      expect(missed).toBeLessThan(1.5);
    },
    LONG,
  );
});

// The project that showed it: its waypoints put the robot partly over the
// field edge while it turns, which no change to a control point can undo.
describe("a path that already clips the field edge where it can't move", () => {
  const start = blueton.startPoint as unknown as Point;
  const lines = normalizeLines(blueton.lines as unknown as Line[]);
  const sequence = blueton.sequence as unknown as SequenceItem[];
  const timeOf = (ls: Line[]) =>
    calculatePathTime(start, ls, medium, sequence).totalTime;
  const edgeSamples = (ls: Line[]) => {
    const optimizer = new PathOptimizer(start, lines, medium, sequence, []);
    return optimizer
      .getCollisions(null, ls)
      .filter((m) => m.type === "boundary")
      .reduce(
        (n, m) => n + 1 + Math.round(((m.endTime ?? m.time) - m.time) / 0.2),
        0,
      );
  };

  it("really does clip the edge", () => {
    expect(edgeSamples(lines)).toBeGreaterThan(0);
  });

  it.each([1, 2, 3])(
    "isn't redrawn: the result is no slower, and no more complicated (seed %i)",
    async (seed) => {
      const before = timeOf(lines);
      const { lines: best, bestTime } = await optimize(
        start,
        lines,
        sequence,
        medium,
        seed,
      );
      // It used to be 8 seconds slower, with control points all over the
      // field, because the clipping made every path that didn't look "better".
      expect(bestTime).toBeLessThanOrEqual(before + 1e-6);
      expect(timeOf(best)).toBeCloseTo(bestTime, 6);
      best.forEach((l, i) => {
        // At most a couple of bends on any path, or as many as it had.
        expect(l.controlPoints.length).toBeLessThanOrEqual(
          Math.max(2, lines[i].controlPoints.length),
        );
      });
      // It doesn't clip the edge any more than the original did.
      expect(edgeSamples(best)).toBeLessThanOrEqual(edgeSamples(lines));
    },
    LONG,
  );

  it.each([1, 2, 3])(
    "keeps each control point near where it was (seed %i)",
    async (seed) => {
      const { lines: best } = await optimize(
        start,
        lines,
        sequence,
        medium,
        seed,
      );
      // A path being refined doesn't leap across the field.
      best.forEach((l, i) => {
        const from = i === 0 ? start : lines[i - 1].endPoint;
        const reach = Math.max(
          Math.hypot(l.endPoint.x - from.x, l.endPoint.y - from.y),
          ...lines[i].controlPoints.map((c) =>
            Math.hypot(c.x - from.x, c.y - from.y),
          ),
        );
        l.controlPoints.forEach((c, j) => {
          const anchor = lines[i].controlPoints[
            Math.min(j, lines[i].controlPoints.length - 1)
          ] ?? {
            x: (from.x + l.endPoint.x) / 2,
            y: (from.y + l.endPoint.y) / 2,
          };
          expect(
            Math.hypot(c.x - anchor.x, c.y - anchor.y),
          ).toBeLessThanOrEqual(Math.max(20, 0.3 * reach) + 1e-6);
        });
      });
    },
    LONG,
  );
});

describe("an optimizer that can't beat the path gives it back", () => {
  const start = {
    x: 10,
    y: 20,
    heading: "tangential",
    reverse: false,
  } as Point;

  it("returns the path as it was, and says it found nothing", async () => {
    const lines = [line("a", 100, 20)];
    const result = await optimize(start, lines, lines.map(pathItem), quick, 1);
    expect(result.improved).toBe(false);
    expect(result.lines).toEqual(lines);
    expect(result.bestTime).toBeCloseTo(
      calculatePathTime(start, lines, quick, lines.map(pathItem)).totalTime,
      6,
    );
  });

  it(
    "says it found something when it did",
    async () => {
      const lines = [
        line("a", 60, 25),
        line("b", 27, 33, { isChain: true, controlPoints: [{ x: 58, y: 52 }] }),
      ];
      const result = await optimize(
        start,
        lines,
        lines.map(pathItem),
        medium,
        1,
      );
      expect(result.improved).toBe(true);
    },
    LONG,
  );
});

// What it costs to move a path, and what is worth it (the project's
// hairpin to the flower is worth a couple of seconds for five inches; moving
// the long path to the hive or the park path saved next to nothing).
describe("the optimizer only changes what pays for itself", () => {
  const start = blueton.startPoint as unknown as Point;
  const lines = normalizeLines(blueton.lines as unknown as Line[]);
  const sequence = blueton.sequence as unknown as SequenceItem[];

  /** How far (inches, on average along it) path `i` was moved. */
  const moved = (best: Line[], i: number) => {
    const from = i === 0 ? start : lines[i - 1].endPoint;
    const curve = (l: Line) => [from, ...l.controlPoints, l.endPoint];
    let sum = 0;
    for (let j = 1; j <= 10; j++) {
      const a = getCurvePoint(j / 10, curve(lines[i]));
      const b = getCurvePoint(j / 10, curve(best[i]));
      sum += Math.hypot(a.x - b.x, a.y - b.y);
    }
    return sum / 10;
  };
  const byName = (name: string) => lines.findIndex((l) => l.name === name);
  /** How much (radians) path `i` of `ls` turns along its length. */
  const turning = (ls: Line[], i: number) => {
    const from = i === 0 ? start : lines[i - 1].endPoint;
    const curve = [from, ...ls[i].controlPoints, ls[i].endPoint];
    let total = 0;
    let prev: number | null = null;
    for (let j = 1; j <= 40; j++) {
      const a = getCurvePoint((j - 1) / 40, curve);
      const b = getCurvePoint(j / 40, curve);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (prev !== null) {
        total += Math.abs(
          Math.atan2(Math.sin(angle - prev), Math.cos(angle - prev)),
        );
      }
      prev = angle;
    }
    return total;
  };

  it.each([1, 2, 3])(
    "fixes the bend that costs seconds and leaves the rest as it was (seed %i)",
    async (seed) => {
      const before = calculatePathTime(
        start,
        lines,
        medium,
        sequence,
      ).totalTime;
      const { lines: best, bestTime } = await optimize(
        start,
        lines,
        sequence,
        medium,
        seed,
      );
      // The hairpin to the flower: a few inches, and most of the gain.
      const flower = byName("RunToFlower");
      expect(moved(best, flower)).toBeGreaterThan(1);
      expect(moved(best, flower)).toBeLessThan(10);
      expect(before - bestTime).toBeGreaterThan(1.5);
      // The paths whose change saved next to nothing stay as drawn.
      for (const name of ["IntakeCorner", "Park"]) {
        expect(moved(best, byName(name)), name).toBeLessThan(1);
      }
    },
    LONG,
  );

  it.each([1, 2, 3])(
    "leaves the path alone when only a small gain is possible (seed %i)",
    async (seed) => {
      // Only the park path can change, and its best change saves about a tenth
      // of a second: not worth redrawing it for.
      const parkOnly = lines.map((l, i) =>
        i === byName("Park") ? l : { ...l, locked: true },
      );
      const result = await optimize(start, parkOnly, sequence, medium, seed);
      expect(result.improved).toBe(false);
      expect(result.lines).toEqual(parkOnly);
    },
    LONG,
  );

  it("says how much it could have saved when that isn't worth it", async () => {
    // A path that can only be sped up by a bend that isn't worth the drawing.
    const lines = [line("a", 100, 20, { controlPoints: [{ x: 55, y: 24 }] })];
    const start = {
      x: 10,
      y: 20,
      heading: "tangential",
      reverse: false,
    } as Point;
    const result = await optimize(start, lines, lines.map(pathItem), quick, 1);
    expect(result.improved).toBe(false);
    expect(result.gain).toBeGreaterThanOrEqual(0);
    expect(result.gain).toBeLessThan(0.5);
  });
});
