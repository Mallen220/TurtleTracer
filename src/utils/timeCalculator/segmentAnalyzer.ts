// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { BasePoint } from "../../types";
import { getDistance, getAngularDifference, getCurvePoint } from "../math";
import type { PathStep, PathAnalysis } from "./types";
import { getBezierDerivative, getBezierSecondDerivative } from "./math";

export function unwrapAngle(target: number, reference: number): number {
  const diff = getAngularDifference(reference, target);
  return reference + diff;
}

/** A point on a Bezier curve with its first and second derivatives there. */
interface CurveSample {
  px: number;
  py: number;
  d1x: number;
  d1y: number;
  d2x: number;
  d2y: number;
}

/**
 * A Bezier curve through `start`, its control points and `end`. Lines,
 * quadratics and cubics, which are nearly every path, are worked out directly
 * from coefficients prepared once; `at` runs for every sample of every path,
 * so it takes care not to allocate.
 */
class Curve {
  private readonly degree: number;
  private readonly p0x: number;
  private readonly p0y: number;
  private p1x = 0;
  private p1y = 0;
  private p2x = 0;
  private p2y = 0;
  private p3x = 0;
  private p3y = 0;
  // The curve's derivative is a Bezier curve with these control points.
  private q0x = 0;
  private q0y = 0;
  private q1x = 0;
  private q1y = 0;
  private q2x = 0;
  private q2y = 0;
  // So is the 2nd derivative of a cubic; a quadratic's is constant.
  private s0x = 0;
  private s0y = 0;
  private s1x = 0;
  private s1y = 0;
  private d2x = 0;
  private d2y = 0;
  private readonly lineDx: number;
  private readonly lineDy: number;
  private readonly fullPoints: BasePoint[];

  constructor(
    private readonly start: BasePoint,
    cps: BasePoint[],
    private readonly end: BasePoint,
  ) {
    this.degree = cps.length + 1;
    this.p0x = start.x;
    this.p0y = start.y;
    this.lineDx = end.x - start.x;
    this.lineDy = end.y - start.y;
    this.fullPoints = this.degree > 3 ? [start, ...cps, end] : [];

    if (this.degree === 2) this.prepareQuadratic(cps);
    else if (this.degree === 3) this.prepareCubic(cps);
  }

  private prepareQuadratic(cps: BasePoint[]) {
    const { p0x, p0y, end } = this;
    this.p1x = cps[0].x;
    this.p1y = cps[0].y;
    this.p2x = end.x;
    this.p2y = end.y;
    const { p1x, p1y, p2x, p2y } = this;
    // Derivative: 2(P1-P0) to 2(P2-P1), and a constant 2nd derivative.
    this.q0x = 2 * (p1x - p0x);
    this.q0y = 2 * (p1y - p0y);
    this.q1x = 2 * (p2x - p1x);
    this.q1y = 2 * (p2y - p1y);
    this.d2x = 2 * (p2x - 2 * p1x + p0x);
    this.d2y = 2 * (p2y - 2 * p1y + p0y);
  }

  private prepareCubic(cps: BasePoint[]) {
    const { p0x, p0y, end } = this;
    this.p1x = cps[0].x;
    this.p1y = cps[0].y;
    this.p2x = cps[1].x;
    this.p2y = cps[1].y;
    this.p3x = end.x;
    this.p3y = end.y;
    const { p1x, p1y, p2x, p2y, p3x, p3y } = this;
    // Derivative: 3(P1-P0), 3(P2-P1), 3(P3-P2).
    this.q0x = 3 * (p1x - p0x);
    this.q0y = 3 * (p1y - p0y);
    this.q1x = 3 * (p2x - p1x);
    this.q1y = 3 * (p2y - p1y);
    this.q2x = 3 * (p3x - p2x);
    this.q2y = 3 * (p3y - p2y);
    // 2nd derivative: 6(P2 - 2P1 + P0) to 6(P3 - 2P2 + P1).
    this.s0x = 6 * (p2x - 2 * p1x + p0x);
    this.s0y = 6 * (p2y - 2 * p1y + p0y);
    this.s1x = 6 * (p3x - 2 * p2x + p1x);
    this.s1y = 6 * (p3y - 2 * p2y + p1y);
  }

  /** Fills `out` with the curve's point and derivatives at `t` (0 to 1). */
  at(t: number, out: CurveSample) {
    switch (this.degree) {
      case 1:
        return this.lineAt(t, out);
      case 2:
        return this.quadraticAt(t, out);
      case 3:
        return this.cubicAt(t, out);
      default:
        return this.generalAt(t, out);
    }
  }

  private lineAt(t: number, out: CurveSample) {
    out.px = this.p0x + (this.end.x - this.p0x) * t;
    out.py = this.p0y + (this.end.y - this.p0y) * t;
    out.d1x = this.lineDx;
    out.d1y = this.lineDy;
    out.d2x = 0;
    out.d2y = 0;
  }

  /** (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2 */
  private quadraticAt(t: number, out: CurveSample) {
    const mt = 1 - t;
    const a = mt * mt;
    const b = 2 * mt * t;
    const c = t * t;
    out.px = a * this.p0x + b * this.p1x + c * this.p2x;
    out.py = a * this.p0y + b * this.p1y + c * this.p2y;
    out.d1x = mt * this.q0x + t * this.q1x;
    out.d1y = mt * this.q0y + t * this.q1y;
    out.d2x = this.d2x;
    out.d2y = this.d2y;
  }

  /** (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t)t^2 P2 + t^3 P3 */
  private cubicAt(t: number, out: CurveSample) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const a = mt2 * mt;
    const b = 3 * mt2 * t;
    const c = 3 * mt * t2;
    const d = t2 * t;
    out.px = a * this.p0x + b * this.p1x + c * this.p2x + d * this.p3x;
    out.py = a * this.p0y + b * this.p1y + c * this.p2y + d * this.p3y;
    out.d1x = mt2 * this.q0x + 2 * mt * t * this.q1x + t2 * this.q2x;
    out.d1y = mt2 * this.q0y + 2 * mt * t * this.q1y + t2 * this.q2y;
    out.d2x = mt * this.s0x + t * this.s1x;
    out.d2y = mt * this.s0y + t * this.s1y;
  }

  /** Higher degrees: the general (slower) calculation. */
  private generalAt(t: number, out: CurveSample) {
    const point = getCurvePoint(t, this.fullPoints);
    out.px = point.x;
    out.py = point.y;
    const d1 = getBezierDerivative(t, this.fullPoints);
    out.d1x = d1.x;
    out.d1y = d1.y;
    const d2 = getBezierSecondDerivative(t, this.fullPoints);
    out.d2x = d2.x;
    out.d2y = d2.y;
  }
}

/**
 * How many steps to sample a path in: more for longer, curvier ones, between
 * 20 and `samples`, and at least `minSamples` (capped at `samples`).
 */
function sampleCount(
  start: BasePoint,
  cps: BasePoint[],
  end: BasePoint,
  samples: number,
  minSamples: number,
): number {
  let count = samples;
  if (cps.length === 0) {
    count = 10; // Linear: minimal samples needed
  } else {
    // Estimate length using control polygon
    let estimatedLength = 0;
    let prev = start;
    for (const p of cps) {
      estimatedLength += getDistance(prev, p);
      prev = p;
    }
    estimatedLength += getDistance(prev, end);

    // Density: 1 sample per unit (e.g. inch)
    // Clamp between 20 (min resolution) and samples (max resolution)
    const density = 1;
    const target = Math.ceil(estimatedLength * density);
    count = Math.max(20, Math.min(target, samples));
  }
  return Math.max(count, Math.min(minSamples, samples));
}

/**
 * The radius of the curve at a point from its first and second derivatives:
 * k = |x'y'' - y'x''| / (x'^2 + y'^2)^(3/2), radius = 1/k. Infinite where it
 * is straight, and 0 at a cusp or a stop.
 */
function curveRadius(d1x: number, d1y: number, d2x: number, d2y: number) {
  const numerator = Math.abs(d1x * d2y - d1y * d2x);
  if (numerator >= 1e-6) {
    const denominator = Math.pow(d1x * d1x + d1y * d1y, 1.5);
    return denominator / numerator;
  }
  if (Math.abs(d1x) < 1e-6 && Math.abs(d1y) < 1e-6) return 0;
  return Infinity;
}

/**
 * Follows the direction a path points in as it is sampled: how far it turns
 * between samples, in total and net, and the heading the robot would have
 * if it turned with it.
 */
class TurnTracker {
  /** Total turning, ignoring direction (what takes the robot time). */
  tangentRotation = 0;
  /** Turning with direction (how the heading ends up). */
  netRotation = 0;
  /** The direction of travel at the last sample that had one. */
  direction = 0;
  /** The starting heading carried along by the turns so far, unwrapped. */
  heading: number;
  private prevAngle: number | null = null;

  constructor(initialHeading: number) {
    this.heading = Number.isFinite(initialHeading) ? initialHeading : 0;
  }

  /** Takes the direction of travel (the first derivative) at the next sample; returns the turn since the last, in degrees. */
  sample(d1x: number, d1y: number): number {
    if (Math.abs(d1x) <= 1e-9 && Math.abs(d1y) <= 1e-9) return 0;
    const angle = Math.atan2(d1y, d1x) * (180 / Math.PI);
    let stepRotation = 0;

    if (this.prevAngle !== null) {
      // Shortest difference
      const diff = getAngularDifference(this.prevAngle, angle);
      stepRotation = Math.abs(diff);
      if (stepRotation > 0.001) {
        this.tangentRotation += stepRotation;
        this.netRotation += diff;
        this.heading += diff;
      }
    }
    this.prevAngle = angle;
    this.direction = angle;
    return stepRotation;
  }
}

/**
 * Analyzes a path segment (Line, Quadratic, or Cubic)
 */
export function analyzePathSegment(
  start: BasePoint,
  controlPoints: BasePoint[],
  end: BasePoint,
  samples: number = 50,
  initialHeading: number, // Unwrapped starting heading
  minSamples: number = 0, // Finer steps for paths the robot joins part way along
): PathAnalysis {
  const cps = controlPoints || [];
  const curve = new Curve(start, cps, end);
  const sampleSteps = sampleCount(start, cps, end, samples, minSamples);
  const sample: CurveSample = { px: 0, py: 0, d1x: 0, d1y: 0, d2x: 0, d2y: 0 };
  const turns = new TurnTracker(initialHeading);

  let length = 0;
  let minRadius = Infinity;
  let prevPointX = start.x;
  let prevPointY = start.y;
  const steps: PathStep[] = [];

  for (let i = 0; i <= sampleSteps; i++) {
    curve.at(i / sampleSteps, sample);
    const { px, py, d1x, d1y, d2x, d2y } = sample;

    let deltaLength = 0;
    if (i > 0) {
      deltaLength = Math.hypot(px - prevPointX, py - prevPointY);
      length += deltaLength;
    }
    prevPointX = px;
    prevPointY = py;

    const radius = curveRadius(d1x, d1y, d2x, d2y);
    if (radius < minRadius) minRadius = radius;

    const stepRotation = turns.sample(d1x, d1y);
    if (i > 0) {
      steps.push({
        deltaLength,
        radius,
        rotation: stepRotation,
        heading: turns.heading,
        direction: turns.direction,
      });
    }
  }

  return {
    length,
    minRadius,
    tangentRotation: turns.tangentRotation,
    netRotation: turns.netRotation,
    steps,
    startHeading: initialHeading,
  };
}
