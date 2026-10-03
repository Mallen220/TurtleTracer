// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { buildPoseTable, poseNameOf } from "../lib/exporters/poseTable";
import type { Line, Point } from "../types";

const start: Point = { x: 10, y: 20, heading: "constant", degrees: 90 };
const line = (name: string, x: number, end: object, extra: object = {}) =>
  ({
    id: `${name}${x}`,
    name,
    endPoint: { x, y: 30, ...end },
    controlPoints: [],
    color: "red",
    ...extra,
  }) as unknown as Line;

describe("buildPoseTable", () => {
  it("starts with the start pose, then each line's pose and control points in order", () => {
    const lines = [
      line(
        "Score",
        40,
        { heading: "constant", degrees: 45 },
        {
          controlPoints: [{ x: 20, y: 25 }],
        },
      ),
      line("Park", 60, { heading: "tangential" }),
    ];
    expect(buildPoseTable(start, lines).map((e) => e.name)).toEqual([
      "startPoint",
      "Score",
      "Score_line0_control1",
      "Park",
    ]);
  });

  it("gives a fixed heading its angle and a path-following one 0", () => {
    const lines = [
      line("Const", 40, { heading: "constant", degrees: 45 }),
      line("Lin", 50, { heading: "linear", startDeg: 45, endDeg: 200 }),
      line("Tan", 60, { heading: "tangential" }),
      line("Face", 70, { heading: "facingPoint", targetX: 1, targetY: 2 }),
    ];
    const byName = Object.fromEntries(
      buildPoseTable(start, lines).map((e) => [e.name, e.degrees]),
    );
    expect(byName).toMatchObject({ Const: 45, Lin: 200, Tan: 0, Face: 0 });
  });

  it("leaves control points without a heading", () => {
    const lines = [
      line(
        "A",
        40,
        { heading: "tangential" },
        {
          controlPoints: [{ x: 1, y: 2 }],
        },
      ),
    ];
    const cp = buildPoseTable(start, lines).find((e) =>
      e.name.includes("control"),
    );
    expect(cp).toEqual({ name: "A_line0_control1", x: 1, y: 2 });
  });

  it("shares the first pose between lines with the same name", () => {
    const lines = [
      line("Grab", 40, { heading: "tangential" }),
      line("Grab", 60, { heading: "tangential" }),
    ];
    const grab = buildPoseTable(start, lines).filter((e) => e.name === "Grab");
    expect(grab).toHaveLength(1);
    expect(grab[0].x).toBe(40);
  });

  it("names lines without a usable name after their position", () => {
    const lines = [line("", 40, { heading: "tangential" })];
    expect(poseNameOf(lines, 0)).toBe("point1");
    expect(poseNameOf([line("A-b c!", 1, {})], 0)).toBe("Abc");
  });

  it("skips lines that have no end point instead of throwing", () => {
    const lines = [{ id: "x", name: "Broken" } as unknown as Line];
    expect(buildPoseTable(start, lines).map((e) => e.name)).toEqual([
      "startPoint",
    ]);
  });
});
