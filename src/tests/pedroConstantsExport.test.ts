// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Exported code names the team's own Pedro constants class: the one found in
// their robot project, or the one they typed, so it compiles as it is.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { generateJavaCode } from "../lib/exporters/javaExporter";
import { generateSequentialCommandCode } from "../lib/exporters/sequentialExporter";
import {
  QUICKSTART_CONSTANTS,
  resolvePedroConstants,
  setPedroConstants,
} from "../lib/exporters/pedroConstants";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem } from "../types";

beforeAll(() => registerCoreUI());
afterEach(() => setPedroConstants(null));

const team = {
  qualifiedName: "org.firstinspires.ftc.teamcode.pedroPathing.Constants",
  className: "Constants",
  followerFactory: "createFollower",
};

const start = { x: 10, y: 20, heading: "constant", degrees: 0 } as Point;
const lines = [
  {
    id: "a",
    name: "Score",
    endPoint: { x: 40, y: 20, heading: "constant", degrees: 0 },
    controlPoints: [],
    color: "#000",
    maxSpeed: 30,
  },
] as Line[];
const sequence: SequenceItem[] = [{ kind: "path", lineId: "a" }];

const commands = (language: "java" | "kotlin" = "java") =>
  generateSequentialCommandCode(
    start,
    lines,
    "Auto.turt",
    sequence,
    "SolversLib",
    "org.team.Commands",
    true,
    "Pedro",
    "imperial",
    language,
  );

describe("the team's Pedro constants class in exported code", () => {
  it("is Pedro 3's quickstart one when nothing else is known", async () => {
    const code = await generateJavaCode(start, lines, true, sequence);
    expect(code).toContain(
      "import org.firstinspires.ftc.teamcode.pedro.Constants;",
    );
    expect(code).toContain("follower = Constants.create(hardwareMap);");
  });

  it("is the one found in the project, in the OpMode", async () => {
    setPedroConstants(team);
    const code = await generateJavaCode(start, lines, true, sequence);
    expect(code).toContain(
      "import org.firstinspires.ftc.teamcode.pedroPathing.Constants;",
    );
    expect(code).not.toContain("teamcode.pedro.Constants");
    expect(code).toContain("follower = Constants.createFollower(hardwareMap);");
  });

  it("is the one found in the project, in command-based code with speed limits", async () => {
    setPedroConstants(team);
    const code = await commands();
    expect(code).toContain(
      "import org.firstinspires.ftc.teamcode.pedroPathing.Constants;",
    );
    expect(code).toContain(
      ".with(Constants.foresightConfig.maxVelocityConstraint.at(30.0))",
    );
    const kotlin = await commands("kotlin");
    expect(kotlin).toContain(
      "import org.firstinspires.ftc.teamcode.pedroPathing.Constants\n",
    );
  });

  it("uses the class's own name", async () => {
    setPedroConstants({
      qualifiedName: "org.team.pedro.PedroConstants",
      className: "PedroConstants",
      followerFactory: "build",
    });
    const opMode = await generateJavaCode(start, lines, true, sequence);
    expect(opMode).toContain("import org.team.pedro.PedroConstants;");
    expect(opMode).toContain("follower = PedroConstants.build(hardwareMap);");
    expect(await commands()).toContain(
      ".with(PedroConstants.foresightConfig.maxVelocityConstraint.at(30.0))",
    );
  });
});

describe("which constants class to use", () => {
  const found = { ...team, followerFactory: "createFollower" };

  it("takes the one found in the project", () => {
    expect(resolvePedroConstants({}, found)).toEqual(team);
  });

  it("takes what the team typed over what was found", () => {
    expect(
      resolvePedroConstants({ qualifiedName: " org.x.MyConstants " }, found),
    ).toEqual({
      qualifiedName: "org.x.MyConstants",
      className: "MyConstants",
      followerFactory: "create",
    });
    expect(
      resolvePedroConstants({ followerFactory: "makeFollower" }, found)
        .followerFactory,
    ).toBe("makeFollower");
  });

  it("keeps the found factory when the typed class is the one found", () => {
    expect(
      resolvePedroConstants({ qualifiedName: team.qualifiedName }, found)
        .followerFactory,
    ).toBe("createFollower");
  });

  it("falls back to Pedro's quickstart", () => {
    expect(resolvePedroConstants({}, null)).toEqual(QUICKSTART_CONSTANTS);
    expect(resolvePedroConstants({ qualifiedName: "  " }, null)).toEqual(
      QUICKSTART_CONSTANTS,
    );
  });
});
