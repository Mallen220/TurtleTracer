// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// A holonomic robot is slower driving sideways than forwards. Pedro limits its
// speed by the angle between the direction it is travelling and the way it
// faces: 1 / (|cos θ| / forward + |sin θ| / strafe). The X and Y velocity
// settings give the forward and strafe speeds; the maximum velocity stays the
// robot's best speed, so these only set how much slower the other directions
// are.
import type { Settings } from "../../types";
import type { PathStep } from "./types";

const toRadians = (deg: number) => (deg * Math.PI) / 180;

/**
 * How much of its top speed the robot has when it travels `angle` degrees
 * away from the way it faces, or null when every direction is equally fast.
 */
export function speedAtAngle(
  settings: Settings,
): ((angle: number) => number) | null {
  const forward = settings.xVelocity;
  const strafe = settings.yVelocity;
  if (!(forward > 0) || !(strafe > 0) || Math.abs(forward - strafe) < 1e-6) {
    return null;
  }
  const best = Math.max(forward, strafe);
  return (angle) => {
    const radians = toRadians(angle);
    return (
      1 /
      (Math.abs(Math.cos(radians)) / forward +
        Math.abs(Math.sin(radians)) / strafe) /
      best
    );
  };
}

/**
 * The speed scale for each step of a path, from the direction it travels and
 * the heading the robot has there (`headings` has an entry for each step
 * boundary). Null if no step is slowed.
 */
export function stepSpeedScales(
  steps: PathStep[],
  headings: number[],
  settings: Settings,
): number[] | null {
  const scaleAt = speedAtAngle(settings);
  if (!scaleAt) return null;

  let slowed = false;
  const scales = steps.map((step, i) => {
    if (step.direction === undefined) return 1;
    const heading =
      ((headings[i] ?? 0) + (headings[i + 1] ?? headings[i] ?? 0)) / 2;
    const scale = scaleAt(step.direction - heading);
    if (scale < 0.999) slowed = true;
    return scale;
  });
  return slowed ? scales : null;
}
