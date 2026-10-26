// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  detectRobotProject,
  findProjectRoot,
  pickConstantsClass,
  projectSuggestions,
  readPastedConstants,
  readBuildFiles,
  readConstantsClass,
} from "../utils/robotProject";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Settings } from "../types";

// As a team that came from Pedro 2 keeps it (abridged).
const teamConstants = `package org.firstinspires.ftc.teamcode.pedroPathing;

import com.pedropathing.algorithm.ForesightConfig;
import com.pedropathing.follower.Follower;
import com.pedropathing.math.Matrix;

public class Constants {
  public static ForesightConfig foresightConfig =
      new ForesightConfig(
          c -> {
            c.linearBrakeCoefficients.set(Matrix.diag(0.0450653162639568, 0.04401223598329838));
            c.quadraticBrakeCoefficients.set(
                Matrix.diag(0.002017859860966682, 0.0016049569428496324));
          });

  public static Follower createFollower(HardwareMap hardwareMap) {
    return new Follower(null, null, new Foresight(foresightConfig));
  }
}
`;

// The robot's own constants (motor names), which aren't Pedro's.
const robotConstants = `package org.firstinspires.ftc.teamcode;

public class Constants {
  public static class DriveConstants {
    public static final String FRONT_LEFT_MOTOR_ID = "frontLeftMotor";
  }
}
`;

const kotlinConstants = `package org.team.pedro

object PedroConstants {
    @JvmField var foresightConfig = ForesightConfig { }

    @JvmStatic
    fun create(hardwareMap: HardwareMap): Follower = Follower(null, null, null)
}
`;

describe("reading a constants class", () => {
  it("reads the package, name and follower factory of a Java one", () => {
    expect(
      readConstantsClass("/t/pedroPathing/Constants.java", teamConstants),
    ).toEqual({
      qualifiedName: "org.firstinspires.ftc.teamcode.pedroPathing.Constants",
      className: "Constants",
      followerFactory: "createFollower",
      hasForesightConfig: true,
      file: "/t/pedroPathing/Constants.java",
    });
  });

  it("reads a Kotlin object", () => {
    expect(
      readConstantsClass("/t/pedro/PedroConstants.kt", kotlinConstants),
    ).toMatchObject({
      qualifiedName: "org.team.pedro.PedroConstants",
      className: "PedroConstants",
      followerFactory: "create",
      hasForesightConfig: true,
    });
  });

  it("reads a Kotlin factory written as an expression", () => {
    const short = `package a\nobject Constants {\n  fun createFollower(hardwareMap: HardwareMap) = Follower(x, y, z)\n}`;
    expect(readConstantsClass("/a/Constants.kt", short)?.followerFactory).toBe(
      "createFollower",
    );
  });

  it("isn't fooled by constants that have nothing to do with Pedro", () => {
    expect(readConstantsClass("/t/Constants.java", robotConstants)).toBeNull();
  });

  it("picks the one that builds the Follower", () => {
    const quiet = readConstantsClass(
      "/t/other/FConstants.java",
      "package x; public class FConstants { static FollowerConstants f; }",
    )!;
    const team = readConstantsClass("/t/Constants.java", teamConstants)!;
    expect(pickConstantsClass([quiet, team])).toBe(team);
    expect(pickConstantsClass([])).toBeNull();
  });
});

describe("reading the build files", () => {
  it("finds Pedro 3 and SolversLib", () => {
    expect(
      readBuildFiles([
        `implementation 'org.solverslib:pedroPathing:0.3.6'
         implementation 'com.pedropathing:revhub:3.0.2'
         implementation 'com.pedropathing:tuning:1.0.1'`,
      ]),
    ).toEqual({
      pedroVersion: "v3",
      pedroDependency: "com.pedropathing:revhub:3.0.2",
      commandLibrary: "SolversLib",
    });
  });

  it("finds Pedro 2, ignoring lines that are commented out", () => {
    expect(
      readBuildFiles([
        `// implementation 'com.pedropathing:revhub:3.0.0'
         implementation 'com.pedropathing:ftc:2.0.6'
         implementation "dev.nextftc:ftc:1.0.0"`,
      ]),
    ).toEqual({
      pedroVersion: "v2",
      pedroDependency: "com.pedropathing:ftc:2.0.6",
      commandLibrary: "NextFTC",
    });
  });

  it("finds nothing in a project without Pedro", () => {
    expect(readBuildFiles(["implementation 'x:y:1.0'"])).toEqual({
      pedroVersion: null,
      pedroDependency: null,
      commandLibrary: null,
    });
  });
});

describe("finding the project", () => {
  const exists = (paths: string[]) => async (p: string) => paths.includes(p);

  it("goes up from a folder inside TeamCode", async () => {
    expect(
      await findProjectRoot(
        "/robot/TeamCode/src/main/java/org/x/Commands",
        exists([]),
      ),
    ).toBe("/robot");
    expect(
      await findProjectRoot(String.raw`C:\robot\TeamCode\src`, exists([])),
    ).toBe("C:/robot");
  });

  it("takes a folder that holds TeamCode, and nothing else", async () => {
    expect(await findProjectRoot("/robot/", exists(["/robot/TeamCode"]))).toBe(
      "/robot/",
    );
    expect(await findProjectRoot("/paths", exists([]))).toBeNull();
  });

  it("reads everything it can from a project", async () => {
    const files: Record<string, string> = {
      "/robot/TeamCode/build.gradle":
        "implementation 'com.pedropathing:revhub:3.0.2'\nimplementation 'org.solverslib:core:0.3.6'",
      "/robot/TeamCode/src/main/java/org/firstinspires/ftc/teamcode/Constants.java":
        robotConstants,
      "/robot/TeamCode/src/main/java/org/firstinspires/ftc/teamcode/pedroPathing/Constants.java":
        teamConstants,
    };
    const project = await detectRobotProject("/robot/TeamCode/src/main/java", {
      fileExists: async (p) => p in files,
      readFile: async (p) => files[p],
      findFiles: async (root, endings) =>
        Object.keys(files).filter(
          (f) => f.startsWith(root) && endings.some((e) => f.endsWith(e)),
        ),
    });
    expect(project).toMatchObject({
      root: "/robot",
      pedroVersion: "v3",
      commandLibrary: "SolversLib",
      constants: {
        qualifiedName: "org.firstinspires.ftc.teamcode.pedroPathing.Constants",
        followerFactory: "createFollower",
      },
      pedroValues: expect.arrayContaining([
        expect.objectContaining({
          setting: "pedroQuadraticBrakeForward",
          value: 0.002017859860966682,
        }),
      ]),
    });
  });

  it("isn't a project outside one", async () => {
    expect(
      await detectRobotProject("/paths", {
        fileExists: async () => false,
        readFile: async () => "",
      }),
    ).toBeNull();
  });
});

describe("what the project says to change", () => {
  const project = {
    root: "/robot",
    constants: null,
    pedroVersion: "v2" as const,
    pedroDependency: "com.pedropathing:ftc:2.0.6",
    commandLibrary: "NextFTC" as const,
    pedroValues: [
      { setting: "xVelocity" as const, value: 62.6, source: "xVelocity" },
      {
        setting: "pedroQuadraticBrakeForward" as const,
        value: 0.002,
        source: "quadraticBrakeCoefficients",
      },
      {
        setting: "pedroQuadraticBrakeStrafe" as const,
        value: 0.0016,
        source: "quadraticBrakeCoefficients",
      },
      {
        setting: "pedroLinearBrakeForward" as const,
        value: 0.045,
        source: "linearBrakeCoefficients",
      },
      {
        setting: "pedroLinearBrakeStrafe" as const,
        value: 0.044,
        source: "linearBrakeCoefficients",
      },
    ],
  };
  const settings = {
    ...DEFAULT_SETTINGS,
    pedroVersion: "v3",
    autoExportFormat: "sequential",
    autoExportTargetLibrary: "SolversLib",
  } as Settings;

  it("offers each setting the project disagrees with", () => {
    const found = projectSuggestions(project, settings);
    expect(found.map((s) => s.id)).toEqual([
      "pedroVersion",
      "handoverBrakes",
      "motionValues",
      "targetLibrary",
    ]);
    expect(found[0].patch).toEqual({ pedroVersion: "v2" });
    expect(found[1].patch).toEqual({
      pedroQuadraticBrakeForward: 0.002,
      pedroQuadraticBrakeStrafe: 0.0016,
      pedroLinearBrakeForward: 0.045,
      pedroLinearBrakeStrafe: 0.044,
    });
    expect(found[2].patch).toEqual({ xVelocity: 62.6 });
    expect(found[2].found).toBe("Forward velocity 62.6");
  });

  it("offers nothing once the settings match", () => {
    const matching = {
      ...settings,
      ...Object.assign(
        {},
        ...projectSuggestions(project, settings).map((s) => s.patch),
      ),
    };
    expect(projectSuggestions(project, matching)).toEqual([]);
  });

  it("only offers a library for command-based code", () => {
    const stateMachine = { ...settings, autoExportFormat: "java" } as Settings;
    expect(
      projectSuggestions(project, stateMachine).map((s) => s.id),
    ).not.toContain("targetLibrary");
  });
});

describe("a constants file pasted in whole", () => {
  const settings = { ...DEFAULT_SETTINGS, pedroVersion: "v2" } as Settings;

  it("changes the numbers, the Pedro version, and the class names", () => {
    const pasted = readPastedConstants(teamConstants, settings);
    expect(pasted.recognised).toBe(true);
    expect(pasted.changes.map((c) => c.setting)).toEqual([
      "pedroVersion",
      "pedroQuadraticBrakeForward",
      "pedroQuadraticBrakeStrafe",
      "pedroLinearBrakeForward",
      "pedroLinearBrakeStrafe",
      "pedroConstantsClass",
      "pedroFollowerFactory",
    ]);
    expect(pasted.patch).toMatchObject({
      pedroVersion: "v3",
      pedroLinearBrakeForward: 0.0450653162639568,
      pedroConstantsClass:
        "org.firstinspires.ftc.teamcode.pedroPathing.Constants",
      pedroFollowerFactory: "createFollower",
    });
  });

  it("reads a Kotlin object's names", () => {
    expect(readPastedConstants(kotlinConstants, settings).patch).toMatchObject({
      pedroConstantsClass: "org.team.pedro.PedroConstants",
      pedroFollowerFactory: "create",
    });
  });

  it("has nothing to change once the settings match", () => {
    const first = readPastedConstants(teamConstants, settings);
    const after = readPastedConstants(teamConstants, {
      ...settings,
      ...first.patch,
    });
    expect(after.recognised).toBe(true);
    expect(after.changes).toEqual([]);
  });

  it("doesn't recognise text that has no Pedro in it", () => {
    expect(readPastedConstants("hello there", settings)).toEqual({
      recognised: false,
      changes: [],
      patch: {},
    });
    expect(readPastedConstants(robotConstants, settings).recognised).toBe(
      false,
    );
  });
});
