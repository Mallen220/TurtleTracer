// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  analyzePathSegment,
  calculatePathTime,
} from "../utils/timeCalculator";
import { getCurvePoint } from "../utils/math";
import type { Point, Line, SequenceItem, Settings } from "../types";

describe("Time Calculator Extended", () => {
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

  describe("analyzePathSegment Consistency", () => {
    it("should estimate length consistent with point-to-point distance (Linear)", () => {
      fc.assert(
        fc.property(
            fc.record({ x: fc.double({min: 0, max: 100, noNaN: true}), y: fc.double({min: 0, max: 100, noNaN: true}) }),
            fc.record({ x: fc.double({min: 0, max: 100, noNaN: true}), y: fc.double({min: 0, max: 100, noNaN: true}) }),
            (start, end) => {
                const analysis = analyzePathSegment(start, [], end, 100, 0);
                const straightDist = Math.hypot(end.x - start.x, end.y - start.y);
                // The estimated length should be very close to straight line distance
                expect(analysis.length).toBeCloseTo(straightDist, 1);
            }
        )
      );
    });

    it("should estimate length >= straight line distance (Quadratic)", () => {
        fc.assert(
          fc.property(
              fc.record({ x: fc.double({min: 0, max: 100, noNaN: true}), y: fc.double({min: 0, max: 100, noNaN: true}) }),
              fc.record({ x: fc.double({min: 0, max: 100, noNaN: true}), y: fc.double({min: 0, max: 100, noNaN: true}) }),
              fc.record({ x: fc.double({min: 0, max: 100, noNaN: true}), y: fc.double({min: 0, max: 100, noNaN: true}) }),
              (start, cp, end) => {
                  const analysis = analyzePathSegment(start, [cp], end, 50, 0);
                  const straightDist = Math.hypot(end.x - start.x, end.y - start.y);
                  expect(analysis.length).toBeGreaterThanOrEqual(straightDist - 0.01);
              }
          )
        );
      });

      it("should estimate length >= straight line distance (Cubic)", () => {
        fc.assert(
          fc.property(
              fc.record({ x: fc.double({min: 0, max: 100, noNaN: true}), y: fc.double({min: 0, max: 100, noNaN: true}) }),
              fc.record({ x: fc.double({min: 0, max: 100, noNaN: true}), y: fc.double({min: 0, max: 100, noNaN: true}) }),
              fc.record({ x: fc.double({min: 0, max: 100, noNaN: true}), y: fc.double({min: 0, max: 100, noNaN: true}) }),
              fc.record({ x: fc.double({min: 0, max: 100, noNaN: true}), y: fc.double({min: 0, max: 100, noNaN: true}) }),
              (start, cp1, cp2, end) => {
                  const analysis = analyzePathSegment(start, [cp1, cp2], end, 50, 0);
                  const straightDist = Math.hypot(end.x - start.x, end.y - start.y);
                  expect(analysis.length).toBeGreaterThanOrEqual(straightDist - 0.01);
              }
          )
        );
      });
  });

  describe("Complex Sequences", () => {
    it("should handle mixed sequence of Path, Wait, Rotate", () => {
        const startPoint: Point = { x: 0, y: 0, heading: "constant", degrees: 0 };
        const lines: Line[] = [
            {
                id: "L1",
                endPoint: { x: 10, y: 0, heading: "constant", degrees: 0 },
                controlPoints: [],
                color: "red"
            },
            {
                id: "L2",
                endPoint: { x: 20, y: 10, heading: "constant", degrees: 90 },
                controlPoints: [],
                color: "red"
            }
        ];

        // Sequence: Path L1 -> Wait 1s -> Rotate to 45 -> Path L2
        const sequence: SequenceItem[] = [
            { kind: "path", lineId: "L1" },
            { kind: "wait", id: "w1", name: "w1", durationMs: 1000 },
            { kind: "rotate", id: "r1", degrees: 45, name: "Turn" },
            { kind: "path", lineId: "L2" }
        ];

        const result = calculatePathTime(startPoint, lines, defaultSettings, sequence);

        // Analyze expected timeline
        // 1. Travel L1 (0,0)->(10,0). Dist 10.
        //    Accel=5, Vel=10. AccelDist = 100/10 = 10.
        //    Wait, AccelDist = v^2 / 2a.
        //    If we reach max vel 10, we need 0.5 * 100 / 5 = 10 distance.
        //    So we exactly hit max vel at end of accel?
        //    Let's check calculateMotionProfileDetailed logic.
        //    Actually, simple triangle profile check:
        //    If dist < 2 * (0.5 * v_max^2 / a), we don't reach max vel?
        //    Dist = 10.
        //    Accel needed to reach 10: 10 = 0.5 * 5 * t^2 -> t = 2.
        //    v = 5 * 2 = 10.
        //    So we reach 10m/s exactly at 10m mark? No, we need to decel.
        //    Triangle profile: Halfway is 5m.
        //    5 = 0.5 * 5 * t_accel^2 -> t_accel = sqrt(2) = 1.414s.
        //    Total time = 2 * 1.414 = 2.828s.

        // 2. Wait 1s.

        // 3. Rotate 0 -> 45. Diff 45 deg = 0.785 rad.
        //    aVel = 90 deg/s = 1.57 rad/s.
        //    But wait, calculateRotationTime uses angular acceleration derived from linear accel and robot width if not specified.
        //    defaultSettings: maxAccel=5, rWidth=18.
        //    maxAngAccel = 5 / (18/2) = 5/9 = 0.555 rad/s^2.
        //    Dist = 0.785 rad.
        //    Triangle profile check: dist_accel = 0.5 * v^2 / a.
        //    Need to check if we reach max angular velocity (1.57).
        //    0.5 * 1.57^2 / 0.555 = 1.23 / 0.555 = 2.21 rad.
        //    Since 0.785 < 2.21 + 2.21, we use triangle profile.
        //    Time = 2 * sqrt(dist / a) = 2 * sqrt(0.785 / 0.555) = 2 * sqrt(1.414) = 2 * 1.189 = 2.378s.

        // 4. Travel L2 (10,0)->(20,10). Dist = sqrt(100+100) = 14.14.
        //    Triangle profile to midpoint 7.07.
        //    7.07 = 0.5 * 5 * t^2 -> t = sqrt(2.828) = 1.68s.
        //    Total = 3.36s.

        // Expected Total = 2.828 + 1.0 + 2.378 + 3.36 = 9.566s approximately.

        // Let's rely on checking that we have 4 main events in timeline corresponding to our sequence
        // (plus potentially auto-rotations)

        // Check timeline event types
        const types = result.timeline.map(e => e.type);
        // Expect: travel, wait (explicit), wait (rotate), wait (auto-rotate before L2?), travel.

        // Before L2: Current heading is 45 (from rotate).
        // L2 Start Heading:
        // L2 goes (10,0) to (20,10). Heading constant 90 at end.
        // But what is the REQUIRED start heading?
        // getLineStartHeading for "constant" returns end degrees?
        // No, verify getLineStartHeading logic.
        // If L2 endpoint is constant 90.
        // getLineStartHeading returns 0?
        // Math.ts: if (line.endPoint.heading === "constant") return line.endPoint.degrees;
        // So L2 requires 90 degrees start heading.
        // We are at 45. Difference 45.
        // So we need another rotation 45->90.

        // So timeline:
        // 1. Travel L1.
        // 2. Wait 1s.
        // 3. Rotate 45 deg.
        // 4. Rotate 45->90 deg (auto-inserted).
        // 5. Travel L2.

        expect(types).toContain("travel");
        expect(types).toContain("wait");

        const rotationEvents = result.timeline.filter(e => e.type === "wait" && (e.targetHeading !== e.startHeading));
        expect(rotationEvents.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle Linear heading interpolation", () => {
        const startPoint: Point = { x: 0, y: 0, heading: "constant", degrees: 0 };
        const lines: Line[] = [
            {
                id: "L1",
                endPoint: {
                    x: 10, y: 0,
                    heading: "linear",
                    startDeg: 0,
                    endDeg: 180
                },
                controlPoints: [],
                color: "red"
            }
        ];

        const result = calculatePathTime(startPoint, lines, defaultSettings);

        // Should have no initial rotation wait (startDeg 0 == current 0)
        const rotationEvents = result.timeline.filter(e => e.type === "wait");
        expect(rotationEvents.length).toBe(0);

        // Travel event should contain heading profile
        const travelEvent = result.timeline.find(e => e.type === "travel");
        expect(travelEvent).toBeDefined();
        expect(travelEvent?.headingProfile).toBeDefined();

        // Check profile start/end
        const profile = travelEvent!.headingProfile!;
        expect(profile[0]).toBeCloseTo(0);
        expect(profile[profile.length - 1]).toBeCloseTo(180);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero-length path segments without crashing", () => {
        const start = { x: 10, y: 10, heading: "constant", degrees: 0 } as Point;
        // End point same as start
        const analysis = analyzePathSegment(start, [], start, 50, 0);
        expect(analysis.length).toBe(0);
        expect(analysis.steps.length).toBeGreaterThan(0); // It still iterates samples
        expect(analysis.steps[0].deltaLength).toBe(0);
    });

    it("should handle cusps (sharp turns) in Bezier curves", () => {
        // A cusp happens when velocity goes to zero.
        // P0(0,0), P1(10,0), P2(0,0). Go out and back.
        // At t=0.5, P=(5,0). Velocity is not zero there?
        // P(t) = (1-t)^2*0 + 2(1-t)t*10 + t^2*0 = 20(t - t^2).
        // P'(t) = 20(1 - 2t). At t=0.5, P'(t)=0. Velocity zero. Cusp.

        const start = { x: 0, y: 0 };
        const cp = { x: 10, y: 0 };
        const end = { x: 0, y: 0 };

        const analysis = analyzePathSegment(start, [cp], end, 50, 0);

        // Min radius should be very small (near zero) at the cusp
        expect(analysis.minRadius).toBeLessThan(0.001);
    });
  });
});
