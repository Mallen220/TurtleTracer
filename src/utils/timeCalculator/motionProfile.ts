import type {
  Settings,
  SequenceItem,
  Line,
  BasePoint,
  Point,
} from "../../types";
import {
  getLineStartHeading,
  getAngularDifference,
  getLineEndHeading,
} from "../math";
import type { PathStep } from "./types";

/**
 * Accounts for angular acceleration limits derived from robot dimensions.
 */
export function calculateRotationTime(
  angleDiffDegrees: number,
  settings: Settings,
): number {
  if (angleDiffDegrees <= 0.001) return 0;

  const diffRad = angleDiffDegrees * (Math.PI / 180);
  const maxVel = Math.max(settings.aVelocity, 0.001);

  let maxAngAccel = settings.maxAngularAcceleration;

  if (!maxAngAccel || maxAngAccel <= 0) {
    const leverArm = Math.max(settings.rWidth / 2, 1); // Avoid division by zero
    const maxAccel = settings.maxAcceleration || 30;
    maxAngAccel = maxAccel / leverArm;
  }

  // Motion profile:
  // t_accel = v_max / a_max
  // dist_accel = 0.5 * a_max * t_accel^2 = 0.5 * v_max^2 / a_max
  const accDist = (maxVel * maxVel) / (2 * maxAngAccel);
  const decDist = accDist; // Symmetric

  if (diffRad >= accDist + decDist) {
    // Trapezoid Profile (reaches max speed)
    const accTime = maxVel / maxAngAccel;
    const decTime = accTime;
    const constDist = diffRad - accDist - decDist;
    const constTime = constDist / maxVel;
    return accTime + constTime + decTime;
  } else {
    // Triangle Profile (does not reach max speed)
    // dist = 0.5 * a * t_accel^2 + 0.5 * a * t_decel^2
    // t_total = 2 * sqrt(dist / a)
    // v_peak = sqrt(dist * a)
    return 2 * Math.sqrt(diffRad / maxAngAccel);
  }
}

/**
 * Calculates time for a motion profile over a path with varying constraints.
 * Returns both total time and the cumulative time profile.

 */
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

export function calculateSegmentVelocities(
  idx: number,
  seq: SequenceItem[],
  lineById: Map<string, Line>,
  globalChainMeta: Map<string, any>,
  currentHeading: number,
  prevPoint: BasePoint,
  rootLine: Line | undefined,
  chainMeta: any,
  line: Line,
  maxVelGlobal: number,
  isChained: boolean,
  isChainedToNext: boolean,
): { entryVelocity: number; exitVelocity: number } {
  let entryVelocity = 0;
  let exitVelocity = 0;

  if (isChained) {
    if (idx > 0 && seq[idx - 1].kind === "path") {
      const prevLineId = (seq[idx - 1] as any).lineId;
      const prevLine = lineById.get(prevLineId);
      if (prevLine) {
        let thisStartHeading = getLineStartHeading(
          line,
          prevPoint as Point,
          rootLine,
          chainMeta?.chainTotalLength,
          chainMeta?.distanceBefore,
        );
        let diff = Math.abs(
          getAngularDifference(currentHeading, thisStartHeading),
        );
        let speedFactor = Math.max(0, Math.cos((diff * Math.PI) / 180));
        entryVelocity = maxVelGlobal * speedFactor;
      }
    } else {
      entryVelocity = maxVelGlobal;
    }
  }

  if (isChainedToNext) {
    const nextItem = seq[idx + 1];
    let nextLine = lineById.get((nextItem as any).lineId);
    if (nextLine) {
      let thisEndHeading = getLineEndHeading(line, prevPoint as Point);
      const nextChainMeta = globalChainMeta.get(nextLine.id!);
      let nextStartHeading = getLineStartHeading(
        nextLine,
        line.endPoint as Point,
        nextChainMeta?.rootLine,
        nextChainMeta?.chainTotalLength,
        nextChainMeta?.distanceBefore,
      );
      let diff = Math.abs(
        getAngularDifference(thisEndHeading, nextStartHeading),
      );
      let speedFactor = Math.max(0, Math.cos((diff * Math.PI) / 180));
      exitVelocity = maxVelGlobal * speedFactor;
    }
  }

  return { entryVelocity, exitVelocity };
}
