// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Point, ControlPoint, Line, Shape, SequenceItem } from "../types";

// Represents a set of data used for path editing operations. Sequence is optional
// because many helpers only care about the geometric portion.
export interface PathData {
  startPoint: Point;
  lines: Line[];
  shapes?: Shape[];
  sequence?: SequenceItem[];
}

// Helper to mirror a single point's heading
export function mirrorPointHeading(point: Point): Point {
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

// Mirror path data across the center Y-axis
export function mirrorPathData(data: PathData, fieldWidth: number = 144) {
  const m = structuredClone(data);

  if (m.startPoint) {
    m.startPoint.x = fieldWidth - m.startPoint.x;
    m.startPoint = mirrorPointHeading(m.startPoint);
  }

  if (m.lines) {
    m.lines.forEach((line: Line) => {
      if (line.endPoint) {
        line.endPoint.x = fieldWidth - line.endPoint.x;
        line.endPoint = mirrorPointHeading(line.endPoint);
      }
      if (line.controlPoints) {
        line.controlPoints.forEach(
          (cp: ControlPoint) => (cp.x = fieldWidth - cp.x),
        );
      }
    });
  }

  if (m.shapes) {
    m.shapes.forEach((s: Shape) =>
      s.vertices?.forEach((v: any) => (v.x = fieldWidth - v.x)),
    );
  }

  return m;
}

// Translate path data by a given (dx, dy) offset
export function translatePathData(
  data: PathData,
  dx: number,
  dy: number,
): PathData {
  const t = structuredClone(data);

  if (t.startPoint) {
    t.startPoint.x += dx;
    t.startPoint.y += dy;
  }

  if (t.lines) {
    t.lines.forEach((line: Line) => {
      if (line.endPoint) {
        line.endPoint.x += dx;
        line.endPoint.y += dy;
        if (line.endPoint.targetX !== undefined) {
          line.endPoint.targetX += dx;
        }
        if (line.endPoint.targetY !== undefined) {
          line.endPoint.targetY += dy;
        }
      }
      if (line.controlPoints) {
        line.controlPoints.forEach((cp: ControlPoint) => {
          cp.x += dx;
          cp.y += dy;
        });
      }
    });
  }

  if (t.shapes) {
    t.shapes.forEach((s: Shape) =>
      s.vertices?.forEach((v: any) => {
        v.x += dx;
        v.y += dy;
      }),
    );
  }

  return t;
}

/**
 * A copy of `data` with every position moved by `move` (start point, path ends,
 * the point a path faces, control points and obstacle corners) and the heading
 * of the start point and each path end changed by `turn`.
 */
function transformPathData(
  data: PathData,
  move: (x: number, y: number) => { x: number; y: number },
  turn: (point: Point) => Point,
): PathData {
  const out = structuredClone(data);

  const moveInPlace = (p: { x: number; y: number }) => {
    const moved = move(p.x, p.y);
    p.x = moved.x;
    p.y = moved.y;
  };

  if (out.startPoint) {
    moveInPlace(out.startPoint);
    out.startPoint = turn(out.startPoint);
  }

  out.lines?.forEach((line: Line) => {
    const end = line.endPoint;
    if (end) {
      moveInPlace(end);
      if (end.targetX !== undefined && end.targetY !== undefined) {
        const target = move(end.targetX, end.targetY);
        end.targetX = target.x;
        end.targetY = target.y;
      }
      line.endPoint = turn(end);
    }
    line.controlPoints?.forEach(moveInPlace);
  });

  out.shapes?.forEach((s: Shape) => s.vertices?.forEach(moveInPlace));

  return out;
}

// Rotate path data by a given angle (in degrees) around a pivot point
export function rotatePathData(
  data: PathData,
  degrees: number,
  pivotX: number,
  pivotY: number,
): PathData {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rotatePoint = (x: number, y: number) => {
    const dx = x - pivotX;
    const dy = y - pivotY;
    return {
      x: pivotX + dx * cos - dy * sin,
      y: pivotY + dx * sin + dy * cos,
    };
  };

  const rotateHeading = (point: Point) => {
    if (point.heading === "linear") {
      return {
        ...point,
        startDeg: (point.startDeg + degrees + 360) % 360,
        endDeg: (point.endDeg + degrees + 360) % 360,
      };
    }
    if (point.heading === "constant") {
      return {
        ...point,
        degrees: (point.degrees + degrees + 360) % 360,
      };
    }
    return point;
  };

  return transformPathData(data, rotatePoint, rotateHeading);
}

// Flip path data horizontally and/or vertically around a pivot point
export function flipPathData(
  data: PathData,
  horizontal: boolean,
  vertical: boolean,
  pivotX: number,
  pivotY: number,
): PathData {
  const flipPoint = (x: number, y: number) => {
    let nx = x;
    let ny = y;
    if (horizontal) {
      nx = pivotX - (x - pivotX);
    }
    if (vertical) {
      ny = pivotY - (y - pivotY);
    }
    return { x: nx, y: ny };
  };

  const flipHeading = (point: Point) => {
    // Angles are measured from the +x axis. Mirroring left-right maps an
    // angle to 180 - angle; mirroring top-bottom maps it to -angle.

    let newPoint = { ...point };

    if (newPoint.heading === "linear") {
      if (horizontal) {
        newPoint.startDeg = (180 - newPoint.startDeg + 360) % 360;
        newPoint.endDeg = (180 - newPoint.endDeg + 360) % 360;
      }
      if (vertical) {
        newPoint.startDeg = (-newPoint.startDeg + 360) % 360;
        newPoint.endDeg = (-newPoint.endDeg + 360) % 360;
      }
    } else if (newPoint.heading === "constant") {
      if (horizontal) {
        newPoint.degrees = (180 - newPoint.degrees + 360) % 360;
      }
      if (vertical) {
        newPoint.degrees = (-newPoint.degrees + 360) % 360;
      }
    }
    return newPoint;
  };

  return transformPathData(data, flipPoint, flipHeading);
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

  const lastLine = originalLines.at(-1);
  if (!lastLine) return r;

  // 1. New Start Point is the last End Point
  const newStartPoint = structuredClone(lastLine.endPoint);

  // Adjust new start point heading properties
  if (newStartPoint.heading === "linear") {
    const temp = newStartPoint.startDeg;
    newStartPoint.startDeg = newStartPoint.endDeg;
    newStartPoint.endDeg = temp;
  }

  // 2. Reverse Lines
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

    // Reverse event markers
    const newEventMarkers = (originalLine.eventMarkers || [])
      .map((marker) => ({
        ...marker,
        position: 1 - marker.position,
      }))
      .reverse();

    const newLine: Line = {
      ...originalLine,
      endPoint: targetEndPoint,
      controlPoints: newControlPoints,
      eventMarkers: newEventMarkers,
      // Swap waits
      waitBefore: originalLine.waitAfter,
      waitAfter: originalLine.waitBefore,
      waitBeforeMs: originalLine.waitAfterMs,
      waitAfterMs: originalLine.waitBeforeMs,
      waitBeforeName: originalLine.waitAfterName,
      waitAfterName: originalLine.waitBeforeName,
    };

    // Need to swap tangential reverses
    if (newLine.endPoint.heading === "tangential") {
      // Typically, going backwards along a path means tangental reversing behavior might swap.
      newLine.endPoint.reverse = !newLine.endPoint.reverse;
    }

    newLines.push(newLine);
  }

  if (newStartPoint.heading === "tangential") {
    newStartPoint.reverse = !newStartPoint.reverse;
  }

  r.startPoint = newStartPoint;
  r.lines = newLines;

  // 3. Reverse Sequence
  if (r.sequence && Array.isArray(r.sequence)) {
    r.sequence = r.sequence.reverse();
  }

  return r;
}
