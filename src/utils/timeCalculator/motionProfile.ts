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
  const maxVelGlobal = settings.maxVelocity || 100;
  const maxAcc = settings.maxAcceleration || 30;
  const { turnsWithPath = true, stepSpeedScale } = options;
  // Ensure aVelocity is finite and non-zero to avoid Infinity
  const aVelocity = Math.max(settings.aVelocity, 0.001);

  const n = steps.length;
  if (n === 0) return { totalTime: 0, profile: [0], velocityProfile: [0] };

  const vAtPoints = new Float64Array(n + 1);
  vAtPoints[0] = Math.min(
    entryVelocity,
    maxVelGlobal,
    speedCaps.get(0) ?? Infinity,
  );

  // 1. Forward Pass
  for (let i = 0; i < n; i++) {
    const step = steps[i];
    let limit = maxVelGlobal * (stepSpeedScale?.[i] ?? 1);
    if (turnsWithPath) {
      const angVelLimit = aVelocity * step.radius;
      if (angVelLimit < limit) limit = angVelLimit;
    }

    const dist = step.deltaLength;
    const maxReachable = Math.sqrt(
      vAtPoints[i] * vAtPoints[i] + 2 * maxAcc * dist,
    );
    vAtPoints[i + 1] = Math.min(
      limit,
      maxReachable,
      speedCaps.get(i + 1) ?? Infinity,
    );
  }

  // 2. Backward Pass
  // The exit can only be lower than the forward pass reached, never higher:
  // the robot can't gain speed the distance doesn't allow.
  vAtPoints[n] = Math.min(vAtPoints[n], exitVelocity, maxVelGlobal);
  for (let i = n - 1; i >= 0; i--) {
    const maxReachable = speedToSlowWithin(
      steps[i].deltaLength,
      vAtPoints[i + 1],
      settings,
    );
    if (maxReachable < vAtPoints[i]) {
      vAtPoints[i] = maxReachable;
    }
  }

  // 3. Integrate Time and Build Profile
  const profile: number[] = [0];
  let totalTime = 0;

  for (let i = 0; i < n; i++) {
    const vStart = vAtPoints[i];
    const vEnd = vAtPoints[i + 1];
    const dist = steps[i].deltaLength;
    const avgV = (vStart + vEnd) / 2;

    let dtLinear = 0;
    if (avgV > 1e-6) {
      dtLinear = dist / avgV;
    } else {
      // Fallback for very low speeds (start from 0) using kinematics
      dtLinear = Math.sqrt((2 * dist) / maxAcc);
    }

    // Check rotation constraint
    // Using simple constant velocity assumption for travel continuity
    // This avoids over-penalizing smooth curves with acceleration start/stops
    const dtRotation = turnsWithPath
      ? (steps[i].rotation * (Math.PI / 180)) / aVelocity
      : 0;

    // Take the maximum time required (slower of the two)
    const dt = Math.max(dtLinear, dtRotation);

    // Guard against NaN integration
    if (Number.isFinite(dt)) {
      totalTime += dt;
    } else {
      totalTime += 0;
    }
    profile.push(totalTime);
  }

  // Convert Float64Array to number[] for easier consumption
  const velocityProfile = Array.from(vAtPoints);

  return { totalTime, profile, velocityProfile };
}
