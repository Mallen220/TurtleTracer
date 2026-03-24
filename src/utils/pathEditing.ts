// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  Line,
  SequenceItem,
  TimePrediction,
  SequencePathItem,
  Point,
} from "../types";
import {
  splitBezier,
  easeInOutQuad,
  shortestRotation,
  getDistance,
} from "./math";
import { getRandomColor } from "./draw";
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

    // Update L2 — construct a fresh 'linear' endPoint to avoid carrying an incompatible 'degrees' property
    line2.endPoint = {
      x: line2.endPoint.x,
      y: line2.endPoint.y,
      // preserve optional metadata fields
      locked: line2.endPoint.locked,
      isMacroElement: line2.endPoint.isMacroElement,
      macroId: line2.endPoint.macroId,
      originalId: line2.endPoint.originalId,
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
      i++; // Skip the item just pushed
    }
  }

  return {
    lines: newLines,
    sequence: newSequence,
    splitIndex: lineIndex,
  };
}

/**
 * Generates path lines from an array of raw drawn points.
 */
function perpendicularDistance(
  pt: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  const magSq = dx * dx + dy * dy;
  if (magSq > 0.0) {
    // Numerator is the absolute value of the cross product of the vector from lineStart to lineEnd
    // and the vector from lineStart to pt. This gives the area of the parallelogram formed by the two vectors.
    // Dividing by the magnitude of the line segment gives the height of the parallelogram,
    // which is the perpendicular distance.
    const numerator = Math.abs(
      dx * (lineStart.y - pt.y) - (lineStart.x - pt.x) * dy,
    );
    return numerator / Math.sqrt(magSq);
  } else {
    return getDistance(pt, lineStart);
  }
}

function douglasPeucker(
  points: { x: number; y: number }[],
  epsilon: number,
): { x: number; y: number }[] {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const recResults1 = douglasPeucker(points.slice(0, index + 1), epsilon);
    const recResults2 = douglasPeucker(points.slice(index), epsilon);

    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [points[0], points[end]];
  }
}

/**
 * Generates path lines from an array of raw drawn points.
 */
export function generateLinesFromDrawing(
  drawnPoints: { x: number; y: number }[],
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
): { startPoint: Point; lines: Line[]; sequence: SequenceItem[] } | null {
  if (drawnPoints.length < 2) return null;

  // 1. Simplify points using Douglas-Peucker.
  // Start with a moderate tolerance to capture general curves but ignore minor jitters.
  let epsilon = 5;
  let simplified = douglasPeucker(drawnPoints, epsilon);

  // Force simplification to be at most 4 points to aggressively prevent excessive paths being generated
  // This ensures U-shapes and sweeping curves map to ~3 segments maximum.
  while (simplified.length > 12 && epsilon < 60) {
    epsilon += 5;
    simplified = douglasPeucker(drawnPoints, epsilon);
  }

  // We need at least one point to draw to.
  // If simplified has only 1 point, it means the user just clicked without dragging far.
  if (simplified.length < 1) return null;

  let currentLines = [...lines];
  let currentSequence = [...sequence];
  let currentStartPoint = { ...startPoint };

  // Determine starting context
  let isFirstLine = currentLines.length === 0;

  let currentConnectionPt = isFirstLine
    ? { x: simplified[0].x, y: simplified[0].y }
    : currentLines[currentLines.length - 1].endPoint;

  if (isFirstLine) {
    currentStartPoint = {
      ...currentStartPoint,
      x: simplified[0].x,
      y: simplified[0].y,
    };
    // The first drawn point becomes the start point, so we start drawing lines to the 2nd point.
    // If they only drew one point (clicked), we just update the start point and return.
    if (simplified.length === 1) {
      return {
        startPoint: currentStartPoint,
        lines: currentLines,
        sequence: currentSequence,
      };
    }
  }

  // If there are existing lines, we must draw a line from the existing endPoint to the first drawn point,
  // unless the first drawn point is extremely close to the existing endPoint.
  let startIndex = isFirstLine ? 1 : 0;

  if (!isFirstLine && getDistance(currentConnectionPt, simplified[0]) < 2) {
    // They started drawing right at the end of the existing path, skip connecting to the first point.
    startIndex = 1;
  }

  // Determine if we should maintain tangency from a previous line
  let initialTangent: { dx: number; dy: number } | null = null;
  if (!isFirstLine) {
    const lastLine = currentLines[currentLines.length - 1];
    if (lastLine.controlPoints.length > 0) {
      const lastCp = lastLine.controlPoints[lastLine.controlPoints.length - 1];
      initialTangent = {
        dx: lastLine.endPoint.x - lastCp.x,
        dy: lastLine.endPoint.y - lastCp.y,
      };
    } else {
      const pPrev =
        currentLines.length > 1
          ? currentLines[currentLines.length - 2].endPoint
          : currentStartPoint;
      initialTangent = {
        dx: lastLine.endPoint.x - pPrev.x,
        dy: lastLine.endPoint.y - pPrev.y,
      };
    }
  }

  // Pre-calculate points to include the "connection" point if we are starting from an existing line
  const ptsForTangents = [];
  if (startIndex === 0 && !isFirstLine) {
    ptsForTangents.push(currentConnectionPt);
  }
  for (let i = startIndex; i < simplified.length; i++) {
    ptsForTangents.push(simplified[i]);
  }

  // Generate lines
  for (let i = startIndex; i < simplified.length; i++) {
    const pt = simplified[i];
    const prevPt = currentConnectionPt;
    const dist = getDistance(prevPt, pt);

    // Find the original drawn points that correspond to this segment
    // We can do this approximately by finding the indices in drawnPoints
    // that are closest to prevPt and pt.
    let startIndexRaw = 0;
    let endIndexRaw = drawnPoints.length - 1;
    let minDistStart = Infinity;
    let minDistEnd = Infinity;

    for (let j = 0; j < drawnPoints.length; j++) {
      const dStart = getDistance(drawnPoints[j], prevPt);
      if (dStart < minDistStart) {
        minDistStart = dStart;
        startIndexRaw = j;
      }
      const dEnd = getDistance(drawnPoints[j], pt);
      if (dEnd < minDistEnd) {
        minDistEnd = dEnd;
        endIndexRaw = j;
      }
    }

    // If the indices are inverted (which shouldn't happen, but just in case), swap them
    if (startIndexRaw > endIndexRaw) {
      const temp = startIndexRaw;
      startIndexRaw = endIndexRaw;
      endIndexRaw = temp;
    }

    const segmentDrawnPoints = drawnPoints.slice(
      startIndexRaw,
      endIndexRaw + 1,
    );

    // Check if the segment is straight
    let maxDev = 0;
    for (let j = 0; j < segmentDrawnPoints.length; j++) {
      const dev = perpendicularDistance(segmentDrawnPoints[j], prevPt, pt);
      if (dev > maxDev) maxDev = dev;
    }

    const isStraight = maxDev < 1.0; // Less than 1 inch deviation is considered straight

    // Default tension factor for control points.
    // Set to 0.38 for a balanced curve that accurately tracks points without overshooting.
    const tension = 0.38;

    // Calculate tangent at the starting point of this segment
    let startTangent = { dx: pt.x - prevPt.x, dy: pt.y - prevPt.y };
    if (i === startIndex && initialTangent) {
      startTangent = { ...initialTangent };
    } else if (i > startIndex) {
      // For internal points, tangent is vector from previous-previous point to current point
      const ppPt =
        i - 1 === startIndex
          ? isFirstLine
            ? currentStartPoint
            : currentConnectionPt
          : simplified[i - 2];
      startTangent = { dx: pt.x - ppPt.x, dy: pt.y - ppPt.y };
    }

    // Normalize start tangent
    let stMag =
      Math.sqrt(
        startTangent.dx * startTangent.dx + startTangent.dy * startTangent.dy,
      ) || 1;
    startTangent.dx /= stMag;
    startTangent.dy /= stMag;

    // Calculate tangent at the ending point of this segment
    let endTangent = { dx: pt.x - prevPt.x, dy: pt.y - prevPt.y };
    if (i < simplified.length - 1) {
      const nextPt = simplified[i + 1];
      endTangent = { dx: nextPt.x - prevPt.x, dy: nextPt.y - prevPt.y };
    }

    // Normalize end tangent
    let etMag =
      Math.sqrt(
        endTangent.dx * endTangent.dx + endTangent.dy * endTangent.dy,
      ) || 1;
    endTangent.dx /= etMag;
    endTangent.dy /= etMag;

    // Place control points
    const controlPoints = [];
    if (!isStraight) {
      const cp1 = {
        x: prevPt.x + startTangent.dx * dist * tension,
        y: prevPt.y + startTangent.dy * dist * tension,
      };

      const cp2 = {
        x: pt.x - endTangent.dx * dist * tension,
        y: pt.y - endTangent.dy * dist * tension,
      };
      controlPoints.push(cp1, cp2);
    }

    const newLine: Line = {
      id: makeId(),
      name: "",
      endPoint: {
        x: pt.x,
        y: pt.y,
        heading: "tangential",
        reverse: false,
      },
      controlPoints,
      color: getRandomColor(),
      locked: false,
      eventMarkers: [],
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    currentLines.push(newLine);
    currentSequence.push({ kind: "path", lineId: newLine.id! });

    // Update connection point for next iteration
    currentConnectionPt = pt;
    initialTangent = endTangent;
  }

  return {
    startPoint: currentStartPoint,
    lines: currentLines,
    sequence: currentSequence,
  };
}
