// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/**
 * Geometry utility functions for obstacle detection and polygon operations
 */
import type { BasePoint } from "../types";

/**
 * Determines if a point is inside a polygon using ray casting algorithm
 */
export function pointInPolygon(point: number[], polygon: BasePoint[]): boolean {
  const x = point[0],
    y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Calculate minimum distance from a point to a polygon's edges
 */
export function minDistanceToPolygon(
  point: number[],
  polygon: BasePoint[],
): number {
  let minDistance = Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    const distance = pointToLineDistance(point, [p1.x, p1.y], [p2.x, p2.y]);
    minDistance = Math.min(minDistance, distance);
  }

  return minDistance;
}

/**
 * Calculate shortest distance from a point to a line segment
 */
export function pointToLineDistance(
  point: number[],
  lineStart: number[],
  lineEnd: number[],
): number {
  const A = point[0] - lineStart[0];
  const B = point[1] - lineStart[1];
  const C = lineEnd[0] - lineStart[0];
  const D = lineEnd[1] - lineStart[1];

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = lineStart[0];
    yy = lineStart[1];
  } else if (param > 1) {
    xx = lineEnd[0];
    yy = lineEnd[1];
  } else {
    xx = lineStart[0] + param * C;
    yy = lineStart[1] + param * D;
  }

  const dx = point[0] - xx;
  const dy = point[1] - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the four corner points of a robot at a given position and heading
 * Assumes the robot is a rectangle centered at (x, y) with the given heading angle
 * The heading convention: 0° = right, 90° = down, 180° = left, 270° = up
 * (this matches SVG/screen coordinates where Y increases downward)
 * @param x - Robot center X position (in inches)
 * @param y - Robot center Y position (in inches)
 * @param heading - Robot heading in degrees
 * @param length - Robot length in inches (extends forward-backward from center)
 * @param width - Robot width in inches (extends left-right from center)
 * @returns Array of 4 corner points in order: [front-left, front-right, back-right, back-left]
 */
export function getRobotCorners(
  x: number,
  y: number,
  heading: number,
  length: number,
  width: number,
): BasePoint[] {
  const headingRad = (heading * Math.PI) / 180;

  const hl = length / 2;
  const hw = width / 2;

  const cos = Math.cos(headingRad);
  const sin = Math.sin(headingRad);

  const corners = [
    { dx: -hl, dy: -hw }, // front-left
    { dx: hl, dy: -hw }, // front-right
    { dx: hl, dy: hw }, // back-right
    { dx: -hl, dy: hw }, // back-left
  ];

  return corners.map((corner) => ({
    x: x + corner.dx * cos - corner.dy * sin,
    y: y + corner.dx * sin + corner.dy * cos,
  }));
}

/**
 * Compute the convex hull of a set of points using Graham scan algorithm
 * @param points - Array of points to compute convex hull for
 * @returns Array of points forming the convex hull in counter-clockwise order
 */
export function convexHull(points: BasePoint[]): BasePoint[] {
  if (points.length < 3) return points;

  const pts = [...points];

  let minIdx = 0;
  for (let i = 1; i < pts.length; i++) {
    if (
      pts[i].y < pts[minIdx].y ||
      (pts[i].y === pts[minIdx].y && pts[i].x < pts[minIdx].x)
    ) {
      minIdx = i;
    }
  }

  [pts[0], pts[minIdx]] = [pts[minIdx], pts[0]];
  const pivot = pts[0];

  const distSq = (p: BasePoint) => (p.x - pivot.x) ** 2 + (p.y - pivot.y) ** 2;

  const sorted = pts.slice(1).sort((a, b) => {
    const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
    const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);

    if (angleA !== angleB) {
      return angleA - angleB;
    }

    return distSq(a) - distSq(b);
  });

  const cross = (o: BasePoint, a: BasePoint, b: BasePoint): number => {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  };

  const hull: BasePoint[] = [pivot];

  for (const point of sorted) {
    while (
      hull.length >= 2 &&
      cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0
    ) {
      hull.pop();
    }
    hull.push(point);
  }

  return hull;
}
