// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { javaClassName } from "../lib/exporters/javaFormat";
import { generateJavaCode } from "../lib/exporters/javaExporter";
import { generateSequentialCommandCode } from "../lib/exporters/sequentialExporter";
import type { Line, Point } from "../types";

const start: Point = { x: 0, y: 0, heading: "tangential" } as Point;
const lines: Line[] = [
  {
    id: "l1",
    endPoint: { x: 20, y: 0, heading: "tangential" } as Point,
    controlPoints: [],
    color: "#fff",
  },
];

describe("javaClassName", () => {
  it("names the class after the project file", () => {
    expect(javaClassName("Far.turt", "X")).toBe("Far");
    expect(javaClassName("/repo/AutoPaths/Far Side.turt", "X")).toBe(
      "Far_Side",
    );
    expect(javaClassName(String.raw`C:\paths\red-close.pp`, "X")).toBe(
      "red_close",
    );
  });

  it("makes names Java can't use valid", () => {
    expect(javaClassName("2 Specimen.turt", "X")).toBe("Auto2_Specimen");
    expect(javaClassName("class.turt", "X")).toBe("classAuto");
  });

  it("falls back when there's no usable name", () => {
    expect(javaClassName(null, "AutoPath")).toBe("AutoPath");
    expect(javaClassName("", "AutoPath")).toBe("AutoPath");
    expect(javaClassName("!!!.turt", "AutoPath")).toBe("AutoPath");
  });
});

describe("generated classes match their file names", () => {
  it("names the OpMode class and its listing after the project", async () => {
    const code = await generateJavaCode(
      start,
      lines,
      true,
      [],
      "org.firstinspires.ftc.teamcode",
      "None",
      "Pedro",
      "imperial",
      "Far Side.turt",
    );
    expect(code).toMatch(/public class Far_Side extends OpMode/);
    expect(code).toContain('@Autonomous(name = "Far Side"');
  });

  it("keeps the old name when there's no project file", async () => {
    const code = await generateJavaCode(start, lines, true, []);
    expect(code).toMatch(/public class TurtleTracerAutonomous extends OpMode/);
    expect(code).toContain('@Autonomous(name = "Turtle Tracer Autonomous"');
  });

  it("names sequential command classes the same way", async () => {
    const code = await generateSequentialCommandCode(
      start,
      lines,
      "2nd auto.turt",
    );
    expect(code).toMatch(/class Auto2nd_auto\b/);
  });
});
