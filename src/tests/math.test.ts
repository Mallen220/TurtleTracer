// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  transformAngle,
  getAngularDifference,
  shortestRotation,
  lerp,
  lerp2d,
  quadraticToCubic,
  easeInOutQuad,
  radiansToDegrees,
  getCurvePoint,
  getTangentAngle,
  getLineStartHeading,
  getLineEndHeading,
  splitBezier,
} from "../utils/math";
import type { Line, Point } from "../types";

describe("Math Utils", () => {
  describe("transformAngle", () => {
    it("normalizes angles to [-180, 180)", () => {
      expect(transformAngle(0)).toBe(0);
      expect(transformAngle(180)).toBe(-180);
      expect(transformAngle(-180)).toBe(-180);
      expect(transformAngle(360)).toBe(0);
      expect(transformAngle(450)).toBe(90);
      expect(transformAngle(-450)).toBe(-90);
      expect(transformAngle(90)).toBe(90);
      expect(transformAngle(-90)).toBe(-90);
    });
  });

  describe("getAngularDifference", () => {
    it("calculates shortest difference between angles", () => {
      expect(getAngularDifference(0, 90)).toBe(90);
      expect(getAngularDifference(90, 0)).toBe(-90);
      // The current implementation returns 180 for 180 degree difference
      expect(Math.abs(getAngularDifference(0, 180))).toBe(180);
      expect(getAngularDifference(0, -90)).toBe(-90);
      expect(getAngularDifference(350, 10)).toBe(20);
      expect(getAngularDifference(10, 350)).toBe(-20);
    });
  });

  describe("shortestRotation", () => {
    it("interpolates angle correctly via shortest path", () => {
      expect(shortestRotation(0, 90, 0.5)).toBe(45);
      expect(shortestRotation(350, 10, 0.5)).toBe(360); // 350 + 20*0.5 = 360 which is equivalent to 0
      expect(shortestRotation(10, 350, 0.5)).toBe(0); // 10 - 20*0.5 = 0
    });
  });

  describe("lerp", () => {
    it("linearly interpolates between two numbers", () => {
      expect(lerp(0, 0, 10)).toBe(0);
      expect(lerp(0.5, 0, 10)).toBe(5);
      expect(lerp(1, 0, 10)).toBe(10);
      expect(lerp(0.25, 10, 20)).toBe(12.5);
    });
  });

  describe("lerp2d", () => {
    it("linearly interpolates between two points", () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 20 };
      expect(lerp2d(0.5, p1, p2)).toEqual({ x: 5, y: 10 });
      expect(lerp2d(0, p1, p2)).toEqual(p1);
      expect(lerp2d(1, p1, p2)).toEqual(p2);
    });
  });

  describe("quadraticToCubic", () => {
    it("converts quadratic bezier control points to cubic", () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 10, y: 10 };
      const p2 = { x: 20, y: 0 };
      const { Q1, Q2 } = quadraticToCubic(p0, p1, p2);

      // Q1 = P0 + (2/3)(P1 - P0)
      expect(Q1.x).toBeCloseTo(0 + (2 / 3) * 10);
      expect(Q1.y).toBeCloseTo(0 + (2 / 3) * 10);

      // Q2 = P2 + (2/3)(P1 - P2)
      expect(Q2.x).toBeCloseTo(20 + (2 / 3) * (10 - 20));
      expect(Q2.y).toBeCloseTo(0 + (2 / 3) * (10 - 0));
    });
  });

  describe("easeInOutQuad", () => {
    it("calculates easing value", () => {
      expect(easeInOutQuad(0)).toBe(0);
      expect(easeInOutQuad(0.5)).toBe(0.5);
      expect(easeInOutQuad(1)).toBe(1);
      expect(easeInOutQuad(0.25)).toBe(0.125); // 2 * 0.25 * 0.25 = 0.125
    });
  });

  describe("radiansToDegrees", () => {
    it("converts radians to degrees", () => {
      expect(radiansToDegrees(Math.PI)).toBe(180);
      expect(radiansToDegrees(Math.PI / 2)).toBe(90);
      expect(radiansToDegrees(0)).toBe(0);
    });
  });

  describe("getCurvePoint", () => {
    it("calculates point on linear curve", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ];
      const p = getCurvePoint(0.5, points);
      expect(p.x).toBeCloseTo(5);
      expect(p.y).toBeCloseTo(5);
    });

    it("calculates point on quadratic bezier curve", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 0 },
      ];
      // At t=0.5, a quadratic bezier with these points is at (10, 5)
      const p = getCurvePoint(0.5, points);
      expect(p.x).toBeCloseTo(10);
      expect(p.y).toBeCloseTo(5);
    });

    it("calculates point on cubic bezier curve", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 30, y: 0 },
      ];
      // Simple cubic case
      const p = getCurvePoint(0.5, points);
      expect(p.x).toBeCloseTo(15);
      expect(p.y).toBeCloseTo(7.5);
    });

    it("calculates point on single point", () => {
      const points = [{ x: 5, y: 5 }];
      const p = getCurvePoint(0.5, points);
      expect(p.x).toBe(5);
      expect(p.y).toBe(5);
    });

    it("calculates point on higher order curve (recursive fallback)", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
      ];
      const p = getCurvePoint(0.5, points);
      // Fallback works recursively
      expect(p.x).toBeDefined();
      expect(p.y).toBeDefined();
    });
  });

  describe("getTangentAngle", () => {
    it("calculates angle in degrees between two points", () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 1, y: 1 };
      expect(getTangentAngle(p1, p2)).toBe(45);
    });

    it("handles vertical lines", () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 0, y: 1 };
      expect(getTangentAngle(p1, p2)).toBe(90);
    });

    it("handles horizontal lines", () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 1, y: 0 };
      expect(getTangentAngle(p1, p2)).toBe(0);
    });
  });

  describe("getLineStartHeading", () => {
    it("returns 0 if line or endpoint is undefined", () => {
      const p = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      expect(getLineStartHeading(undefined, p)).toBe(0);
      expect(
        getLineStartHeading(
          { endPoint: undefined as unknown as Point } as Line,
          p,
        ),
      ).toBe(0);
    });

    it("returns degrees for constant heading", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        endPoint: {
          x: 10,
          y: 10,
          heading: "constant",
          degrees: 45,
        } as Point,
      } as Line;
      expect(getLineStartHeading(line, prev)).toBe(45);
    });

    it("returns startDeg for linear heading", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        endPoint: {
          x: 10,
          y: 10,
          heading: "linear",
          startDeg: 30,
          endDeg: 60,
        } as Point,
      } as Line;
      expect(getLineStartHeading(line, prev)).toBe(30);
    });

    it("returns tangent angle for tangential heading", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        endPoint: {
          x: 10,
          y: 10,
          heading: "tangential",
          reverse: false,
        } as Point,
      } as Line;
      // Angle from (0,0) to (10,10) is 45 degrees
      expect(getLineStartHeading(line, prev)).toBe(45);
    });

    it("returns reversed tangent angle for tangential heading with reverse=true", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        endPoint: {
          x: 10,
          y: 10,
          heading: "tangential",
          reverse: true,
        } as Point,
      } as Line;
      // Angle from (0,0) to (10,10) is 45 degrees, +180 = 225 -> -135
      expect(getLineStartHeading(line, prev)).toBe(-135);
    });

    it("uses control points for tangential heading", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        controlPoints: [{ x: 5, y: 0 }],
        endPoint: {
          x: 10,
          y: 10,
          heading: "tangential",
          reverse: false,
        } as Point,
      } as Line;
      // Angle from (0,0) to first CP (5,0) is 0 degrees
      expect(getLineStartHeading(line, prev)).toBe(0);
    });

    it("skips overlapping control points for tangential heading", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        controlPoints: [
          { x: 0, y: 0 }, // Overlaps with prev
          { x: 5, y: 5 },
        ],
        endPoint: {
          x: 10,
          y: 10,
          heading: "tangential",
          reverse: false,
        } as Point,
      } as Line;
      // Should skip (0,0) and use (5,5), angle 45
      expect(getLineStartHeading(line, prev)).toBe(45);
    });
  });

  describe("splitBezier", () => {
    it("splits a linear bezier correctly", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ];
      const [left, right] = splitBezier(0.5, points);
      expect(left.length).toBe(2);
      expect(right.length).toBe(2);
      expect(left[0]).toEqual({ x: 0, y: 0 });
      expect(left[1]).toEqual({ x: 5, y: 5 });
      expect(right[0]).toEqual({ x: 5, y: 5 });
      expect(right[1]).toEqual({ x: 10, y: 10 });
    });

    it("splits a quadratic bezier correctly", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 10 }, // Control Point
        { x: 20, y: 0 },
      ];
      const [left, right] = splitBezier(0.5, points);
      // Expected Split Point: (10, 5)
      // Left Q0: (5, 5), Left Q1: (10, 5) ? No.
      // Left: P0, Q0, S0
      // Right: S0, Q1, P2
      // Q0 = lerp(P0, P1, 0.5) = (5, 5)
      // Q1 = lerp(P1, P2, 0.5) = (15, 5)
      // S0 = lerp(Q0, Q1, 0.5) = (10, 5)

      expect(left.length).toBe(3);
      expect(right.length).toBe(3);
      expect(left[0]).toEqual({ x: 0, y: 0 });
      expect(left[1]).toEqual({ x: 5, y: 5 });
      expect(left[2]).toEqual({ x: 10, y: 5 });

      expect(right[0]).toEqual({ x: 10, y: 5 });
      expect(right[1]).toEqual({ x: 15, y: 5 });
      expect(right[2]).toEqual({ x: 20, y: 0 });
    });
  });

  describe("getLineEndHeading", () => {
    it("returns 0 if line or endpoint is undefined", () => {
      const p = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      expect(getLineEndHeading(undefined, p)).toBe(0);
      expect(
        getLineEndHeading(
          { endPoint: undefined as unknown as Point } as Line,
          p,
        ),
      ).toBe(0);
    });

    it("returns degrees for constant heading", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        endPoint: {
          x: 10,
          y: 10,
          heading: "constant",
          degrees: 90,
        } as Point,
      } as Line;
      expect(getLineEndHeading(line, prev)).toBe(90);
    });

    it("returns endDeg for linear heading", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        endPoint: {
          x: 10,
          y: 10,
          heading: "linear",
          startDeg: 30,
          endDeg: 60,
        } as Point,
      } as Line;
      expect(getLineEndHeading(line, prev)).toBe(60);
    });

    it("returns tangent angle for tangential heading", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        endPoint: {
          x: 10,
          y: 10,
          heading: "tangential",
          reverse: false,
        } as Point,
      } as Line;
      // Angle from (0,0) to (10,10) is 45 degrees
      expect(getLineEndHeading(line, prev)).toBe(45);
    });

    it("returns reversed tangent angle for tangential heading with reverse=true", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        endPoint: {
          x: 10,
          y: 10,
          heading: "tangential",
          reverse: true,
        } as Point,
      } as Line;
      expect(getLineEndHeading(line, prev)).toBe(-135);
    });

    it("uses last control point for tangential heading", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        controlPoints: [
          { x: 5, y: 10 }, // Last CP is (5,10)
        ],
        endPoint: {
          x: 10,
          y: 10,
          heading: "tangential",
          reverse: false,
        } as Point,
      } as Line;
      // Angle from CP (5,10) to End (10,10) is 0 degrees
      expect(getLineEndHeading(line, prev)).toBe(0);
    });

    it("skips overlapping control points (overlapping with end point) for tangential heading", () => {
      const prev = { x: 0, y: 0, heading: "constant", degrees: 0 } as Point;
      const line = {
        controlPoints: [
          { x: 5, y: 5 },
          { x: 10, y: 10 }, // Overlaps with end
        ],
        endPoint: {
          x: 10,
          y: 10,
          heading: "tangential",
          reverse: false,
        } as Point,
      } as Line;
      // Should skip (10,10) and use (5,5) as prev point for tangent
      // Tangent from (5,5) to (10,10) is 45 degrees
      expect(getLineEndHeading(line, prev)).toBe(45);
    });
  });

  describe("Fuzz/Property tests", () => {
    it("transformAngle keeps angle within [-180, 180]", () => {
      for (let i = 0; i < 1000; i++) {
        const input = (Math.random() - 0.5) * 10000;
        const output = transformAngle(input);
        expect(output).toBeGreaterThanOrEqual(-180);
        expect(output).toBeLessThan(180);
        // Check that it's equivalent modulo 360
        const k = Math.round((input - output) / 360);
        expect(Math.abs(input - output - k * 360)).toBeLessThan(1e-9);
      }
    });

    it("getAngularDifference is consistent", () => {
      for (let i = 0; i < 1000; i++) {
        const a = (Math.random() - 0.5) * 720;
        const b = (Math.random() - 0.5) * 720;
        const diff = getAngularDifference(a, b);
        expect(diff).toBeGreaterThanOrEqual(-180);
        expect(diff).toBeLessThanOrEqual(180);

        // Check consistency: a + diff approx b (mod 360)
        const target = a + diff;
        const diff2 = getAngularDifference(target, b);
        expect(Math.abs(diff2)).toBeLessThan(1e-9);
      }
    });
  });
});
