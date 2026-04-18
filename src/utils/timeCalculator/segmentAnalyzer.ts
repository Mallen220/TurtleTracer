// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { BasePoint } from "../../types";
import { getDistance, getAngularDifference, getCurvePoint } from "../math";
import type { PathStep, PathAnalysis } from "./types";
import { getBezierDerivative, getBezierSecondDerivative } from "./math";

export function unwrapAngle(target: number, reference: number): number {
  const diff = getAngularDifference(reference, target);
  return reference + diff;
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
): PathAnalysis {
  const cps = controlPoints || [];

  let length = 0;
  let minRadius = Infinity;
  let prevPointX = start.x;
  let prevPointY = start.y;
  let tangentRotation = 0;
  let netRotation = 0;
  let prevAngle: number | null = null;
  let currentUnwrapped = Number.isFinite(initialHeading) ? initialHeading : 0;

  const steps: PathStep[] = [];

  // Determine degree and pre-calculate coefficients
  // Degree 1: Linear (2 points) -> cps.length == 0
  // Degree 2: Quadratic (3 points) -> cps.length == 1
  // Degree 3: Cubic (4 points) -> cps.length == 2
  // Higher degrees use fallback

  const degree = cps.length + 1;

  // Pre-calculated variables for optimization
  let q0x = 0,
    q0y = 0,
    q1x = 0,
    q1y = 0,
    q2x = 0,
    q2y = 0; // Derivative coeffs
  let s0x = 0,
    s0y = 0,
    s1x = 0,
    s1y = 0; // 2nd Derivative coeffs
  let d2x = 0,
    d2y = 0; // Constant 2nd deriv for Quadratic

  // Pointers for points to avoid array indexing in loop
  let p0x = start.x,
    p0y = start.y;
  let p1x = 0,
    p1y = 0;
  let p2x = 0,
    p2y = 0;
  let p3x = 0,
    p3y = 0;

  // Linear constants
  let lineDx = 0,
    lineDy = 0;

  if (degree === 1) {
    lineDx = end.x - start.x;
    lineDy = end.y - start.y;
  } else if (degree === 2) {
    p1x = cps[0].x;
    p1y = cps[0].y;
    p2x = end.x;
    p2y = end.y;

    // Quadratic Derivative coeffs (Degree 1 bezier)
    // Q0 = 2(P1-P0), Q1 = 2(P2-P1)
    q0x = 2 * (p1x - p0x);
    q0y = 2 * (p1y - p0y);
    q1x = 2 * (p2x - p1x);
    q1y = 2 * (p2y - p1y);

    // Quadratic 2nd Derivative is constant: 2(P2 - 2P1 + P0)
    d2x = 2 * (p2x - 2 * p1x + p0x);
    d2y = 2 * (p2y - 2 * p1y + p0y);
  } else if (degree === 3) {
    p1x = cps[0].x;
    p1y = cps[0].y;
    p2x = cps[1].x;
    p2y = cps[1].y;
    p3x = end.x;
    p3y = end.y;

    // Cubic Derivative coeffs (Degree 2 bezier)
    // Q0 = 3(P1-P0), Q1 = 3(P2-P1), Q2 = 3(P3-P2)
    q0x = 3 * (p1x - p0x);
    q0y = 3 * (p1y - p0y);
    q1x = 3 * (p2x - p1x);
    q1y = 3 * (p2y - p1y);
    q2x = 3 * (p3x - p2x);
    q2y = 3 * (p3y - p2y);

    // Cubic 2nd Derivative coeffs (Degree 1 bezier)
    // S0 = 6(P2 - 2P1 + P0)
    // S1 = 6(P3 - 2P2 + P1)
    s0x = 6 * (p2x - 2 * p1x + p0x);
    s0y = 6 * (p2y - 2 * p1y + p0y);
    s1x = 6 * (p3x - 2 * p2x + p1x);
    s1y = 6 * (p3y - 2 * p2y + p1y);
  }

  // Fallback for higher degrees
  const useFallback = degree > 3;
  const fullPoints = useFallback ? [start, ...cps, end] : [];

  // Adaptive Sampling: reduce samples for short or linear segments
  let adaptiveSamples = samples;
  if (degree === 1) {
    adaptiveSamples = 10; // Linear: minimal samples needed
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
    adaptiveSamples = Math.max(20, Math.min(target, samples));
  }

  for (let i = 0; i <= adaptiveSamples; i++) {
    const t = i / adaptiveSamples;

    let px = 0,
      py = 0;
    let d1x = 0,
      d1y = 0;
    // d2x, d2y declared above or calculated

    if (degree === 1) {
      // Linear
      px = p0x + (end.x - p0x) * t;
      py = p0y + (end.y - p0y) * t;
      d1x = lineDx;
      d1y = lineDy;
      d2x = 0;
      d2y = 0;
    } else if (degree === 2) {
      // Quadratic Point: (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
      const mt = 1 - t;
      const a = mt * mt;
      const b = 2 * mt * t;
      const c = t * t;
      px = a * p0x + b * p1x + c * p2x;
      py = a * p0y + b * p1y + c * p2y;

      // Quadratic Derivative: Linear interpolation of Q0, Q1
      // (1-t)Q0 + tQ1
      d1x = mt * q0x + t * q1x;
      d1y = mt * q0y + t * q1y;
      // d2x, d2y are constant and pre-calculated
    } else if (degree === 3) {
      // Cubic Point: (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t)t^2 P2 + t^3 P3
      const mt = 1 - t;
      const mt2 = mt * mt;
      const t2 = t * t;
      const a = mt2 * mt;
      const b = 3 * mt2 * t;
      const c = 3 * mt * t2;
      const d = t2 * t;

      px = a * p0x + b * p1x + c * p2x + d * p3x;
      py = a * p0y + b * p1y + c * p2y + d * p3y;

      // Cubic Derivative: Quadratic interpolation of Q0, Q1, Q2
      // (1-t)^2 Q0 + 2(1-t)t Q1 + t^2 Q2
      d1x = mt2 * q0x + 2 * mt * t * q1x + t2 * q2x;
      d1y = mt2 * q0y + 2 * mt * t * q1y + t2 * q2y;

      // Cubic 2nd Derivative: Linear interpolation of S0, S1
      // (1-t)S0 + tS1
      d2x = mt * s0x + t * s1x;
      d2y = mt * s0y + t * s1y;
    } else {
      // Fallback
      const point = getCurvePoint(t, fullPoints);
      px = point.x;
      py = point.y;
      const d1 = getBezierDerivative(t, fullPoints);
      d1x = d1.x;
      d1y = d1.y;
      const d2 = getBezierSecondDerivative(t, fullPoints);
      d2x = d2.x;
      d2y = d2.y;
    }

    let deltaLength = 0;
    if (i > 0) {
      const dx = px - prevPointX;
      const dy = py - prevPointY;
      deltaLength = Math.sqrt(dx * dx + dy * dy);
      length += deltaLength;
    }
    prevPointX = px;
    prevPointY = py;

    // Inline Curvature Calculation
    // k = |x'y'' - y'x''| / (x'^2 + y'^2)^(3/2)
    let radius = Infinity;
    const numerator = Math.abs(d1x * d2y - d1y * d2x);
    if (numerator >= 1e-6) {
      const denominator = Math.pow(d1x * d1x + d1y * d1y, 1.5);
      radius = denominator / numerator;
    } else if (Math.abs(d1x) < 1e-6 && Math.abs(d1y) < 1e-6) {
      radius = 0; // Cusp or stop
    }

    if (radius < minRadius) minRadius = radius;

    let stepRotation = 0;
    if (Math.abs(d1x) > 1e-9 || Math.abs(d1y) > 1e-9) {
      const angle = Math.atan2(d1y, d1x) * (180 / Math.PI);

      if (prevAngle !== null) {
        // Shortest difference
        const diff = getAngularDifference(prevAngle, angle);
        stepRotation = Math.abs(diff);

        // Accumulate absolute (for physics time)
        if (stepRotation > 0.001) {
          tangentRotation += stepRotation;
          // Accumulate signed (for heading tracking)
          netRotation += diff;
          // Update unwrapped heading
          currentUnwrapped += diff;
        }
      }
      prevAngle = angle;
    }

    if (i > 0) {
      steps.push({
        deltaLength,
        radius,
        rotation: stepRotation,
        heading: currentUnwrapped,
      });
    }
  }

  return {
    length,
    minRadius,
    tangentRotation,
    netRotation,
    steps,
    startHeading: initialHeading,
  };
}
