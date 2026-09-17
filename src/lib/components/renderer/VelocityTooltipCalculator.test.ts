// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { calculateVelocityTooltip } from "./VelocityTooltipCalculator";
import type { Line, Point } from "../../../types";

describe("VelocityTooltipCalculator", () => {
  const startPoint: Point = { x: 0, y: 0, heading: "tangential" };
  const lines: Line[] = [
    {
      id: "line-1",
      color: "#ff0000",
      endPoint: { x: 10, y: 0, heading: "tangential" },
      controlPoints: [],
    },
  ];

  it("returns visible: false when timeline is missing or empty", () => {
    expect(
      calculateVelocityTooltip({
        rawInchX: 5,
        rawInchY: 0,
        lines,
        startPoint,
        timeline: [],
        clientX: 100,
        clientY: 200,
      }),
    ).toEqual({ visible: false });

    expect(
      calculateVelocityTooltip({
        rawInchX: 5,
        rawInchY: 0,
        lines,
        startPoint,
        timeline: undefined,
        clientX: 100,
        clientY: 200,
      }),
    ).toEqual({ visible: false });
  });

  it("returns visible: false when point is too far from line (snapThreshold)", () => {
    const timeline = [
      {
        type: "travel",
        lineIndex: 0,
        startTime: 0,
        duration: 2,
        velocityProfile: [10, 20, 30],
      },
    ];

    const result = calculateVelocityTooltip({
      rawInchX: 5,
      rawInchY: 10, // 10 inches away, well beyond 0.5 snap threshold
      lines,
      startPoint,
      timeline,
      clientX: 100,
      clientY: 200,
      snapThreshold: 0.5,
    });

    expect(result.visible).toBe(false);
  });

  it("calculates tooltip values when close to line", () => {
    const timeline = [
      {
        type: "travel",
        lineIndex: 0,
        startTime: 1,
        duration: 2,
        velocityProfile: [10, 20, 30],
      },
    ];

    // Midpoint: (5, 0.1) is 0.1 inch away from y=0
    const result = calculateVelocityTooltip({
      rawInchX: 5,
      rawInchY: 0.1,
      lines,
      startPoint,
      timeline,
      clientX: 150,
      clientY: 250,
      snapThreshold: 0.5,
    });

    expect(result.visible).toBe(true);
    expect(result.x).toBe(150);
    expect(result.y).toBe(250);
    expect(result.velocity).toBe(20);
    expect(result.time).toBeCloseTo(2); // 1 + 0.5 * 2 = 2
    expect(result.distance).toBeCloseTo(5); // 0 + 10 * 0.5 = 5
  });
});
