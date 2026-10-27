// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// A heading inside a piecewise one is followed the same way as on its own:
// the robot turns toward it as fast as it can.
import { describe, it, expect } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line, Point, Settings } from "../types";

const start = { x: 10, y: 10, heading: "constant", degrees: 0 } as Point;
const headings = (endPoint: Partial<Point>) => {
  const line: Line = {
    id: "L",
    endPoint: { x: 100, y: 10, ...endPoint } as Point,
    controlPoints: [],
    color: "red",
  };
  const travel = calculatePathTime(
    start,
    [line],
    DEFAULT_SETTINGS as Settings,
  ).timeline.find((e) => e.type === "travel")!;
  return travel.headingProfile!;
};

describe("a piecewise heading", () => {
  it.each([
    ["a linear turn", { heading: "linear", startDeg: 0, endDeg: 120 }, 120],
    ["a constant heading", { heading: "constant", degrees: 150 }, 150],
  ] as const)("follows %s as it would on its own", (_, alone, end) => {
    const own = headings(alone);
    const wrapped = headings({
      heading: "piecewise",
      segments: [{ tStart: 0, tEnd: 1, ...alone }],
    } as Partial<Point>);
    expect(wrapped).toHaveLength(own.length);
    wrapped.forEach((h, i) => expect(h).toBeCloseTo(own[i]!, 6));
    expect(wrapped.at(-1)).toBeCloseTo(end, 6);
  });
});
