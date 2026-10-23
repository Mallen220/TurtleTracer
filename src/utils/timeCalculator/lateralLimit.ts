// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// How much sideways acceleration a robot can have before it can't follow a bend.
import type { Settings } from "../../types";

export const GRAVITY = 386.22; // in/s^2

/**
 * The sideways acceleration (in/s²) beyond which the robot can't stay on a
 * bend: where its wheels slip, given a coefficient of friction. A robot can
 * always do what it is set to accelerate at, so a grip lower than that (or
 * no friction set) leaves its acceleration as the limit.
 */
export function lateralLimit(settings: Settings): {
  limit: number;
  byFriction: boolean;
} {
  const grip = (settings.kFriction || 0) * GRAVITY;
  const acceleration = settings.maxAcceleration || 30;
  return grip > acceleration
    ? { limit: grip, byFriction: true }
    : { limit: acceleration, byFriction: false };
}
