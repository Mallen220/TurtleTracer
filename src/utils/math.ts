import type { Line, Point } from "../types";

export function quadraticToCubic(
  P0: { x: number; y: number },
  P1: { x: number; y: number },
  P2: { x: number; y: number },
) {
  const Q1 = {
    x: P0.x + (2 / 3) * (P1.x - P0.x),
    y: P0.y + (2 / 3) * (P1.y - P0.y),
  };
  const Q2 = {
    x: P2.x + (2 / 3) * (P1.x - P2.x),
    y: P2.y + (2 / 3) * (P1.y - P2.y),
  };
  return { Q1, Q2 };
}

export function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function getMousePos(evt: MouseEvent, canvas: any) {
  let rect = canvas.getBoundingClientRect();
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

/**
 * Calculates the smallest difference between two angles.
 * Returns a value between -180 and 180.
 */
export function getAngularDifference(start: number, end: number): number {
  const normalizedStart = (start + 360) % 360;
  const normalizedEnd = (end + 360) % 360;
  let diff = normalizedEnd - normalizedStart;

  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;

  return diff;
}

/**
 * Calculates the shortest rotation from startAngle to endAngle based on a percentage.
 * @param startAngle
 * @param endAngle
 * @param percentage
 * @returns
 */
export function shortestRotation(
  startAngle: number,
  endAngle: number,
  percentage: number,
) {
  // Use the helper to find the shortest signed difference
  const diff = getAngularDifference(startAngle, endAngle);
  // Apply difference to the ORIGINAL startAngle to preserve winding/continuity
  return startAngle + diff * percentage;
}

export function radiansToDegrees(radians: number) {
  return radians * (180 / Math.PI);
}

export function lerp(ratio: number, start: number, end: number) {
  return start + (end - start) * ratio;
}

export function lerp2d(
  ratio: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  return {
    x: lerp(ratio, start.x, end.x),
    y: lerp(ratio, start.y, end.y),
  };
}

/**
 * Optimized De Casteljau's algorithm for Bezier curves.
 * Uses explicit Bernstein basis polynomials for common degrees (1-3)
 * to avoid recursion and array allocation.
 */
export function getCurvePoint(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  const len = points.length;

  if (len === 2) {
    // Linear: P = (1-t)P0 + tP1
    const p0 = points[0];
    const p1 = points[1];
    return {
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
    };
  } else if (len === 3) {
    // Quadratic: P = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
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
    // Cubic: P = (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t)t^2 P2 + t^3 P3
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

  // Fallback for N > 4 (or N=1)
  if (len === 1) return points[0];

  // Recursive fallback
  const newpoints = [];
  for (let i = 0, j = 1; j < len; i++, j++) {
    newpoints[i] = lerp2d(t, points[i], points[j]);
  }
  return getCurvePoint(t, newpoints);
}

// Helpers for Heading Calculation
export function getTangentAngle(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
}

export function getLineStartHeading(
  line: Line | undefined,
  previousPoint: Point,
): number {
  if (!line || !line.endPoint) return 0;

  if (line.endPoint.heading === "constant") return line.endPoint.degrees;
  if (line.endPoint.heading === "linear") return line.endPoint.startDeg;
  if (line.endPoint.heading === "tangential") {
    let nextP = line.endPoint;
    // Find the first point that isn't the start point (overlap handling)
    if (line.controlPoints && line.controlPoints.length > 0) {
      for (const cp of line.controlPoints) {
        const dist = Math.hypot(cp.x - previousPoint.x, cp.y - previousPoint.y);
        if (dist > 1e-6) {
          nextP = cp;
          break;
        }
      }
    }
    const angle = getTangentAngle(previousPoint, nextP);
    return line.endPoint.reverse
      ? transformAngle(angle + 180)
      : transformAngle(angle);
  }
  return 0;
}

export function getLineEndHeading(
  line: Line | undefined,
  previousPoint: Point,
): number {
  if (!line || !line.endPoint) return 0;

  if (line.endPoint.heading === "constant") return line.endPoint.degrees;
  if (line.endPoint.heading === "linear") return line.endPoint.endDeg;
  if (line.endPoint.heading === "tangential") {
    let prevP = previousPoint;
    // Find the last point that isn't the end point (overlap handling)
    if (line.controlPoints && line.controlPoints.length > 0) {
      for (let i = line.controlPoints.length - 1; i >= 0; i--) {
        const cp = line.controlPoints[i];
        const dist = Math.hypot(cp.x - line.endPoint.x, cp.y - line.endPoint.y);
        if (dist > 1e-6) {
          prevP = cp;
          break;
        }
      }
    }
    const angle = getTangentAngle(prevP, line.endPoint);
    return line.endPoint.reverse
      ? transformAngle(angle + 180)
      : transformAngle(angle);
  }
  return 0;
}

export function vh(percent: number) {
  var h = Math.max(
    document.documentElement.clientHeight,
    window.innerHeight || 0,
  );
  return (percent * h) / 100;
}

export function vw(percent: number) {
  var w = Math.max(
    document.documentElement.clientWidth,
    window.innerWidth || 0,
  );
  return (percent * w) / 100;
}
