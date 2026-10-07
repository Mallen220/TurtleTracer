// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Cases the fuzz tests turned up: tiny and degenerate paths, and headings that
// want to change faster than a robot can turn.
import { describe, it, expect, beforeAll } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import { robotPoseDuring } from "../utils/animation";
import { computePathStatistics } from "../utils/pathStatistics";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings } from "../types";
import { separately } from "./helpers/sequences";

beforeAll(() => registerCoreUI());

const base = { ...DEFAULT_SETTINGS } as Settings;
const path = (
  id: string,
  endPoint: Record<string, unknown>,
  controlPoints: { x: number; y: number }[] = [],
): Line => ({
  id,
  name: id,
  endPoint: endPoint as unknown as Point,
  controlPoints,
  color: "#000",
});
const steps = separately;

/** The largest heading change between frames, in degrees, over the run. */
function biggestTurn(
  start: Point,
  lines: Line[],
  sequence: SequenceItem[],
  settings: Settings,
) {
  const { timeline, totalTime } = calculatePathTime(
    start,
    lines,
    settings,
    sequence,
  );
  let previous: number | null = null;
  let biggest = 0;
  for (let t = 0; t <= totalTime; t += 0.02) {
    const event = timeline.find((e) => t >= e.startTime && t <= e.endTime);
    const pose = event && robotPoseDuring(event, t, lines, start);
    if (!pose) continue;
    if (previous !== null) {
      biggest = Math.max(
        biggest,
        Math.abs(((pose.heading - previous + 540) % 360) - 180),
      );
    }
    previous = pose.heading;
  }
  return biggest;
}

describe("a heading that wants to change faster than the robot can turn", () => {
  const turnRate = (base.aVelocity * 180) / Math.PI;
  const start = { x: 70, y: 10, heading: "tangential" } as Point;

  it("turns at the robot's rate when facing a point it passes close to", () => {
    // The direction to the point swings right round as the robot passes it.
    const lines = [
      path("a", {
        x: 70,
        y: 130,
        heading: "facingPoint",
        targetX: 71,
        targetY: 70,
      }),
    ];
    const biggest = biggestTurn(start, lines, steps("a"), base);
    expect(biggest).toBeLessThanOrEqual(turnRate * 0.02 * 3 + 2);
  });

  it("turns at the robot's rate through a loop that sweeps its heading", () => {
    const loop = [
      path(
        "a",
        {
          x: 0,
          y: 2,
          heading: "linear",
          startDeg: 0,
          endDeg: 0,
          reverse: true,
        },
        [{ x: 2, y: 0 }],
      ),
    ];
    const biggest = biggestTurn(
      { x: 0, y: 2, heading: "linear", startDeg: 0, endDeg: 0 } as Point,
      loop,
      steps("a"),
      { ...base, maxVelocity: 2, pedroVersion: "v2", aVelocity: 0.4 },
    );
    expect(biggest).toBeLessThanOrEqual(((0.4 * 180) / Math.PI) * 0.02 * 3 + 2);
  });

  it("still gets to the heading it was asked for by the end of a path it stops at", () => {
    const lines = [
      path("a", { x: 130, y: 10, heading: "linear", startDeg: 0, endDeg: 90 }),
    ];
    const [travel] = calculatePathTime(
      { x: 10, y: 10, heading: "constant", degrees: 0 } as Point,
      lines,
      base,
      steps("a"),
    ).timeline;
    expect(travel.headingProfile!.at(-1)).toBeCloseTo(90, 3);
  });
});

describe("tiny paths", () => {
  const start = { x: 2, y: 2, heading: "constant", degrees: 0 } as Point;
  const tiny = [
    path("a", { x: 2, y: 2, heading: "constant", degrees: 0 }, [
      { x: 2.92, y: 2 },
    ]),
    path("b", { x: 2, y: 2, heading: "linear", startDeg: 0, endDeg: 0 }, [
      { x: 2, y: 2.000001 },
    ]),
  ];
  const sequence: SequenceItem[] = [
    { kind: "path", lineId: "a" },
    { kind: "path", lineId: "b", isChain: true },
  ];

  it("never jumps when a chain is handed over on a path with no length", () => {
    const settings = { ...base, maxVelocity: 5, maxAcceleration: 5 };
    const { timeline, totalTime } = calculatePathTime(
      start,
      tiny,
      settings,
      sequence,
    );
    let previous: { x: number; y: number } | null = null;
    for (let t = 0; t <= totalTime; t += 0.02) {
      const event = timeline.find((e) => t >= e.startTime && t <= e.endTime)!;
      const pose = robotPoseDuring(event, t, tiny, start)!;
      if (previous) {
        expect(
          Math.hypot(pose.x - previous.x, pose.y - previous.y),
        ).toBeLessThan(settings.maxVelocity * 0.02 * 1.6 + 0.05);
      }
      previous = pose;
    }
  });

  it("times a path whose start and end are the same point", () => {
    const { totalTime } = calculatePathTime(
      start,
      [path("a", { x: 2, y: 2, heading: "constant", degrees: 0 })],
      base,
      steps("a"),
    );
    expect(Number.isFinite(totalTime)).toBe(true);
    expect(totalTime).toBeGreaterThanOrEqual(0);
  });
});

describe("turns the simulation adds between paths", () => {
  it("are listed in Path Statistics, so the rows add up to the whole run", () => {
    const start = { x: 10, y: 10, heading: "constant", degrees: 0 } as Point;
    const lines = [
      path("a", { x: 60, y: 10, heading: "constant", degrees: 0 }),
      path("b", { x: 60, y: 60, heading: "constant", degrees: 90 }),
    ];
    const stats = computePathStatistics(start, lines, steps("a", "b"), {
      ...base,
      stopToTurn: true,
    });
    expect(stats.segments.map((s) => s.name)).toEqual(["a", "Turn", "b"]);
    const turn = stats.segments[1];
    expect(turn.degrees).toBeCloseTo(90, 3);
    expect(turn.length).toBe(0);
    expect(stats.segments.reduce((sum, s) => sum + s.time, 0)).toBeCloseTo(
      stats.totalTime,
      6,
    );
  });

  it("aren't listed twice, or confused with waits and rotations the user added", () => {
    const start = { x: 10, y: 10, heading: "constant", degrees: 0 } as Point;
    const lines = [
      path("a", { x: 60, y: 10, heading: "constant", degrees: 0 }),
      path("b", { x: 60, y: 60, heading: "constant", degrees: 90 }),
    ];
    const sequence: SequenceItem[] = [
      { kind: "path", lineId: "a" },
      { kind: "wait", id: "w", name: "Hold", durationMs: 500 },
      { kind: "path", lineId: "b" },
    ];
    const stats = computePathStatistics(start, lines, sequence, {
      ...base,
      stopToTurn: true,
    });
    expect(stats.segments.map((s) => s.name)).toEqual([
      "a",
      "Hold",
      "Turn",
      "b",
    ]);
    expect(stats.segments.reduce((sum, s) => sum + s.time, 0)).toBeCloseTo(
      stats.totalTime,
      6,
    );
  });
});
