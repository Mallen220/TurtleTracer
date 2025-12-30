import { describe, it, expect } from "vitest";
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

    // Note: Behavior on edges/vertices depends on exact ray casting implementation
    // Usually it considers edge cases inconsistently or strictly one way.
    // Given the implementation: yi > y !== yj > y ...
    // Let's not test strictly on edge unless we are sure of the behavior.
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
      // Robot at (0,0), 0 deg heading, 10 length, 6 width
      // Length (10) is along X axis (heading 0) -> extends +/- 5
      // Width (6) is along Y axis -> extends +/- 3
      // Corners should be +/- 5, +/- 3
      const corners = getRobotCorners(0, 0, 0, 10, 6);

      // Expected corners based on implementation:
      // front-left: (-5, -3)
      // front-right: (5, -3)
      // back-right: (5, 3)
      // back-left: (-5, 3)
      // Wait, let's check implementation of getRobotCorners in src/utils/geometry.ts

      // hl = 5, hw = 3
      // cos=1, sin=0
      // 1: dx=-5, dy=-3 -> x=-5, y=-3
      // 2: dx=5, dy=-3 -> x=5, y=-3
      // 3: dx=5, dy=3 -> x=5, y=3
      // 4: dx=-5, dy=3 -> x=-5, y=3

      expect(corners).toHaveLength(4);
      expect(corners).toContainEqual({ x: -5, y: -3 });
      expect(corners).toContainEqual({ x: 5, y: -3 });
      expect(corners).toContainEqual({ x: 5, y: 3 });
      expect(corners).toContainEqual({ x: -5, y: 3 });
    });

    it("calculates corners for rotated robot (90 deg)", () => {
      // Robot at (0,0), 90 deg heading, 10 length, 6 width
      // Heading 90 deg = down in screen coords.
      // Length extends along Y axis. Width extends along X axis.
      // Corners should be at x = +/- 3, y = +/- 5

      const corners = getRobotCorners(0, 0, 90, 10, 6);

      // Check for approximations due to floating point
      const roundedCorners = corners.map(c => ({
        x: Math.round(c.x),
        y: Math.round(c.y)
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

      // Hull should contain the 4 corner points
      expect(hull.length).toBe(4);
      expect(hull).toEqual(expect.arrayContaining([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]));

      // Should not contain the inner point
      expect(hull).not.toContainEqual({ x: 5, y: 5 });
    });

    it("handles less than 3 points", () => {
        const points = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
        expect(convexHull(points)).toEqual(points);
    });
  });
});
