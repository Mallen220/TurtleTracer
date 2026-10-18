// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Settings } from "../../types";
import type { PathStep } from "./types";
import { speedToSlowWithin } from "./braking";

/** Per-path details of how the robot drives that the settings can't say. */
export interface MotionOptions {
  /**
   * Whether the robot's heading turns with the path (tangential heading). If
   * not, a curved path doesn't make it rotate, so the turn rate doesn't slow
   * it down.
   */
  turnsWithPath?: boolean;
  /** Multiplies the top speed on each step, e.g. for driving sideways. */
  stepSpeedScale?: ArrayLike<number>;
}

/** What the three passes of the motion profile share. */
interface ProfileLimits {
  maxVelocity: number;
  maxAcceleration: number;
  /** Turn rate in radians per second, never zero. */
  aVelocity: number;
  turnsWithPath: boolean;
}

/**
 * Forward pass: the fastest the robot can be going at each step boundary,
 * given its top speed, the turn rate on curves, how fast it can speed up and
 * the caps. `v[0]` is already set.
 */
function forwardPass(
  steps: PathStep[],
  v: Float64Array,
  limits: ProfileLimits,
  speedCaps: ReadonlyMap<number, number>,
  stepSpeedScale: ArrayLike<number> | undefined,
) {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let limit = limits.maxVelocity * (stepSpeedScale?.[i] ?? 1);
    if (limits.turnsWithPath) {
      const angVelLimit = limits.aVelocity * step.radius;
      if (angVelLimit < limit) limit = angVelLimit;
    }

    const maxReachable = Math.sqrt(
      v[i] * v[i] + 2 * limits.maxAcceleration * step.deltaLength,
    );
    v[i + 1] = Math.min(limit, maxReachable, speedCaps.get(i + 1) ?? Infinity);
  }
}

/**
 * Backward pass: lowers the speeds so the robot can slow down in time for
 * the exit, and for any limit ahead.
 */
function backwardPass(
  steps: PathStep[],
  v: Float64Array,
  exitVelocity: number,
  limits: ProfileLimits,
  settings: Settings,
) {
  const n = steps.length;
  // The exit can only be lower than the forward pass reached, never higher:
  // the robot can't gain speed the distance doesn't allow.
  v[n] = Math.min(v[n], exitVelocity, limits.maxVelocity);
  for (let i = n - 1; i >= 0; i--) {
    const maxReachable = speedToSlowWithin(
      steps[i].deltaLength,
      v[i + 1],
      settings,
    );
    if (maxReachable < v[i]) {
      v[i] = maxReachable;
    }
  }
}

/** The time at each step boundary, from the speeds there. */
function integrateTime(
  steps: PathStep[],
  v: Float64Array,
  limits: ProfileLimits,
): { totalTime: number; profile: number[] } {
  const profile: number[] = [0];
  let totalTime = 0;

  for (let i = 0; i < steps.length; i++) {
    const dist = steps[i].deltaLength;
    const avgV = (v[i] + v[i + 1]) / 2;

    // At very low speeds (starting from 0) use kinematics instead.
    const dtLinear =
      avgV > 1e-6
        ? dist / avgV
        : Math.sqrt((2 * dist) / limits.maxAcceleration);

    // Using simple constant velocity assumption for travel continuity
    // This avoids over-penalizing smooth curves with acceleration start/stops
    const dtRotation = limits.turnsWithPath
      ? (steps[i].rotation * (Math.PI / 180)) / limits.aVelocity
      : 0;

    // Take the maximum time required (slower of the two), ignoring NaN.
    const dt = Math.max(dtLinear, dtRotation);
    if (Number.isFinite(dt)) totalTime += dt;
    profile.push(totalTime);
  }
  return { totalTime, profile };
}

/**
 * Times the robot along `steps`, and works out its speed at every step
 * boundary. Speed is limited by the robot's maximum, by turn rate on curves
 * when its heading follows the path, and by its acceleration and deceleration.
 *
 * `entryVelocity` and `exitVelocity` are upper limits for the ends; they are
 * lowered if the robot can't reach or shed that speed in the distance there
 * is. `speedCaps` maps a boundary index (0 is the start, `steps.length` the
 * end) to a speed limit there, for example a corner between chained paths.
 */
export function calculateMotionProfileDetailed(
  steps: PathStep[],
  settings: Settings,
  entryVelocity: number = 0,
  exitVelocity: number = 0,
  speedCaps: ReadonlyMap<number, number> = new Map(),
  options: MotionOptions = {},
): { totalTime: number; profile: number[]; velocityProfile: number[] } {
  const n = steps.length;
  if (n === 0) return { totalTime: 0, profile: [0], velocityProfile: [0] };

  const { turnsWithPath = true, stepSpeedScale } = options;
  const limits: ProfileLimits = {
    maxVelocity: settings.maxVelocity || 100,
    maxAcceleration: settings.maxAcceleration || 30,
    // Ensure aVelocity is finite and non-zero to avoid Infinity
    aVelocity: Math.max(settings.aVelocity, 0.001),
    turnsWithPath,
  };

  const vAtPoints = new Float64Array(n + 1);
  vAtPoints[0] = Math.min(
    entryVelocity,
    limits.maxVelocity,
    speedCaps.get(0) ?? Infinity,
  );
  forwardPass(steps, vAtPoints, limits, speedCaps, stepSpeedScale);
  backwardPass(steps, vAtPoints, exitVelocity, limits, settings);
  const { totalTime, profile } = integrateTime(steps, vAtPoints, limits);

  // Convert Float64Array to number[] for easier consumption
  return { totalTime, profile, velocityProfile: Array.from(vAtPoints) };
}
