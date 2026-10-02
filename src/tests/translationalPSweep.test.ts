// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import { computePathStatistics } from "../utils/pathStatistics";
import { robotPoseDuring } from "../utils/animation";
import {
  MAX_TRANSLATIONAL_P,
  MIN_TRANSLATIONAL_P,
  simulateRecovery,
} from "../utils/timeCalculator/chainRecovery";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings } from "../types";

beforeAll(() => registerCoreUI());

// A real auto: nine chained paths, going out and back at several heights, with
// the heading facing a point on some of them.
const start = {
  x: 60,
  y: 8,
  heading: "linear",
  startDeg: 113.45,
  endDeg: 134.36,
} as Point;
const to = (
  id: string,
  x: number,
  y: number,
  heading: Record<string, unknown> = { heading: "tangential" },
): Line => ({
  id,
  name: id,
  endPoint: { x, y, ...heading } as unknown as Point,
  controlPoints: [],
  color: "#000",
});
const facing = (targetX: number, targetY: number) => ({
  heading: "facingPoint",
  targetX,
  targetY,
});
const lines: Line[] = [
  to("a", 48, 36, facing(1, 144)),
  to("b", 12, 36),
  to("c", 72, 72, facing(1, 144)),
  to("d", 36, 60),
  to("e", 12, 60),
  to("f", 72, 72, facing(1, 144)),
  to("g", 36, 84),
  to("h", 12, 84),
  to("i", 72, 72, facing(7.01, 138.45)),
];
const sequence: SequenceItem[] = lines.map((l, i) => ({
  kind: "path",
  lineId: l.id!,
  ...(i > 0 ? { isChain: true } : {}),
}));

const withP = (translationalP: number) =>
  ({ ...DEFAULT_SETTINGS, translationalP }) as Settings;
const run = (p: number) => calculatePathTime(start, lines, withP(p), sequence);

describe("a nine-path chained auto, at different translational P values", () => {
  const gains = [0.01, 0.05, 0.1, 0.3, 1, 3, 10, 100, 1e4, 1e6];

  it("gives finite, ordered results at every value, however extreme", () => {
    for (const p of gains) {
      const { timeline, totalTime } = run(p);
      expect(Number.isFinite(totalTime)).toBe(true);
      expect(totalTime).toBeGreaterThan(5);
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].startTime).toBeCloseTo(timeline[i - 1].endTime, 6);
      }
    }
  });

  it("never lets the robot jump or break its top speed, at any value", () => {
    const limit = DEFAULT_SETTINGS.maxVelocity * 0.02 * 1.6 + 0.3;
    for (const p of gains) {
      const { timeline, totalTime } = run(p);
      let previous: { x: number; y: number } | null = null;
      for (let t = 0; t <= totalTime; t += 0.02) {
        const event = timeline.find((e) => t >= e.startTime && t <= e.endTime)!;
        const pose = robotPoseDuring(event, t, lines, start)!;
        if (previous) {
          expect(
            Math.hypot(pose.x - previous.x, pose.y - previous.y),
          ).toBeLessThan(limit);
        }
        previous = pose;
      }
      for (const e of timeline) {
        for (const v of e.trace?.speed ?? []) {
          expect(v).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxVelocity * 1.01);
        }
      }
    }
  });

  it("gets back onto every path at any sensible or high value", () => {
    for (const p of [0.1, 0.3, 1, 3, 10, 100, 1e4, 1e6]) {
      for (const e of run(p).timeline) {
        if (e.type === "recovery") expect(e.settled).toBe(true);
      }
    }
  });

  it("treats values above 1 exactly the same as 1", () => {
    const at = run(MAX_TRANSLATIONAL_P).totalTime;
    for (const p of [1.5, 3, 10, 100, 1e4, 1e6]) {
      expect(run(p).totalTime).toBe(at);
    }
  });

  it("treats values below the minimum exactly the same as the minimum", () => {
    const at = run(MIN_TRANSLATIONAL_P).totalTime;
    for (const p of [0, 0.005, -3]) expect(run(p).totalTime).toBe(at);
  });

  it("is slowest with almost no correction, and settles down by Pedro's default", () => {
    const weakest = run(MIN_TRANSLATIONAL_P).totalTime;
    const normal = run(0.1).totalTime;
    const strong = run(1).totalTime;
    expect(weakest).toBeGreaterThan(normal * 1.3);
    expect(normal).toBeGreaterThan(strong);
    // Past a point, a stronger correction makes little difference.
    expect(Math.abs(run(10).totalTime - strong)).toBe(0);
  });

  it("reports no errors at sensible and high values, only at hopelessly low ones", () => {
    const errors = (p: number) =>
      computePathStatistics(start, lines, sequence, withP(p)).insights.filter(
        (i) => i.type === "error",
      );
    for (const p of [0.1, 1, 100, 1e6]) expect(errors(p)).toHaveLength(0);
    expect(errors(MIN_TRANSLATIONAL_P).length).toBeGreaterThan(0);
  });

  it("treats an absurd value as the strongest one, so it costs no more to compute", () => {
    const traceSizes = (p: number) =>
      run(p).timeline.flatMap((e) => (e.trace ? [e.trace.time.length] : []));
    expect(traceSizes(1e6)).toEqual(traceSizes(MAX_TRANSLATIONAL_P));
    // Samples come every 20 ms, for at most 8 s.
    for (const size of traceSizes(1e6)) expect(size).toBeLessThanOrEqual(401);
  });
});

describe("simulateRecovery with absurdly high gains", () => {
  const path = Array.from({ length: 101 }, (_, i) => ({ x: 60, y: i * 1.3 }));
  const at = (translationalP: number) =>
    simulateRecovery({
      position: { x: 34, y: 0 },
      velocity: { x: 40, y: 0 },
      path,
      settings: withP(translationalP),
    });

  it("behaves the same as at the largest gain it uses", () => {
    const cap = at(MAX_TRANSLATIONAL_P);
    for (const p of [50, 1e3, 1e9, Number.MAX_VALUE]) {
      const r = at(p);
      expect(r.duration).toBe(cap.duration);
      expect(r.overshoot).toBe(cap.overshoot);
      expect(r.settled).toBe(true);
    }
  });

  it("copes with a gain that isn't a usable number", () => {
    const cap = at(MAX_TRANSLATIONAL_P);
    const normal = at(0.1);
    // Infinity is as high as it gets; NaN means nothing was set.
    expect(at(Number.POSITIVE_INFINITY).duration).toBe(cap.duration);
    const nan = at(Number.NaN);
    expect(nan.duration).toBe(normal.duration);
    expect(nan.x.every(Number.isFinite)).toBe(true);
    expect(nan.y.every(Number.isFinite)).toBe(true);
  });
});
