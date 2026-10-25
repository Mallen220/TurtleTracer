// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Measuring the translational P from chained corners: a robot that swings
// at corners exactly as the simulation does with some gain is measured as
// having that gain.
import { describe, it, expect } from "vitest";
import { simulateRecovery } from "../utils/timeCalculator/chainRecovery";
import { brakingDistance } from "../utils/timeCalculator/braking";
import { MotionRecorder } from "../utils/calibration/recorder";
import { swingPast, type CornerEvent } from "../utils/calibration/corners";
import {
  estimateSettings,
  type CalibrationKey,
  type Estimate,
} from "../utils/calibration/estimates";
import type { RawSample } from "../utils/calibration/samples";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Settings } from "../types";

const DT = 0.02;

const settings = {
  ...DEFAULT_SETTINGS,
  maxVelocity: 50,
  maxAcceleration: 30,
  maxDeceleration: 30,
} as Settings;

/**
 * Telemetry for one chained corner: driving along +x at `speed`, handed over
 * (as Pedro does, once the robot could stop at the corner) to a path leaving
 * at `turn` degrees, then the simulation's recovery onto it with `gain`, then
 * driving on along it and stopping.
 */
function cornerTelemetry(
  speed: number,
  turn: number,
  gain: number,
  t0: number,
  origin: { x: number; y: number },
): RawSample[] {
  const robot = { ...settings, translationalP: gain };
  // Far enough to reach full speed first, as on a real field.
  const joint = { x: origin.x + 160, y: origin.y };
  const rad = (turn * Math.PI) / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  const path = Array.from({ length: 401 }, (_, i) => ({
    x: joint.x + dir.x * i * 0.75,
    y: joint.y + dir.y * i * 0.75,
  }));
  const onNewPath = (x: number, y: number) => {
    const u = Math.max(0, (x - joint.x) * dir.x + (y - joint.y) * dir.y);
    return { cx: joint.x + dir.x * u, cy: joint.y + dir.y * u };
  };

  const samples: RawSample[] = [];
  let t = t0;
  const push = (s: Omit<RawSample, "t" | "heading">) => {
    samples.push({ t, heading: 0, busy: true, ...s });
    t += DT;
  };

  // Rest, then up to speed along path 0.
  for (let i = 0; i < 20; i++) {
    push({
      x: origin.x,
      y: origin.y,
      cx: origin.x,
      cy: origin.y,
      tx: 1,
      ty: 0,
      pathIndex: 0,
    });
  }
  const handoverX = joint.x - brakingDistance(speed, robot);
  let x = origin.x;
  let v = 0;
  while (x + v * DT < handoverX) {
    v = Math.min(speed, v + robot.maxAcceleration * DT);
    x += v * DT;
    push({ x, y: origin.y, cx: x, cy: origin.y, tx: 1, ty: 0, pathIndex: 0 });
  }

  // The handover and the swing back onto the new path. The trace starts
  // where the robot already is.
  const run = simulateRecovery({
    position: { x, y: origin.y },
    velocity: { x: v, y: 0 },
    path,
    settings: robot,
  });
  const from = run.x[0] === x && run.y[0] === origin.y ? 1 : 0;
  for (let i = from; i < run.x.length; i++) {
    push({
      x: run.x[i],
      y: run.y[i],
      ...onNewPath(run.x[i], run.y[i]),
      tx: dir.x,
      ty: dir.y,
      pathIndex: 1,
    });
  }

  // On along it, then to a stop.
  let px = run.x.at(-1)!;
  let py = run.y.at(-1)!;
  let w = run.rejoinSpeed;
  for (let i = 0; i < 40 || w > 0; i++) {
    if (i >= 25) w = Math.max(0, w - robot.maxDeceleration! * DT);
    px += dir.x * w * DT;
    py += dir.y * w * DT;
    push({
      x: px,
      y: py,
      ...onNewPath(px, py),
      tx: dir.x,
      ty: dir.y,
      pathIndex: 1,
    });
  }
  for (let i = 0; i < 20; i++) push({ x: px, y: py, busy: false });
  return samples;
}

function measure(gain: number) {
  const recorder = new MotionRecorder("robot");
  const cases = [
    [50, 90],
    [40, 90],
    [45, 120],
    [50, 60],
  ];
  let t = 0;
  cases.forEach(([speed, turn], i) => {
    // Far apart, so each starts a new stretch of telemetry.
    for (const s of cornerTelemetry(speed, turn, gain, t, {
      x: 0,
      y: i * 200,
    })) {
      recorder.push(s);
      t = s.t;
    }
    t += 1;
  });
  recorder.finish();
  const estimates = Object.fromEntries(
    estimateSettings(recorder.events, settings, "robot").map((e) => [e.key, e]),
  ) as Record<CalibrationKey, Estimate>;
  return {
    events: recorder.events,
    corners: recorder.events.filter(
      (e): e is CornerEvent => e.kind === "corner",
    ),
    gain: estimates.translationalP,
    decel: estimates.maxDeceleration,
  };
}

describe("measuring the translational P", () => {
  it.each([0.06, 0.1, 0.15])("gives back a gain of %s", (gain) => {
    const { corners, gain: estimate } = measure(gain);
    expect(corners).toHaveLength(4);
    expect(estimate.ready).toBe(true);
    expect(Math.abs(estimate.measured! / gain - 1)).toBeLessThan(0.1);
  });

  it("suggests it when the setting is off", () => {
    const { gain } = measure(0.06);
    expect(gain.current).toBe(0.1);
    expect(gain.suggestion?.patch.translationalP).toBeCloseTo(0.06, 2);
    expect(gain.suggestion?.label).toMatch(/^Set Translational P to 0\.\d\d$/);
  });

  it("stops suggesting once the setting matches, even before rounding", () => {
    const { events } = measure(0.06);
    const after = estimateSettings(
      events,
      { ...settings, translationalP: 0.06 },
      "robot",
    ).find((e) => e.key === "translationalP")!;
    expect(after.suggestion).toBeNull();
    expect(after.difference).toBe(0);
  });

  it("still reads the stop after a chained corner as braking", () => {
    const { decel } = measure(0.06);
    expect(decel.count).toBeGreaterThanOrEqual(3);
    expect(Math.abs(decel.measured! / 30 - 1)).toBeLessThan(0.1);
  });

  it("says so when the robot holds its corners too tightly to measure", () => {
    const { gain } = measure(0.3);
    expect(gain.ready).toBe(false);
    expect(gain.hint).toMatch(/\d corners held too tightly to measure/);
  });

  it("records the corner as the robot drove it", () => {
    const [first] = measure(0.15).corners;
    expect(first.turn).toBeCloseTo(90, -1);
    expect(Math.hypot(first.velocity.x, first.velocity.y)).toBeCloseTo(50, -1);
    expect(first.swing).toBeGreaterThan(1);
  });
});

describe("swingPast", () => {
  const path = [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
  ];
  it("measures how far past the path a route goes from the side it starts on", () => {
    expect(
      swingPast(path, [
        { x: -5, y: 0 },
        { x: 3, y: 10 },
        { x: 0, y: 20 },
      ]),
    ).toBe(3);
  });
  it("is zero for a route that starts on the path", () => {
    expect(
      swingPast(path, [
        { x: 0.2, y: 0 },
        { x: -4, y: 5 },
      ]),
    ).toBe(0);
  });
});
