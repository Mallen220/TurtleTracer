// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { analyzePathSegment, calculatePathTime } from "../utils/timeCalculator";
import { getCurvePoint } from "../utils/math";
import type { Point, Line, SequenceItem, Settings } from "../types";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";
import type {
  SequencePathItem,
  SequenceWaitItem,
  SequenceRotateItem,
} from "../types";

beforeEach(() => {
  actionRegistry.reset();
  registerCoreUI();
});

const pathKind = (): SequencePathItem["kind"] =>
  (actionRegistry.getAll().find((a) => a.isPath)
    ?.kind as SequencePathItem["kind"]) ?? "path";
const waitKind = (): SequenceWaitItem["kind"] =>
  (actionRegistry.getAll().find((a) => a.isWait)
    ?.kind as SequenceWaitItem["kind"]) ?? "wait";
const rotateKind = (): SequenceRotateItem["kind"] =>
  (actionRegistry.getAll().find((a) => a.isRotate)
    ?.kind as SequenceRotateItem["kind"]) ?? "rotate";

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
          fc.record({
            x: fc.double({ min: 0, max: 100, noNaN: true }),
            y: fc.double({ min: 0, max: 100, noNaN: true }),
          }),
          fc.record({
            x: fc.double({ min: 0, max: 100, noNaN: true }),
            y: fc.double({ min: 0, max: 100, noNaN: true }),
          }),
          (start, end) => {
            const analysis = analyzePathSegment(start, [], end, 100, 0);
            const straightDist = Math.hypot(end.x - start.x, end.y - start.y);
            // The estimated length should be very close to straight line distance
            expect(analysis.length).toBeCloseTo(straightDist, 1);
          },
        ),
      );
    });

    it("should estimate length >= straight line distance (Quadratic)", () => {
      fc.assert(
        fc.property(
          fc.record({
            x: fc.double({ min: 0, max: 100, noNaN: true }),
            y: fc.double({ min: 0, max: 100, noNaN: true }),
          }),
          fc.record({
            x: fc.double({ min: 0, max: 100, noNaN: true }),
            y: fc.double({ min: 0, max: 100, noNaN: true }),
          }),
          fc.record({
            x: fc.double({ min: 0, max: 100, noNaN: true }),
            y: fc.double({ min: 0, max: 100, noNaN: true }),
          }),
          (start, cp, end) => {
            const analysis = analyzePathSegment(start, [cp], end, 50, 0);
            const straightDist = Math.hypot(end.x - start.x, end.y - start.y);
            expect(analysis.length).toBeGreaterThanOrEqual(straightDist - 0.01);
          },
        ),
      );
    });

    it("should estimate length >= straight line distance (Cubic)", () => {
      fc.assert(
        fc.property(
          fc.record({
            x: fc.double({ min: 0, max: 100, noNaN: true }),
            y: fc.double({ min: 0, max: 100, noNaN: true }),
          }),
          fc.record({
            x: fc.double({ min: 0, max: 100, noNaN: true }),
            y: fc.double({ min: 0, max: 100, noNaN: true }),
          }),
          fc.record({
            x: fc.double({ min: 0, max: 100, noNaN: true }),
            y: fc.double({ min: 0, max: 100, noNaN: true }),
          }),
          fc.record({
            x: fc.double({ min: 0, max: 100, noNaN: true }),
            y: fc.double({ min: 0, max: 100, noNaN: true }),
          }),
          (start, cp1, cp2, end) => {
            const analysis = analyzePathSegment(start, [cp1, cp2], end, 50, 0);
            const straightDist = Math.hypot(end.x - start.x, end.y - start.y);
            expect(analysis.length).toBeGreaterThanOrEqual(straightDist - 0.01);
          },
        ),
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
          color: "red",
        },
        {
          id: "L2",
          endPoint: { x: 20, y: 10, heading: "constant", degrees: 90 },
          controlPoints: [],
          color: "red",
        },
      ];

      // Sequence: Path L1 -> Wait 1s -> Rotate to 45 -> Path L2
      const sequence: SequenceItem[] = [
        { kind: pathKind(), lineId: "L1" },
        { kind: waitKind(), id: "w1", name: "w1", durationMs: 1000 },
        { kind: rotateKind(), id: "r1", degrees: 45, name: "Turn" },
        { kind: pathKind(), lineId: "L2" },
      ];

      const result = calculatePathTime(
        startPoint,
        lines,
        defaultSettings,
        sequence,
      );

      // Check timeline event types
      const types = result.timeline.map((e) => e.type);
      // Expect: travel, wait (explicit), wait (rotate), wait (auto-rotate before L2?), travel.

      expect(types).toContain("travel");
      expect(types).toContain("wait");

      const rotationEvents = result.timeline.filter(
        (e) => e.type === "wait" && e.targetHeading !== e.startHeading,
      );
      expect(rotationEvents.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle Linear heading interpolation", () => {
      const startPoint: Point = { x: 0, y: 0, heading: "constant", degrees: 0 };
      const lines: Line[] = [
        {
          id: "L1",
          endPoint: {
            x: 10,
            y: 0,
            heading: "linear",
            startDeg: 0,
            endDeg: 180,
          },
          controlPoints: [],
          color: "red",
        },
      ];

      const result = calculatePathTime(startPoint, lines, defaultSettings);

      // Should have no initial rotation wait (startDeg 0 == current 0)
      const rotationEvents = result.timeline.filter((e) => e.type === "wait");
      expect(rotationEvents.length).toBe(0);

      // Travel event should contain heading profile
      const travelEvent = result.timeline.find((e) => e.type === "travel");
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
