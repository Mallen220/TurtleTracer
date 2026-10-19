// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { robotSettingsOf, tuningFromProfile, tuningOf } from "./robotProfile";
import type { RobotProfile, Settings } from "../types";

describe("robot profile tuning", () => {
  it("takes the tuning from the current settings", () => {
    expect(
      tuningOf({
        translationalP: 0.2,
        brakingQuadratic: 0.05,
        brakingLinear: 0.3,
        pathSettleTime: 0.1,
        maxVelocity: 50,
      }),
    ).toEqual({
      translationalP: 0.2,
      brakingQuadratic: 0.05,
      brakingLinear: 0.3,
      pathSettleTime: 0.1,
    });
  });

  it("uses what the profile has", () => {
    const profile = { translationalP: 0.5, pathSettleTime: 0 } as RobotProfile;
    expect(
      tuningFromProfile(profile, { translationalP: 0.1, pathSettleTime: 0.05 }),
    ).toMatchObject({ translationalP: 0.5, pathSettleTime: 0 });
  });

  it("leaves the current value alone for what an older profile doesn't have", () => {
    const old = { name: "Old" } as RobotProfile;
    expect(
      tuningFromProfile(old, { translationalP: 0.3, brakingLinear: 0.4 }),
    ).toEqual({
      translationalP: 0.3,
      brakingQuadratic: undefined,
      brakingLinear: 0.4,
      pathSettleTime: undefined,
    });
  });

  it("ignores values of the wrong type", () => {
    const bad = { translationalP: "fast" } as unknown as RobotProfile;
    expect(tuningFromProfile(bad, { translationalP: 0.1 }).translationalP).toBe(
      0.1,
    );
  });
});

describe("robotSettingsOf", () => {
  const settings = {
    rLength: 15,
    rWidth: 14,
    maxVelocity: 50,
    maxAcceleration: 30,
    maxDeceleration: 0,
    maxAngularAcceleration: 6,
    kFriction: 2,
    aVelocity: 3,
    xVelocity: 60,
    yVelocity: 45,
    translationalP: 0.2,
    robotImage: "/robot.png",
    robotDriveType: "mecanum",
    showRobotArrows: true,
    showFakeHeadingArrow: false,
    fakeHeadingArrowColor: "#ef4444",
    fieldMap: "not part of a profile",
  } as unknown as Settings;

  it("saves the robot's size, speeds, tuning and looks, but nothing else", () => {
    expect(robotSettingsOf(settings)).toEqual({
      rLength: 15,
      rWidth: 14,
      maxVelocity: 50,
      maxAcceleration: 30,
      maxDeceleration: 0,
      maxAngularAcceleration: 6,
      kFriction: 2,
      aVelocity: 3,
      xVelocity: 60,
      yVelocity: 45,
      translationalP: 0.2,
      brakingQuadratic: undefined,
      brakingLinear: undefined,
      pathSettleTime: undefined,
      robotImage: "/robot.png",
      robotDriveType: "mecanum",
      showRobotArrows: true,
      showFakeHeadingArrow: false,
      fakeHeadingArrowColor: "#ef4444",
    });
  });

  it("saves no deceleration as 0", () => {
    const unset = { ...settings, maxDeceleration: undefined } as Settings;
    expect(robotSettingsOf(unset).maxDeceleration).toBe(0);
  });
});
