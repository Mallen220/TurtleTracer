// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point } from "../types";

// Extracted type for 2D points to DRY up function signatures
type Point2D = { x: number; y: number };

export function quadraticToCubic(P0: Point2D, P1: Point2D, P2: Point2D) {
  const Q1 = lerp2d(2 / 3, P0, P1);
  const Q2 = lerp2d(2 / 3, P2, P1);
  return { Q1, Q2 };
}

export function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function getMousePos(evt: MouseEvent, canvas: SVGSVGElement) {
  const rect = canvas.getBoundingClientRect();
  return {
    x:
      ((evt.clientX - rect.left) / (rect.right - rect.left)) *
      canvas.width.baseVal.value,
    y:
      ((evt.clientY - rect.top) / (rect.bottom - rect.top)) *
      canvas.height.baseVal.value,
  };
}

export function transformAngle(angle: number) {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

export function getAngularDifference(start: number, end: number): number {
  const normalizedStart = ((start % 360) + 360) % 360;
  const normalizedEnd = ((end % 360) + 360) % 360;
  let diff = normalizedEnd - normalizedStart;

  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;

  return diff;
}

export function shortestRotation(
  startAngle: number,
  endAngle: number,
  percentage: number,
) {
  const diff = getAngularDifference(startAngle, endAngle);
  return startAngle + diff * percentage;
}

export function radiansToDegrees(radians: number) {
  return radians * (180 / Math.PI);
}

export function lerp(ratio: number, start: number, end: number) {
  return start + (end - start) * ratio;
}

export function lerp2d(ratio: number, start: Point2D, end: Point2D) {
  return {
    x: lerp(ratio, start.x, end.x),
    y: lerp(ratio, start.y, end.y),
  };
}

export function getFirstValidControlPoint(
  controlPoints: Point2D[],
  refPoint: Point2D,
  reverse: boolean = false,
): Point2D | null {
  const pts = reverse ? [...controlPoints].reverse() : controlPoints;
  for (const cp of pts) {
    if (getDistance(cp, refPoint) > 1e-6) {
      return cp;
    }
  }
  return null;
}

export function getDistance(p1: Point2D, p2: Point2D) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getCurvePoint(t: number, points: Point2D[]): Point2D {
  const len = points.length;

  if (len === 2) {
    return lerp2d(t, points[0], points[1]);
  } else if (len === 3) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const mt = 1 - t;
    const a = mt * mt;
    const b = 2 * mt * t;
    const c = t * t;

    return {
      x: a * p0.x + b * p1.x + c * p2.x,
      y: a * p0.y + b * p1.y + c * p2.y,
    };
  } else if (len === 4) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const p3 = points[3];
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;

    const a = mt2 * mt;
    const b = 3 * mt2 * t;
    const c = 3 * mt * t2;
    const d = t2 * t;

    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    };
  }

  if (len === 1) return points[0];

  const work = points.slice();
  let n = len;
  while (n > 1) {
    for (let i = 0; i < n - 1; i++) {
      const p = lerp2d(t, work[i], work[i + 1]);
      if (n === len) {
        work[i] = p;
      } else {
        work[i].x = p.x;
        work[i].y = p.y;
      }
    }
    n--;
  }
  return work[0];
}

export function splitBezier(
  t: number,
  points: Point2D[],
): [Point2D[], Point2D[]] {
  const left: Point2D[] = [];
  const right: Point2D[] = [];
  const n = points.length - 1;

  let currentPoints = points.slice();

  left.push(currentPoints[0]);
  right.push(currentPoints[currentPoints.length - 1]);

  for (let i = 0; i < n; i++) {
    const nextPoints: Point2D[] = [];
    for (let j = 0; j < currentPoints.length - 1; j++) {
      nextPoints.push(lerp2d(t, currentPoints[j], currentPoints[j + 1]));
    }
    currentPoints = nextPoints;
    left.push(currentPoints[0]);
    right.push(currentPoints[currentPoints.length - 1]);
  }

  right.reverse();
  return [left, right];
}

export function getTangentAngle(p1: Point2D, p2: Point2D): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
}

function getHeadingBase(
  endPoint: any,
  refPoint1: Point2D,
  refPoint2: Point2D,
): number {
  if (endPoint.heading === "constant") {
    return transformAngle(endPoint.degrees + (endPoint.reverse ? 180 : 0));
  }
  if (endPoint.heading === "facingPoint") {
    const angle = getTangentAngle(refPoint1, {
      x: endPoint.targetX || 0,
      y: endPoint.targetY || 0,
    });
    return transformAngle(angle + (endPoint.reverse ? 180 : 0));
  }
  if (endPoint.heading === "tangential") {
    const angle = getTangentAngle(refPoint1, refPoint2);
    return transformAngle(angle + (endPoint.reverse ? 180 : 0));
  }
  return 0;
}

export function getLineStartHeading(
  line: Line | undefined,
  previousPoint: Point,
): number {
  if (!line || !line.endPoint) return 0;
  if (line.endPoint.heading === "linear") return line.endPoint.startDeg;

  let nextP: Point2D = line.endPoint;
  if (
    line.endPoint.heading === "tangential" &&
    line.controlPoints?.length > 0
  ) {
    nextP =
      getFirstValidControlPoint(line.controlPoints, previousPoint) || nextP;
  }

  return getHeadingBase(line.endPoint, previousPoint, nextP);
}

export function getLineEndHeading(
  line: Line | undefined,
  previousPoint: Point,
): number {
  if (!line || !line.endPoint) return 0;
  if (line.endPoint.heading === "linear") return line.endPoint.endDeg;

  let prevP: Point2D = previousPoint;
  if (
    line.endPoint.heading === "tangential" &&
    line.controlPoints?.length > 0
  ) {
    prevP =
      getFirstValidControlPoint(line.controlPoints, line.endPoint, true) ||
      prevP;
  }

  return getHeadingBase(
    line.endPoint,
    line.endPoint.heading === "facingPoint" ? line.endPoint : prevP,
    line.endPoint,
  );
}

export function vh(percent: number) {
  const h = Math.max(
    document.documentElement.clientHeight,
    window.innerHeight || 0,
  );
  return (percent * h) / 100;
}

export function vw(percent: number) {
  const w = Math.max(
    document.documentElement.clientWidth,
    window.innerWidth || 0,
  );
  return (percent * w) / 100;
}
