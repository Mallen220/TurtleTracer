// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  calculateSwerveDriveAngles,
  calculateSwerveStates,
} from "../../../utils/drivetrain/swerve";

describe("calculateSwerveStates", () => {
  const trackWidth = 10;
  const wheelBase = 10;

  it("should return 0 speed and angle when not moving", () => {
    const states = calculateSwerveStates(0, 0, 0, trackWidth, wheelBase);
    states.forEach((state) => {
      expect(state.velocity).toBeCloseTo(0);
      expect(state.angle).toBeCloseTo(0);
    });
  });

  it("should calculate correct states when moving forward", () => {
    // vx = 0, vy = 1, omega = 0
    const states = calculateSwerveStates(0, 1, 0, trackWidth, wheelBase);
    states.forEach((state) => {
      expect(state.velocity).toBeCloseTo(1);
      expect(state.angle).toBeCloseTo(90); // Forward is +y, so atan2(1, 0) = 90 deg
    });
  });

  it("should calculate correct states when strafing right", () => {
    // vx = 1, vy = 0, omega = 0
    const states = calculateSwerveStates(1, 0, 0, trackWidth, wheelBase);
    states.forEach((state) => {
      expect(state.velocity).toBeCloseTo(1);
      expect(state.angle).toBeCloseTo(0); // Right is +x, so atan2(0, 1) = 0 deg
    });
  });

  it("should calculate correct states when strafing left", () => {
    // vx = -1, vy = 0, omega = 0
    const states = calculateSwerveStates(-1, 0, 0, trackWidth, wheelBase);
    states.forEach((state) => {
      expect(state.velocity).toBeCloseTo(1);
      expect(state.angle).toBeCloseTo(180); // Left is -x, so atan2(0, -1) = 180 deg
    });
  });

  it("should calculate correct states when turning in place", () => {
    // vx = 0, vy = 0, omega = 1
    const states = calculateSwerveStates(0, 0, 1, trackWidth, wheelBase);
    // Based on standard implementation:
    // FL: rx = -5, ry = 5. vx = -5, vy = -5 -> angle = -135 (or 225)
    // FR: rx = 5, ry = 5. vx = -5, vy = 5 -> angle = 135
    // BL: rx = -5, ry = -5. vx = 5, vy = -5 -> angle = -45
    // BR: rx = 5, ry = -5. vx = 5, vy = 5 -> angle = 45

    const expectedVel = Math.hypot(5, 5);
    states.forEach((state) => {
      expect(state.velocity).toBeCloseTo(expectedVel);
    });

    // Angle of velocity vector for each module when rotating CCW
    expect(states[0].angle).toBeCloseTo(-135); // FL
    expect(states[1].angle).toBeCloseTo(135); // FR
    expect(states[2].angle).toBeCloseTo(-45); // BL
    expect(states[3].angle).toBeCloseTo(45); // BR
  });
});

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
