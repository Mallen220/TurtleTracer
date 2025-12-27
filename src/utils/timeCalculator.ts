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
 * Calculate the length of a curve by sampling points, and estimate the minimum turn radius.
 */
function analyzeCurve(
  start: BasePoint,
  controlPoints: BasePoint[],
  end: BasePoint,
  samples: number = 100,
): { length: number; minRadius: number } {
  let length = 0;
  let prevPoint: BasePoint = start;

  // We need at least 3 points to calculate curvature (Menger curvature or circumcircle).
  // We will keep a sliding window of points.
  // P0, P1, P2.
  // Curvature k = 4 * Area / (a * b * c).
  // Radius R = 1 / k.
  // Area = 0.5 * |x1(y2-y3) + x2(y3-y1) + x3(y1-y2)|
  // Side lengths a, b, c.

  const points: BasePoint[] = [start];
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const p = getCurvePoint(t, [start, ...controlPoints, end]);
    points.push(p);
  }

  let minRadius = Infinity;

  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }

    if (i >= 1 && i < points.length - 1) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const p3 = points[i + 1];

      // Side lengths
      const a = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const b = Math.hypot(p2.x - p3.x, p2.y - p3.y);
      const c = Math.hypot(p3.x - p1.x, p3.y - p1.y);

      // Area of triangle using shoelace formula
      const area =
        0.5 *
        Math.abs(
          p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y),
        );

      if (area > 1e-6) {
        // Avoid division by zero for collinear points
        const radius = (a * b * c) / (4 * area);
        if (radius < minRadius) {
          minRadius = radius;
        }
      }
    }
  }

  return { length, minRadius };
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
  // If maxVel is very small, return dist / maxVel (assume no acc time or negligible)
  if (maxVel < 0.001) return distance / 0.001; // Avoid infinity

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
  // Note: This initialization is technically overridden by the idx===0 check below
  // to ensure no initial turning, but kept for fallback logic.
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
      // Skip missing or malformed lines in sequence
      return;
    }
    const prevPoint = lastPoint;

    // --- ROTATION CHECK ---
    const requiredStartHeading = getLineStartHeading(line, prevPoint);
    if (idx === 0) currentHeading = requiredStartHeading;
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

    // --- TRAVEL ---
    // Analyze curve for length and curvature
    const { length, minRadius } = analyzeCurve(
      prevPoint,
      line.controlPoints as any,
      line.endPoint as any,
    );
    segmentLengths.push(length);

    let segmentTime = 0;
    if (useMotionProfile) {
      let maxVel = settings.maxVelocity!;

      // Limit velocity based on curvature
      // v = w * r. We use aVelocity as max w.
      // If minRadius is small, maxVel should be small.
      if (minRadius < Infinity && minRadius > 0.1) {
        const curvatureLimitedVel = settings.aVelocity * minRadius;
        // Apply a "cornering stiffness" factor? Or raw physics?
        // Raw physics: v <= w_max * r.
        if (curvatureLimitedVel < maxVel) {
          maxVel = curvatureLimitedVel;
        }
      } else if (minRadius <= 0.1 && length > 0.1) {
        // Extremely sharp turn (effectively a point turn while moving)
        // Limit to very slow speed
        maxVel = Math.min(maxVel, settings.aVelocity * 0.1);
      }

      segmentTime = calculateMotionProfileTime(
        length,
        maxVel,
        settings.maxAcceleration!,
        settings.maxDeceleration,
      );
    } else {
      const avgVelocity = (settings.xVelocity + settings.yVelocity) / 2;
      segmentTime = length / avgVelocity;
    }
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
    currentHeading = getLineEndHeading(line, prevPoint);
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
