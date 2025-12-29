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
} from "./math";

/**
 * Calculates the first derivative of a Bezier curve of degree N at t.
 * The derivative of an N-degree Bezier defined by P0...Pn is an (N-1)-degree Bezier
 * defined by Q0...Q(n-1), where Qi = n * (P(i+1) - Pi).
 */
function getBezierDerivative(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  const n = points.length - 1;
  if (n < 1) return { x: 0, y: 0 };

  const derivativePoints = [];
  for (let i = 0; i < n; i++) {
    derivativePoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y),
    });
  }

  // Use the existing getCurvePoint (De Casteljau) to evaluate the derivative curve
  return getCurvePoint(t, derivativePoints);
}

/**
 * Calculates the second derivative of a Bezier curve of degree N at t.
 * This is the derivative of the first derivative.
 */
function getBezierSecondDerivative(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  const n = points.length - 1;
  if (n < 2) return { x: 0, y: 0 };

  // Calculate first derivative control points Q
  const qPoints = [];
  for (let i = 0; i < n; i++) {
    qPoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y),
    });
  }

  // Calculate second derivative control points R from Q
  // R has degree n-2, derived from Q (degree n-1)
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

/**
 * Calculate curvature at t.
 * kappa = |x'y'' - y'x''| / (x'^2 + y'^2)^(3/2)
 * Radius = 1 / kappa
 */
function getCurvatureRadius(
  d1: { x: number; y: number },
  d2: { x: number; y: number },
): number {
  const numerator = Math.abs(d1.x * d2.y - d1.y * d2.x);
  const denominator = Math.pow(d1.x * d1.x + d1.y * d1.y, 1.5);
  if (numerator < 1e-6) return Infinity; // Straight line
  return denominator / numerator;
}

interface PathAnalysis {
  length: number;
  minRadius: number;
  tangentRotation: number;
}

/**
 * Analyzes a path segment (Line, Quadratic, or Cubic)
 */
function analyzePathSegment(
  start: BasePoint,
  controlPoints: BasePoint[],
  end: BasePoint,
  samples: number = 50,
): PathAnalysis {
  // Safe access to control points
  const cps = controlPoints || [];

  let length = 0;
  let minRadius = Infinity;
  let prevPoint = start;
  let tangentRotation = 0;
  let prevAngle: number | null = null;

  // Determine curve type
  const isLine = cps.length === 0;
  const isQuadratic = cps.length === 1;
  const isCubic = cps.length >= 2;

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = getCurvePoint(t, [start, ...cps, end]);

    // Length
    if (i > 0) {
      const dx = point.x - prevPoint.x;
      const dy = point.y - prevPoint.y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    prevPoint = point;

    // Derivatives for Curvature and Tangent
    let d1 = { x: 0, y: 0 };
    let d2 = { x: 0, y: 0 };

    if (isLine) {
      d1 = { x: end.x - start.x, y: end.y - start.y };
      d2 = { x: 0, y: 0 }; // Zero curvature
    } else {
      // Use generic N-degree Bezier derivative logic for Quadratic, Cubic, Quartic, etc.
      const fullPoints = [start, ...cps, end];
      d1 = getBezierDerivative(t, fullPoints);
      d2 = getBezierSecondDerivative(t, fullPoints);
    }

    // Curvature Radius
    const radius = getCurvatureRadius(d1, d2);
    if (radius < minRadius) minRadius = radius;

    // Tangent Angle
    // Ensure d1 is not zero vector to avoid undefined atan2
    if (Math.abs(d1.x) > 1e-9 || Math.abs(d1.y) > 1e-9) {
      const angle = Math.atan2(d1.y, d1.x) * (180 / Math.PI);
      if (prevAngle !== null) {
        const diff = Math.abs(getAngularDifference(prevAngle, angle));
        // Accumulate all rotation to be safe, filtering only extreme noise
        if (diff > 0.001) {
          tangentRotation += diff;
        }
      }
      prevAngle = angle;
    }
  }

  return { length, minRadius, tangentRotation };
}

/**
 * Calculate time for a motion profile (trapezoidal or triangular)
 */
function calculateMotionProfileTime(
  distance: number,
  maxVel: number,
  maxAcc: number,
  maxDec?: number,
): number {
  const deceleration = maxDec || maxAcc;

  // Avoid division by zero
  if (maxVel <= 0 || maxAcc <= 0 || deceleration <= 0) return 0;

  const accDist = (maxVel * maxVel) / (2 * maxAcc);
  const decDist = (maxVel * maxVel) / (2 * deceleration);

  if (distance >= accDist + decDist) {
    const accTime = maxVel / maxAcc;
    const decTime = maxVel / deceleration;
    const constDist = distance - accDist - decDist;
    const constTime = constDist / maxVel;

    return accTime + constTime + decTime;
  } else {
    const vPeak = Math.sqrt(
      (2 * distance * maxAcc * deceleration) / (maxAcc + deceleration),
    );
    const accTime = vPeak / maxAcc;
    const decTime = vPeak / deceleration;

    return accTime + decTime;
  }
}

export function calculatePathTime(
  startPoint: Point,
  lines: Line[],
  settings: Settings,
  sequence?: SequenceItem[],
): TimePrediction {
  const msToSeconds = (value?: number | string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric / 1000;
  };

  const useMotionProfile =
    settings.maxVelocity !== undefined &&
    settings.maxAcceleration !== undefined;

  const segmentLengths: number[] = [];
  const segmentTimes: number[] = [];
  const timeline: TimelineEvent[] = [];

  let currentTime = 0;
  let currentHeading = 0;

  // Initialize heading based on start point settings
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
      const angle =
        Math.atan2(nextP.y - startPoint.y, nextP.x - startPoint.x) *
        (180 / Math.PI);
      currentHeading = startPoint.reverse ? angle + 180 : angle;
    } else {
      currentHeading = 0;
    }
  }

  // Create map and default sequence
  const lineById = new Map<string, Line>();
  lines.forEach((ln) => {
    if (!ln.id) ln.id = `line-${Math.random().toString(36).slice(2)}`;
    lineById.set(ln.id, ln);
  });

  const seq: SequenceItem[] =
    sequence && sequence.length
      ? sequence
      : lines.map((ln) => ({ kind: "path", lineId: ln.id! }));

  let lastPoint: Point = startPoint;

  seq.forEach((item, idx) => {
    if (item.kind === "wait") {
      const waitSeconds = msToSeconds(item.durationMs);
      if (waitSeconds > 0) {
        timeline.push({
          type: "wait",
          name: item.name,
          duration: waitSeconds,
          startTime: currentTime,
          endTime: currentTime + waitSeconds,
          waitId: item.id,
          startHeading: currentHeading,
          targetHeading: currentHeading,
          atPoint: lastPoint,
        });
        currentTime += waitSeconds;
      }
      return;
    }

    const line = lineById.get(item.lineId);
    if (!line || !line.endPoint) {
      return;
    }
    const prevPoint = lastPoint;

    // --- ROTATION CHECK (Initial Turn-to-Face or Wait) ---
    // If we need to be at a specific heading before starting the path segment
    const requiredStartHeading = getLineStartHeading(line, prevPoint);
    if (idx === 0) currentHeading = requiredStartHeading;

    // Wait logic: If the current heading is significantly different from the start heading of the line
    // we simulate a "wait" turn.
    // Note: If the previous line ended at 90 and this one starts at 90, diff is 0.
    // If the previous line ended at 90 and this one starts at 180 (e.g. sharp corner in Tangential mode),
    // we assume we must stop and turn.
    const diff = Math.abs(
      getAngularDifference(currentHeading, requiredStartHeading),
    );
    if (diff > 0.1) {
      const diffRad = diff * (Math.PI / 180);
      const rotTime = diffRad / settings.aVelocity;
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
    }

    // --- TRAVEL ANALYSIS ---
    const analysis = analyzePathSegment(
      prevPoint,
      line.controlPoints as any,
      line.endPoint as any,
    );
    const length = analysis.length;
    segmentLengths.push(length);

    // Calculate Translation Time (Physical Limits)
    let maxVel = settings.maxVelocity || 100;
    // 1. Friction Limit (Centripetal: v = sqrt(k * g * r))
    if (settings.kFriction && settings.kFriction > 0) {
      // 386.22 in/s^2 is gravity
      const frictionLimit = Math.sqrt(
        settings.kFriction * 386.22 * analysis.minRadius,
      );
      if (frictionLimit < maxVel) maxVel = frictionLimit;
    }

    // 2. Angular Velocity Limit for Curve Following (v = w * r)
    // Limits the speed based on the robot's maximum angular velocity and the path curvature.
    // This applies to the path vector rotation regardless of chassis heading mode.
    const angVelLimit = settings.aVelocity * analysis.minRadius;
    if (angVelLimit < maxVel) maxVel = angVelLimit;

    let translationTime = 0;
    if (useMotionProfile) {
      translationTime = calculateMotionProfileTime(
        length,
        maxVel,
        settings.maxAcceleration!,
        settings.maxDeceleration,
      );
    } else {
      const avgVelocity = (settings.xVelocity + settings.yVelocity) / 2;
      translationTime = length / avgVelocity;
    }

    // Calculate Rotation Time (Simultaneous Heading Change)
    // We need to know the Total Rotation required during this segment.
    let rotationRequired = 0;
    const endHeading = getLineEndHeading(line, prevPoint);

    if (line.endPoint.heading === "tangential") {
      // For tangential, the robot rotates as the curve turns.
      // We use the accumulated tangent rotation from analysis.
      rotationRequired = analysis.tangentRotation;
    } else if (line.endPoint.heading === "constant") {
      // No rotation during movement (unless previous was different, which is handled by initial Wait)
      rotationRequired = 0;
    } else if (line.endPoint.heading === "linear") {
      // Linear interpolation from start heading to end heading
      // start heading is `requiredStartHeading` (which we are at)
      // end heading is `endHeading`
      // For linear heading, we use the absolute difference of the raw values
      // to respect multi-turn rotations (e.g. 0 to 720)
      rotationRequired = Math.abs(endHeading - requiredStartHeading);
    }

    const rotationTime =
      (rotationRequired * (Math.PI / 180)) / settings.aVelocity;

    // The segment takes the maximum of translation time (slowed by physics) and rotation time
    const segmentTime = Math.max(translationTime, rotationTime);

    segmentTimes.push(segmentTime);
    const lineIndex = lines.findIndex((l) => l.id === line.id);
    timeline.push({
      type: "travel",
      duration: segmentTime,
      startTime: currentTime,
      endTime: currentTime + segmentTime,
      lineIndex,
    });
    currentTime += segmentTime;

    // Update state
    currentHeading = endHeading;
    lastPoint = line.endPoint as Point;
  });

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
