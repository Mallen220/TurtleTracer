// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeAll } from "vitest";

// Skip prettier: the tests check the generated text, not its layout.
vi.mock("prettier", () => ({
  default: { format: vi.fn(async (code: string) => code) },
}));
vi.mock("prettier-plugin-java", () => ({ default: {} }));

import { generateJavaCode } from "../lib/exporters/javaExporter";
import {
  commandRegistrarCall,
  commandRegistrarMethod,
  commandRegistrarSummary,
} from "../lib/exporters/eventMarkerUtils";
import { get } from "svelte/store";
import { exporterRegistry } from "../lib/exporters";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { CodeLanguage, Line, Point } from "../types";

beforeAll(() => registerCoreUI());

const start: Point = { x: 10, y: 10, heading: "constant", degrees: 0 };
const REGISTRAR = "org.team.RobotCommands.register";

const line = (withMarker: boolean): Line =>
  ({
    id: "a",
    name: "Score",
    endPoint: { x: 20, y: 20, heading: "tangential", reverse: false },
    controlPoints: [],
    color: "red",
    ...(withMarker && {
      eventMarkers: [
        { id: "e", name: "raiseArm", position: 0.5, parameters: [] },
      ],
    }),
  }) as Line;

const opMode = (
  withMarker: boolean,
  language: CodeLanguage,
  registrar?: string,
) =>
  generateJavaCode(
    start,
    [line(withMarker)],
    true,
    undefined,
    "org.team.Autos",
    "Panels",
    "Pedro",
    "imperial",
    "Red.turt",
    language,
    registrar,
  );

describe("commandRegistrarMethod", () => {
  it("accepts a class and a method", () => {
    expect(commandRegistrarMethod(REGISTRAR)).toBe(REGISTRAR);
    expect(commandRegistrarMethod("RobotCommands.register")).toBe(
      "RobotCommands.register",
    );
    expect(commandRegistrarMethod("a.b$.c_d")).toBe("a.b$.c_d");
  });

  it("drops the call syntax a team might type around it", () => {
    for (const typed of [
      `  ${REGISTRAR}  `,
      `${REGISTRAR};`,
      `${REGISTRAR}()`,
      `${REGISTRAR}(hardwareMap);`,
    ]) {
      expect(commandRegistrarMethod(typed)).toBe(REGISTRAR);
    }
  });

  it("rejects anything that isn't a class and a method", () => {
    for (const typed of [
      undefined,
      "",
      "   ",
      "register",
      "org.team.",
      ".register",
      "org..register",
      "1org.register",
      "org.team.Robot.register(); System.exit(0)",
      "org.team.Robot.register(hardwareMap) // x",
      "a.b c",
    ]) {
      expect(commandRegistrarMethod(typed)).toBeNull();
    }
  });
});

describe("commandRegistrarCall", () => {
  it("ends a Java statement but not a Kotlin one", () => {
    expect(commandRegistrarCall(REGISTRAR, "hw")).toBe(`${REGISTRAR}(hw);`);
    expect(commandRegistrarCall(REGISTRAR, "hw", "kotlin")).toBe(
      `${REGISTRAR}(hw)`,
    );
  });

  it("is empty without a usable registrar", () => {
    expect(commandRegistrarCall("", "hw")).toBe("");
    expect(commandRegistrarCall("nope", "hw")).toBe("");
  });
});

describe("OpMode export", () => {
  it("calls the registrar in init() before the paths are built", async () => {
    const code = await opMode(true, "java", REGISTRAR);
    expect(code).toContain(`${REGISTRAR}(hardwareMap);`);
    const at = (text: string) => code.indexOf(text);
    expect(at(REGISTRAR)).toBeGreaterThan(at("public void init()"));
    expect(at(REGISTRAR)).toBeLessThan(at("paths = new Paths(follower)"));
    expect(at(REGISTRAR)).toBeLessThan(at("tracker = new ProgressTracker"));
    expect(at(REGISTRAR)).toBeLessThan(at("NamedCommands.getCommand"));
  });

  it("does it in Kotlin too, without the semicolon", async () => {
    const code = await opMode(true, "kotlin", REGISTRAR);
    expect(code).toContain(`${REGISTRAR}(hardwareMap) //`);
    expect(code).not.toContain(`${REGISTRAR}(hardwareMap);`);
    expect(code.indexOf(REGISTRAR)).toBeLessThan(
      code.indexOf("paths = Paths()"),
    );
  });

  it("writes nothing when no registrar is set", async () => {
    for (const language of ["java", "kotlin"] as const) {
      const code = await opMode(true, language);
      expect(code).not.toContain("RobotCommands");
      expect(code).not.toContain("Team's named commands");
    }
  });

  it("writes nothing when the registrar isn't a class and a method", async () => {
    const code = await opMode(true, "java", "register(); evil()");
    expect(code).not.toContain("evil");
    expect(code).not.toContain("Team's named commands");
  });

  it("writes nothing when the path has no event markers", async () => {
    for (const language of ["java", "kotlin"] as const) {
      const code = await opMode(false, language, REGISTRAR);
      expect(code).not.toContain("RobotCommands");
    }
  });

  it("does not touch the Paths-only export", async () => {
    const code = await generateJavaCode(
      start,
      [line(true)],
      false,
      undefined,
      "org.team.Autos",
      "Panels",
      "Pedro",
      "imperial",
      "Red.turt",
      "java",
      REGISTRAR,
    );
    expect(code).not.toContain("RobotCommands");
  });
});

describe("command group exports", () => {
  const data = { startPoint: start, lines: [line(true)], shapes: [] } as any;

  for (const library of ["SolversLib", "NextFTC", "Ivy"] as const) {
    for (const language of ["java", "kotlin"] as const) {
      for (const hardcodeValues of [false, true]) {
        it(`${library} ${language}${hardcodeValues ? " with poses embedded" : ""}: leave the registrar out, even when one is set`, async () => {
          const exporter = get(exporterRegistry).sequential;
          const code = await exporter.exportCode(data, {
            commandRegistrar: REGISTRAR,
            targetLibrary: library,
            codeLanguage: language,
            hardcodeValues,
            fileName: "Red.turt",
          });
          expect(code).toContain("NamedCommands.getCommand");
          expect(code).not.toContain("RobotCommands");
          expect(code).not.toContain("Team's named commands");
        });
      }
    }
  }
});

describe("what the settings say the registrar does", () => {
  it("names the statement and where it goes", () => {
    expect(commandRegistrarSummary(REGISTRAR)).toEqual({
      call: `${REGISTRAR}(hardwareMap);`,
      short: "register(hardwareMap);",
      where: "init()",
    });
    expect(commandRegistrarSummary(REGISTRAR, "kotlin")).toEqual({
      call: `${REGISTRAR}(hardwareMap)`,
      short: "register(hardwareMap)",
      where: "init()",
    });
  });

  it("says nothing when nothing would be written", () => {
    expect(commandRegistrarSummary("")).toBeNull();
    expect(commandRegistrarSummary("register")).toBeNull();
  });

  it("is exactly the statement the OpMode export writes, and it adds no import for it", async () => {
    for (const language of ["java", "kotlin"] as const) {
      const code = await opMode(true, language, REGISTRAR);
      const summary = commandRegistrarSummary(REGISTRAR, language)!;
      expect(code).toContain(summary.call);
      // The short form is the end of it, so what's shown is what's written.
      expect(summary.call.endsWith(summary.short)).toBe(true);
      expect(code).not.toMatch(/^\s*import\s.*RobotCommands/m);
    }
  });
});
