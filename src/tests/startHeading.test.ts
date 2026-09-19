// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The robot's heading before its first path, and that playback never snaps
// from one heading to another.
import { describe, it, expect, beforeAll } from "vitest";
import * as d3 from "d3";
import { calculatePathTime } from "../utils/timeCalculator";
import { calculateRobotState } from "../utils/animation";
import { actionRegistry } from "../lib/actionRegistry";
import { WaitAction } from "../lib/actions/WaitAction";
import { RotateAction } from "../lib/actions/RotateAction";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line, Point, SequenceItem } from "../types";

beforeAll(() => {
  actionRegistry.register(WaitAction);
  actionRegistry.register(RotateAction);
});

const identity = d3.scaleLinear();
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** Field headings (degrees) sampled across the whole playback. */
function playback(start: Point, lines: Line[], sequence: SequenceItem[]) {
  const { timeline } = calculatePathTime(
    start,
    lines,
    DEFAULT_SETTINGS,
    sequence,
  );
  const samples = 2000;
  return Array.from(
    { length: samples + 1 },
    (_, i) =>
      -calculateRobotState(
        (i / samples) * 100,
        timeline,
        lines,
        start,
        identity,
        identity,
      ).heading,
  );
}

/** The largest change in heading between neighbouring samples. */
function biggestJump(headings: number[]) {
  let biggest = 0;
  for (let i = 1; i < headings.length; i++) {
    biggest = Math.max(biggest, Math.abs(wrap(headings[i] - headings[i - 1])));
  }
  return biggest;
}

// Well under one sample's worth of the fastest turn the settings allow.
const SMOOTH = 5;

const origin: Point = { x: 72, y: 72, heading: "constant", degrees: 0 };
const path = (lineId: string): SequenceItem => ({ kind: "path", lineId });
const wait = (id = "w"): SequenceItem => ({
  kind: "wait",
  id,
  name: "",
  durationMs: 1000,
});
const turn = (degrees: number): SequenceItem => ({
  kind: "rotate",
  id: "r",
  name: "",
  degrees,
});
const line = (endPoint: Line["endPoint"], extra: Partial<Line> = {}): Line => ({
  id: "a",
  endPoint,
  controlPoints: [],
  color: "#fff",
  ...extra,
});

describe("heading before the first path", () => {
  const cases: [string, Line, number][] = [
    ["constant", line({ x: 100, y: 72, heading: "constant", degrees: 90 }), 90],
    ["tangential", line({ x: 72, y: 100, heading: "tangential" }), 90],
    [
      "reversed tangential",
      line({ x: 72, y: 100, heading: "tangential", reverse: true }),
      -90,
    ],
    [
      "linear",
      line({ x: 100, y: 72, heading: "linear", startDeg: 135, endDeg: 45 }),
      135,
    ],
    [
      "facing a point",
      line({ x: 100, y: 72, heading: "facingPoint", targetX: 72, targetY: 0 }),
      -90,
    ],
    [
      "piecewise",
      line({
        x: 100,
        y: 72,
        heading: "piecewise",
        segments: [
          { tStart: 0, tEnd: 0.5, heading: "constant", degrees: 60 },
          { tStart: 0.5, tEnd: 1, heading: "tangential" },
        ],
      }),
      60,
    ],
  ];

  for (const [name, first, expected] of cases) {
    it(`waits facing where a ${name} path starts`, () => {
      const headings = playback(origin, [first], [wait(), path("a")]);
      expect(wrap(headings[0] - expected)).toBeCloseTo(0);
      expect(biggestJump(headings)).toBeLessThan(SMOOTH);
    });
  }

  it("uses a chain-wide heading on the first path", () => {
    const first = line(
      { x: 100, y: 72, heading: "tangential" },
      { globalHeading: "constant", globalDegrees: 120 },
    );
    const headings = playback(origin, [first], [wait(), path("a")]);
    expect(headings[0]).toBeCloseTo(120);
    expect(biggestJump(headings)).toBeLessThan(SMOOTH);
  });

  it("looks for the first path inside a macro", () => {
    const first = line({ x: 100, y: 72, heading: "constant", degrees: -45 });
    const macro: SequenceItem = {
      kind: "macro",
      id: "m",
      name: "m",
      filePath: "/m.turt",
      sequence: [wait("inner"), path("a")],
    };
    const headings = playback(origin, [first], [wait(), macro]);
    expect(headings[0]).toBeCloseTo(-45);
    expect(biggestJump(headings)).toBeLessThan(SMOOTH);
  });

  it("follows the first path driven, not the first one listed", () => {
    const east = line({ x: 100, y: 72, heading: "constant", degrees: 0 });
    const north = line(
      { x: 100, y: 100, heading: "constant", degrees: 90 },
      { id: "b" },
    );
    const headings = playback(
      origin,
      [east, north],
      [wait(), path("b"), path("a")],
    );
    expect(headings[0]).toBeCloseTo(90);
    expect(biggestJump(headings)).toBeLessThan(SMOOTH);
  });

  it("turns from the first path's heading when a rotate comes first", () => {
    const first = line({ x: 100, y: 72, heading: "constant", degrees: 90 });
    const headings = playback(origin, [first], [turn(0), path("a")]);
    expect(headings[0]).toBeCloseTo(90);
    // It does turn to 0 before driving off at 90 again.
    expect(Math.min(...headings.map(Math.abs))).toBeLessThan(1);
    expect(biggestJump(headings)).toBeLessThan(SMOOTH);
  });

  it("drives a path that comes first without a turn beforehand", () => {
    const first = line({ x: 100, y: 72, heading: "constant", degrees: 90 });
    const { timeline } = calculatePathTime(origin, [first], DEFAULT_SETTINGS, [
      path("a"),
    ]);
    expect(timeline.map((e) => e.type)).toEqual(["travel"]);
  });
});

describe("heading with no path at all", () => {
  const starts: [string, Point, number][] = [
    ["constant", { x: 72, y: 72, heading: "constant", degrees: 30 }, 30],
    [
      "reversed constant",
      { x: 72, y: 72, heading: "constant", degrees: 30, reverse: true },
      -150,
    ],
    [
      "linear",
      { x: 72, y: 72, heading: "linear", startDeg: -60, endDeg: 10 },
      -60,
    ],
    [
      "facing a point",
      { x: 72, y: 72, heading: "facingPoint", targetX: 72, targetY: 144 },
      90,
    ],
  ];

  for (const [name, start, expected] of starts) {
    it(`shows a ${name} start heading with an empty project`, () => {
      const [heading] = playback(start, [], []);
      expect(wrap(heading - expected)).toBeCloseTo(0);
    });

    it(`waits at a ${name} start heading`, () => {
      const headings = playback(start, [], [wait()]);
      expect(wrap(headings[0] - expected)).toBeCloseTo(0);
      expect(biggestJump(headings)).toBeLessThan(SMOOTH);
    });
  }

  it("turns from the start heading to a rotate's angle", () => {
    const start: Point = { x: 72, y: 72, heading: "constant", degrees: 30 };
    const headings = playback(start, [], [turn(120)]);
    expect(headings[0]).toBeCloseTo(30);
    expect(headings.at(-1)).toBeCloseTo(120);
    expect(biggestJump(headings)).toBeLessThan(SMOOTH);
  });
});
