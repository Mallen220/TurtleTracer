// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Settings } from "../../types";

/** How fast the robot can speed up its turning, in rad/s². */
function angularAcceleration(settings: Settings): number {
  const set = settings.maxAngularAcceleration;
  if (set && set > 0) return set;
  const leverArm = Math.max(settings.rWidth / 2, 1); // Avoid division by zero
  const maxAccel = settings.maxAcceleration || 30;
  return maxAccel / leverArm;
}

export function calculateRotationTime(
  angleDiffDegrees: number,
  settings: Settings,
): number {
  if (angleDiffDegrees <= 0.001) return 0;

  const diffRad = angleDiffDegrees * (Math.PI / 180);
  const maxVel = Math.max(settings.aVelocity, 0.001);
  const maxAngAccel = angularAcceleration(settings);

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
 * How long turning `angleDiffDegrees` takes from rest when the robot doesn't
 * slow down at the end, as when Pedro turns before it drives: it speeds up to
 * its top turn rate and is still turning when it sets off along the path.
 */
export function turnFromRestTime(
  angleDiffDegrees: number,
  settings: Settings,
): number {
  if (angleDiffDegrees <= 0.001) return 0;
  const diffRad = angleDiffDegrees * (Math.PI / 180);
  const maxVel = Math.max(settings.aVelocity, 0.001);
  const maxAngAccel = angularAcceleration(settings);
  const accDist = (maxVel * maxVel) / (2 * maxAngAccel);
  if (diffRad <= accDist) return Math.sqrt((2 * diffRad) / maxAngAccel);
  return maxVel / maxAngAccel + (diffRad - accDist) / maxVel;
}
