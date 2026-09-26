// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { calculatePathTime, startingHeading } from "../utils/timeCalculator";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line, Point } from "../types";

const settings = { ...DEFAULT_SETTINGS, aVelocity: 1 }; // about 57 degrees/s

describe("path timing", () => {
  it("times a linear heading by the turn it actually makes", () => {
    // 170 to -170 is a 20 degree turn across the back, not 340 degrees.
    const start: Point = { x: 72, y: 72, heading: "constant", degrees: 170 };
    const lines: Line[] = [
      {
        id: "a",
        endPoint: {
          x: 74,
          y: 72,
          heading: "linear",
          startDeg: 170,
          endDeg: -170,
        },
        controlPoints: [],
        color: "#fff",
      },
    ];
    const { totalTime } = calculatePathTime(start, lines, settings, [
      { kind: "path", lineId: "a" },
    ]);
    expect(totalTime).toBeLessThan(2);
  });

  it("starts a tangential start point facing the first path driven", () => {
    const start: Point = {
      x: 72,
      y: 72,
      heading: "tangential",
      reverse: false,
    };
    const east: Line = {
      id: "east",
      endPoint: { x: 100, y: 72, heading: "tangential", reverse: false },
      controlPoints: [],
      color: "#fff",
    };
    const north: Line = {
      id: "north",
      endPoint: { x: 72, y: 100, heading: "tangential", reverse: false },
      controlPoints: [],
      color: "#fff",
    };
    // The sequence drives north first, although east is first in the list.
    expect(
      startingHeading(
        start,
        [east, north],
        [
          { kind: "path", lineId: "north" },
          { kind: "path", lineId: "east" },
        ],
      ),
    ).toBeCloseTo(90);
  });
});
