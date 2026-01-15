// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  calculatePathTime,
  formatTime,
  analyzePathSegment,
} from "../utils/timeCalculator";
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
    // With restored acceleration logic:
    // maxAccel = 5, rWidth = 18 => maxAngAccel = 5 / 9 = 0.555 rad/s^2
    // Angle = 90 deg = 1.57 rad.
    // Triangle profile: t = 2 * sqrt(dist / a) = 2 * sqrt(1.57 / 0.555) = 2 * 1.68 = 3.36s.
    // NOTE: This confirms we are back to physics-based logic (acceleration limited).
    expect(rotationEvents[0].duration).toBeCloseTo(3.36, 1);
  });

  it("calculates rotation time with user-defined maxAngularAcceleration", () => {
    const customSettings: Settings = {
      ...defaultSettings,
      maxAngularAcceleration: 10, // High acceleration!
    };

    const diffDegrees = 90;
    const diffRad = diffDegrees * (Math.PI / 180);
    // maxVel = PI/2 = 1.57 rad/s
    // maxAccel = 10 rad/s^2
    // Time to reach maxVel: 1.57 / 10 = 0.157s.
    // Dist to reach: 0.5 * 10 * 0.157^2 = 0.123 rad.
    // Total accel+decel dist = 0.246 rad.
    // Total dist = 1.57 rad.
    // Trapezoid profile!
    // t_accel = 0.157s.
    // t_decel = 0.157s.
    // dist_const = 1.57 - 0.246 = 1.324.
    // t_const = 1.324 / 1.57 = 0.843s.
    // Total = 0.157 + 0.157 + 0.843 = 1.157s.

    // Let's create a fake timeline test or call calculateRotationTime directly if exported?
    // It's not exported. So we use calculatePathTime with a rotate sequence.

    const lines: Line[] = [
      {
        id: "line1",
        endPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
        controlPoints: [],
        color: "#fff",
      },
    ];
    const sequence: SequenceItem[] = [
        { kind: "rotate", id: "rot1", name: "Rotate", degrees: 90 }
    ];

    // Need to set initial heading to 0.
    const startPoint: Point = { x: 0, y: 0, heading: "constant", degrees: 0 };

    const result = calculatePathTime(startPoint, lines, customSettings, sequence);
    const rotationEvents = result.timeline.filter(e => e.waitId === "rot1");
    expect(rotationEvents.length).toBe(1);
    expect(rotationEvents[0].duration).toBeCloseTo(1.157, 2);
  });

  describe("analyzePathSegment", () => {
    it("should return correct steps for a linear path", () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 0 };
      const controlPoints: Point[] = [];
      const headingConfig = { heading: "constant", degrees: 0 } as any;

      const steps = analyzePathSegment(
        p1,
        controlPoints, // Corrected signature: p1, cps, p2
        p2,
        50, // samples
        0, // initialHeading
      );

      // Should have steps covering the distance 10
      // 50 samples = 50 intervals.
      // steps array has length 50 (i=1 to 50)
      expect(steps.steps.length).toBe(50);
      expect(steps.length).toBeCloseTo(10);
    });

    it("should calculate curvature for bezier", () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 10 };
      const controlPoints = [{ x: 10, y: 0 }]; // Quadratic bezier
      const headingConfig = { heading: "constant", degrees: 0 } as any;

      const steps = analyzePathSegment(
        p1,
        controlPoints, // Corrected signature
        p2,
        50,
        0,
      );

      expect(steps.steps.length).toBe(50);
      // Midpoint curvature should be non-zero
      const midStep = steps.steps[Math.floor(steps.steps.length / 2)];
      // For a quadratic bezier with P0(0,0), P1(10,0), P2(10,10)
      // At t=0.5, P=(7.5, 2.5) -> No, P=(0.25*0 + 0.5*10 + 0.25*10, ...) = (7.5, 2.5)
      // Curvature is non-zero.
      expect(midStep.radius).toBeGreaterThan(0);
    });
  });
});
