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
export function generateLinesFromDrawing(
  drawnPoints: { x: number; y: number }[],
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
): { startPoint: Point; lines: Line[]; sequence: SequenceItem[] } | null {
  if (drawnPoints.length < 2) return null;

  // 1. Simplify points
  // A simple distance-based decimation + Douglas-Peucker could be used, but for now we'll
  // do a basic greedy decimation to ensure we don't have too many lines.
  const minLineLength = 4; // min 4 inches between waypoints
  const simplified: { x: number; y: number }[] = [drawnPoints[0]];
  let lastAdded = drawnPoints[0];

  for (let i = 1; i < drawnPoints.length - 1; i++) {
    if (getDistance(lastAdded, drawnPoints[i]) >= minLineLength) {
      simplified.push(drawnPoints[i]);
      lastAdded = drawnPoints[i];
    }
  }
  // Always include the last point, but only if it's not super close to the last added point
  if (getDistance(lastAdded, drawnPoints[drawnPoints.length - 1]) > 1) {
    simplified.push(drawnPoints[drawnPoints.length - 1]);
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

  // Generate lines
  for (let i = startIndex; i < simplified.length; i++) {
    const pt = simplified[i];
    const prevPt = currentConnectionPt;

    // Calculate a simple control point halfway to make it a bezier line.
    // To make it actually smooth, we'd need a more complex fit, but a straight-ish line is fine for rough drawing.
    // Let's just use 0 control points to make them straight lines for now,
    // or 2 control points on the straight line for users to adjust later.

    // Calculate control points exactly on the line (1/3 and 2/3 distance)
    const dx = pt.x - prevPt.x;
    const dy = pt.y - prevPt.y;

    const cp1 = { x: prevPt.x + dx * 0.33, y: prevPt.y + dy * 0.33 };
    const cp2 = { x: prevPt.x + dx * 0.66, y: prevPt.y + dy * 0.66 };

    const newLine: Line = {
      id: makeId(),
      name: "",
      endPoint: {
        x: pt.x,
        y: pt.y,
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [cp1, cp2],
      color: "#60a5fa", // Default blue, or use getRandomColor() if we want
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
  }

  return {
    startPoint: currentStartPoint,
    lines: currentLines,
    sequence: currentSequence,
  };
}
