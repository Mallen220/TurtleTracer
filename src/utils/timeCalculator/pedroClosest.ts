// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Where Pedro puts a robot along a path. Each loop, Pedro 3 finds the point of
// the path nearest the robot (`closestParameter`) and steers by it: the
// direction to drive, the heading to face, and whether the path is finished.
// It searches the whole path, not just the part the robot has reached, so a
// path that curves back toward the robot can have its far end nearest.
import type { BasePoint } from "../../types";
import { getCurvePoint } from "../math";
import { getBezierDerivative, getBezierSecondDerivative } from "./math";

/** Pedro's default `parametricTConstraint`: past 1 minus this, the path counts as finished. */
export const PARAMETRIC_END_TOLERANCE = 0.025;
/** How many times Pedro refines its first guess. */
const SEARCH_LIMIT = 10;

/**
 * The parameter (0 to 1) of the point of the path nearest `position`, as
 * Pedro 3 works it out: a straight path by projection, a curve by trying 11
 * evenly spaced points and the last answer, then refining the best with
 * Newton's method. `curve` is the start, the control points, then the end.
 */
export function pedroClosestParameter(
  curve: BasePoint[],
  position: BasePoint,
  initialGuess = 0,
): number {
  if (curve.length < 2) return 0;
  if (curve.length === 2) {
    const [a, b] = curve;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = dx * dx + dy * dy;
    if (span === 0) return 0;
    const t = ((position.x - a.x) * dx + (position.y - a.y) * dy) / span;
    return Math.min(1, Math.max(0, t));
  }

  const distanceSquared = (t: number) => {
    const p = getCurvePoint(t, curve);
    return (p.x - position.x) ** 2 + (p.y - position.y) ** 2;
  };

  let guess = 0;
  let best = Infinity;
  const tries = [
    0,
    0.1,
    0.2,
    0.3,
    0.4,
    0.5,
    0.6,
    0.7,
    0.8,
    0.9,
    1,
    initialGuess,
  ];
  for (const t of tries) {
    const d = distanceSquared(t);
    if (d < best) {
      best = d;
      guess = t;
    }
  }

  for (let i = 0; i < SEARCH_LIMIT; i++) {
    const here = getCurvePoint(guess, curve);
    const d1 = getBezierDerivative(guess, curve);
    const d2 = getBezierSecondDerivative(guess, curve);
    const dx = here.x - position.x;
    const dy = here.y - position.y;
    const first = 2 * (dx * d1.x + dy * d1.y);
    const second = 2 * (dx * d2.x + dy * d2.y + d1.x * d1.x + d1.y * d1.y);
    guess = Math.min(1, Math.max(0, guess - first / (second + 1e-9)));
    const moved = getCurvePoint(guess, curve);
    if (Math.hypot(moved.x - here.x, moved.y - here.y) < 0.1) break;
  }
  return guess;
}

/** The direction a path points in at parameter `t`, in degrees. */
export function pathDirectionAt(curve: BasePoint[], t: number): number {
  const d =
    curve.length === 2
      ? { x: curve[1].x - curve[0].x, y: curve[1].y - curve[0].y }
      : getBezierDerivative(t, curve);
  return (Math.atan2(d.y, d.x) * 180) / Math.PI;
}
