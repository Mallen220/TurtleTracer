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

/**
 * Calculate curvature at t.
 */
function getCurvatureRadius(
  d1: { x: number; y: number },
  d2: { x: number; y: number },
): number {
  const numerator = Math.abs(d1.x * d2.y - d1.y * d2.x);
  const denominator = Math.pow(d1.x * d1.x + d1.y * d1.y, 1.5);

  if (Math.abs(d1.x) < 1e-6 && Math.abs(d1.y) < 1e-6) {
    return 0;
  }

  if (numerator < 1e-6) return Infinity; // Straight line
  return denominator / numerator;
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
function unwrapAngle(target: number, reference: number): number {
  const diff = getAngularDifference(reference, target);
  return reference + diff;
}

/**
 * Analyzes a path segment (Line, Quadratic, or Cubic)
 */
function analyzePathSegment(
  start: BasePoint,
  controlPoints: BasePoint[],
  end: BasePoint,
  samples: number = 50,
  initialHeading: number, // Unwrapped starting heading
): PathAnalysis {
  const cps = controlPoints || [];

  let length = 0;
  let minRadius = Infinity;
  let prevPoint = start;
  let tangentRotation = 0;
  let netRotation = 0;
  let prevAngle: number | null = null;
  let currentUnwrapped = Number.isFinite(initialHeading) ? initialHeading : 0;

  const isLine = cps.length === 0;
  const steps: PathStep[] = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = getCurvePoint(t, [start, ...cps, end]);

    let deltaLength = 0;
    if (i > 0) {
      const dx = point.x - prevPoint.x;
      const dy = point.y - prevPoint.y;
      deltaLength = Math.sqrt(dx * dx + dy * dy);
      length += deltaLength;
    }
    prevPoint = point;

    let d1 = { x: 0, y: 0 };
    let d2 = { x: 0, y: 0 };

    if (isLine) {
      d1 = { x: end.x - start.x, y: end.y - start.y };
      d2 = { x: 0, y: 0 };
    } else {
      const fullPoints = [start, ...cps, end];
      d1 = getBezierDerivative(t, fullPoints);
      d2 = getBezierSecondDerivative(t, fullPoints);
    }

    const radius = getCurvatureRadius(d1, d2);
    if (radius < minRadius) minRadius = radius;

    let stepRotation = 0;
    if (Math.abs(d1.x) > 1e-9 || Math.abs(d1.y) > 1e-9) {
      const angle = Math.atan2(d1.y, d1.x) * (180 / Math.PI);

      if (prevAngle === null) {
        // Do not reset currentUnwrapped; respect the initialHeading passed in.
      } else {
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
function calculateRotationTime(
  angleDiffDegrees: number,
  settings: Settings,
): number {
  if (angleDiffDegrees <= 0.001) return 0;

  const diffRad = angleDiffDegrees * (Math.PI / 180);
  const maxVel = Math.max(settings.aVelocity, 0.001);

  // Estimate max angular acceleration from linear acceleration and robot width
  // alpha = a_linear / r
  // Assuming rotation around center, wheels are at width/2
  // We use width/2 as the lever arm for conservative estimate
  const leverArm = Math.max(settings.rWidth / 2, 1); // Avoid division by zero
  const maxAccel = settings.maxAcceleration || 30;
  const maxAngAccel = maxAccel / leverArm;

  // Motion profile:
  const accDist = (maxVel * maxVel) / (2 * maxAngAccel);
  const decDist = accDist; // Symmetric

  if (diffRad >= accDist + decDist) {
    // Trapezoid
    const accTime = maxVel / maxAngAccel;
    const decTime = accTime;
    const constDist = diffRad - accDist - decDist;
    const constTime = constDist / maxVel;
    return accTime + constTime + decTime;
  } else {
    // Triangle (don't reach max speed)
    const vPeak = Math.sqrt(diffRad * maxAngAccel);
    const accTime = vPeak / maxAngAccel;
    const decTime = accTime;
    return accTime + decTime;
  }
}

/**
 * Calculates time for a motion profile over a path with varying constraints.
 * Returns both total time and the cumulative time profile.
 */
function calculateMotionProfileDetailed(
  steps: PathStep[],
  settings: Settings,
): { totalTime: number; profile: number[] } {
  const maxVelGlobal = settings.maxVelocity || 100;
  const maxAcc = settings.maxAcceleration || 30;
  const maxDec = settings.maxDeceleration || maxAcc;
  const kFriction = settings.kFriction || 0;
  // Ensure aVelocity is finite and non-zero to avoid Infinity
  const aVelocity = Math.max(settings.aVelocity, 0.001);

  const n = steps.length;
  if (n === 0) return { totalTime: 0, profile: [0] };

  const vAtPoints = new Float64Array(n + 1);
  vAtPoints[0] = 0;

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
  vAtPoints[n] = 0;
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

  return { totalTime, profile };
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

  // Guard aVelocity globally in this scope
  const safeSettings = {
    ...settings,
    aVelocity: Math.max(settings.aVelocity, 0.001),
  };

  const segmentLengths: number[] = [];
  const segmentTimes: number[] = [];
  const timeline: TimelineEvent[] = [];

  let currentTime = 0;
  let currentHeading = 0;

  // Initialize heading based on start point settings
  // Note: We don't have a previous reference, so we take the raw value.
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

  if (!Number.isFinite(currentHeading)) currentHeading = 0;

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
    // Unwind requiredStartHeading relative to currentHeading
    let requiredStartHeadingRaw = getLineStartHeading(line, prevPoint);
    // Unwind: find value closest to currentHeading
    let requiredStartHeading = unwrapAngle(
      requiredStartHeadingRaw,
      currentHeading,
    );

    if (!Number.isFinite(requiredStartHeading))
      requiredStartHeading = currentHeading;

    if (idx === 0) currentHeading = requiredStartHeading;

    const diff = Math.abs(currentHeading - requiredStartHeading);

    // Use a small epsilon
    if (diff > 0.1) {
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
    let headingProfile: number[] | undefined = undefined;

    if (useMotionProfile) {
      const result = calculateMotionProfileDetailed(
        analysis.steps,
        safeSettings,
      );
      translationTime = result.totalTime;
      motionProfile = result.profile;

      // Build heading profile if Tangential
      if (line.endPoint.heading === "tangential") {
        headingProfile = [analysis.startHeading]; // Start
        for (const step of analysis.steps) {
          headingProfile.push(step.heading);
        }
      }
    } else {
      const avgVelocity = (safeSettings.xVelocity + safeSettings.yVelocity) / 2;
      translationTime = length / avgVelocity;
    }

    // Calculate Rotation Time (for non-profile logic)
    let rotationRequired = 0;

    // Determine End Heading (Unwound)
    let endHeadingRaw = getLineEndHeading(line, prevPoint);
    let endHeading = endHeadingRaw;

    if (line.endPoint.heading === "tangential") {
      endHeading = currentHeading + analysis.netRotation;
      rotationRequired = analysis.tangentRotation;
    } else if (line.endPoint.heading === "constant") {
      // Rotate to specific constant heading
      endHeading = unwrapAngle(line.endPoint.degrees, currentHeading);
      rotationRequired = 0;
    } else if (line.endPoint.heading === "linear") {
      // Linear: Interpolate from start to end.
      endHeading = unwrapAngle(line.endPoint.endDeg, currentHeading);
      rotationRequired = Math.abs(endHeading - currentHeading);

      if (useMotionProfile) {
        headingProfile = [currentHeading];
        const samples = analysis.steps.length; // 100
        for (let i = 1; i <= samples; i++) {
          const ratio = i / samples;
          headingProfile!.push(
            currentHeading + (endHeading - currentHeading) * ratio,
          );
        }
      }
    }

    if (!Number.isFinite(endHeading)) endHeading = currentHeading;

    // Use simple velocity check for segment duration max check
    // This maintains continuity with previous logic that didn't penalize smooth travel
    const rotationTime =
      (rotationRequired * (Math.PI / 180)) / safeSettings.aVelocity;

    const segmentTime = Math.max(translationTime, rotationTime);

    segmentTimes.push(segmentTime);
    const lineIndex = lines.findIndex((l) => l.id === line.id);
    timeline.push({
      type: "travel",
      duration: segmentTime,
      startTime: currentTime,
      endTime: currentTime + segmentTime,
      lineIndex,
      motionProfile: motionProfile,
      headingProfile: headingProfile,
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
