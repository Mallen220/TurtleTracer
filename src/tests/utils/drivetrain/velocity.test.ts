// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { calculateDrivetrainSpeeds } from "../../../utils/drivetrain/velocity";
import * as animation from "../../../utils/animation";

vi.mock("../../../utils/animation", () => ({
  calculateRobotState: vi.fn(),
}));

describe("calculateDrivetrainSpeeds", () => {
  const defaultSettings = {
    robotImage: "none",
    robotDriveType: "mecanum",
    rWidth: 18,
    rLength: 18,
  };

  it("should return null if showRobot is false", () => {
    expect(
      calculateDrivetrainSpeeds(0, {}, [], {}, defaultSettings, false),
    ).toBeNull();
  });

  it("should return null if robotImage is not 'none'", () => {
    expect(
      calculateDrivetrainSpeeds(
        0,
        {},
        [],
        {},
        { ...defaultSettings, robotImage: "bot.png" },
        true,
      ),
    ).toBeNull();
  });

  it("should return zeros if timeline is missing", () => {
    expect(
      calculateDrivetrainSpeeds(0, null, [], {}, defaultSettings, true),
    ).toEqual({
      frontLeft: 0,
      backLeft: 0,
      frontRight: 0,
      backRight: 0,
    });
    expect(
      calculateDrivetrainSpeeds(
        0,
        { timeline: [] },
        [],
        {},
        defaultSettings,
        true,
      ),
    ).toEqual({
      frontLeft: 0,
      backLeft: 0,
      frontRight: 0,
      backRight: 0,
    });
  });

  it("should calculate correct speeds for mecanum", () => {
    const timePrediction = { timeline: [{ endTime: 10 }] };
    // state1
    vi.mocked(animation.calculateRobotState).mockReturnValueOnce({
      x: 0,
      y: 0,
      heading: 0,
    });
    // state2 (dt is 0.05, so after 0.05s it moved 1 inch in X, which is forward velocity in this func. vx = 1/0.05 = 20 inches/sec)
    vi.mocked(animation.calculateRobotState).mockReturnValueOnce({
      x: 1,
      y: 0,
      heading: 0,
    });

    const speeds = calculateDrivetrainSpeeds(
      0,
      timePrediction,
      [],
      {},
      defaultSettings,
      true,
    );
    // vx = 20, vy = 0. maxV = 60. normalizedForward = 20/60 = 0.333.
    // Mecanum straight forward
    expect(speeds).toBeTruthy();
    expect(speeds?.frontLeft).toBeCloseTo(0.3333);
    expect(speeds?.backLeft).toBeCloseTo(0.3333);
    expect(speeds?.frontRight).toBeCloseTo(0.3333);
    expect(speeds?.backRight).toBeCloseTo(0.3333);
  });

  it("should calculate correct angles for swerve", () => {
    const timePrediction = { timeline: [{ endTime: 10 }] };
    vi.mocked(animation.calculateRobotState).mockReset();
    vi.mocked(animation.calculateRobotState).mockReturnValueOnce({
      x: 0,
      y: 0,
      heading: 0,
    });
    // Moving only in X (forward for this function coordinate system)
    vi.mocked(animation.calculateRobotState).mockReturnValueOnce({
      x: 1,
      y: 0,
      heading: 0,
    });

    const speeds = calculateDrivetrainSpeeds(
      0,
      timePrediction,
      [],
      {},
      { ...defaultSettings, robotDriveType: "swerve" },
      true,
    );
    // Straight forward should be 90 degrees
    expect(speeds).toBeTruthy();
    expect(speeds?.frontLeft).toBeCloseTo(90);
    expect(speeds?.backLeft).toBeCloseTo(90);
    expect(speeds?.frontRight).toBeCloseTo(90);
    expect(speeds?.backRight).toBeCloseTo(90);
  });

  it("should handle heading wrapping correctly", () => {
    const timePrediction = { timeline: [{ endTime: 10 }] };
    vi.mocked(animation.calculateRobotState).mockReset();
    vi.mocked(animation.calculateRobotState).mockReturnValueOnce({
      x: 0,
      y: 0,
      heading: 359,
    });
    // Moving only in X (forward for this function coordinate system)
    vi.mocked(animation.calculateRobotState).mockReturnValueOnce({
      x: 0,
      y: 0,
      heading: 1,
    });

    const speeds = calculateDrivetrainSpeeds(
      0,
      timePrediction,
      [],
      {},
      { ...defaultSettings, robotDriveType: "mecanum" },
      true,
    );
    // dHeading should be 2 degrees. dt = 0.05. omega = 2 * PI / 180 / 0.05 = 0.698 rad/s
    // normalizedRotate = 0.698 / 3 = 0.2327
    // This is rotation only
    expect(speeds).toBeTruthy();
    expect(speeds?.frontLeft).toBeGreaterThan(0);
    expect(speeds?.backLeft).toBeLessThan(0);
  });
});
