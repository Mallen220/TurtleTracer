// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Settings } from "../../types";
import type { PathStep } from "./types";

export function calculateMotionProfileDetailed(
  steps: PathStep[],
  settings: Settings,
  entryVelocity: number = 0,
  exitVelocity: number = 0,
): { totalTime: number; profile: number[]; velocityProfile: number[] } {
  const maxVelGlobal = settings.maxVelocity || 100;
  const maxAcc = settings.maxAcceleration || 30;
  const maxDec = settings.maxDeceleration || maxAcc;
  const kFriction = settings.kFriction || 0;
  // Ensure aVelocity is finite and non-zero to avoid Infinity
  const aVelocity = Math.max(settings.aVelocity, 0.001);

  const n = steps.length;
  if (n === 0) return { totalTime: 0, profile: [0], velocityProfile: [0] };

  const vAtPoints = new Float64Array(n + 1);
  vAtPoints[0] = Math.min(entryVelocity, maxVelGlobal);

  // 1. Forward Pass
  for (let i = 0; i < n; i++) {
    const step = steps[i];
    let limit = maxVelGlobal;
    if (kFriction > 0) {
      const frictionLimit = Math.sqrt(kFriction * 386.22 * step.radius);
      if (frictionLimit < limit) limit = frictionLimit;
    }
    const angVelLimit = aVelocity * step.radius;
    if (angVelLimit < limit) limit = angVelLimit;

    const dist = step.deltaLength;
    const maxReachable = Math.sqrt(
      vAtPoints[i] * vAtPoints[i] + 2 * maxAcc * dist,
    );
    vAtPoints[i + 1] = Math.min(limit, maxReachable);
  }

  // 2. Backward Pass
  vAtPoints[n] = Math.min(exitVelocity, maxVelGlobal);
  for (let i = n - 1; i >= 0; i--) {
    const dist = steps[i].deltaLength;
    const maxReachable = Math.sqrt(
      vAtPoints[i + 1] * vAtPoints[i + 1] + 2 * maxDec * dist,
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
    const dtRotation = (steps[i].rotation * (Math.PI / 180)) / aVelocity;

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
