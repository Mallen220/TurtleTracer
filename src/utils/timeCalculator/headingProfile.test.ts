// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { calculatePathTime } from "./index";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import type { Line, Point, PiecewiseSegment } from "../../types";

const start: Point = { x: 10, y: 10, heading: "constant", degrees: 10 };

function finalHeading(endPoint: Point): number {
  const line: Line = {
    id: "a",
    endPoint,
    controlPoints: [],
    color: "red",
  };
  const { timeline } = calculatePathTime(start, [line], {
    ...DEFAULT_SETTINGS,
  });
  const profile = timeline.find((e) => e.type === "travel")!.headingProfile!;
  return profile.at(-1)!;
}

describe("heading profile", () => {
  it("turns a piecewise linear segment the short way, like a plain linear heading", () => {
    const segment: PiecewiseSegment = {
      tStart: 0,
      tEnd: 1,
      heading: "linear",
      startDeg: 10,
      endDeg: 350,
    };
    const piecewise = finalHeading({
      x: 100,
      y: 10,
      heading: "piecewise",
      segments: [segment],
    });
    const linear = finalHeading({
      x: 100,
      y: 10,
      heading: "linear",
      startDeg: 10,
      endDeg: 350,
    });
    expect(linear).toBeCloseTo(-10);
    expect(piecewise).toBeCloseTo(linear);
  });
});
