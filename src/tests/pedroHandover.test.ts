// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Pedro 3 at a chained corner, as a real robot showed it: it hands over when
// its own brake model (the coefficients in the robot's code) says it could
// stop at the corner, and when the next path wants it to face another way it
// turns first, carrying straight on past the corner, before it drives.
import { describe, it, expect, beforeAll } from "vitest";
import {
  brakingDistance,
  handoverDistance,
  pedroAxisStop,
} from "../utils/timeCalculator/braking";
import { simulateRecovery } from "../utils/timeCalculator/chainRecovery";
import { calculatePathTime } from "../utils/timeCalculator";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings } from "../types";

beforeAll(() => registerCoreUI());

const settings = {
  ...DEFAULT_SETTINGS,
  maxVelocity: 60,
  maxAcceleration: 80,
  maxDeceleration: 100,
  brakingQuadratic: 0.0035,
  brakingLinear: 0.036,
  aVelocity: (200 * Math.PI) / 180,
} as Settings;

// The team's tuned ForesightConfig: forward, then strafe.
const pedro = {
  pedroQuadraticBrakeForward: 0.00202,
  pedroQuadraticBrakeStrafe: 0.0016,
  pedroLinearBrakeForward: 0.0451,
  pedroLinearBrakeStrafe: 0.044,
};

describe("Pedro's brake model for handing over", () => {
  it("uses the robot's real braking when the code's coefficients aren't given", () => {
    expect(handoverDistance(50, 0, settings)).toBeCloseTo(
      brakingDistance(50, settings),
      9,
    );
    expect(pedroAxisStop(-50, "strafe", settings)).toBeCloseTo(
      -brakingDistance(50, settings),
      9,
    );
  });

  it("matches the handovers a real robot made", () => {
    const tuned = { ...settings, ...pedro };
    // Driving forwards (or backwards, 180°) at these speeds, it handed over
    // this far before the corner. Telemetry shows the handover at the first
    // sample after it, up to 20 ms of driving later.
    for (const [speed, angle, seen] of [
      [28.2, 0, 2.9],
      [41, 0, 4.5],
      [47.6, 0, 6.5],
      [62.2, 180, 9.1],
    ]) {
      const model = handoverDistance(speed, angle, tuned);
      expect(seen).toBeLessThanOrEqual(model + 0.3);
      expect(seen).toBeGreaterThanOrEqual(model - speed * 0.025);
    }
  });

  it("weighs the forward and strafe values by which way the robot faces", () => {
    const tuned = { ...settings, ...pedro };
    const strafing = handoverDistance(40, 90, tuned);
    expect(strafing).toBeCloseTo(0.0016 * 1600 + 0.044 * 40, 9);
    const diagonal = handoverDistance(40, 45, tuned);
    expect(diagonal).toBeLessThan(handoverDistance(40, 0, tuned));
    expect(diagonal).toBeLessThan(strafing);
  });

  it("uses one axis's values for the other when only one is given", () => {
    const forwardOnly = {
      ...settings,
      pedroQuadraticBrakeForward: 0.002,
      pedroLinearBrakeForward: 0.04,
    };
    expect(handoverDistance(40, 90, forwardOnly)).toBeCloseTo(
      handoverDistance(40, 0, forwardOnly),
      9,
    );
  });
});

describe("turning first after a handover", () => {
  // Driving +x at 60 in/s, 10 in before a corner onto a path going +y.
  const path = Array.from({ length: 101 }, (_, i) => ({ x: 100, y: i }));
  const input = {
    position: { x: 90, y: 0 },
    velocity: { x: 60, y: 0 },
    path,
    settings: { ...settings, ...pedro },
  };
  const facing = (start: number, wanted: number) => ({
    start,
    wanted: Array.from({ length: 101 }, () => wanted),
  });

  it("carries straight on past the corner, braking while it turns", () => {
    const run = simulateRecovery({ ...input, heading: facing(0, 90) });
    // Until it faces within 11.25° of the path, it doesn't go up the path...
    const turned = run.heading!.findIndex((h) => h > 90 - 11.25);
    expect(turned).toBeGreaterThan(0);
    for (let i = 0; i <= turned; i++) expect(run.y[i]).toBeLessThan(1);
    // ...but straight on, past it, slowing right down.
    expect(Math.max(...run.x)).toBeGreaterThan(105);
    const facingAlready = simulateRecovery({
      ...input,
      heading: facing(90, 90),
    });
    expect(Math.min(...run.speed)).toBeLessThan(
      Math.min(...facingAlready.speed) / 2,
    );
    expect(run.settled).toBe(true);
    expect(run.heading!.at(-1)).toBeCloseTo(90, 0);
  });

  it("comes to a stop when it turns slowly", () => {
    const slow = { ...input.settings, aVelocity: Math.PI / 2 };
    const run = simulateRecovery({
      ...input,
      settings: slow,
      heading: facing(0, 90),
    });
    expect(Math.min(...run.speed)).toBeLessThan(1);
    expect(run.settled).toBe(true);
  });

  it("swings round without stopping when it already faces the right way", () => {
    const run = simulateRecovery({ ...input, heading: facing(90, 90) });
    expect(Math.min(...run.speed)).toBeGreaterThan(15);
  });

  it("doesn't turn first for Pedro 2, which isn't known to", () => {
    const run = simulateRecovery({
      ...input,
      settings: { ...input.settings, pedroVersion: "v2" },
      heading: facing(0, 90),
    });
    expect(Math.min(...run.speed)).toBeGreaterThan(15);
    expect(run.heading!.at(-1)).toBeCloseTo(90, 0);
  });

  it("gives no heading when it wasn't given one", () => {
    expect(simulateRecovery(input).heading).toBeUndefined();
  });
});

describe("a chained corner the robot has to turn at", () => {
  const point = (x: number, y: number, degrees: number): Point =>
    ({ x, y, heading: "constant", degrees }) as Point;
  const start = point(10, 30, 0);
  const sequence: SequenceItem[] = [
    { kind: "path", lineId: "a" },
    { kind: "path", lineId: "b", isChain: true },
  ];
  const corner = (upHeading: number) => {
    const lines: Line[] = [
      {
        id: "a",
        endPoint: point(100, 30, 0),
        controlPoints: [],
        color: "#000",
      },
      {
        id: "b",
        endPoint: point(100, 120, upHeading),
        controlPoints: [],
        color: "#000",
      },
    ];
    const tuned = { ...settings, ...pedro };
    return calculatePathTime(start, lines, tuned, sequence);
  };
  const recoveryOf = (upHeading: number) =>
    corner(upHeading).timeline.find((e) => e.type === "recovery")!;

  it("hands over where Pedro's own brake model says, not the robot's braking", () => {
    const recovery = recoveryOf(0);
    // At 60 in/s: about 10 in early from the code's coefficients, not the
    // 15 in the robot's real braking would give.
    expect(recovery.startOffset).toBeGreaterThan(8);
    expect(recovery.startOffset).toBeLessThan(12);
  });

  it("slows right down to turn when the next path faces another way", () => {
    const turning = Math.min(...recoveryOf(90).trace!.speed);
    const straight = Math.min(...recoveryOf(0).trace!.speed);
    expect(turning).toBeLessThan(straight / 2);
    expect(corner(90).totalTime).toBeGreaterThan(corner(0).totalTime);
  });
});
