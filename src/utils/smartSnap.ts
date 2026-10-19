// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Smart snapping: pulling a dragged point onto a nearby start point, path end,
// field corner or obstacle corner.
import type { Line, Point, Shape } from "../types";

/** How close (inches) a dragged point has to be to a target to snap to it. */
const SNAP_THRESHOLD = 1;

/**
 * Everything a dragged point can snap to: the start point, then each path's
 * end, the four field corners, and the corners of every visible obstacle.
 */
export function snapTargets(
  startPoint: Point,
  lines: Line[],
  shapes: Shape[],
  fieldW: number,
  fieldH: number,
): Point[] {
  const targets: Point[] = [startPoint];
  for (const line of lines) {
    if (line?.endPoint) targets.push(line.endPoint);
  }

  targets.push(
    { x: 0, y: 0 } as Point,
    { x: fieldW, y: 0 } as Point,
    { x: 0, y: fieldH } as Point,
    { x: fieldW, y: fieldH } as Point,
  );

  for (const shape of shapes) {
    if (shape.visible === false) continue;
    for (const v of shape.vertices) targets.push({ x: v.x, y: v.y } as Point);
  }
  return targets;
}

/**
 * The x and y of the targets nearest to (x, y) along each axis, or null on an
 * axis where none is within the snap distance. `skip` leaves a target out by
 * its index in `targets`, for example the point being dragged.
 */
export function nearestSnap(
  targets: Point[],
  x: number,
  y: number,
  skip?: (index: number) => boolean,
): { x: number | null; y: number | null } {
  let snapX: number | null = null;
  let snapY: number | null = null;
  let nearestX = SNAP_THRESHOLD;
  let nearestY = SNAP_THRESHOLD;

  targets.forEach((target, index) => {
    if (skip?.(index)) return;
    const dx = Math.abs(target.x - x);
    const dy = Math.abs(target.y - y);
    if (dx < nearestX) {
      nearestX = dx;
      snapX = target.x;
    }
    if (dy < nearestY) {
      nearestY = dy;
      snapY = target.y;
    }
  });
  return { x: snapX, y: snapY };
}
