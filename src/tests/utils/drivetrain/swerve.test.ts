// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { calculateSwerveDriveAngles } from "../../../utils/drivetrain/swerve";

describe("calculateSwerveDriveAngles", () => {
  const rWidth = 10;
  const rLength = 10;

  it("should return 0 when not moving", () => {
    const angles = calculateSwerveDriveAngles(0, 0, 0, 0, rWidth, rLength);
    expect(angles).toEqual({
      frontLeft: 0,
      backLeft: 0,
      frontRight: 0,
      backRight: 0,
    });
  });

  it("should calculate correct angles when moving forward (0 heading)", () => {
    const angles = calculateSwerveDriveAngles(1, 0, 0, 0, rWidth, rLength);
    // Moving straight forward -> vy > 0, vx = 0 -> atan2(vy, vx) = atan2(1, 0) = 90 deg
    expect(angles.frontLeft).toBeCloseTo(90);
    expect(angles.backLeft).toBeCloseTo(90);
    expect(angles.frontRight).toBeCloseTo(90);
    expect(angles.backRight).toBeCloseTo(90);
  });

  it("should calculate correct angles when strafing right (0 heading)", () => {
    const angles = calculateSwerveDriveAngles(0, 1, 0, 0, rWidth, rLength);
    // Strafing right -> vx > 0, vy = 0 -> atan2(0, 1) = 0 deg
    expect(angles.frontLeft).toBeCloseTo(0);
    expect(angles.backLeft).toBeCloseTo(0);
    expect(angles.frontRight).toBeCloseTo(0);
    expect(angles.backRight).toBeCloseTo(0);
  });

  it("should calculate correct angles when turning in place (0 heading)", () => {
    // rotate = 1
    // rxFL = -5, ryFL = 5. vxFL = 5, vyFL = 5 -> atan2(5, 5) = 45 deg
    // rxFR = 5, ryFR = 5. vxFR = -5, vyFR = 5 -> atan2(5, -5) = 135 deg
    // rxBL = -5, ryBL = -5. vxBL = 5, vyBL = -5 -> atan2(-5, 5) = -45 deg
    // rxBR = 5, ryBR = -5. vxBR = -5, vyBR = -5 -> atan2(-5, -5) = -135 deg
    const angles = calculateSwerveDriveAngles(0, 0, 1, 0, rWidth, rLength);

    expect(angles.frontLeft).toBeCloseTo(45);
    expect(angles.backLeft).toBeCloseTo(-45);
    expect(angles.frontRight).toBeCloseTo(135);
    expect(angles.backRight).toBeCloseTo(-135);
  });

  it("should calculate field centric properly (heading pi/2, stick forward)", () => {
    // Heading pi/2, going forward stick should make bot go 'up' field (strafe right relative to bot)
    const angles = calculateSwerveDriveAngles(
      1,
      0,
      0,
      Math.PI / 2,
      rWidth,
      rLength,
    );
    // Bot needs to strafe right, should be 0 deg
    expect(angles.frontLeft).toBeCloseTo(0);
    expect(angles.backLeft).toBeCloseTo(0);
    expect(angles.frontRight).toBeCloseTo(0);
    expect(angles.backRight).toBeCloseTo(0);
  });
});
