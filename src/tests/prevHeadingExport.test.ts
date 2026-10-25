// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Prev is read from the robot when the path starts, not when it is built.
import { describe, it, expect, vi, beforeAll } from "vitest";

// Skip prettier: the tests check the generated text, not its layout.
vi.mock("prettier", () => ({
  default: { format: vi.fn(async (code: string) => code) },
}));
vi.mock("prettier-plugin-java", () => ({ default: {} }));

import { generateJavaCode } from "../lib/exporters/javaExporter";
import { importJavaProject } from "../utils/javaImporter";
import { generateSequentialCommandCode } from "../lib/exporters/sequentialExporter";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point } from "../types";

beforeAll(() => registerCoreUI());

const start: Point = { x: 10, y: 10, heading: "constant", degrees: 0 };

const line = (
  id: string,
  name: string,
  x: number,
  endPoint: Partial<Point>,
  over: Partial<Line> = {},
): Line => ({
  id,
  name,
  endPoint: { x, y: 10, heading: "tangential", ...endPoint } as Point,
  controlPoints: [],
  color: "red",
  ...over,
});

const first = line("a", "First", 30, {
  heading: "linear",
  startDeg: 0,
  endDeg: 90,
});
const blank = line("b", "Second", 50, { heading: "linear", endDeg: 180 });

function java(lines: Line[], language: "java" | "kotlin" = "java") {
  return generateJavaCode(
    start,
    lines,
    true,
    undefined,
    "org.example",
    "Panels",
    "Pedro",
    "imperial",
    null,
    language,
  );
}

describe("a blank start heading in the OpMode", () => {
  it("is read from the robot when the path starts", async () => {
    const code = await java([first, blank]);
    expect(code).toContain(
      "fromRobotHeading(follower, start -> Interpolator.linear(start, Math.toRadians(180)))",
    );
    expect(code).toContain("private static Interpolator fromRobotHeading(");
    expect(code).toContain("follower.pose().heading()");
  });

  it("leaves a path with every angle written out as it was", async () => {
    const code = await java([
      first,
      { ...blank, endPoint: { ...blank.endPoint, startDeg: 90 } as Point },
    ]);
    expect(code).not.toContain("fromRobotHeading");
    expect(code).toContain(".linear(Math.toRadians(90), Math.toRadians(180))");
  });

  it("takes the heading the chain has reached part way through a chain", async () => {
    const chained = { ...blank, isChain: true };
    const code = await java([first, chained]);
    expect(code).not.toContain("fromRobotHeading");
    expect(code).toContain(".linear(Math.toRadians(90), Math.toRadians(180))");
  });

  it("starts a blank constant heading from the robot's", async () => {
    const hold = line("c", "Hold", 50, { heading: "constant" });
    const code = await java([first, hold]);
    expect(code).toContain(
      "fromRobotHeading(follower, start -> Interpolator.constant(start))",
    );
  });

  it("starts the first segment of a piecewise heading from the robot's", async () => {
    const piece = line("p", "Piece", 50, {
      heading: "piecewise",
      segments: [
        { tStart: 0, tEnd: 0.5, heading: "linear", endDeg: 100 },
        { tStart: 0.5, tEnd: 1, heading: "linear", endDeg: 10 },
      ],
    });
    const code = await java([first, piece]);
    expect(code).toContain(
      ".until(0.5, fromRobotHeading(follower, start -> Interpolator.linear(start, Math.toRadians(100))))",
    );
    // The second segment goes on from where the first ended.
    expect(code).toContain(
      ".until(1, Interpolator.linear(Math.toRadians(100), Math.toRadians(10)))",
    );
  });

  it("keeps a reversed heading reversed", async () => {
    const reversed = line("r", "Rev", 50, {
      heading: "linear",
      endDeg: 180,
      reverse: true,
    });
    const code = await java([first, reversed]);
    expect(code).toContain(".reverse())");
    expect(code).toContain("fromRobotHeading(follower, start ->");
  });

  it("gives Kotlin's Paths the follower it reads", async () => {
    const code = await java([first, blank], "kotlin");
    expect(code).toContain("class Paths(follower: Follower)");
    expect(code).toContain("paths = Paths(follower)");
    expect(code).toContain(
      "fromRobotHeading(follower) { start -> Interpolator.linear(start, Math.toRadians(180.0)) }",
    );
    expect(code).toContain("private fun fromRobotHeading(");
  });

  it("leaves Kotlin's Paths alone when nothing is blank", async () => {
    const code = await java([first], "kotlin");
    expect(code).toContain("class Paths {");
    expect(code).toContain("paths = Paths()");
  });
});

describe("a blank start heading in command code", () => {
  const sequential = (lines: Line[], language: "java" | "kotlin" = "java") =>
    generateSequentialCommandCode(
      start,
      lines,
      null,
      undefined,
      "SolversLib",
      "org.example",
      true,
      "Pedro",
      "imperial",
      language,
    );

  it("is read from the robot when the path starts", async () => {
    const code = await sequential([first, blank]);
    expect(code).toContain(
      "fromRobotHeading(follower, start -> Interpolator.linear(start, Math.toRadians(180)))",
    );
    expect(code).toContain("private static Interpolator fromRobotHeading(");
  });

  it("works in Kotlin", async () => {
    const code = await sequential([first, blank], "kotlin");
    expect(code).toContain(
      "fromRobotHeading(follower) { start -> Interpolator.linear(start, Math.toRadians(180.0)) }",
    );
    expect(code).toContain("private fun fromRobotHeading(");
  });

  it("adds nothing when no angle is blank", async () => {
    const code = await sequential([first]);
    expect(code).not.toContain("fromRobotHeading");
  });
});

describe("importing a blank start heading", () => {
  const piece = line("p", "Piece", 90, {
    heading: "piecewise",
    segments: [
      { tStart: 0, tEnd: 0.5, heading: "linear", endDeg: 100 },
      { tStart: 0.5, tEnd: 1, heading: "linear", endDeg: 10 },
    ],
  });
  const hold = line("c", "Hold", 70, { heading: "constant" });
  const lines = [first, blank, hold, piece];

  for (const language of ["java", "kotlin"] as const) {
    it(`reads the ${language} the app wrote back as blank angles`, async () => {
      const code = await java(lines, language);
      const read = importJavaProject(code, { language }).lines;

      expect(read[0].endPoint).toMatchObject({ startDeg: 0, endDeg: 90 });
      expect(read[1].endPoint.heading).toBe("linear");
      expect(read[1].endPoint.startDeg).toBeUndefined();
      expect(read[1].endPoint.endDeg).toBe(180);
      expect(read[2].endPoint.heading).toBe("constant");
      expect(read[2].endPoint.degrees).toBeUndefined();

      const segments = read[3].endPoint.segments!;
      expect(segments[0].startDeg).toBeUndefined();
      expect(segments[0].endDeg).toBe(100);
      expect(segments[1]).toMatchObject({ startDeg: 100, endDeg: 10 });
    });
  }

  it("reads a hand-written follower heading as a blank angle", async () => {
    const code = (await java([first, blank])).replace(
      /\.heading\(fromRobotHeading\(follower, start -> Interpolator\.linear\(start, ([^)]*\)\))\)\)/,
      ".linear(follower.pose().heading(), $1)",
    );
    expect(code).toContain(".linear(follower.pose().heading(), ");
    const read = importJavaProject(code).lines;
    expect(read[1].endPoint.startDeg).toBeUndefined();
    expect(read[1].endPoint.endDeg).toBe(180);
  });
});
