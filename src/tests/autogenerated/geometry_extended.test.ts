// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  pointInPolygon,
  minDistanceToPolygon,
  pointToLineDistance,
  polygonCenter,
  getRobotCorners,
  convexHull,
} from "../../utils/geometry";
import type { BasePoint } from "../../types";

// Avoid extremely small numbers that cause underflow/precision issues in geometric algorithms
// not designed for them.
const saneDouble = fc.double({ min: -1000, max: 1000, noNaN: true });
const pointArb = fc.record({
  x: saneDouble,
  y: saneDouble,
});

describe("Geometry Properties (Extended)", () => {
  describe("pointInPolygon", () => {
    it("should be consistent with convex hull containment for random points", () => {
      // If a point is in the polygon, it must be in the convex hull
      fc.assert(
        fc.property(
          fc.array(pointArb, { minLength: 3, maxLength: 10 }),
          pointArb,
          (polygon, point) => {
            // Remove duplicates and collinear points essentially by convex hull logic
            // But here we test the function as is.
            const hull = convexHull(polygon);
            const isInPolygon = pointInPolygon([point.x, point.y], polygon);
            const isInHull = pointInPolygon([point.x, point.y], hull);

            // Note: pointInPolygon is for any polygon (concave or convex).
            // A point inside a polygon implies it is inside the convex hull of that polygon.
            if (isInPolygon) {
               // Relaxed check for floating point precision issues.
               // If it's in polygon, but not in hull, check distance to hull.
               if (!isInHull) {
                   const dist = minDistanceToPolygon([point.x, point.y], hull);
                   // If distance is negligible, we consider it inside (on boundary)
                   return dist < 1e-4;
               }
               return true;
            }
            return true;
          }
        )
      );
    });
  });

  describe("getRobotCorners", () => {
    it("should preserve dimensions between corners", () => {
      fc.assert(
        fc.property(
          saneDouble, saneDouble, // x, y
          fc.double({ min: -360, max: 360, noNaN: true }), // heading
          fc.double({ min: 1, max: 100, noNaN: true }), // length
          fc.double({ min: 1, max: 100, noNaN: true }), // width
          (x, y, heading, length, width) => {
            const corners = getRobotCorners(x, y, heading, length, width);

            // corners: [FL, FR, BR, BL]
            // FL (-hl, -hw), FR (hl, -hw), BR (hl, hw), BL (-hl, hw)
            // FL to FR: varies by 2*hl = length
            // FR to BR: varies by 2*hw = width
            // BR to BL: varies by 2*hl = length
            // BL to FL: varies by 2*hw = width

            const dist = (p1: BasePoint, p2: BasePoint) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

            const fl = corners[0];
            const fr = corners[1];
            const br = corners[2];
            const bl = corners[3];

            const epsilon = 1e-4; // Reasonable epsilon now that logic is correct

            expect(Math.abs(dist(fl, fr) - length)).toBeLessThan(epsilon);
            expect(Math.abs(dist(fr, br) - width)).toBeLessThan(epsilon);

            expect(Math.abs(dist(br, bl) - length)).toBeLessThan(epsilon);
            expect(Math.abs(dist(bl, fl) - width)).toBeLessThan(epsilon);

            // Diagonals should be equal
            expect(Math.abs(dist(fl, br) - dist(fr, bl))).toBeLessThan(epsilon);
          }
        )
      );
    });
  });

  describe("polygonCenter", () => {
    it("should lie within the bounding box of the polygon", () => {
      fc.assert(
        fc.property(
          fc.array(pointArb, { minLength: 3, maxLength: 20 }),
          (polygon) => {
             const center = polygonCenter(polygon);
             const xs = polygon.map(p => p.x);
             const ys = polygon.map(p => p.y);

             const minX = Math.min(...xs);
             const maxX = Math.max(...xs);
             const minY = Math.min(...ys);
             const maxY = Math.max(...ys);

             // Allow for small floating point error
             expect(center[0]).toBeGreaterThanOrEqual(minX - 1e-9);
             expect(center[0]).toBeLessThanOrEqual(maxX + 1e-9);
             expect(center[1]).toBeGreaterThanOrEqual(minY - 1e-9);
             expect(center[1]).toBeLessThanOrEqual(maxY + 1e-9);
          }
        )
      );
    });
  });

  describe("pointToLineDistance", () => {
     it("should return 0 for points on the line segment", () => {
         fc.assert(
             fc.property(
                 pointArb, pointArb, fc.double({min: 0, max: 1, noNaN: true}),
                 (p1, p2, t) => {
                     // Point strictly on the segment
                     const px = p1.x + (p2.x - p1.x) * t;
                     const py = p1.y + (p2.y - p1.y) * t;

                     const dist = pointToLineDistance([px, py], [p1.x, p1.y], [p2.x, p2.y]);
                     expect(dist).toBeLessThan(1e-4);
                 }
             )
         );
     });

     it("should always be non-negative", () => {
         fc.assert(
            fc.property(
                pointArb, pointArb, pointArb,
                (p, l1, l2) => {
                    const dist = pointToLineDistance([p.x, p.y], [l1.x, l1.y], [l2.x, l2.y]);
                    expect(dist).toBeGreaterThanOrEqual(0);
                }
            )
         );
     });
  });
});
