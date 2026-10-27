// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The measured settings mean what the simulation means: a robot that drives
// exactly like the simulation with some settings is measured as having them.
import { describe, it, expect, beforeAll } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import { MotionRecorder } from "../utils/calibration/recorder";
import {
  estimateSettings,
  type CalibrationKey,
  type Estimate,
} from "../utils/calibration/estimates";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { SCENARIO_MOTION } from "./helpers/motion";
import { registerCoreUI } from "../lib/coreRegistrations";
import type {
  Line,
  Point,
  SequenceItem,
  Settings,
  TimelineEvent,
} from "../types";

beforeAll(() => registerCoreUI());

const start: Point = { x: 10, y: 72, heading: "constant", degrees: 0 } as Point;

const line = (id: string, x: number): Line => ({
  id,
  name: id.toUpperCase(),
  endPoint: { x, y: 72, heading: "constant", degrees: 0 } as Point,
  controlPoints: [],
  color: "#000",
});

/** Back and forth across the field, facing the same way. */
const lines = Array.from({ length: 8 }, (_, i) =>
  line(`l${i}`, i % 2 ? 10 : 110),
);
// A pause after each path, long enough to read as a stop.
const sequence: SequenceItem[] = lines.flatMap((l, i) => [
  { kind: "path", lineId: l.id! },
  { kind: "wait", id: `w${i}`, name: "", durationMs: 400 },
]);

const robot: Settings = {
  ...DEFAULT_SETTINGS,
  ...SCENARIO_MOTION,
  maxVelocity: 50,
  xVelocity: 50,
  yVelocity: 50,
  maxAcceleration: 40,
  maxDeceleration: 55,
} as Settings;

/**
 * Where the robot is `t` seconds into a straight travel event, driving its
 * motion profile: the speed at each step boundary, with constant
 * acceleration between them. (The field animation moves at a step's average
 * speed instead, which is right for timing but has no smooth ramps.)
 */
function distanceAt(event: TimelineEvent, t: number) {
  const times = event.motionProfile!;
  const speeds = event.velocityProfile!;
  let distance = 0;
  for (let i = 0; i + 1 < times.length; i++) {
    const dt = times[i + 1] - times[i];
    const accel = dt > 0 ? (speeds[i + 1] - speeds[i]) / dt : 0;
    const into = Math.min(Math.max(t - times[i], 0), dt);
    distance += speeds[i] * into + (accel * into * into) / 2;
  }
  return distance;
}

/** The simulated robot's pose every 20 ms, as the robot would send it. */
function simulatedTelemetry(settings: Settings) {
  const { timeline, totalTime } = calculatePathTime(
    start,
    lines,
    settings,
    sequence,
  );
  const travels = timeline.filter((e) => e.type === "travel");
  const recorder = new MotionRecorder("robot");
  for (let t = 0; t <= totalTime; t += 0.02) {
    // The path being driven, or the last one: the robot finishes it (Pedro
    // can let go a little before the end) and waits there.
    let index = 0;
    travels.forEach((e, i) => {
      if (e.startTime <= t) index = i;
    });
    const event = travels[index];
    const from = index > 0 ? lines[index - 1].endPoint.x : start.x;
    const to = lines[index].endPoint.x;
    const along = distanceAt(event, t - event.startTime);
    recorder.push({
      t,
      x: from + Math.sign(to - from) * along,
      y: 72,
      heading: 0,
      busy: true,
    });
  }
  recorder.finish();
  return recorder.events;
}

const timeWith = (settings: Settings) =>
  calculatePathTime(start, lines, settings, sequence).totalTime;

describe("measuring the simulation itself", () => {
  const before = {
    ...DEFAULT_SETTINGS,
    ...SCENARIO_MOTION,
  } as Settings;
  let est: Record<CalibrationKey, Estimate>;
  beforeAll(() => {
    est = Object.fromEntries(
      estimateSettings(simulatedTelemetry(robot), before, "robot").map((e) => [
        e.key,
        e,
      ]),
    ) as Record<CalibrationKey, Estimate>;
  });

  // The simulation plans in 10 inch steps, so braking starts a little early
  // and the measured deceleration is a few percent under the setting.
  it.each([
    ["maxVelocity", 50, 0.02],
    ["maxAcceleration", 40, 0.04],
    ["maxDeceleration", 55, 0.06],
  ] as const)("gives back the %s it ran with", (key, value, share) => {
    expect(est[key].ready).toBe(true);
    expect(Math.abs(est[key].measured! / value - 1)).toBeLessThan(share);
  });

  it("suggests settings that make the simulated time match the robot's", () => {
    const patchOf = (keys: CalibrationKey[]) =>
      Object.assign({}, ...keys.map((k) => est[k].suggestion!.patch));
    const robotTime = timeWith(robot);
    expect(Math.abs(timeWith(before) / robotTime - 1)).toBeGreaterThan(0.1);

    const basics: CalibrationKey[] = [
      "maxVelocity",
      "maxAcceleration",
      "maxDeceleration",
    ];
    // With max deceleration, or with the braking curve fitted to the stops.
    for (const keys of [basics, [...basics, "braking"]] as CalibrationKey[][]) {
      const time = timeWith({ ...before, ...patchOf(keys) });
      expect(Math.abs(time / robotTime - 1), keys.join()).toBeLessThan(0.02);
    }
  });
});
