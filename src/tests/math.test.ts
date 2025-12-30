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
} from "../utils/math";

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
    it("calculates point on bezier curve", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 0 },
      ];
      // At t=0.5, a quadratic bezier with these points is at (10, 5)
      // P = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
      // P = 0.25*(0,0) + 0.5*(10,10) + 0.25*(20,0)
      // P = (0,0) + (5,5) + (5,0) = (10,5)
      const p = getCurvePoint(0.5, points);
      expect(p.x).toBeCloseTo(10);
      expect(p.y).toBeCloseTo(5);
    });
  });
});
