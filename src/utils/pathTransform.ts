// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Point, ControlPoint, Line, Shape, SequenceItem } from "../types";

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

// Mirror path data across the center Y-axis (X = 72)
export function mirrorPathData(data: {
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
}) {
  const m = structuredClone(data);

  if (m.startPoint) {
    m.startPoint.x = 144 - m.startPoint.x;
    m.startPoint = mirrorPointHeading(m.startPoint);
  }

  if (m.lines) {
    m.lines.forEach((line: Line) => {
      if (line.endPoint) {
        line.endPoint.x = 144 - line.endPoint.x;
        line.endPoint = mirrorPointHeading(line.endPoint);
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

// Translate path data by a given (dx, dy) offset
export function translatePathData(
  data: { startPoint: Point; lines: Line[]; shapes?: Shape[] },
  dx: number,
  dy: number,
) {
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

// Rotate path data by a given angle (in degrees) around a pivot point
export function rotatePathData(
  data: { startPoint: Point; lines: Line[]; shapes?: Shape[] },
  degrees: number,
  pivotX: number,
  pivotY: number,
) {
  const r = structuredClone(data);
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

  if (r.startPoint) {
    const newPt = rotatePoint(r.startPoint.x, r.startPoint.y);
    r.startPoint.x = newPt.x;
    r.startPoint.y = newPt.y;
    r.startPoint = rotateHeading(r.startPoint);
  }

  if (r.lines) {
    r.lines.forEach((line: Line) => {
      if (line.endPoint) {
        const newPt = rotatePoint(line.endPoint.x, line.endPoint.y);
        line.endPoint.x = newPt.x;
        line.endPoint.y = newPt.y;
        if (
          line.endPoint.targetX !== undefined &&
          line.endPoint.targetY !== undefined
        ) {
          const newTarget = rotatePoint(
            line.endPoint.targetX,
            line.endPoint.targetY,
          );
          line.endPoint.targetX = newTarget.x;
          line.endPoint.targetY = newTarget.y;
        }
        line.endPoint = rotateHeading(line.endPoint);
      }
      if (line.controlPoints) {
        line.controlPoints.forEach((cp: ControlPoint) => {
          const newPt = rotatePoint(cp.x, cp.y);
          cp.x = newPt.x;
          cp.y = newPt.y;
        });
      }
    });
  }

  if (r.shapes) {
    r.shapes.forEach((s: Shape) =>
      s.vertices?.forEach((v: any) => {
        const newPt = rotatePoint(v.x, v.y);
        v.x = newPt.x;
        v.y = newPt.y;
      }),
    );
  }

  return r;
}

// Flip path data horizontally and/or vertically around a pivot point
export function flipPathData(
  data: { startPoint: Point; lines: Line[]; shapes?: Shape[] },
  horizontal: boolean,
  vertical: boolean,
  pivotX: number,
  pivotY: number,
) {
  const f = structuredClone(data);

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
    // If heading is linear or constant, flipping horizontal negates degrees (e.g. 30 -> 150? No, wait)
    // Actually, mathematical angle in this app is generally 0 pointing right.
    // Horizontal flip: mirror across Y axis (x -> -x). Angle: 180 - angle.
    // Vertical flip: mirror across X axis (y -> -y). Angle: -angle or 360 - angle.

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

  if (f.startPoint) {
    const newPt = flipPoint(f.startPoint.x, f.startPoint.y);
    f.startPoint.x = newPt.x;
    f.startPoint.y = newPt.y;
    f.startPoint = flipHeading(f.startPoint);
  }

  if (f.lines) {
    f.lines.forEach((line: Line) => {
      if (line.endPoint) {
        const newPt = flipPoint(line.endPoint.x, line.endPoint.y);
        line.endPoint.x = newPt.x;
        line.endPoint.y = newPt.y;
        if (
          line.endPoint.targetX !== undefined &&
          line.endPoint.targetY !== undefined
        ) {
          const newTarget = flipPoint(
            line.endPoint.targetX,
            line.endPoint.targetY,
          );
          line.endPoint.targetX = newTarget.x;
          line.endPoint.targetY = newTarget.y;
        }
        line.endPoint = flipHeading(line.endPoint);
      }
      if (line.controlPoints) {
        line.controlPoints.forEach((cp: ControlPoint) => {
          const newPt = flipPoint(cp.x, cp.y);
          cp.x = newPt.x;
          cp.y = newPt.y;
        });
      }
    });
  }

  if (f.shapes) {
    f.shapes.forEach((s: Shape) =>
      s.vertices?.forEach((v: any) => {
        const newPt = flipPoint(v.x, v.y);
        v.x = newPt.x;
        v.y = newPt.y;
      }),
    );
  }

  return f;
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
