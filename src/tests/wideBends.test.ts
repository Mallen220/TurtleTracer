// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import { lateralLimit } from "../utils/timeCalculator/lateralLimit";
import { computePathStatistics } from "../utils/pathStatistics";
import { robotPoseDuring } from "../utils/animation";
import { getCurvePoint } from "../utils/math";
import { splitPathAtPercent } from "../utils/pathEditing";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings } from "../types";

beforeAll(() => registerCoreUI());

const settings = { ...DEFAULT_SETTINGS } as Settings;

// Out about 45 in and back to nearly where it began: a bend with a radius
// under an inch at the turn, taken at the robot's full speed.
const start = {
  x: 81,
  y: 11.4,
  heading: "constant",
  degrees: 0,
} as Point;
const hairpin: Line = {
  id: "h",
  name: "Hairpin",
  endPoint: { x: 93.7, y: 14.6, heading: "constant", degrees: 0 } as Point,
  controlPoints: [{ x: 105, y: 59.25 }],
  color: "#c05",
};
// A long, gentle arc.
const arc: Line = {
  id: "g",
  name: "Arc",
  endPoint: { x: 120, y: 100, heading: "constant", degrees: 0 } as Point,
  controlPoints: [{ x: 120, y: 20 }],
  color: "#05c",
};
const sequenceOf = (line: Line): SequenceItem[] => [
  { kind: "path", lineId: line.id! },
];

const run = (line: Line, over: Partial<Settings> = {}, options = {}) => {
  const lines = [line];
  const result = calculatePathTime(
    start,
    lines,
    { ...settings, ...over },
    sequenceOf(line),
    options,
  );
  const travel = result.timeline.find((e) => e.type === "travel")!;
  return { lines, result, travel };
};

describe("a bend too sharp to follow at speed", () => {
  it("sends the robot wide of the path, and back onto it", () => {
    const { travel } = run(hairpin);
    const wide = travel.excursion!;
    expect(wide).toBeDefined();
    expect(wide.maxOffset).toBeGreaterThan(5);
    expect(wide.settled).toBe(true);
    expect(wide.duration).toBeGreaterThan(0.5);
    expect(wide.toT).toBeGreaterThan(wide.fromT);
    // It leaves the line where it is, and ends up back on it.
    const curve = [start, ...hairpin.controlPoints, hairpin.endPoint];
    const { x, y } = wide.trace;
    const from = getCurvePoint(wide.fromT, curve);
    const to = getCurvePoint(wide.toT, curve);
    expect(Math.hypot(x[0] - from.x, y[0] - from.y)).toBeLessThan(0.5);
    expect(Math.hypot(x.at(-1)! - to.x, y.at(-1)! - to.y)).toBeLessThan(0.5);
  });

  it("takes longer than a robot that could follow the path", () => {
    const wide = run(hairpin).travel.duration;
    const exact = run(hairpin, {}, { chainCorrection: false });
    expect(exact.travel.excursion).toBeUndefined();
    expect(wide).toBeGreaterThan(exact.travel.duration + 0.5);
  });

  it("is left alone when the robot can follow the path", () => {
    expect(run(arc).travel.excursion).toBeUndefined();
    // Or when its tyres would hold on to the hairpin.
    expect(run(hairpin, { kFriction: 50 }).travel.excursion).toBeUndefined();
  });

  it("plays back along the route it takes, without jumping", () => {
    const { lines, travel } = run(hairpin);
    const wide = travel.excursion!;
    const curve = [start, ...hairpin.controlPoints, hairpin.endPoint];
    let previous = robotPoseDuring(travel, travel.startTime, lines, start)!;
    let farthest = 0;
    for (let t = 0.02; t <= travel.duration; t += 0.02) {
      const pose = robotPoseDuring(travel, travel.startTime + t, lines, start)!;
      expect(Math.hypot(pose.x - previous.x, pose.y - previous.y)).toBeLessThan(
        settings.maxVelocity * 0.02 * 1.6 + 0.3,
      );
      previous = pose;
      // How far from the path it is, by the nearest of many points along it.
      let nearest = Infinity;
      for (let k = 0; k <= 400; k++) {
        const on = getCurvePoint(k / 400, curve);
        nearest = Math.min(nearest, Math.hypot(pose.x - on.x, pose.y - on.y));
      }
      farthest = Math.max(farthest, nearest);
    }
    expect(farthest).toBeGreaterThan(wide.maxOffset * 0.8);
  });

  it("keeps the profiles of the event in order and within the robot's limits", () => {
    const { travel } = run(hairpin);
    const times = travel.motionProfile!;
    const speeds = travel.velocityProfile!;
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1] - 1e-9);
    }
    for (const v of speeds) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(settings.maxVelocity * 1.0001);
    }
    expect(speeds.at(-1)).toBeCloseTo(0);
    expect(travel.headingProfile).toHaveLength(times.length);
    expect(travel.headingProfile!.every(Number.isFinite)).toBe(true);
  });

  it("shows the sideways acceleration the robot has, not what the path asks for", () => {
    const lines = [hairpin];
    const stats = computePathStatistics(
      start,
      lines,
      sequenceOf(hairpin),
      settings,
    );
    const peak = Math.max(...stats.centripetalData.map((p) => p.value));
    expect(peak).toBeLessThan(lateralLimit(settings).limit);
    const sum = stats.segments.reduce((total, s) => total + s.time, 0);
    expect(sum).toBeCloseTo(stats.totalTime, 5);
  });

  it("says what happens in Path Statistics, and what the user can do about it", () => {
    const stats = computePathStatistics(
      start,
      [hairpin],
      sequenceOf(hairpin),
      settings,
    );
    const note = stats.insights.find((i) => i.message.includes("too tight"))!;
    expect(note.type).toBe("warning");
    expect(note.valueLabel).toMatch(/^Wide by: \d/);
    expect(note.endTime!).toBeGreaterThan(note.startTime);
    expect(note.message).toContain("Hairpin has a bend with a radius of 0.");
    expect(note.message).toContain("wheels slip beyond about");
    // Advice for what the app lets users change, never "slow down".
    expect(note.message).toContain("control points");
    expect(note.message).toContain("press K");
    expect(note.message).toContain("un-chained");
    expect(note.message).not.toMatch(/slow(ed)? the path down/i);
  });

  it("takes the user to the tightest part of the bend when they click the warning", () => {
    const { lines, travel } = run(hairpin);
    const stats = computePathStatistics(
      start,
      lines,
      sequenceOf(hairpin),
      settings,
    );
    const note = stats.insights.find((i) => i.message.includes("too tight"))!;
    const tight = travel.excursion!.tightest;
    expect(note.seekTime).toBeCloseTo(travel.startTime + tight.time);
    expect(note.seekTime!).toBeGreaterThanOrEqual(note.startTime - 1e-9);
    expect(note.seekTime!).toBeLessThanOrEqual(note.endTime! + 1e-9);
    // It is the tightest part, near the turn at the far end of the path.
    expect(tight.radius).toBeLessThan(1);
    expect(tight.y).toBeGreaterThan(30);
  });

  it("is fixed by splitting the path at the bend and not chaining the halves", () => {
    const { lines, result, travel } = run(hairpin);
    const tight = travel.excursion!.tightest;
    const percent = ((travel.startTime + tight.time) / result.totalTime) * 100;
    const split = splitPathAtPercent(
      percent,
      result,
      lines,
      sequenceOf(hairpin),
    )!;
    expect(
      split.sequence.some((item) => "isChain" in item && item.isChain),
    ).toBe(false);
    const after = calculatePathTime(
      start,
      split.lines,
      settings,
      split.sequence,
    );
    const travels = after.timeline.filter((e) => e.type === "travel");
    expect(travels).toHaveLength(2);
    expect(travels.some((e) => e.excursion)).toBe(false);
    expect(after.totalTime).toBeLessThan(result.totalTime);
  });
});

describe("lateralLimit", () => {
  it("is the tyres' grip when there is a friction coefficient", () => {
    const { limit, byFriction } = lateralLimit({
      ...settings,
      kFriction: 0.5,
    });
    expect(byFriction).toBe(true);
    expect(limit).toBeCloseTo(0.5 * 386.22);
  });

  it("is never less than what the robot can accelerate at", () => {
    const tiny = lateralLimit({ ...settings, kFriction: 1e-9 });
    expect(tiny).toEqual({
      limit: settings.maxAcceleration,
      byFriction: false,
    });
  });

  it("falls back to the robot's acceleration without one", () => {
    const { limit, byFriction } = lateralLimit({
      ...settings,
      kFriction: 0,
      maxAcceleration: 45,
    });
    expect(byFriction).toBe(false);
    expect(limit).toBe(45);
  });
});
