// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { updateCurrentHeading } from "../lib/macroUtils";
import type { Line, Point } from "../types";

describe("updateCurrentHeading", () => {
  it("returns tangent correctly when heading is tangential", () => {
    const line: Line = {
      id: "l1",
      endPoint: { x: 10, y: 10, heading: "tangential", reverse: false },
      controlPoints: [],
      color: "red",
    };
    const currentPoint: Point = {
      x: 0,
      y: 0,
      heading: "linear",
      startDeg: 0,
      endDeg: 0,
    };
    const currentHeading = 0;
    // from 0,0 to 10,10 the angle is 45 degrees
    const updated = updateCurrentHeading(line, currentPoint, currentHeading);
    expect(updated).toBe(45);
  });

  it("returns endPoint.degrees when heading is constant", () => {
    const line: Line = {
      id: "l2",
      endPoint: { x: 10, y: 10, heading: "constant", degrees: 135 },
      controlPoints: [],
      color: "blue",
    };
    const currentPoint: Point = {
      x: 0,
      y: 0,
      heading: "linear",
      startDeg: 0,
      endDeg: 0,
    };
    const currentHeading = 45;
    const updated = updateCurrentHeading(line, currentPoint, currentHeading);
    expect(updated).toBe(135);
  });

  it("returns endPoint.endDeg when heading is linear", () => {
    const line: Line = {
      id: "l3",
      endPoint: {
        x: 10,
        y: 10,
        heading: "linear",
        startDeg: 90,
        endDeg: 180,
      },
      controlPoints: [],
      color: "green",
    };
    const currentPoint: Point = {
      x: 0,
      y: 0,
      heading: "linear",
      startDeg: 0,
      endDeg: 0,
    };
    const currentHeading = 45;
    const updated = updateCurrentHeading(line, currentPoint, currentHeading);
    expect(updated).toBe(180);
  });

  it("returns currentHeading when heading is unrecognized", () => {
    // Cast to any to simulate an invalid/unrecognized heading type
    const line = {
      id: "l4",
      endPoint: { x: 10, y: 10, heading: "unrecognized" },
      controlPoints: [],
      color: "yellow",
    } as any;
    const currentPoint: Point = {
      x: 0,
      y: 0,
      heading: "linear",
      startDeg: 0,
      endDeg: 0,
    };
    const currentHeading = 45;
    const updated = updateCurrentHeading(line, currentPoint, currentHeading);
    expect(updated).toBe(45);
  });
});
