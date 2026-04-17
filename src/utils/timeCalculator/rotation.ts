// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Settings } from "../../types";

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
