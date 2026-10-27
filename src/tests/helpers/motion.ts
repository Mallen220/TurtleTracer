// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The motion defaults the corner and speed-limit scenarios were written
// against. The shipped defaults move over time; these scenarios depend on a
// robot that is slow to accelerate, so they pin it here.
export const SCENARIO_MOTION = {
  xVelocity: 30,
  yVelocity: 30,
  aVelocity: Math.PI / 2,
  maxVelocity: 40,
  maxAcceleration: 30,
  maxDeceleration: 30,
};

// Stopping distance v²/(2·30): what the handover assumed before it had a fit of
// its own to fall back on. For the scenarios whose corners depend on it.
export const SCENARIO_BRAKING = {
  brakingQuadratic: 1 / 60,
  brakingLinear: 0,
};
