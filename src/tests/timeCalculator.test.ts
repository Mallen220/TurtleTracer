// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { calculatePathTime, formatTime } from "../utils/timeCalculator";
import type { Point, Line, Settings, SequenceItem } from "../types";

describe("Time Calculator", () => {
  const defaultSettings: Settings = {
    xVelocity: 10,
    yVelocity: 10,
    aVelocity: Math.PI / 2, // 90 degrees per second
    maxVelocity: 10,
    maxAcceleration: 5,
    maxDeceleration: 5,
    fieldMap: "decode.webp",
    kFriction: 0.4,
    rLength: 18,
    rWidth: 18,
    safetyMargin: 1,
    theme: "auto",
  };

  const startPoint: Point = {
    x: 0,
    y: 0,
    heading: "constant",
    degrees: 0,
  };

  it("calculates travel time correctly for a simple line", () => {
    const lines: Line[] = [
      {
        id: "line1",
        endPoint: {
          x: 10,
          y: 0,
          heading: "constant",
          degrees: 0,
        },
        controlPoints: [],
        color: "#fff",
      },
    ];

    const result = calculatePathTime(startPoint, lines, defaultSettings);
    // 2.828 was for previous logic. With motion profile (accel=5, vel=10).
    // Dist 10. Accel Dist = 100 / 10 = 10.
    // Triangle profile. vPeak = sqrt(2*5*5) = 7.07.
    // Time = 7.07/5 * 2 = 2.828.
    // Correct.
    expect(result.totalTime).toBeCloseTo(2.828, 2);
  });

  it("formats time correctly", () => {
    expect(formatTime(1.5)).toBe("1.500s");
    expect(formatTime(65.123)).toBe("1:05.123s");
    expect(formatTime(0)).toBe("0.000s");
  });

  it("handles wait commands", () => {
    const lines: Line[] = [
      {
        id: "line1",
        endPoint: {
          x: 10,
          y: 0,
          heading: "constant",
          degrees: 0,
        },
        controlPoints: [],
        color: "#fff",
      },
    ];

    const sequence: SequenceItem[] = [
      { kind: "path", lineId: "line1" },
      { kind: "wait", durationMs: 1000, name: "wait1", id: "wait1" },
    ];

    const result = calculatePathTime(
      startPoint,
      lines,
      defaultSettings,
      sequence,
    );
    expect(result.totalTime).toBeCloseTo(3.828, 2);
  });

  it("calculates rotation time", () => {
    // We need to trigger the rotation logic:
    // if (diff > 0.1) ...
    // diff = abs(getAngularDifference(currentHeading, requiredStartHeading))

    // Line 1: Ends at (10,0) with heading 0.
    // Line 2: Starts at (10,0) and goes to (10,10).
    // Tangent is 90 deg.
    // We set Line 2 endPoint heading to 'tangential'.

    const lines: Line[] = [
      {
        id: "line1",
        endPoint: {
          x: 10,
          y: 0,
          heading: "constant",
          degrees: 0,
        },
        controlPoints: [],
        color: "#fff",
      },
      {
        id: "line2",
        endPoint: {
          x: 10,
          y: 10,
          heading: "tangential",
          reverse: false,
        },
        controlPoints: [],
        color: "#fff",
      },
    ];

    // Explicitly define sequence to ensure order
    const sequence: SequenceItem[] = [
      { kind: "path", lineId: "line1" },
      { kind: "path", lineId: "line2" },
    ];

    const result = calculatePathTime(
      startPoint,
      lines,
      defaultSettings,
      sequence,
    );

    // Check timeline for wait type without waitId (auto-generated rotation wait)
    const rotationEvents = result.timeline.filter(
      (e) => e.type === "wait" && !e.waitId,
    );

    expect(rotationEvents.length).toBeGreaterThan(0);
    // With angular acceleration logic (maxAccel=5, rWidth=18 -> alpha=0.55),
    // time to rotate 90 deg (1.57 rad) is ~3.36s (triangle profile).
    expect(rotationEvents[0].duration).toBeCloseTo(3.36, 1);
  });
});
