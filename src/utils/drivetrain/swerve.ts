// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { WheelSpeeds } from "./mecanum";

export function calculateSwerveDriveAngles(
  forward: number,
  strafe: number,
  rotate: number,
  botHeading: number,
  rWidth: number,
  rLength: number,
): WheelSpeeds {
  // Rotate the movement direction counter to the bot's rotation
  const rotStrafe =
    strafe * Math.cos(-botHeading) - forward * Math.sin(-botHeading);
  const rotForward =
    strafe * Math.sin(-botHeading) + forward * Math.cos(-botHeading);

  // Wheel coordinates relative to center
  // X is right (+), Y is forward (+)
  const rxFL = -rWidth / 2;
  const ryFL = rLength / 2;

  const rxFR = rWidth / 2;
  const ryFR = rLength / 2;

  const rxBL = -rWidth / 2;
  const ryBL = -rLength / 2;

  const rxBR = rWidth / 2;
  const ryBR = -rLength / 2;

  // Wheel velocity = V + (omega x r)
  // Vx = V_strafe - omega * r_y
  // Vy = V_forward + omega * r_x
  const vxFL = rotStrafe + rotate * ryFL;
  const vyFL = rotForward - rotate * rxFL;

  const vxFR = rotStrafe - rotate * ryFR;
  const vyFR = rotForward + rotate * rxFR;

  const vxBL = rotStrafe - rotate * ryBL;
  const vyBL = rotForward + rotate * rxBL;

  const vxBR = rotStrafe + rotate * ryBR;
  const vyBR = rotForward - rotate * rxBR;

  // Special case for not moving or turning
  if (Math.hypot(rotForward, rotStrafe) < 0.05 && Math.abs(rotate) <= 0.05) {
    return { frontLeft: 0, backLeft: 0, frontRight: 0, backRight: 0 };
  }

  const radToDeg = 180 / Math.PI;

  return {
    frontLeft: Math.atan2(vyFL, vxFL) * radToDeg,
    backLeft: Math.atan2(vyBL, vxBL) * radToDeg,
    frontRight: Math.atan2(vyFR, vxFR) * radToDeg,
    backRight: Math.atan2(vyBR, vxBR) * radToDeg,
  };
}
