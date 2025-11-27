import type { Point, Line, FPASettings } from "../types";
import { getCurvePoint } from "./math";

/**
 * Calculate the length of a bezier curve segment
 */
export function calculateSegmentLength(
  startPoint: Point,
  controlPoints: Point[],
  endPoint: Point,
  samples: number = 100,
): number {
  if (controlPoints.length === 0) {
    // Straight line - simple distance calculation
    return Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) +
        Math.pow(endPoint.y - startPoint.y, 2),
    );
  }

  // For curves, sample multiple points and sum the distances
  let totalLength = 0;
  let prevPoint = startPoint;

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const currentPoint = getCurvePoint(t, [
      startPoint,
      ...controlPoints,
      endPoint,
    ]);

    const segmentLength = Math.sqrt(
      Math.pow(currentPoint.x - prevPoint.x, 2) +
        Math.pow(currentPoint.y - prevPoint.y, 2),
    );

    totalLength += segmentLength;
    prevPoint = currentPoint;
  }

  return totalLength;
}

/**
 * Calculate time to traverse a path segment based on velocity settings
 */
export function calculateSegmentTime(
  segmentLength: number,
  settings: FPASettings,
  isCurve: boolean = false,
): number {
  if (segmentLength === 0) return 0;

  // Use the average of x and y velocities for more accurate prediction
  const averageVelocity = (settings.xVelocity + settings.yVelocity) / 2;

  // For curves, apply a reduction factor since robots typically slow down
  const curveFactor = isCurve ? 0.7 : 1.0;

  // Consider angular velocity impact - if there's significant turning, it slows down overall speed
  const turningFactor = settings.aVelocity > Math.PI ? 0.9 : 1.0;

  // Base time calculation
  const effectiveVelocity = averageVelocity * curveFactor * turningFactor;
  const baseTime = segmentLength / effectiveVelocity;

  // Add acceleration/deceleration factor (more significant for shorter segments)
  const accelerationTime = Math.min(0.3, baseTime * 0.2); // Cap acceleration time

  return baseTime + accelerationTime;
}

/**
 * Calculate total path time and individual segment times
 */
export function calculatePathTime(
  startPoint: Point,
  lines: Line[],
  settings: FPASettings,
): { totalTime: number; segmentTimes: number[]; totalDistance: number } {
  if (!lines.length) {
    return { totalTime: 0, segmentTimes: [], totalDistance: 0 };
  }

  const segmentTimes: number[] = [];
  let totalDistance = 0;

  // Calculate time for each segment
  lines.forEach((line, index) => {
    const segmentStart = index === 0 ? startPoint : lines[index - 1].endPoint;
    const isCurve = line.controlPoints.length > 0;

    const segmentLength = calculateSegmentLength(
      segmentStart,
      line.controlPoints,
      line.endPoint,
    );
    const segmentTime = calculateSegmentTime(segmentLength, settings, isCurve);

    segmentTimes.push(segmentTime);
    totalDistance += segmentLength;
  });

  const totalTime = segmentTimes.reduce((sum, time) => sum + time, 0);

  return {
    totalTime,
    segmentTimes,
    totalDistance,
  };
}

/**
 * Format time for display (seconds with 2 decimal places)
 */
export function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  } else {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  }
}

/**
 * Calculate the optimal animation duration based on predicted time
 * This ensures the animation matches the real-world timing
 */
export function getAnimationDuration(predictedTime: number): number {
  // The animation should take exactly the predicted time to complete
  return Math.max(0.1, predictedTime); // Ensure minimum duration
}
