// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import { simulateRecovery } from "../utils/timeCalculator/chainRecovery";
import { robotPoseDuring } from "../utils/animation";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings } from "../types";
import { tangentialHeading } from "./helpers/sequences";

beforeAll(() => registerCoreUI());

const settings = { ...DEFAULT_SETTINGS } as Settings;

// A curve, then a short chained path the robot can't get onto before it ends,
// then an unchained path from where that one ends.
const start = {
  x: 9,
  y: 25,
  heading: "linear",
  startDeg: -8,
  endDeg: 90,
} as Point;
const tangential = tangentialHeading;
const lines: Line[] = [
  {
    id: "a",
    name: "DriveToShoot",
    endPoint: tangential(51.90959291126236, 45.11044047771929),
    controlPoints: [
      { x: 32.26700534385343, y: 21.73580025365693 },
      { x: 29.28255811800577, y: 25.62399105370161 },
      { x: 45.368704109030325, y: 15.798036256147604 },
    ],
    color: "#8CD6B8",
  },
  {
    id: "b",
    name: "",
    endPoint: tangential(60.02529857454733, 74.25455085398742),
    controlPoints: [{ x: 86.44076511616798, y: 43.723513548221405 }],
    color: "#8C7CAA",
    isChain: true,
  },
  {
    id: "c",
    name: "",
    endPoint: tangential(60.02529857454733, 113.7836137151663),
    controlPoints: [],
    color: "#7DA76A",
  },
];
const sequence: SequenceItem[] = [
  { kind: "path", lineId: "a" },
  { kind: "path", lineId: "b", isChain: true },
  { kind: "path", lineId: "c" },
];

describe("a robot that can't get onto a short chained path before it ends", () => {
  const { timeline, totalTime } = calculatePathTime(
    start,
    lines,
    settings,
    sequence,
  );

  it("never jumps from one place to another", () => {
    const limit = settings.maxVelocity * 0.02 * 1.3;
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
  });

  it("runs past the end of the path, then comes back to it and settles", () => {
    const recovery = timeline.find((e) => e.type === "recovery")!;
    const end = lines[1].endPoint;
    const { x, y, speed } = recovery.trace!;
    // It goes beyond the end point...
    const farthest = Math.max(
      ...x.map((px, i) => Math.hypot(px - end.x, y[i] - end.y)),
    );
    expect(farthest).toBeGreaterThan(4);
    // ...and finishes at it, nearly stopped.
    expect(Math.hypot(x.at(-1)! - end.x, y.at(-1)! - end.y)).toBeLessThan(2);
    expect(speed.at(-1)!).toBeLessThan(5);
    expect(recovery.settled).toBe(true);
  });

  it("doesn't circle the end point", () => {
    const recovery = timeline.find((e) => e.type === "recovery")!;
    const end = lines[1].endPoint;
    const { x, y } = recovery.trace!;
    // Once it is near the end point, it keeps getting nearer.
    const from = x.findIndex(
      (px, i) => Math.hypot(px - end.x, y[i] - end.y) < 6 && i > x.length / 2,
    );
    let worst = 0;
    for (let i = Math.max(0, from); i < x.length; i++) {
      worst = Math.max(worst, Math.hypot(x[i] - end.x, y[i] - end.y));
    }
    expect(worst).toBeLessThan(8);
  });

  it("carries on with the next path from where the robot actually is", () => {
    const last = timeline.at(-1)!;
    expect(last.type).toBe("travel");
    expect(last.startTime).toBeCloseTo(timeline.at(-2)!.endTime, 9);
    const pose = robotPoseDuring(last, last.startTime, lines, start)!;
    expect(Math.hypot(pose.x - 60.03, pose.y - 74.25)).toBeLessThan(2);
  });

  it("takes a believable amount of time", () => {
    expect(totalTime).toBeGreaterThan(6);
    expect(totalTime).toBeLessThan(13);
  });
});

describe("simulateRecovery at the end of a path", () => {
  const path = Array.from({ length: 101 }, (_, i) => ({ x: 60, y: i * 0.4 }));

  it("brakes to stop at the end when nothing is chained after it", () => {
    const r = simulateRecovery({
      position: { x: 54, y: 25 },
      velocity: { x: 0, y: 40 },
      path,
      settings,
      brakeAtEnd: true,
    });
    expect(r.settled).toBe(true);
    expect(Math.hypot(r.x.at(-1)! - 60, r.y.at(-1)! - 40)).toBeLessThan(3);
    expect(r.speed.at(-1)!).toBeLessThan(5);
    // It didn't carry on at speed past the end.
    expect(Math.max(...r.y)).toBeLessThan(40 + 25);
  });

  it("holds the end point after running past it", () => {
    const r = simulateRecovery({
      position: { x: 40, y: 38 },
      velocity: { x: 0, y: 40 },
      path,
      settings,
    });
    expect(r.settled).toBe(true);
    expect(Math.max(...r.y)).toBeGreaterThan(40);
    expect(Math.hypot(r.x.at(-1)! - 60, r.y.at(-1)! - 40)).toBeLessThan(2.5);
  });

  it("never jumps, even when the robot can't get back in time", () => {
    // Far too weak to turn round and get back to the path within the time.
    const weak = { ...settings, maxAcceleration: 0.5, maxDeceleration: 0.5 };
    const r = simulateRecovery({
      position: { x: -80, y: 20 },
      velocity: { x: -40, y: 0 },
      path,
      settings: weak,
    });
    expect(r.settled).toBe(false);
    const limit = weak.maxVelocity * 0.02 * 1.5 + 0.1;
    for (let i = 1; i < r.time.length; i++) {
      expect(Math.hypot(r.x[i] - r.x[i - 1], r.y[i] - r.y[i - 1])).toBeLessThan(
        limit,
      );
    }
    // And it finishes on the path.
    expect(Math.abs(r.x.at(-1)! - 60)).toBeLessThan(6);
  });
});
