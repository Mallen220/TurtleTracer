// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { rotateVector } from "../../utils/math";

export interface WheelSpeeds {
  frontLeft: number;
  backLeft: number;
  frontRight: number;
  backRight: number;
}

export function calculateFieldCentricMecanum(
  forward: number,
  strafe: number,
  rotate: number,
  botHeading: number,
): WheelSpeeds {
  // Rotate the movement direction counter to the bot's rotation
  const { x: rotStrafe, y: rotForward } = rotateVector(
    strafe,
    forward,
    -botHeading,
  );

  // Counteract imperfect strafing on the rotated vector
  const adjustedRotStrafe = rotStrafe * 1.1;

  // Normalize speeds
  const denominator = Math.max(
    Math.abs(rotForward) + Math.abs(adjustedRotStrafe) + Math.abs(rotate),
    1,
  );

  return {
    frontLeft: (rotForward + adjustedRotStrafe + rotate) / denominator,
    backLeft: (rotForward - adjustedRotStrafe - rotate) / denominator,
    frontRight: (rotForward - adjustedRotStrafe + rotate) / denominator,
    backRight: (rotForward + adjustedRotStrafe - rotate) / denominator,
  };
}
