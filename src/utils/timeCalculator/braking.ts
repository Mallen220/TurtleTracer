// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// How far the robot travels while braking. By default it slows at a constant
// rate (max deceleration). Pedro Pathing instead fits braking distance as a
// quadratic and a linear term in speed, which the robot's settings can give.
import type { Settings } from "../../types";

/** The braking coefficients, or null when braking is at a constant rate. */
function coefficients(settings: Settings) {
  const quadratic = Math.max(0, settings.brakingQuadratic ?? 0);
  const linear = Math.max(0, settings.brakingLinear ?? 0);
  return quadratic > 0 || linear > 0 ? { quadratic, linear } : null;
}

const decelerationOf = (settings: Settings) =>
  settings.maxDeceleration || settings.maxAcceleration || 30;

/** Distance (inches) to stop from `speed` (in/s) when braking. */
export function brakingDistance(speed: number, settings: Settings): number {
  const fit = coefficients(settings);
  if (!fit) return (speed * speed) / (2 * decelerationOf(settings));
  return fit.quadratic * speed * speed + fit.linear * speed;
}

/**
 * The fastest the robot can be going and still stop to `exitSpeed` within
 * `distance`: the speed it can be going `distance` before it has to be at
 * `exitSpeed`.
 */
export function speedToSlowWithin(
  distance: number,
  exitSpeed: number,
  settings: Settings,
): number {
  const fit = coefficients(settings);
  if (!fit) {
    return Math.sqrt(
      exitSpeed * exitSpeed + 2 * decelerationOf(settings) * distance,
    );
  }
  const total = brakingDistance(exitSpeed, settings) + distance;
  const { quadratic, linear } = fit;
  if (quadratic <= 0) return total / linear;
  return (
    (-linear + Math.sqrt(linear * linear + 4 * quadratic * total)) /
    (2 * quadratic)
  );
}
