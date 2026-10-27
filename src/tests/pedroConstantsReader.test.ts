// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { changedValues, readPedroValues } from "../utils/pedroConstantsReader";
import { DEFAULT_SETTINGS } from "../config/defaults";

// A Pedro 3 file as Foresight AutoTune writes it, with the team's own variables.
const pedro3 = `package org.firstinspires.ftc.teamcode.pedroPathing;

/** Paste the generated configs here: https://pedropathing.com/docs/pathing/tuning */
public class Constants {
  public static ForesightConfig foresightConfig =
      new ForesightConfig(
          c -> {
            Controller primaryTranslationalForward = Controller.proportional(0.6918084646366569);
            Controller secondaryTranslationalForward = Controller.proportional(0.25560474222061796);
            Controller primaryTranslationalLateral = Controller.proportional(1.306824012460313);

            c.forwardTranslational.set(
                Controller.piecewise(secondaryTranslationalForward)
                    .put(2.5, primaryTranslationalForward));
            c.strafeTranslational.set(Controller.proportional(1.3));

            c.linearBrakeCoefficients.set(Matrix.diag(0.0450653162639568, 0.04401223598329838));
            c.quadraticBrakeCoefficients.set(
                Matrix.diag(0.002017859860966682, 0.0016049569428496324));

            c.maxAchievableForwardVelocity.set(62.6321833988067);
            c.maxAchievableStrafeVelocity.set(55.24797429320508);
            c.naturalForwardDeceleration.set(43.19459872999997);
            c.naturalStrafeDeceleration.set(51.59615090010216);
          });
}
`;

const settingOf = (found: ReturnType<typeof readPedroValues>) =>
  Object.fromEntries(found.values.map((v) => [v.setting, v.value]));

describe("reading Pedro 3 constants", () => {
  const found = readPedroValues(pedro3);

  it("reads the speeds and the brake model", () => {
    expect(found.version).toBe("v3");
    expect(settingOf(found)).toEqual({
      xVelocity: 62.6321833988067,
      yVelocity: 55.24797429320508,
      maxVelocity: 62.6321833988067,
      pedroQuadraticBrakeForward: 0.002017859860966682,
      pedroQuadraticBrakeStrafe: 0.0016049569428496324,
      pedroLinearBrakeForward: 0.0450653162639568,
      pedroLinearBrakeStrafe: 0.04401223598329838,
    });
  });

  it("says which Pedro name each value came from", () => {
    const source = Object.fromEntries(
      found.values.map((v) => [v.setting, v.source]),
    );
    expect(source.xVelocity).toBe("maxAchievableForwardVelocity");
    expect(source.maxVelocity).toBe("maxAchievableForwardVelocity");
    expect(source.pedroLinearBrakeStrafe).toBe("linearBrakeCoefficients");
  });

  it("leaves out what only the robot can tell: P and the coasting deceleration", () => {
    // The file sets forwardTranslational and naturalForwardDeceleration, but
    // the simulation's P is fitted to the robot's corners, and a coasting
    // robot slows at about a third of the rate it brakes at.
    const settings = found.values.map((v) => v.setting);
    expect(settings).not.toContain("translationalP");
    expect(settings).not.toContain("maxDeceleration");
  });

  it("takes the constraints a team sets over the measured speeds", () => {
    const limited = readPedroValues(`${pedro3}
      c.maxVelocityConstraint.set(50);
      c.maxAccelerationConstraint.set(80);
      c.maxDecelerationConstraint.set(35.5);
      c.timeoutConstraint.set(250);`);
    expect(settingOf(limited)).toMatchObject({
      xVelocity: 62.6321833988067,
      maxVelocity: 50,
      maxAcceleration: 80,
      maxDeceleration: 35.5,
      pathSettleTime: 0.25,
    });
  });

  it("doesn't let a constraint above the robot's best speed raise it", () => {
    const loose = readPedroValues(
      `${pedro3}\nc.maxVelocityConstraint.set(200);`,
    );
    expect(settingOf(loose).maxVelocity).toBe(62.6321833988067);
  });

  it("ignores constraints left at Pedro's NONE", () => {
    const none = readPedroValues(
      `${pedro3}\nc.maxAccelerationConstraint.set(ForesightConfig.Constraint.NONE);`,
    );
    expect(settingOf(none).maxAcceleration).toBeUndefined();
  });
});

describe("what it can and can't read", () => {
  it("skips settings that are commented out", () => {
    const found = readPedroValues(`
      // c.maxAchievableForwardVelocity.set(99);
      /* c.maxAchievableStrafeVelocity.set(88); */
      c.maxAchievableForwardVelocity.set(60);
      String url = "https://example.com"; c.maxDecelerationConstraint.set(40);`);
    expect(settingOf(found)).toMatchObject({
      xVelocity: 60,
      maxDeceleration: 40,
    });
    expect(settingOf(found).yVelocity).toBeUndefined();
  });

  it("works out variables and simple arithmetic", () => {
    const found = readPedroValues(`
      double top = 70;
      static final double SCALE = 0.9;
      c.maxAchievableForwardVelocity.set(top * SCALE);
      c.maxAchievableStrafeVelocity.set(-(-top) / 2 + 1);`);
    expect(settingOf(found)).toMatchObject({ xVelocity: 63, yVelocity: 36 });
  });

  it("leaves out what it can't work out", () => {
    const found = readPedroValues(`
      c.maxAchievableForwardVelocity.set(Tuning.measureForward());
      c.maxAchievableStrafeVelocity.set(0);`);
    expect(found.values).toEqual([]);
  });

  it("needs both brake matrices", () => {
    const found = readPedroValues(
      "c.linearBrakeCoefficients.set(Matrix.diag(0.04, 0.04));",
    );
    expect(found.values).toEqual([]);
  });

  it("reads nothing from code that isn't Pedro's", () => {
    expect(
      readPedroValues("public class Constants { static int X = 4; }"),
    ).toEqual({ version: null, values: [] });
  });

  it("reads a Kotlin file", () => {
    const found = readPedroValues(`
object PedroConstants {
    @JvmField
    var foresightConfig = ForesightConfig { c ->
        val top = 58.0
        c.maxAchievableForwardVelocity.set(top)
        c.maxAchievableStrafeVelocity.set(
            top * 0.5
        )
        c.maxDecelerationConstraint.set(90.0)
    }
}`);
    expect(found.version).toBe("v3");
    expect(settingOf(found)).toMatchObject({
      xVelocity: 58,
      yVelocity: 29,
      maxDeceleration: 90,
    });
  });
});

describe("reading Pedro 2 constants", () => {
  const found = readPedroValues(`
public class Constants {
    public static FollowerConstants followerConstants = new FollowerConstants()
            .mass(5)
            .forwardZeroPowerAcceleration(-41.278)
            .translationalPIDFCoefficients(new PIDFCoefficients(0.12, 0, 0.01, 0))
            .secondaryTranslationalPIDFCoefficients(new PIDFCoefficients(0.9, 0, 0.01, 0));
    public static MecanumConstants driveConstants = new MecanumConstants()
            .maxPower(1)
            .xVelocity(81.34)
            .yVelocity(65.43);
    public static PathConstraints pathConstraints = new PathConstraints(0.99, 100, 1, 1);
}`);

  it("reads the speeds and the timeout, not the coasting deceleration or P", () => {
    expect(found.version).toBe("v2");
    expect(settingOf(found)).toEqual({
      xVelocity: 81.34,
      yVelocity: 65.43,
      maxVelocity: 81.34,
      pathSettleTime: 0.1,
    });
  });

  it("reads the timeout of the eight-argument PathConstraints", () => {
    const all = readPedroValues(
      "new PathConstraints(0.995, 0.1, 0.1, 0.007, 250, 1, 10, 1);",
    );
    expect(settingOf(all).pathSettleTime).toBe(0.25);
  });

  it("has no timeout when PathConstraints is a shape it doesn't know", () => {
    const odd = readPedroValues("new PathConstraints(0.995, 0.1, 0.1);");
    expect(settingOf(odd).pathSettleTime).toBeUndefined();
  });
});

describe("comparing with the settings", () => {
  it("lists only what differs", () => {
    const values = readPedroValues(pedro3).values;
    const changes = changedValues(values, {
      ...DEFAULT_SETTINGS,
      xVelocity: 62.6321833988067,
    });
    expect(changes.map((c) => c.setting)).not.toContain("xVelocity");
    expect(changes.find((c) => c.setting === "yVelocity")).toMatchObject({
      label: "Strafe velocity",
      value: 55.24797429320508,
      current: DEFAULT_SETTINGS.yVelocity,
      source: "maxAchievableStrafeVelocity",
    });
  });

  it("counts an unset brake coefficient as 0", () => {
    const changes = changedValues(
      [
        {
          setting: "pedroLinearBrakeForward",
          value: 0,
          source: "linearBrakeCoefficients",
        },
      ],
      { ...DEFAULT_SETTINGS, pedroLinearBrakeForward: undefined },
    );
    expect(changes).toEqual([]);
  });
});
