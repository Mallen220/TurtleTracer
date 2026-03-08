// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  pointInPolygon,
  minDistanceToPolygon,
  pointToLineDistance,
  polygonCenter,
  getRobotCorners,
  convexHull,
} from "../utils/geometry";

describe("Geometry Utils", () => {
  describe("pointInPolygon", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    it("returns true for point inside polygon", () => {
      expect(pointInPolygon([5, 5], square)).toBe(true);
    });

    it("returns false for point outside polygon", () => {
      expect(pointInPolygon([15, 5], square)).toBe(false);
      expect(pointInPolygon([5, 15], square)).toBe(false);
    });

    it("should handle ray casting edge cases gracefully", () => {
      // Points on vertices
      // In the ray casting algorithm implementation:
      // yi > y !== yj > y
      // (0,0) -> y=0. yi=0, yj=0/10.
      // It's brittle on vertices/edges.
      // The implementation considers strictly greater for Y check.
      // Let's document current behavior rather than enforcing 'false'.
      // If it returns true for [0,0], that's fine as long as consistent.
      // But [10,10] might be false.

      // Actually, ray casting is usually exclusive of edges/vertices depending on exact logic.
      // Current implementation:
      // intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      // If point is [0,0]. y=0.
      // Edge (0,0)-(10,0). yi=0, yj=0. yi>y (0>0) False. yj>y False. False.
      // Edge (10,0)-(10,10). yi=0, yj=10. yi>0 False. yj>0 True. Intersect potential.
      // x < ...?
      // x=0.
      // ((10-10)*(0-0))/(10-0) + 10 = 0/10 + 10 = 10.
      // 0 < 10. True.
      // So it intersects edge (10,0)-(10,10). One intersection -> Inside (True).

      // So [0,0] is considered Inside.

      expect(pointInPolygon([0, 0], square)).toBe(true);
    });
  });

  describe("pointToLineDistance", () => {
    it("calculates distance to line segment", () => {
      // Line from (0,0) to (10,0)
      const start = [0, 0];
      const end = [10, 0];

      // Point at (5, 5) -> distance 5
      expect(pointToLineDistance([5, 5], start, end)).toBe(5);

      // Point at (-5, 0) -> distance 5 (to start point)
      expect(pointToLineDistance([-5, 0], start, end)).toBe(5);

      // Point at (15, 0) -> distance 5 (to end point)
      expect(pointToLineDistance([15, 0], start, end)).toBe(5);
    });

    it("should return 0 for points on the line segment", () => {
      const start = [0, 0];
      const end = [10, 10];
      expect(pointToLineDistance([5, 5], start, end)).toBeCloseTo(0);
    });
  });

  describe("minDistanceToPolygon", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    it("calculates minimum distance to any edge", () => {
      // Point at (5, 15) -> distance to top edge (0,10)-(10,10) is 5
      expect(minDistanceToPolygon([5, 15], square)).toBe(5);

      // Point at (-5, 5) -> distance to left edge (0,0)-(0,10) is 5
      expect(minDistanceToPolygon([-5, 5], square)).toBe(5);

      // Point inside (5,5) -> distance to closest edge
      expect(minDistanceToPolygon([5, 5], square)).toBe(5);
    });
  });

  describe("polygonCenter", () => {
    it("calculates centroid of polygon", () => {
      const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const center = polygonCenter(square);
      expect(center[0]).toBe(5);
      expect(center[1]).toBe(5);
    });
  });

  describe("getRobotCorners", () => {
    it("calculates corners for unrotated robot", () => {
      const corners = getRobotCorners(0, 0, 0, 10, 6);
      expect(corners).toHaveLength(4);
      expect(corners).toContainEqual({ x: -5, y: -3 });
      expect(corners).toContainEqual({ x: 5, y: -3 });
      expect(corners).toContainEqual({ x: 5, y: 3 });
      expect(corners).toContainEqual({ x: -5, y: 3 });
    });

    it("calculates corners for rotated robot (90 deg)", () => {
      const corners = getRobotCorners(0, 0, 90, 10, 6);
      const roundedCorners = corners.map((c) => ({
        x: Math.round(c.x),
        y: Math.round(c.y),
      }));
      expect(roundedCorners).toContainEqual({ x: 3, y: 5 });
      expect(roundedCorners).toContainEqual({ x: -3, y: 5 });
      expect(roundedCorners).toContainEqual({ x: -3, y: -5 });
      expect(roundedCorners).toContainEqual({ x: 3, y: -5 });
    });
  });

  describe("convexHull", () => {
    it("returns convex hull of points", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 5, y: 5 }, // Inside point
      ];

      const hull = convexHull(points);
      expect(hull.length).toBe(4);
      expect(hull).toEqual(
        expect.arrayContaining([
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ]),
      );
      expect(hull).not.toContainEqual({ x: 5, y: 5 });
    });

    it("handles less than 3 points", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ];
      expect(convexHull(points)).toEqual(points);
    });

    it("property: all points should be inside or on boundary of hull", () => {
      // Use fast-check to generate random point sets
      const pointArb = fc.record({
        x: fc.double({ min: -1000, max: 1000 }),
        y: fc.double({ min: -1000, max: 1000 }),
      });

      fc.assert(
        fc.property(
          fc.array(pointArb, { minLength: 3, maxLength: 20 }),
          (points) => {
            // If points are collinear or duplicates, convex hull might fail or behave weirdly
            // Filter out unique points roughly
            const uniquePoints = points.filter(
              (p, i) =>
                points.findIndex(
                  (p2) =>
                    Math.abs(p2.x - p.x) < 1e-6 && Math.abs(p2.y - p.y) < 1e-6,
                ) === i,
            );
            if (uniquePoints.length < 3) return true;

            const hull = convexHull(uniquePoints);

            return uniquePoints.every((p) => {
              const isInside = pointInPolygon([p.x, p.y], hull);
              if (isInside) return true;

              // If considered outside, check if it's on the boundary
              const dist = minDistanceToPolygon([p.x, p.y], hull);
              return dist < 1e-4;
            });
          },
        ),
      );
    });
  });
});
