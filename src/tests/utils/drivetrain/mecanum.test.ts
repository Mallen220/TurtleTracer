// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { calculateFieldCentricMecanum } from "../../../utils/drivetrain/mecanum";

describe("calculateFieldCentricMecanum", () => {
  it("should calculate correct wheel speeds when going straight forward (0 heading)", () => {
    const speeds = calculateFieldCentricMecanum(1, 0, 0, 0);
    expect(speeds.frontLeft).toBeCloseTo(1);
    expect(speeds.backLeft).toBeCloseTo(1);
    expect(speeds.frontRight).toBeCloseTo(1);
    expect(speeds.backRight).toBeCloseTo(1);
  });

  it("should calculate correct wheel speeds when strafing right (0 heading)", () => {
    const speeds = calculateFieldCentricMecanum(0, 1, 0, 0);
    // Adjusted strafe is 1 * 1.1 = 1.1. Denominator is 1.1.
    // FL: 1.1/1.1=1, BL: -1.1/1.1=-1, FR: -1.1/1.1=-1, BR: 1.1/1.1=1
    expect(speeds.frontLeft).toBeCloseTo(1);
    expect(speeds.backLeft).toBeCloseTo(-1);
    expect(speeds.frontRight).toBeCloseTo(-1);
    expect(speeds.backRight).toBeCloseTo(1);
  });

  it("should calculate correct wheel speeds when rotating right (0 heading)", () => {
    const speeds = calculateFieldCentricMecanum(0, 0, 1, 0);
    expect(speeds.frontLeft).toBeCloseTo(1);
    expect(speeds.backLeft).toBeCloseTo(-1);
    expect(speeds.frontRight).toBeCloseTo(1);
    expect(speeds.backRight).toBeCloseTo(-1);
  });

  it("should calculate correct wheel speeds going forward but facing 90 degrees left (heading pi/2)", () => {
    // If bot heading is pi/2 (facing left), pushing forward stick means moving 'up' on the field.
    // Bot needs to strafe right relative to itself to go 'up'.
    const speeds = calculateFieldCentricMecanum(1, 0, 0, Math.PI / 2);
    // When heading is pi/2, rotStrafe = 0*cos(-pi/2) - 1*sin(-pi/2) = -1*(-1) = 1
    // rotForward = 0*sin(-pi/2) + 1*cos(-pi/2) = 0
    // Adjusted strafe = 1.1. FL: 1.1/1.1=1, BL: -1.1/1.1=-1, FR: -1.1/1.1=-1, BR: 1.1/1.1=1
    expect(speeds.frontLeft).toBeCloseTo(1);
    expect(speeds.backLeft).toBeCloseTo(-1);
    expect(speeds.frontRight).toBeCloseTo(-1);
    expect(speeds.backRight).toBeCloseTo(1);
  });
});
