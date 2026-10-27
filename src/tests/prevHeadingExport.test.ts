// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Prev is exported as the heading it stands for.
import { describe, it, expect, vi, beforeAll } from "vitest";

// Skip prettier: the tests check the generated text, not its layout.
vi.mock("prettier", () => ({
  default: { format: vi.fn(async (code: string) => code) },
}));
vi.mock("prettier-plugin-java", () => ({ default: {} }));

import { generateJavaCode } from "../lib/exporters/javaExporter";
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
  it("is written as the heading before it", async () => {
    const code = await java([first, blank]);
    expect(code).toContain(".linear(Math.toRadians(90), Math.toRadians(180))");
    expect(code).not.toContain("fromRobotHeading");
  });

  it("follows a turn between the paths", async () => {
    const code = await generateJavaCode(
      start,
      [first, blank],
      true,
      [
        { kind: "path", lineId: "a" },
        { kind: "rotate", id: "r", name: "Turn", degrees: 120 },
        { kind: "path", lineId: "b" },
      ],
      "org.example",
    );
    expect(code).toContain(".linear(Math.toRadians(120), Math.toRadians(180))");
  });

  it("holds the heading before it for a blank constant", async () => {
    const hold = line("c", "Hold", 50, { heading: "constant" });
    const code = await java([first, hold]);
    expect(code).toContain(".constant(Math.toRadians(90))");
  });

  it("starts a piecewise segment where the one before ended", async () => {
    const piece = line("p", "Piece", 50, {
      heading: "piecewise",
      segments: [
        { tStart: 0, tEnd: 0.5, heading: "linear", endDeg: 100 },
        { tStart: 0.5, tEnd: 1, heading: "linear", endDeg: 10 },
      ],
    });
    const code = await java([first, piece]);
    expect(code).toContain(
      ".until(0.5, Interpolator.linear(Math.toRadians(90), Math.toRadians(100)))",
    );
    expect(code).toContain(
      ".until(1, Interpolator.linear(Math.toRadians(100), Math.toRadians(10)))",
    );
  });

  it("works in Kotlin", async () => {
    const code = await java([first, blank], "kotlin");
    expect(code).toContain(
      ".linear(Math.toRadians(90.0), Math.toRadians(180.0))",
    );
  });
});

describe("a blank start heading in command code", () => {
  it("is written as the heading before it", async () => {
    const code = await generateSequentialCommandCode(
      start,
      [first, blank],
      null,
      undefined,
      "SolversLib",
      "org.example",
      true,
    );
    expect(code).toContain(".linear(Math.toRadians(90), Math.toRadians(180))");
  });
});
