// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  MIN_TRANSLATIONAL_P,
  simulateRecovery,
} from "../utils/timeCalculator/chainRecovery";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Settings } from "../types";

const settings = { ...DEFAULT_SETTINGS } as Settings;

/** A straight path sampled into `steps` steps. */
const straight = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 100,
) =>
  Array.from({ length: steps + 1 }, (_, i) => ({
    x: from.x + ((to.x - from.x) * i) / steps,
    y: from.y + ((to.y - from.y) * i) / steps,
  }));

const junction = { x: 60, y: 0 };
const north = { x: 60, y: 130 };

/**
 * The robot is heading east at `speed`, `before` inches short of the junction
 * where the next path starts.
 */
const recover = (
  next: { x: number; y: number },
  speed = 40,
  over: Partial<Settings> = {},
  before = 26,
  steps = 100,
) =>
  simulateRecovery({
    position: { x: junction.x - before, y: 0 },
    velocity: { x: speed, y: 0 },
    path: straight(junction, next, steps),
    settings: { ...settings, ...over },
  });

describe("simulateRecovery", () => {
  it("swings wide of a path that turns 90 degrees, then gets back on it", () => {
    const r = recover(north);
    expect(r.settled).toBe(true);
    // The robot carries its momentum east past the path (x = 60).
    expect(Math.max(...r.x)).toBeGreaterThan(64);
    expect(r.overshoot).toBeGreaterThan(4);
    expect(r.duration).toBeGreaterThan(1.5);
    // It is moving along the new path, northwards, by the time it is back.
    expect(r.rejoinSpeed).toBeGreaterThan(20);
    expect(r.y.at(-1)).toBeGreaterThan(20);
  });

  it("brakes to a stop to reverse onto the path it came along", () => {
    const r = recover({ x: 10, y: 0 });
    expect(r.settled).toBe(true);
    // It stops, then sets off along the path it has been turned onto.
    expect(Math.min(...r.speed.slice(1))).toBeLessThan(2);
    // Braking at 30 in/s^2 from 40 in/s takes about 27 inches and 1.3 s.
    expect(r.duration).toBeGreaterThan(1);
    expect(r.duration).toBeLessThan(2);
  });

  it("swings wider the faster the robot arrives", () => {
    const slow = recover(north, 15, {}, 4);
    const fast = recover(north, 40, {}, 26);
    expect(fast.overshoot).toBeGreaterThan(slow.overshoot);
  });

  it("swings wider when the robot can't brake as hard", () => {
    const strong = recover(north, 40, { maxDeceleration: 60 });
    const weak = recover(north, 40, { maxDeceleration: 15 });
    expect(weak.overshoot).toBeGreaterThan(strong.overshoot);
  });

  it("carries on a path that barely turns without straying far", () => {
    const r = recover({ x: 160, y: 5 });
    expect(r.settled).toBe(true);
    expect(r.overshoot).toBeLessThan(2);
  });

  it("never goes faster than the robot's maximum speed", () => {
    const r = recover(north, 40, { maxVelocity: 40 });
    expect(Math.max(...r.speed)).toBeLessThanOrEqual(40 + 1e-6);
  });

  it("never accelerates harder than the robot can, braking included", () => {
    const r = recover(north);
    const limit = Math.max(
      settings.maxAcceleration!,
      settings.maxDeceleration!,
    );
    const velocity = (i: number) => ({
      x: (r.x[i + 1] - r.x[i]) / (r.time[i + 1] - r.time[i]),
      y: (r.y[i + 1] - r.y[i]) / (r.time[i + 1] - r.time[i]),
    });
    // Stay clear of the ends, where the trace is adjusted to meet the path.
    for (let i = 4; i < r.time.length - 8; i++) {
      const before = velocity(i - 1);
      const after = velocity(i);
      const dt = r.time[i + 1] - r.time[i];
      const acceleration =
        Math.hypot(after.x - before.x, after.y - before.y) / dt;
      // Friction adds to the motors' braking in a turn, up to this much.
      expect(acceleration).toBeLessThan(limit * 1.5);
      // Along its own direction of travel it can't slow faster than the limit.
      const slowing =
        (Math.hypot(before.x, before.y) - Math.hypot(after.x, after.y)) / dt;
      expect(slowing).toBeLessThan(settings.maxDeceleration! * 1.05);
    }
  });

  it("starts where the robot is handed over and ends on the new path", () => {
    const path = straight(junction, north);
    const r = recover(north);
    expect(r.x[0]).toBeCloseTo(34);
    expect(r.y[0]).toBeCloseTo(0);
    expect(r.x.at(-1)).toBeCloseTo(path[r.rejoinStep].x, 6);
    expect(r.y.at(-1)).toBeCloseTo(path[r.rejoinStep].y, 6);
    expect(r.startOffset).toBeCloseTo(26, 0);
  });

  it("samples time evenly and in order", () => {
    const r = recover(north);
    expect(r.time).toHaveLength(r.x.length);
    expect(r.time).toHaveLength(r.y.length);
    expect(r.time).toHaveLength(r.speed.length);
    for (let i = 1; i < r.time.length; i++) {
      expect(r.time[i]).toBeGreaterThan(r.time[i - 1]);
    }
    expect(r.duration).toBe(r.time.at(-1));
  });

  it("holds the end of a path too short to get onto, instead of running on", () => {
    const r = recover({ x: 60, y: 6 }, 40, {}, 26, 20);
    expect(r.rejoinStep).toBeLessThanOrEqual(19);
    // It ends at the end of the path, where it settles.
    expect(r.settled).toBe(true);
    expect(Math.hypot(r.x.at(-1)! - 60, r.y.at(-1)! - 6)).toBeLessThan(3);
  });

  it("swings less when the robot is slower overall", () => {
    const quick = recover(north, 40, { maxVelocity: 40 });
    const limited = recover(north, 20, { maxVelocity: 20 });
    expect(limited.overshoot).toBeLessThan(quick.overshoot);
  });

  describe("how well the robot's translational PID is tuned", () => {
    const withP = (translationalP: number) =>
      recover(north, 40, { translationalP });

    it("swings less wide, and gets back sooner, the stronger it is", () => {
      const gains = [0.06, 0.1, 0.2, 0.4];
      const runs = gains.map(withP);
      for (let i = 1; i < runs.length; i++) {
        expect(runs[i].overshoot).toBeLessThan(runs[i - 1].overshoot);
        expect(runs[i].duration).toBeLessThan(runs[i - 1].duration);
      }
    });

    it("keeps a very high value well behaved: no oscillation, no runaway", () => {
      for (const p of [1, 2.5, 10]) {
        const r = withP(p);
        expect(r.settled).toBe(true);
        expect(r.overshoot).toBeLessThan(1);
        expect(r.duration).toBeLessThan(2);
        // It crosses the path once, to the far side, and stays on that side
        // of it until it is back: no weaving.
        let crossings = 0;
        let side = 0;
        r.x.forEach((x) => {
          const off = x - 60;
          if (Math.abs(off) > 0.5) {
            const now = Math.sign(off);
            if (side !== 0 && now !== side) crossings++;
            side = now;
          }
        });
        expect(crossings).toBeLessThanOrEqual(1);
      }
    });

    it("is Pedro's default when nothing is set", () => {
      const unset = recover(north, 40, { translationalP: undefined });
      const explicit = withP(0.1);
      expect(unset.overshoot).toBeCloseTo(explicit.overshoot, 9);
      expect(unset.duration).toBeCloseTo(explicit.duration, 9);
    });

    it("can't get back onto the path if it is almost nothing", () => {
      expect(withP(MIN_TRANSLATIONAL_P).settled).toBe(false);
      expect(withP(0.1).settled).toBe(true);
    });

    it("treats no correction at all as the weakest it can be, not as nothing", () => {
      const none = withP(0);
      const weakest = withP(MIN_TRANSLATIONAL_P);
      expect(none.duration).toBeCloseTo(weakest.duration, 9);
      expect(none.overshoot).toBeCloseTo(weakest.overshoot, 9);
      expect(withP(-1).overshoot).toBeCloseTo(weakest.overshoot, 9);
      expect(Number.isFinite(none.duration)).toBe(true);
    });
  });

  describe("where it ends up", () => {
    it("settles on the path itself, not off to one side or further along", () => {
      const r = recover(north, 40, { translationalP: 0.1 });
      expect(Math.abs(r.x.at(-1)! - 60)).toBeLessThan(1);
      // It is where the path says it is.
      const path = straight(junction, north);
      expect(r.y.at(-1)).toBeCloseTo(path[r.rejoinStep].y, 6);
    });

    it("anticipates sideways drift by its sideways speed alone", () => {
      // Moving fast along the path, a robot with only a little sideways speed
      // isn't pushed back as though it had a lot.
      const moving = simulateRecovery({
        position: { x: 63, y: 20 },
        velocity: { x: 3, y: 40 },
        path: straight(junction, north),
        settings,
      });
      expect(moving.overshoot).toBeLessThan(3);
      expect(moving.settled).toBe(true);
    });
  });
});
