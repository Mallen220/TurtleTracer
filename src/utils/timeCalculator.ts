import type {
  Point,
  Line,
  Settings,
  TimePrediction,
  TimelineEvent,
} from "../types";
import {
  getCurvePoint,
  getLineStartHeading,
  getLineEndHeading,
  getAngularDifference,
} from "./math";

/**
 * Calculate the length of a curve by sampling points
 */
function calculateCurveLength(
  start: Point,
  controlPoints: Point[],
  end: Point,
  samples: number = 100,
): number {
  let length = 0;
  let prevPoint = start;

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const point = getCurvePoint(t, [start, ...controlPoints, end]);
    const dx = point.x - prevPoint.x;
    const dy = point.y - prevPoint.y;
    length += Math.sqrt(dx * dx + dy * dy);
    prevPoint = point;
  }

  return length;
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
): TimePrediction {
  const useMotionProfile =
    settings.maxVelocity !== undefined &&
    settings.maxAcceleration !== undefined;

  const segmentLengths: number[] = [];
  const segmentTimes: number[] = [];
  const timeline: TimelineEvent[] = [];

  let currentTime = 0;
  let currentHeading = 0;

  // Initialize heading
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

  lines.forEach((line, idx) => {
    const prevPoint = idx === 0 ? startPoint : lines[idx - 1].endPoint;

    // --- ROTATION CHECK ---
    const requiredStartHeading = getLineStartHeading(line, prevPoint);

    // CRITICAL FIX: Use getAngularDifference for the shortest path magnitude
    const diff = Math.abs(
      getAngularDifference(currentHeading, requiredStartHeading),
    );

    // If difference is significant, add a Wait event
    if (diff > 0.1) {
      // Time = radians / (radians/sec)
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

    // --- TRAVEL CALCULATION ---
    const length = calculateCurveLength(
      prevPoint,
      line.controlPoints,
      line.endPoint,
    );
    segmentLengths.push(length);

    let segmentTime = 0;
    if (useMotionProfile) {
      segmentTime = calculateMotionProfileTime(
        length,
        settings.maxVelocity!,
        settings.maxAcceleration!,
        settings.maxDeceleration,
      );
    } else {
      const avgVelocity = (settings.xVelocity + settings.yVelocity) / 2;
      segmentTime = length / avgVelocity;
    }

    segmentTimes.push(segmentTime);

    timeline.push({
      type: "travel",
      duration: segmentTime,
      startTime: currentTime,
      endTime: currentTime + segmentTime,
      lineIndex: idx,
    });

    currentTime += segmentTime;

    currentHeading = getLineEndHeading(line, prevPoint);
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
