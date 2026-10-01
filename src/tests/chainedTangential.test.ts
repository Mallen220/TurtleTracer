// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import { simulateRecovery } from "../utils/timeCalculator/chainRecovery";
import { computePathStatistics } from "../utils/pathStatistics";
import { robotPoseDuring } from "../utils/animation";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type {
  Line,
  Point,
  SequenceItem,
  Settings,
  TimelineEvent,
} from "../types";

beforeAll(() => registerCoreUI());

const settings = { ...DEFAULT_SETTINGS } as Settings;

// Two chained tangential paths: a curve that ends heading east, then a path
// that sets off east (or, in the second, south) and ends up going north.
const start = {
  x: 9,
  y: 25,
  heading: "linear",
  startDeg: -22.1,
  endDeg: 100,
} as Point;
const first: Line = {
  id: "a",
  name: "DriveToShoot",
  endPoint: { x: 60, y: 25, heading: "tangential" } as Point,
  controlPoints: [
    { x: 38.1456449798176, y: 13.149679617695194 },
    { x: 31.403087080633107, y: 18.84376790312226 },
  ],
  color: "#8CD6B8",
};
const second = (controlPoint: { x: number; y: number }): Line => ({
  id: "b",
  name: "",
  endPoint: {
    x: 61.71824836265571,
    y: 116.0935132271735,
    heading: "tangential",
  } as Point,
  controlPoints: [controlPoint],
  color: "#8C7CAA",
  isChain: true,
});
const sequence: SequenceItem[] = [
  { kind: "path", lineId: "a" },
  { kind: "path", lineId: "b", isChain: true },
];

// The path leaves the corner heading east, then arcs north.
const arcing = [first, second({ x: 81.13522537562605, y: 25 })];
// The path leaves heading south and doubles back: a hairpin at its start.
const hairpin = [first, second({ x: 64.02979324515219, y: 7.663413381276499 })];

const timeline = (lines: Line[]) =>
  calculatePathTime(start, lines, settings, sequence)
    .timeline as TimelineEvent[];

describe.each([
  ["a path that arcs away from the corner", arcing],
  ["a path that starts with a hairpin", hairpin],
])("two chained tangential paths: %s", (_name, lines) => {
  it("gets round the corner in a few seconds, not tens of seconds", () => {
    const events = timeline(lines);
    const total = events.at(-1)!.endTime;
    expect(total).toBeGreaterThan(4);
    expect(total).toBeLessThan(8);
    const recovery = events.find((e) => e.type === "recovery")!;
    expect(recovery.duration).toBeLessThan(4);
    expect(recovery.settled).toBe(true);
  });

  it("stays on and near the field", () => {
    const events = timeline(lines);
    const total = events.at(-1)!.endTime;
    for (let t = 0; t <= total; t += 0.1) {
      const event = events.find((e) => t >= e.startTime && t <= e.endTime)!;
      const pose = robotPoseDuring(event, t, lines, start)!;
      expect(pose.x).toBeGreaterThan(-5);
      expect(pose.x).toBeLessThan(150);
      expect(pose.y).toBeGreaterThan(-5);
      expect(pose.y).toBeLessThan(150);
    }
  });

  it("moves at the speed it reports, so it can't be flying off", () => {
    const recovery = timeline(lines).find((e) => e.type === "recovery")!;
    const { time, x, y, speed } = recovery.trace!;
    for (let i = 2; i < time.length - 6; i += 3) {
      const dt = time[i + 1] - time[i - 1];
      const travelled = Math.hypot(x[i + 1] - x[i - 1], y[i + 1] - y[i - 1]);
      expect(travelled / dt).toBeLessThan(speed[i] * 1.3 + 3);
    }
  });

  it("turns while it moves rather than spinning on the spot", () => {
    const events = timeline(lines);
    const last = events.at(-1)!;
    expect(last.type).toBe("travel");
    // Over the last path, whenever the heading is changing the robot is moving.
    let previous: { x: number; y: number; heading: number } | null = null;
    for (let t = last.startTime; t < last.endTime - 0.3; t += 0.02) {
      const pose = robotPoseDuring(last, t, lines, start)!;
      if (previous && Math.abs(pose.heading - previous.heading) > 0.5) {
        expect(
          Math.hypot(pose.x - previous.x, pose.y - previous.y),
        ).toBeGreaterThan(0.02);
      }
      previous = pose;
    }
  });

  it("carries its heading on into the path it gets back onto", () => {
    const events = timeline(lines);
    const recovery = events.find((e) => e.type === "recovery")!;
    const headings = recovery.trace!.heading!;
    expect(headings).toHaveLength(recovery.trace!.time.length);
    const next = events.at(-1)!;
    expect(Math.abs(headings.at(-1)! - next.headingProfile![0])).toBeLessThan(
      1,
    );
    // Its heading changes smoothly, at the robot's turn rate at most.
    const turnRate = (settings.aVelocity * 180) / Math.PI;
    for (let i = 1; i < headings.length; i++) {
      const dt = recovery.trace!.time[i] - recovery.trace!.time[i - 1];
      expect(Math.abs(headings[i] - headings[i - 1])).toBeLessThanOrEqual(
        turnRate * dt + 1e-6,
      );
    }
  });

  it("is reported as a sharp corner with sensible numbers", () => {
    const { insights } = computePathStatistics(
      start,
      lines,
      sequence,
      settings,
    );
    expect(insights.some((i) => i.type === "error")).toBe(false);
  });
});

describe("finding the way along a path that folds back on itself", () => {
  // A hairpin: the first twenty steps cover about two inches, then the path
  // runs a hundred inches north.
  const hairpin = [
    ...Array.from({ length: 21 }, (_, i) => ({
      x: 60 + (i < 10 ? i : 20 - i) * 0.2,
      y: 25 - (i < 10 ? i : 20 - i) * 0.2,
    })),
    ...Array.from({ length: 80 }, (_, i) => ({
      x: 60,
      y: 25 + (i + 1) * 1.25,
    })),
  ];

  it("keeps track of where it is along the long leg after the hairpin", () => {
    // Off to the side of the leg and heading up it, quickly: the closest point
    // on the path has to keep up even though the first steps only cover a
    // couple of inches.
    const r = simulateRecovery({
      position: { x: 68, y: 25 },
      velocity: { x: 0, y: 40 },
      path: hairpin,
      settings,
    });
    expect(r.settled).toBe(true);
    expect(r.rejoinStep).toBeGreaterThan(30);
    // The robot ends where the path says it does.
    const rejoin = hairpin[r.rejoinStep];
    expect(r.y.at(-1)).toBeCloseTo(rejoin.y, 6);
    // Its speed and how far it moves agree.
    for (let i = 5; i < r.time.length - 10; i += 5) {
      const dt = r.time[i + 1] - r.time[i - 1];
      const moved = Math.hypot(
        r.x[i + 1] - r.x[i - 1],
        r.y[i + 1] - r.y[i - 1],
      );
      expect(moved / dt).toBeLessThan(settings.maxVelocity * 1.2);
    }
  });

  it("doesn't count the path's own length as overshoot", () => {
    const r = simulateRecovery({
      position: { x: 40, y: 20 },
      velocity: { x: 30, y: 0 },
      path: hairpin,
      settings,
    });
    expect(r.overshoot).toBeLessThan(40);
  });
});
