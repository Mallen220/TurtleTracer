// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Point, ControlPoint, Line, Shape, SequenceItem } from "../types";

// Helper to mirror a single point's heading across the Y-axis (X changes)
export function mirrorPointHeadingX(point: Point): Point {
  if (point.heading === "linear")
    return {
      ...point,
      startDeg: 180 - point.startDeg,
      endDeg: 180 - point.endDeg,
    };
  if (point.heading === "constant")
    return { ...point, degrees: 180 - point.degrees };
  // Tangential reverse flag stays same
  return point;
}

// Helper to mirror a single point's heading across the X-axis (Y changes)
export function mirrorPointHeadingY(point: Point): Point {
  if (point.heading === "linear")
    return {
      ...point,
      startDeg: -point.startDeg,
      endDeg: -point.endDeg,
    };
  if (point.heading === "constant")
    return { ...point, degrees: -point.degrees };
  // Tangential reverse flag stays same
  return point;
}

// Mirror path data across the center Y-axis (X = 72)
export function mirrorPathDataX(data: {
  startPoint: Point;
  lines: Line[];
  shapes?: Shape[];
  sequence?: SequenceItem[];
}) {
  const m = structuredClone(data);

  if (m.startPoint) {
    m.startPoint.x = 144 - m.startPoint.x;
    m.startPoint = mirrorPointHeadingX(m.startPoint);
  }

  if (m.lines) {
    m.lines.forEach((line: Line) => {
      if (line.endPoint) {
        line.endPoint.x = 144 - line.endPoint.x;
        line.endPoint = mirrorPointHeadingX(line.endPoint);
      }
      if (line.controlPoints) {
        line.controlPoints.forEach((cp: ControlPoint) => (cp.x = 144 - cp.x));
      }
    });
  }

  if (m.shapes) {
    m.shapes.forEach((s: Shape) =>
      s.vertices?.forEach((v: any) => (v.x = 144 - v.x)),
    );
  }

  return m;
}

// Mirror path data across the center X-axis (Y = 72)
export function mirrorPathDataY(data: {
  startPoint: Point;
  lines: Line[];
  shapes?: Shape[];
  sequence?: SequenceItem[];
}) {
  const m = structuredClone(data);

  if (m.startPoint) {
    m.startPoint.y = 144 - m.startPoint.y;
    m.startPoint = mirrorPointHeadingY(m.startPoint);
  }

  if (m.lines) {
    m.lines.forEach((line: Line) => {
      if (line.endPoint) {
        line.endPoint.y = 144 - line.endPoint.y;
        line.endPoint = mirrorPointHeadingY(line.endPoint);
      }
      if (line.controlPoints) {
        line.controlPoints.forEach((cp: ControlPoint) => (cp.y = 144 - cp.y));
      }
    });
  }

  if (m.shapes) {
    m.shapes.forEach((s: Shape) =>
      s.vertices?.forEach((v: any) => (v.y = 144 - v.y)),
    );
  }

  return m;
}

// Reverse path direction
export function reversePathData(data: {
  startPoint: Point;
  lines: Line[];
  sequence?: SequenceItem[];
  shapes?: Shape[];
}) {
  // Deep clone to avoid mutating original
  const r = structuredClone(data);
  const originalLines: Line[] = data.lines || [];

  if (originalLines.length === 0) return r;

  // 1. New Start Point is the last End Point
  const lastLine = originalLines[originalLines.length - 1];
  const newStartPoint = structuredClone(lastLine.endPoint);

  // Adjust new start point heading properties
  if (newStartPoint.heading === "linear") {
    const temp = newStartPoint.startDeg;
    newStartPoint.startDeg = newStartPoint.endDeg;
    newStartPoint.endDeg = temp;
  }

  // 2. Reverse Lines
  // We iterate backwards to reconstruct the path in reverse geometric order.
  // The target end points for the new lines are: [P_{n-1}, P_{n-2}, ..., P_0]
  const points = [r.startPoint, ...originalLines.map((l) => l.endPoint)];

  const newLines: Line[] = [];

  for (let i = originalLines.length; i >= 1; i--) {
    const originalLineIndex = i - 1;
    const originalLine = originalLines[originalLineIndex];

    // The target end point is the start point of the original segment.
    const targetEndPoint = structuredClone(points[i - 1]);

    // Fix heading for target end point if linear
    if (targetEndPoint.heading === "linear") {
      const temp = targetEndPoint.startDeg;
      targetEndPoint.startDeg = targetEndPoint.endDeg;
      targetEndPoint.endDeg = temp;
    }

    // Control points need to be reversed order
    const newControlPoints = [...(originalLine.controlPoints || [])].reverse();

    const newLine: Line = {
      ...originalLine,
      endPoint: targetEndPoint,
      controlPoints: newControlPoints,
      // Swap waits
      waitBefore: originalLine.waitAfter,
      waitAfter: originalLine.waitBefore,
      waitBeforeMs: originalLine.waitAfterMs,
      waitAfterMs: originalLine.waitBeforeMs,
      waitBeforeName: originalLine.waitAfterName,
      waitAfterName: originalLine.waitBeforeName,
    };

    newLines.push(newLine);
  }

  r.startPoint = newStartPoint;
  r.lines = newLines;

  // 3. Reverse Sequence
  if (r.sequence && Array.isArray(r.sequence)) {
    r.sequence = r.sequence.reverse();
  }

  return r;
}
