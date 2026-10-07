// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The path a robot is steered back onto at a chained corner, and finding where
// the robot is along it.
import type { BasePoint } from "../../types";

/**
 * How far ahead of and behind the last closest point the path is searched, in
 * inches along the path. Pedro tracks the closest point from where it was
 * last, so it can't jump to a distant part of a path that curves back near
 * itself. This is measured along the path, not in steps: a curve's steps are
 * evenly spaced in its parameter, but a hairpin packs many of them into a
 * couple of inches.
 */
const SEARCH_AHEAD = 15;
const SEARCH_BEHIND = 4;

/**
 * The path the robot is steered back onto, sampled at evenly spaced steps,
 * with each segment's direction worked out once.
 */
export class Track {
  readonly last: number;
  /** Distance along the path to each step boundary. */
  private readonly along: Float64Array;
  /** Length of the whole path. */
  readonly total: number;
  private readonly px: Float64Array;
  private readonly py: Float64Array;
  private readonly dx: Float64Array;
  private readonly dy: Float64Array;
  private readonly span: Float64Array;
  private readonly tx: Float64Array;
  private readonly ty: Float64Array;

  constructor(points: BasePoint[]) {
    const n = points.length;
    this.last = n - 2;
    this.px = new Float64Array(n);
    this.py = new Float64Array(n);
    this.dx = new Float64Array(n);
    this.dy = new Float64Array(n);
    this.along = new Float64Array(n);
    this.span = new Float64Array(n);
    this.tx = new Float64Array(n);
    this.ty = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = points[i].x;
      this.py[i] = points[i].y;
    }
    for (let i = 0; i < n - 1; i++) {
      const dx = this.px[i + 1] - this.px[i];
      const dy = this.py[i + 1] - this.py[i];
      const span = dx * dx + dy * dy;
      const size = Math.sqrt(span) || 1;
      this.dx[i] = dx;
      this.dy[i] = dy;
      this.span[i] = span;
      this.tx[i] = dx / size;
      this.ty[i] = dy / size;
      this.along[i + 1] = this.along[i] + Math.sqrt(span);
    }
    this.total = this.along[n - 1];
  }

  /** Distance along the path to position `u` (in steps). */
  distanceAt(u: number): number {
    const i = Math.min(this.last, Math.max(0, Math.floor(u)));
    return this.along[i] + (u - i) * (this.along[i + 1] - this.along[i]);
  }

  /**
   * Finds where the track is closest to (x, y), searching near `around` (in
   * steps), and writes it into `hit`.
   */
  closest(x: number, y: number, around: number, hit: Closest) {
    const here = Math.min(this.last, Math.floor(around));
    let from = here;
    while (
      from > 0 &&
      this.along[here] - this.along[from - 1] < SEARCH_BEHIND
    ) {
      from--;
    }
    let to = here;
    while (
      to < this.last &&
      this.along[to + 1] - this.along[here] < SEARCH_AHEAD
    ) {
      to++;
    }

    let bestU = from;
    let bestIndex = from;
    let bestDist = Infinity;
    for (let i = from; i <= to; i++) {
      const span = this.span[i];
      const rx = x - this.px[i];
      const ry = y - this.py[i];
      let f = span > 0 ? (rx * this.dx[i] + ry * this.dy[i]) / span : 0;
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      const ex = rx - this.dx[i] * f;
      const ey = ry - this.dy[i] * f;
      const dist = ex * ex + ey * ey;
      if (dist < bestDist - 1e-9) {
        bestDist = dist;
        bestU = i + f;
        bestIndex = i;
      }
    }

    const f = bestU - bestIndex;
    hit.u = bestU;
    hit.x = this.px[bestIndex] + this.dx[bestIndex] * f;
    hit.y = this.py[bestIndex] + this.dy[bestIndex] * f;
    hit.tx = this.tx[bestIndex];
    hit.ty = this.ty[bestIndex];
  }
}

/** A closest point on the track; its normal is the tangent turned left. */
export interface Closest {
  /** Position along the track, in steps (fractional). */
  u: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
}

export const newClosest = (): Closest => ({ u: 0, x: 0, y: 0, tx: 0, ty: 0 });
