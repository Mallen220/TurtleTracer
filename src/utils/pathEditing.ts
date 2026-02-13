// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  Line,
  SequenceItem,
  TimePrediction,
  SequencePathItem,
} from "../types";
import { splitBezier, easeInOutQuad, shortestRotation } from "./math";
import { makeId } from "./nameGenerator";

export interface PathSplitResult {
  lines: Line[];
  sequence: SequenceItem[];
  splitIndex: number;
}

/**
 * Splits the path at the given global percentage.
 * Returns null if the current time does not correspond to a split-table path segment.
 */
export function splitPathAtPercent(
  percent: number,
  timePrediction: TimePrediction,
  lines: Line[],
  sequence: SequenceItem[],
): PathSplitResult | null {
  if (!timePrediction || timePrediction.totalTime <= 0) return null;

  const totalTime = timePrediction.totalTime;
  const globalTime = (percent / 100) * totalTime;

  // Find active event
  const timeline = timePrediction.timeline;
  const activeEvent = timeline.find(
    (e) => globalTime >= e.startTime && globalTime <= e.endTime,
  );

  if (!activeEvent || activeEvent.type !== "travel") return null;

  // Identify Line
  const lineIndex = activeEvent.lineIndex!;
  const originalLine = lines[lineIndex];
  if (!originalLine) return null;

  // Calculate local t
  let t = 0;
  if (activeEvent.motionProfile && activeEvent.motionProfile.length > 0) {
    // Inverse lookup in motion profile
    const relTime = globalTime - activeEvent.startTime;
    const profile = activeEvent.motionProfile;
    const steps = profile.length - 1;
    let i = 0;
    while (i < steps - 1 && relTime > profile[i + 1]) {
      i++;
    }
    const t0 = profile[i];
    const t1 = profile[i + 1];

    // Avoid division by zero
    if (t1 === t0) {
      t = i / steps;
    } else {
      const ratio = (relTime - t0) / (t1 - t0);
      t = (i + ratio) / steps;
    }
  } else {
    // Linear time mapping + easing fallback
    const duration = Math.max(0.001, activeEvent.duration);
    const progress = (globalTime - activeEvent.startTime) / duration;
    t = easeInOutQuad(Math.max(0, Math.min(1, progress)));
  }

  t = Math.max(0.001, Math.min(0.999, t)); // Clamp to avoid degenerate splits

  // Perform Split
  const prevPoint = (activeEvent as any).prevPoint;
  if (!prevPoint) return null;

  const curvePoints = [
    prevPoint,
    ...originalLine.controlPoints,
    originalLine.endPoint,
  ];
  const [leftPoints, rightPoints] = splitBezier(t, curvePoints);

  const splitPoint = leftPoints[leftPoints.length - 1];

  // Create Line 1 (The first half)
  const line1: Line = {
    ...originalLine,
    id: makeId(),
    endPoint: {
      x: splitPoint.x,
      y: splitPoint.y,
      heading: "tangential",
      reverse:
        originalLine.endPoint.heading === "tangential"
          ? originalLine.endPoint.reverse
          : false,
    },
    controlPoints: leftPoints.slice(1, -1),
    name: "",
    eventMarkers: [],
    waitBeforeMs: originalLine.waitBeforeMs,
    waitAfterMs: 0,
    waitBeforeName: originalLine.waitBeforeName,
    waitAfterName: "",
  };

  // Create Line 2 (The second half)
  // We reuse the original ID to minimize sequence disruption, but we must update the properties
  const line2: Line = {
    ...originalLine,
    // Keep ID
    endPoint: { ...originalLine.endPoint }, // Clone to avoid mutation issues
    controlPoints: rightPoints.slice(1, -1),
    name: "",
    eventMarkers: [],
    waitBeforeMs: 0,
    waitAfterMs: originalLine.waitAfterMs,
    waitBeforeName: "",
    waitAfterName: originalLine.waitAfterName,
  };

  // Handle Heading Logic
  if (originalLine.endPoint.heading === "constant") {
    // Both segments maintain constant heading
    // line1 already set to tangential default above, override it
    line1.endPoint = {
      x: splitPoint.x,
      y: splitPoint.y,
      heading: "constant",
      degrees: originalLine.endPoint.degrees,
    };
    // line2 already has original properties (constant)
  } else if (originalLine.endPoint.heading === "linear") {
    const startDeg = originalLine.endPoint.startDeg;
    const endDeg = originalLine.endPoint.endDeg;

    // Interpolate heading at split point
    const midDeg = shortestRotation(startDeg, endDeg, t);

    // Update L1
    line1.endPoint = {
      x: splitPoint.x,
      y: splitPoint.y,
      heading: "linear",
      startDeg: startDeg,
      endDeg: midDeg,
    };

    // Update L2
    line2.endPoint = {
      ...line2.endPoint,
      heading: "linear",
      startDeg: midDeg,
      endDeg: endDeg,
    };
  }
  // If tangential, line1 is tangential (smooth join), line2 is tangential (original end behavior).

  // Migrate Markers
  if (originalLine.eventMarkers) {
    originalLine.eventMarkers.forEach((m) => {
      if (m.position <= t) {
        // Move to L1
        line1.eventMarkers!.push({ ...m, position: m.position / t });
      } else {
        // Move to L2
        line2.eventMarkers!.push({
          ...m,
          position: (m.position - t) / (1 - t),
        });
      }
    });
  }

  // Construct new Arrays
  const newLines = [...lines];
  newLines.splice(lineIndex, 1, line1, line2);

  // Construct new Sequence
  const newSequence = [...sequence];

  // Insert line1 before every occurrence of line2 (originalLine)
  for (let i = 0; i < newSequence.length; i++) {
    const item = newSequence[i];
    if (
      item.kind === "path" &&
      (item as SequencePathItem).lineId === originalLine.id
    ) {
      const newItem: SequencePathItem = {
        kind: "path",
        lineId: line1.id!,
      };
      newSequence.splice(i, 0, newItem);
      i++; // Skip the item we just pushed
    }
  }

  return {
    lines: newLines,
    sequence: newSequence,
    splitIndex: lineIndex,
  };
}
