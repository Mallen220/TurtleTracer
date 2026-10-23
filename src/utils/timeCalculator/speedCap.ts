// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// How fast a path is driven when its own or its chain's speed is set. This
// follows Pedro: a speed set on a path replaces the one set on its chain
// (even a higher one), and neither can take the robot past its Max Velocity.
import type { Line, Settings } from "../../types";

/** A speed worth using: a number above zero, else nothing. */
export function validSpeed(speed: unknown): number | undefined {
  return typeof speed === "number" && Number.isFinite(speed) && speed > 0
    ? speed
    : undefined;
}

/**
 * The speed set for a path, in in/s: its own, else its chain's, if either is
 * set. `rootLine` is the first path of the chain it is in.
 */
export function setSpeedOf(
  line: Line,
  rootLine: Line | undefined,
): number | undefined {
  return validSpeed(line.maxSpeed) ?? validSpeed(rootLine?.chainMaxSpeed);
}

/** The fastest a path is driven, in in/s: the speed set for it, held to the robot's Max Velocity. */
export function maxSpeedOf(
  line: Line,
  rootLine: Line | undefined,
  settings: Settings,
): number {
  return Math.min(
    settings.maxVelocity || 100,
    setSpeedOf(line, rootLine) ?? Infinity,
  );
}
