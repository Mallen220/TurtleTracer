// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  Point,
  BasePoint,
  Line,
  Settings,
  TimePrediction,
  TimelineEvent,
  SequenceItem,
} from "../types";
import {
  getCurvePoint,
  getLineStartHeading,
  getLineEndHeading,
  getAngularDifference,
  getDistance,
  getInitialTangentialHeading,
} from "./math";
import { actionRegistry } from "../lib/actionRegistry";

/**
 * Calculates the first derivative of a Bezier curve of degree N at t.
 */
function getBezierDerivative(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  const n = points.length - 1;
  if (n < 1) return { x: 0, y: 0 };

  // Optimized for Quadratic (3 points)
  if (n === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];

    const mt = 1 - t;

    const d0x = 2 * (p1.x - p0.x);
    const d0y = 2 * (p1.y - p0.y);
    const d1x = 2 * (p2.x - p1.x);
    const d1y = 2 * (p2.y - p1.y);

    return {
      x: mt * d0x + t * d1x,
      y: mt * d0y + t * d1y,
    };
  }

  // Optimized for Cubic (4 points)
  if (n === 3) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const p3 = points[3];

    const mt = 1 - t;
    const a = mt * mt;
    const b = 2 * mt * t;
    const c = t * t;

    const q0x = 3 * (p1.x - p0.x);
    const q0y = 3 * (p1.y - p0.y);
    const q1x = 3 * (p2.x - p1.x);
    const q1y = 3 * (p2.y - p1.y);
    const q2x = 3 * (p3.x - p2.x);
    const q2y = 3 * (p3.y - p2.y);

    return {
      x: a * q0x + b * q1x + c * q2x,
      y: a * q0y + b * q1y + c * q2y,
    };
  }

  const derivativePoints = [];
  for (let i = 0; i < n; i++) {
    derivativePoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y),
    });
  }
  return getCurvePoint(t, derivativePoints);
}

/**
 * Calculates the second derivative of a Bezier curve of degree N at t.
 */
function getBezierSecondDerivative(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  const n = points.length - 1;
  if (n < 2) return { x: 0, y: 0 };

  // Optimized for Quadratic (3 points) -> 2nd Deriv is Constant (1 point)
  // For Quadratic Bezier: P'' = 2(P2 - 2P1 + P0)
  if (n === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];

    return {
      x: 2 * (p2.x - 2 * p1.x + p0.x),
      y: 2 * (p2.y - 2 * p1.y + p0.y),
    };
  }

  // Optimized for Cubic (4 points) -> 2nd Deriv is Linear (2 points)
  // For Cubic Bezier:
  // S0 = 6(P2 - 2P1 + P0)
  // S1 = 6(P3 - 2P2 + P1)
  // P''(t) = (1-t)S0 + tS1
  if (n === 3) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const p3 = points[3];

    const mt = 1 - t;

    const s0x = 6 * (p2.x - 2 * p1.x + p0.x);
    const s0y = 6 * (p2.y - 2 * p1.y + p0.y);

    const s1x = 6 * (p3.x - 2 * p2.x + p1.x);
    const s1y = 6 * (p3.y - 2 * p2.y + p1.y);

    return {
      x: mt * s0x + t * s1x,
      y: mt * s0y + t * s1y,
    };
  }

  // Calculate first derivative control points Q
  const qPoints = [];
  for (let i = 0; i < n; i++) {
    qPoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y),
    });
  }

  const m = n - 1;
  const rPoints = [];
  for (let i = 0; i < m; i++) {
    rPoints.push({
      x: m * (qPoints[i + 1].x - qPoints[i].x),
      y: m * (qPoints[i + 1].y - qPoints[i].y),
    });
  }
  return getCurvePoint(t, rPoints);
}

interface PathStep {
  deltaLength: number;
  radius: number;
  rotation: number; // Absolute rotation change in this step (degrees)
  heading: number; // Unwrapped heading at END of step
}

interface PathAnalysis {
  length: number;
  minRadius: number;
  tangentRotation: number;
  netRotation: number; // Signed net rotation
  steps: PathStep[];
  startHeading: number; // Unwrapped
}

/**
 * Unwraps target angle to be closest to reference angle.
 */
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

/**
 * Calculates time to rotate a certain angle using a trapezoidal motion profile
 * Accounts for angular acceleration limits derived from robot dimensions.
 */
export function calculateRotationTime(
  angleDiffDegrees: number,
  settings: Settings,
): number {
  if (angleDiffDegrees <= 0.001) return 0;

  const diffRad = angleDiffDegrees * (Math.PI / 180);
  const maxVel = Math.max(settings.aVelocity, 0.001);

  let maxAngAccel = settings.maxAngularAcceleration;

  if (!maxAngAccel || maxAngAccel <= 0) {
    const leverArm = Math.max(settings.rWidth / 2, 1); // Avoid division by zero
    const maxAccel = settings.maxAcceleration || 30;
    maxAngAccel = maxAccel / leverArm;
  }

  // Motion profile:
  // t_accel = v_max / a_max
  // dist_accel = 0.5 * a_max * t_accel^2 = 0.5 * v_max^2 / a_max
  const accDist = (maxVel * maxVel) / (2 * maxAngAccel);
  const decDist = accDist; // Symmetric

  if (diffRad >= accDist + decDist) {
    // Trapezoid Profile (reaches max speed)
    const accTime = maxVel / maxAngAccel;
    const decTime = accTime;
    const constDist = diffRad - accDist - decDist;
    const constTime = constDist / maxVel;
    return accTime + constTime + decTime;
  } else {
    // Triangle Profile (does not reach max speed)
    // dist = 0.5 * a * t_accel^2 + 0.5 * a * t_decel^2
    // t_total = 2 * sqrt(dist / a)
    // v_peak = sqrt(dist * a)
    return 2 * Math.sqrt(diffRad / maxAngAccel);
  }
}

/**
 * Calculates time for a motion profile over a path with varying constraints.
 * Returns both total time and the cumulative time profile.
 */
function calculateMotionProfileDetailed(
  steps: PathStep[],
  settings: Settings,
  entryVelocity: number = 0,
  exitVelocity: number = 0,
): { totalTime: number; profile: number[]; velocityProfile: number[] } {
  const maxVelGlobal = settings.maxVelocity || 100;
  const maxAcc = settings.maxAcceleration || 30;
  const maxDec = settings.maxDeceleration || maxAcc;
  const kFriction = settings.kFriction || 0;
  // Ensure aVelocity is finite and non-zero to avoid Infinity
  const aVelocity = Math.max(settings.aVelocity, 0.001);

  const n = steps.length;
  if (n === 0) return { totalTime: 0, profile: [0], velocityProfile: [0] };

  const vAtPoints = new Float64Array(n + 1);
  vAtPoints[0] = Math.min(entryVelocity, maxVelGlobal);

  // 1. Forward Pass
  for (let i = 0; i < n; i++) {
    const step = steps[i];
    let limit = maxVelGlobal;
    if (kFriction > 0) {
      const frictionLimit = Math.sqrt(kFriction * 386.22 * step.radius);
      if (frictionLimit < limit) limit = frictionLimit;
    }
    const angVelLimit = aVelocity * step.radius;
    if (angVelLimit < limit) limit = angVelLimit;

    const dist = step.deltaLength;
    const maxReachable = Math.sqrt(
      vAtPoints[i] * vAtPoints[i] + 2 * maxAcc * dist,
    );
    vAtPoints[i + 1] = Math.min(limit, maxReachable);
  }

  // 2. Backward Pass
  vAtPoints[n] = Math.min(exitVelocity, maxVelGlobal);
  for (let i = n - 1; i >= 0; i--) {
    const dist = steps[i].deltaLength;
    const maxReachable = Math.sqrt(
      vAtPoints[i + 1] * vAtPoints[i + 1] + 2 * maxDec * dist,
    );
    if (maxReachable < vAtPoints[i]) {
      vAtPoints[i] = maxReachable;
    }
  }

  // 3. Integrate Time and Build Profile
  const profile: number[] = [0];
  let totalTime = 0;

  for (let i = 0; i < n; i++) {
    const vStart = vAtPoints[i];
    const vEnd = vAtPoints[i + 1];
    const dist = steps[i].deltaLength;
    const avgV = (vStart + vEnd) / 2;

    let dtLinear = 0;
    if (avgV > 1e-6) {
      dtLinear = dist / avgV;
    } else {
      // Fallback for very low speeds (start from 0) using kinematics
      dtLinear = Math.sqrt((2 * dist) / maxAcc);
    }

    // Check rotation constraint
    // Using simple constant velocity assumption for travel continuity
    // This avoids over-penalizing smooth curves with acceleration start/stops
    const dtRotation = (steps[i].rotation * (Math.PI / 180)) / aVelocity;

    // Take the maximum time required (slower of the two)
    const dt = Math.max(dtLinear, dtRotation);

    // Guard against NaN integration
    if (!Number.isFinite(dt)) {
      totalTime += 0;
    } else {
      totalTime += dt;
    }
    profile.push(totalTime);
  }

  // Convert Float64Array to number[] for easier consumption
  const velocityProfile = Array.from(vAtPoints);

  return { totalTime, profile, velocityProfile };
}

export function calculateGlobalChainMeta(
  seq: SequenceItem[],
  lines: Line[],
  startPoint: Point,
) {
  const lineById = new Map<string, Line>();
  lines.forEach((ln) => {
    if (!ln.id) ln.id = `line-${Math.random().toString(36).slice(2)}`;
    lineById.set(ln.id, ln);
  });

  const meta = new Map<
    string,
    {
      rootLine: Line;
      chainTotalLength: number;
      distanceBefore: number;
    }
  >();

  let tempLastPoint = startPoint;
  let currentChainLength = 0;
  let currentRootLine: Line | null = null;

  seq.forEach((item, idx) => {
    if (item.kind !== "path") return;
    const line = lineById.get((item as any).lineId);
    if (!line || !line.endPoint) return;

    const prevItem = idx > 0 ? seq[idx - 1] : null;
    const isChained = !!(
      prevItem &&
      prevItem.kind === "path" &&
      ((item as any).isChain === true || line.isChain === true)
    );

    const analysis = analyzePathSegment(
      tempLastPoint,
      line.controlPoints as any,
      line.endPoint as any,
      50,
      0,
    );

    if (!isChained) {
      currentRootLine = line;
      currentChainLength = 0;
    }

    if (currentRootLine) {
      meta.set(line.id!, {
        rootLine: currentRootLine,
        chainTotalLength: 0,
        distanceBefore: currentChainLength,
      });
      currentChainLength += analysis.length;
      for (const m of meta.values()) {
        if (m.rootLine === currentRootLine) {
          m.chainTotalLength = currentChainLength;
        }
      }
    }
    tempLastPoint = line.endPoint;
  });

  return meta;
}

export function calculatePathTime(
  startPoint: Point,
  lines: Line[],
  settings: Settings,
  sequence?: SequenceItem[],
  macros?: Map<string, import("../types").TurtleData>,
): TimePrediction {
  const msToSeconds = (value?: number | string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric / 1000;
  };

  const useMotionProfile =
    settings.maxVelocity !== undefined &&
    settings.maxAcceleration !== undefined;

  // Guard aVelocity globally in this scope
  const safeSettings = {
    ...settings,
    aVelocity: Math.max(settings.aVelocity, 0.001),
  };

  const segmentLengths: number[] = [];
  const segmentTimes: number[] = [];
  const timeline: TimelineEvent[] = [];

  const globalChainMeta = sequence
    ? calculateGlobalChainMeta(sequence, lines, startPoint)
    : new Map();

  let currentTime = 0;
  let currentHeading = 0;
  let isFirstPathItem = true;

  // Initialize heading based on start point settings
  // But OVERRIDE if the first path in the sequence has a global chain override
  let startOverrideFound = false;
  if (sequence && sequence.length > 0) {
    const firstPathItem = sequence.find((it) => it.kind === "path");
    if (firstPathItem) {
      const lineId = (firstPathItem as any).lineId;
      const line = lines.find((l) => l.id === lineId);
      if (line) {
        const meta = globalChainMeta.get(line.id!);
        const rootLine = meta?.rootLine;
        if (rootLine?.globalHeading && rootLine.globalHeading !== "none") {
          const effectiveHeading = rootLine.globalHeading;
          if (effectiveHeading === "tangential") {
            const nextP =
              line.controlPoints.length > 0
                ? line.controlPoints[0]
                : line.endPoint;
            currentHeading = getInitialTangentialHeading(startPoint, nextP);
            startOverrideFound = true;
          } else if (effectiveHeading === "constant") {
            const deg = rootLine.globalDegrees || 0;
            const rev = rootLine.globalReverse;
            currentHeading = rev ? deg + 180 : deg;
            startOverrideFound = true;
          } else if (effectiveHeading === "linear") {
            const deg = rootLine.globalStartDeg || 0;
            const rev = rootLine.globalReverse;
            currentHeading = rev ? deg + 180 : deg;
            startOverrideFound = true;
          } else if (effectiveHeading === "facingPoint") {
            const tx = rootLine.globalTargetX || 0;
            const ty = rootLine.globalTargetY || 0;
            const rev = rootLine.globalReverse;
            let angle = Math.atan2(ty - startPoint.y, tx - startPoint.x) * (180 / Math.PI);
            if (rev) angle += 180;
            currentHeading = angle;
            startOverrideFound = true;
          }
        }
      }
    }
  }

  if (!startOverrideFound) {
    if (startPoint.heading === "linear") currentHeading = startPoint.startDeg;
    else if (startPoint.heading === "constant")
      currentHeading = startPoint.degrees;
    else if (startPoint.heading === "tangential") {
      if (lines.length > 0) {
        const firstLine = lines[0];
        const nextP =
          firstLine.controlPoints.length > 0
            ? firstLine.controlPoints[0]
            : firstLine.endPoint;
        currentHeading = getInitialTangentialHeading(startPoint, nextP);
      } else {
        currentHeading = 0;
      }
    }
  }

  if (!Number.isFinite(currentHeading)) currentHeading = 0;

  let lastPoint: Point = startPoint;

  const processSequence = (
    seq: SequenceItem[],
    contextLines: Line[],
    recursionDepth: number = 0,
  ) => {
    if (recursionDepth > 10) {
      console.warn("Max recursion depth reached for macro expansion");
      return;
    }

    const lineById = new Map<string, Line>();
    contextLines.forEach((ln) => {
      if (!ln.id) ln.id = `line-${Math.random().toString(36).slice(2)}`;
      lineById.set(ln.id, ln);
    });

    const globalChainMeta = calculateGlobalChainMeta(seq, contextLines, lastPoint);

    seq.forEach((item, idx) => {
      // Registry Check
      const action = actionRegistry.get(item.kind);
      if (action && action.calculateTime) {
        const res = action.calculateTime(item, {
          currentTime,
          currentHeading,
          lastPoint,
          settings: safeSettings,
          lines: contextLines,
        });
        res.events.forEach((ev) => timeline.push(ev));
        currentTime += res.duration;
        if (res.endHeading !== undefined) {
          currentHeading = res.endHeading;
          isFirstPathItem = false;
        }
        if (res.endPoint) lastPoint = res.endPoint;
        return;
      }

      if (item.kind === "macro") {
        const startTime = currentTime;

        // Use the pre-expanded sequence in the item, which refreshMacros has populated.
        // The lines for this macro should already be in contextLines (which are all project lines).
        if (item.sequence && item.sequence.length > 0) {
          processSequence(item.sequence, contextLines, recursionDepth + 1);
        }

        const endTime = currentTime;
        const duration = endTime - startTime;

        if (duration > 0) {
          timeline.push({
            type: "macro",
            name: item.name || "Macro",
            duration,
            startTime,
            endTime,
          });
        }

        return;
      }

      const line = lineById.get((item as any).lineId);
      if (!line || !line.endPoint) {
        return;
      }
      const prevPoint = lastPoint;

      const prevItem = idx > 0 ? seq[idx - 1] : null;
      const isChained = !!(
        prevItem &&
        prevItem.kind === "path" &&
        ((item as any).isChain === true || line.isChain === true)
      );

      // --- ROTATION CHECK (Initial Turn-to-Face or Wait) ---
      // Unwind requiredStartHeading relative to currentHeading
      let requiredStartHeadingRaw = getLineStartHeading(line, prevPoint);
      // Unwind: find value closest to currentHeading
      let requiredStartHeading = unwrapAngle(
        requiredStartHeadingRaw,
        currentHeading,
      );

      if (!Number.isFinite(requiredStartHeading))
        requiredStartHeading = currentHeading;

      if (isFirstPathItem) {
        currentHeading = requiredStartHeading;
        isFirstPathItem = false;
      }

      let diff = Math.abs(currentHeading - requiredStartHeading);

      // Use a small epsilon
      if (diff > 0.1 && !isChained) {
        // Convert diff to rotation time WITH ACCELERATION logic for Wait events
        const rotTime = calculateRotationTime(diff, safeSettings);

        timeline.push({
          type: "wait",
          duration: rotTime,
          startTime: currentTime,
          endTime: currentTime + rotTime,
          startHeading: currentHeading,
          targetHeading: requiredStartHeading,
          atPoint: prevPoint,
        });
        currentTime += rotTime;
        currentHeading = requiredStartHeading;
      } else if (isChained) {
        // If chained, we don't stop.
        // However, we want to rotate to requiredStartHeading smoothly.
        // Since the robot can drive and rotate, we will factor this into the travel time check below.
        // We will NOT insert a wait block. We just leave currentHeading as is for the start of travel.
      }

      // --- TRAVEL ANALYSIS ---
      // Pass currentHeading to start tracking
      const analysis = analyzePathSegment(
        prevPoint,
        line.controlPoints as any,
        line.endPoint as any,
        100,
        currentHeading,
      );
      const length = analysis.length;
      segmentLengths.push(length);

      let translationTime = 0;
      let motionProfile: number[] | undefined = undefined;
      let velocityProfile: number[] | undefined = undefined;
      let headingProfile: number[] | undefined = undefined;

      const nextItem = seq[idx + 1];
      const isChainedToNext =
        nextItem &&
        nextItem.kind === "path" &&
        ((nextItem as any).isChain === true ||
          (lineById.get((nextItem as any).lineId) as any)?.isChain === true);

      if (useMotionProfile) {
        let entryVelocity = 0;
        let exitVelocity = 0;

        const maxVelGlobal = safeSettings.maxVelocity || 100;

        if (isChained) {
          // Determine the corner angle from the previous path to this path
          // We use the start heading of this path vs the end heading of the previous path
          let prevEndHeading = 0;
          if (idx > 0 && seq[idx - 1].kind === "path") {
            const prevLineId = (seq[idx - 1] as any).lineId;
            const prevLine = lineById.get(prevLineId);
            if (prevLine) {
              // Start of the previous line isn't immediately available, but we can rough it from currentHeading
              // A better heuristic is to look at the immediate start angle of this line vs the inherited currentHeading
              let thisStartHeading = getLineStartHeading(line, prevPoint);
              let diff = Math.abs(
                getAngularDifference(currentHeading, thisStartHeading),
              );
              // Cosine heuristic: 0 deg diff -> maxVel, 90 deg diff -> 0 vel
              let speedFactor = Math.max(0, Math.cos((diff * Math.PI) / 180));
              entryVelocity = maxVelGlobal * speedFactor;
            }
          } else {
            entryVelocity = maxVelGlobal;
          }
        }

        if (isChainedToNext) {
          let nextLine = lineById.get((nextItem as any).lineId);
          if (nextLine) {
            let thisEndHeading = getLineEndHeading(line, prevPoint);
            let nextStartHeading = getLineStartHeading(
              nextLine,
              line.endPoint as Point,
            );
            let diff = Math.abs(
              getAngularDifference(thisEndHeading, nextStartHeading),
            );
            let speedFactor = Math.max(0, Math.cos((diff * Math.PI) / 180));
            exitVelocity = maxVelGlobal * speedFactor;
          }
        }

        const result = calculateMotionProfileDetailed(
          analysis.steps,
          safeSettings,
          entryVelocity,
          exitVelocity,
        );
        translationTime = result.totalTime;
        motionProfile = result.profile;
        velocityProfile = result.velocityProfile;
      } else {
        const avgVelocity =
          (safeSettings.xVelocity + safeSettings.yVelocity) / 2;
        translationTime = length / avgVelocity;
      }

      // Calculate Rotation Time (for non-profile logic)
      let rotationRequired = 0;

      // Determine End Heading (Unwound)
      let endHeadingRaw = getLineEndHeading(line, prevPoint);
      let endHeading = endHeadingRaw;

      // Resolve global chain heading override for endHeading/rotation calculation
      const chainMeta = globalChainMeta.get(line.id!);
      const rootLine = chainMeta?.rootLine;
      const isGlobalOverride = !!(
        rootLine?.globalHeading && rootLine.globalHeading !== "none"
      );
      const effectiveHeading = isGlobalOverride
        ? rootLine.globalHeading!
        : line.endPoint.heading;

      if (effectiveHeading === "tangential") {
        if (isChained) {
          endHeading = unwrapAngle(endHeadingRaw, currentHeading);
          rotationRequired = Math.abs(endHeading - currentHeading);
        } else {
          endHeading = currentHeading + analysis.netRotation;
          rotationRequired = analysis.tangentRotation;
        }
      } else if (effectiveHeading === "constant") {
        const constDeg = isGlobalOverride
          ? rootLine.globalDegrees || 0
          : (line.endPoint as any).degrees || 0;
        const rev = isGlobalOverride
          ? rootLine.globalReverse
          : (line.endPoint as any).reverse;
        const finalDeg = rev ? constDeg + 180 : constDeg;
        endHeading = unwrapAngle(finalDeg, currentHeading);
        rotationRequired = Math.abs(endHeading - currentHeading);
      } else if (effectiveHeading === "linear") {
        const startDeg = isGlobalOverride
          ? rootLine.globalStartDeg || 0
          : (line.endPoint as any).startDeg || 0;
        const endDeg = isGlobalOverride
          ? rootLine.globalEndDeg || 0
          : (line.endPoint as any).endDeg || 0;
        const rev = isGlobalOverride
          ? rootLine.globalReverse
          : (line.endPoint as any).reverse;
        if (rev) {
          const shortDiff = endDeg - startDeg;
          const normalizedShort = ((shortDiff % 360) + 360) % 360;
          const longDiff =
            normalizedShort <= 180 ? normalizedShort - 360 : normalizedShort;
          endHeading = unwrapAngle(startDeg + longDiff, currentHeading);
          rotationRequired = Math.abs(longDiff);
        } else {
          endHeading = unwrapAngle(endDeg, currentHeading);
          const startUnwound = unwrapAngle(startDeg, currentHeading);
          rotationRequired = Math.abs(endHeading - startUnwound);
        }
      } else if (effectiveHeading === "facingPoint") {
        const targetX = isGlobalOverride
          ? rootLine.globalTargetX || 0
          : (line.endPoint as any).targetX || 0;
        const targetY = isGlobalOverride
          ? rootLine.globalTargetY || 0
          : (line.endPoint as any).targetY || 0;
        const rev = isGlobalOverride
          ? rootLine.globalReverse
          : (line.endPoint as any).reverse;
        const facingAngle =
          Math.atan2(targetY - line.endPoint.y, targetX - line.endPoint.x) *
          (180 / Math.PI);
        const finalFacing = rev ? facingAngle + 180 : facingAngle;
        endHeading = unwrapAngle(finalFacing, currentHeading);
        rotationRequired = Math.abs(endHeading - currentHeading);
      } else if (effectiveHeading === "piecewise") {
        let targetHeading = currentHeading;
        const cTotalLen = chainMeta ? chainMeta.chainTotalLength : length;
        const cDistBefore = chainMeta ? chainMeta.distanceBefore : 0;
        // Use globalT=1.0 for the end of this segment
        const segments = isGlobalOverride
          ? rootLine.globalSegments || []
          : line.endPoint.segments || [];
        const globalT =
          isGlobalOverride && cTotalLen > 0
            ? (cDistBefore + length) / cTotalLen
            : 1.0;
        let activeSeg = null;
        for (const seg of segments) {
          if (globalT >= seg.tStart && globalT <= seg.tEnd) {
            activeSeg = seg;
            break;
          }
        }
        if (!activeSeg && segments.length > 0)
          activeSeg = segments[segments.length - 1];

        if (activeSeg) {
          if (activeSeg.heading === "constant") {
            let deg = activeSeg.degrees ?? 0;
            if (activeSeg.reverse) deg += 180;
            targetHeading = unwrapAngle(deg, currentHeading);
          } else if (activeSeg.heading === "tangential") {
            targetHeading = unwrapAngle(endHeadingRaw, currentHeading);
          } else if (activeSeg.heading === "linear") {
            let deg = activeSeg.endDeg ?? 0;
            if (activeSeg.reverse) {
              const sDeg = activeSeg.startDeg ?? 0;
              const eDeg = activeSeg.endDeg ?? 0;
              const shortDiff = eDeg - sDeg;
              const normalizedShort = ((shortDiff % 360) + 360) % 360;
              const longDiff =
                normalizedShort <= 180 ? normalizedShort - 360 : normalizedShort;
              const startUnwound = unwrapAngle(sDeg, currentHeading);
              targetHeading = startUnwound + longDiff;
            } else {
              targetHeading = unwrapAngle(deg, currentHeading);
            }
          } else if (activeSeg.heading === "facingPoint") {
            const targetX = activeSeg.targetX || 0;
            const targetY = activeSeg.targetY || 0;
            let angle =
              Math.atan2(targetY - line.endPoint.y, targetX - line.endPoint.x) *
              (180 / Math.PI);
            if (activeSeg.reverse) angle += 180;
            targetHeading = unwrapAngle(angle, currentHeading);
          }
        }
        endHeading = targetHeading;
        rotationRequired = 0;
      }

      if (!Number.isFinite(endHeading)) endHeading = currentHeading;

      const totalRotationRequiredForSegment = isChained
        ? Math.abs(endHeading - currentHeading)
        : rotationRequired;
      const physicalRotationTime = calculateRotationTime(
        totalRotationRequiredForSegment,
        safeSettings,
      );

      const segmentTime = Math.max(translationTime, physicalRotationTime);

      if (
        useMotionProfile &&
        motionProfile &&
        segmentTime > translationTime &&
        translationTime > 0
      ) {
        const scale = segmentTime / translationTime;
        motionProfile = motionProfile.map((t) => t * scale);
      }

      // Build heading profile AFTER motion profile is scaled/finalized so we have accurate times
      if (useMotionProfile && motionProfile) {
        headingProfile = [currentHeading];
        const samples = analysis.steps.length;

        const globalHeadingMode = isGlobalOverride
          ? rootLine.globalHeading!
          : line.endPoint.heading;
        const cTotalLen = chainMeta ? chainMeta.chainTotalLength : length;
        const cDistBefore = chainMeta ? chainMeta.distanceBefore : 0;

        if (globalHeadingMode === "tangential") {
          if (isChained) {
            // Chained (with or without global override): race toward the ABSOLUTE geometric
            // tangent of the curve at each sample, capped by max angular velocity * dt.
            // finite-difference here — analysis.steps[i].heading only tracks curvature
            // deltas added to currentHeading, NOT the path's true absolute tangent, so
            // it would compare 90° vs 89°,88°... instead of 90° vs 45°,44°... etc.
            const cps = [prevPoint, ...line.controlPoints, line.endPoint];
            const isReverse = (line.endPoint as any).reverse;
            const maxAngVelDegPerSec =
              Math.max(safeSettings.aVelocity, 0.001) * (180 / Math.PI);
            const eps = 0.005;
            let simH = currentHeading;
            for (let i = 1; i <= samples; i++) {
              const t = i / samples;
              const tA = Math.max(0, t - eps);
              const tB = Math.min(1, t + eps);
              const posA = getCurvePoint(tA, cps);
              const posB = getCurvePoint(tB, cps);
              const dx = posB.x - posA.x;
              const dy = posB.y - posA.y;
              let idealTarget: number;
              if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
                idealTarget = simH; // degenerate — hold current
              } else {
                const absTangentDeg = Math.atan2(dy, dx) * (180 / Math.PI);
                idealTarget = unwrapAngle(
                  isReverse ? absTangentDeg + 180 : absTangentDeg,
                  simH,
                );
              }
              const dt =
                (motionProfile[i] ?? motionProfile[motionProfile.length - 1]) -
                (motionProfile[i - 1] ?? 0);
              const maxRot = maxAngVelDegPerSec * dt;
              simH += Math.max(-maxRot, Math.min(maxRot, idealTarget - simH));
              headingProfile.push(simH);
            }
          } else {
            // Non-chained or global override: instantly track the geometric tangent.
            // analyzePathSegment seeds from currentHeading so the profile is continuous.
            for (const step of analysis.steps) {
              headingProfile.push(step.heading);
            }
          }
        } else if (globalHeadingMode === "constant") {
          const targetConstDeg = isGlobalOverride ? rootLine.globalDegrees || 0 : (line.endPoint as any).degrees || 0;
          const isReverse = isGlobalOverride ? rootLine.globalReverse : (line.endPoint as any).reverse;
          const finalTargetDeg = isReverse ? targetConstDeg + 180 : targetConstDeg;
          const targetConstHeading = unwrapAngle(finalTargetDeg, currentHeading);

          if (isChained) {
            for (let i = 1; i <= samples; i++) {
              const stepTime = motionProfile[i];
              const ratio =
                physicalRotationTime > 0
                  ? Math.min(1.0, stepTime / physicalRotationTime)
                  : 1.0;
              headingProfile.push(
                currentHeading + (endHeading - currentHeading) * ratio,
              );
            }
          } else {
            for (let i = 1; i <= samples; i++) {
              headingProfile.push(targetConstHeading);
            }
          }
        } else if (globalHeadingMode === "linear") {
          const startDeg = isGlobalOverride ? rootLine.globalStartDeg || 0 : (line.endPoint as any).startDeg || 0;
          const endDeg = isGlobalOverride ? rootLine.globalEndDeg || 0 : (line.endPoint as any).endDeg || 0;
          const isReverse = isGlobalOverride ? rootLine.globalReverse : (line.endPoint as any).reverse;

          if (isReverse) {
            const shortDiff = endDeg - startDeg;
            const normalizedShort = ((shortDiff % 360) + 360) % 360;
            const longDiff =
              normalizedShort <= 180 ? normalizedShort - 360 : normalizedShort;
            const targetStartHeading = unwrapAngle(startDeg, currentHeading);

            for (let i = 1; i <= samples; i++) {
              if (isGlobalOverride) {
                 const t = cTotalLen > 0 ? (cDistBefore + (i / samples) * length) / cTotalLen : (i / samples);
                 headingProfile.push(targetStartHeading + longDiff * t);
              } else if (isChained) {
                const stepTime = motionProfile[i];
                const ratio =
                  physicalRotationTime > 0
                    ? Math.min(1.0, stepTime / physicalRotationTime)
                    : 1.0;
                headingProfile!.push(
                  currentHeading + (endHeading - currentHeading) * ratio,
                );
              } else {
                const ratio = i / samples;
                const interpolatedHeading = targetStartHeading + longDiff * ratio;
                headingProfile!.push(interpolatedHeading);
              }
            }
          } else {
            const startUnwound = unwrapAngle(startDeg, currentHeading);
            const unwrappedEnd = unwrapAngle(endDeg, startUnwound);
            for (let i = 1; i <= samples; i++) {
              if (isGlobalOverride) {
                 const t = cTotalLen > 0 ? (cDistBefore + (i / samples) * length) / cTotalLen : (i / samples);
                 headingProfile.push(startUnwound + (unwrappedEnd - startUnwound) * t);
              } else if (isChained) {
                const stepTime = motionProfile[i];
                const ratio =
                  physicalRotationTime > 0
                    ? Math.min(1.0, stepTime / physicalRotationTime)
                    : 1.0;
                headingProfile!.push(
                  currentHeading + (endHeading - currentHeading) * ratio,
                );
              } else {
                const ratio = i / samples;
                const interpolatedHeading =
                  startUnwound + (unwrappedEnd - startUnwound) * ratio;
                headingProfile!.push(interpolatedHeading);
              }
            }
          }

        } else if (globalHeadingMode === "facingPoint") {
          const cps = [prevPoint, ...line.controlPoints, line.endPoint];
          const targetX = isGlobalOverride ? rootLine.globalTargetX || 0 : (line.endPoint as any).targetX || 0;
          const targetY = isGlobalOverride ? rootLine.globalTargetY || 0 : (line.endPoint as any).targetY || 0;
          const isReverse = isGlobalOverride ? rootLine.globalReverse : (line.endPoint as any).reverse;

          // Always track the ideal per-position facing angle continuously — no isChained
          // branching. Using a running simH (last profile entry) ensures the angle is
          // unwrapped relative to the most recently achieved heading, not an old anchor.
          let simH = currentHeading;
          for (let i = 1; i <= samples; i++) {
            const t = i / samples;
            const pos = getCurvePoint(t, cps);
            let angle =
              Math.atan2(targetY - pos.y, targetX - pos.x) * (180 / Math.PI);
            if (isReverse) angle += 180;
            const targetHeading = unwrapAngle(angle, simH);
            simH = targetHeading;
            headingProfile.push(simH);
          }
        } else if (globalHeadingMode === "piecewise") {
          const cps = [prevPoint, ...line.controlPoints, line.endPoint];
          const segments = isGlobalOverride ? rootLine.globalSegments || [] : line.endPoint.segments || [];
          let simHeading = currentHeading;
          
          for (let i = 1; i <= samples; i++) {
            const localRatio = i / samples;
            const t = isGlobalOverride && cTotalLen > 0
               ? (cDistBefore + localRatio * length) / cTotalLen
               : localRatio;

            let activeSeg = null;
            for (const seg of segments) {
               if (t >= seg.tStart && t <= seg.tEnd) {
                 activeSeg = seg;
                 break;
               }
            }
            if (!activeSeg) {
               headingProfile.push(simHeading);
               continue;
            }

            let targetHeading = simHeading;
            if (activeSeg.heading === "constant") {
               let deg = activeSeg.degrees ?? 0;
               if (activeSeg.reverse) deg += 180;
               targetHeading = unwrapAngle(deg, simHeading);
            } else if (activeSeg.heading === "tangential") {
               let deg = analysis.steps[Math.min(i-1, analysis.steps.length-1)].heading;
               if (activeSeg.reverse) deg += 180;
               targetHeading = unwrapAngle(deg, simHeading);
            } else if (activeSeg.heading === "linear") {
               let sDeg = activeSeg.startDeg ?? 0;
               let eDeg = activeSeg.endDeg ?? 0;
               let localT = 0;
               if (activeSeg.tEnd > activeSeg.tStart) {
                  localT = (t - activeSeg.tStart) / (activeSeg.tEnd - activeSeg.tStart);
               }
               if (localT < 0) localT = 0;
               if (localT > 1) localT = 1;
               
               if (activeSeg.reverse) {
                  const shortDiff = eDeg - sDeg;
                  const normalizedShort = ((shortDiff % 360) + 360) % 360;
                  const longDiff = normalizedShort <= 180 ? normalizedShort - 360 : normalizedShort;
                  const startUnwound = unwrapAngle(sDeg, simHeading);
                  targetHeading = startUnwound + longDiff * localT;
               } else {
                  let endUnwound = unwrapAngle(eDeg, simHeading);
                  let startUnwound = unwrapAngle(sDeg, simHeading);
                  targetHeading = startUnwound + (endUnwound - startUnwound) * localT;
               }
            } else if (activeSeg.heading === "facingPoint") {
               const targetX = activeSeg.targetX || 0;
               const targetY = activeSeg.targetY || 0;
               const pos = getCurvePoint(t, cps);
               let angle = Math.atan2(targetY - pos.y, targetX - pos.x) * (180 / Math.PI);
               if (activeSeg.reverse) angle += 180;
               targetHeading = unwrapAngle(angle, simHeading);
            }

            const dt = motionProfile[i] - motionProfile[i-1];
            const catchUpRequired = Math.abs(targetHeading - simHeading);
            const stepPhysicalTime = calculateRotationTime(catchUpRequired, safeSettings);
            let nextHeading;
            if (stepPhysicalTime > 0 && dt < stepPhysicalTime) {
                const ratio = dt / stepPhysicalTime;
                nextHeading = simHeading + (targetHeading - simHeading) * Math.min(1.0, ratio);
            } else {
                nextHeading = targetHeading;
            }
            simHeading = nextHeading;
            headingProfile.push(simHeading);
          }
        }

        // Re-unwrap the heading profile so no two adjacent entries differ by > 180°.
        // This prevents teleport snaps both within a segment and across segment boundaries.
        if (headingProfile && headingProfile.length > 1) {
          for (let k = 1; k < headingProfile.length; k++) {
            const prev = headingProfile[k - 1];
            let curr = headingProfile[k];
            // Bring curr within 180° of prev
            while (curr - prev > 180) curr -= 360;
            while (curr - prev < -180) curr += 360;
            headingProfile[k] = curr;
          }
        }
      }

      // Cleaned up the duplicate declarations that caused tests to fail.

      segmentTimes.push(segmentTime);
      const lineIndex = contextLines.findIndex((l) => l.id === line.id);
        timeline.push({
          type: "travel",
          duration: segmentTime,
          startTime: currentTime,
          endTime: currentTime + segmentTime,
          lineIndex,
          line: line, // Pass direct reference
          prevPoint: prevPoint as Point, // Pass direct reference
          motionProfile: motionProfile,
          velocityProfile: velocityProfile,
          headingProfile: headingProfile,
          isGlobalOverride: isGlobalOverride,
          rootLine: rootLine,
          globalHeading: (isGlobalOverride
            ? rootLine.globalHeading!
            : line.endPoint.heading) as any,
        });
      currentTime += segmentTime;

      // Update state: seed from actual last heading profile value if available
      // so the next segment always continues from wherever we truly ended up
      // (which can differ from endHeading when using global chain interpolation).
      if (headingProfile && headingProfile.length > 0) {
        currentHeading = headingProfile[headingProfile.length - 1];
      } else {
        currentHeading = endHeading;
      }
      lastPoint = line.endPoint as Point;
    });
  };

  const initialSeq =
    sequence && sequence.length
      ? sequence
      : lines.map((ln) => ({ kind: "path", lineId: ln.id! }) as SequenceItem);

  processSequence(initialSeq, lines);

  const totalTime = currentTime;
  const totalDistance = segmentLengths.reduce((sum, length) => sum + length, 0);

  return {
    totalTime,
    segmentTimes,
    totalDistance,
    timeline,
  };
}

export function formatTime(totalSeconds: number): string {
  // Handle NaN or Infinity
  if (!Number.isFinite(totalSeconds)) return "Infinite";
  if (totalSeconds <= 0) return "0.000s";

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}s`;
  }
  return `${seconds.toFixed(3)}s`;
}

export function getAnimationDuration(
  totalTime: number,
  speedFactor: number = 1.0,
): number {
  return (totalTime * 1000) / speedFactor;
}
