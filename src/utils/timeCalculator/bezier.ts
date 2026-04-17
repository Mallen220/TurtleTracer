import { getCurvePoint } from "../math";

/**
 * Calculates the first derivative of a Bezier curve of degree N at t.
 */
export function getBezierDerivative(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  const n = points.length - 1;
  if (n < 1) return { x: 0, y: 0 };

  // Optimized for Quadratic (3 points)
  if (n === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];

    const mt = 1 - t;

    const d0x = 2 * (p1.x - p0.x);
    const d0y = 2 * (p1.y - p0.y);
    const d1x = 2 * (p2.x - p1.x);
    const d1y = 2 * (p2.y - p1.y);

    return {
      x: mt * d0x + t * d1x,
      y: mt * d0y + t * d1y,
    };
  }

  // Optimized for Cubic (4 points)
  if (n === 3) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const p3 = points[3];

    const mt = 1 - t;
    const a = mt * mt;
    const b = 2 * mt * t;
    const c = t * t;

    const q0x = 3 * (p1.x - p0.x);
    const q0y = 3 * (p1.y - p0.y);
    const q1x = 3 * (p2.x - p1.x);
    const q1y = 3 * (p2.y - p1.y);
    const q2x = 3 * (p3.x - p2.x);
    const q2y = 3 * (p3.y - p2.y);

    return {
      x: a * q0x + b * q1x + c * q2x,
      y: a * q0y + b * q1y + c * q2y,
    };
  }

  const derivativePoints = [];
  for (let i = 0; i < n; i++) {
    derivativePoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y),
    });
  }
  return getCurvePoint(t, derivativePoints);
}

/**
 * Calculates the second derivative of a Bezier curve of degree N at t.
 */
export function getBezierSecondDerivative(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  const n = points.length - 1;
  if (n < 2) return { x: 0, y: 0 };

  // Optimized for Quadratic (3 points) -> 2nd Deriv is Constant (1 point)
  // For Quadratic Bezier: P'' = 2(P2 - 2P1 + P0)
  if (n === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];

    return {
      x: 2 * (p2.x - 2 * p1.x + p0.x),
      y: 2 * (p2.y - 2 * p1.y + p0.y),
    };
  }

  // Optimized for Cubic (4 points) -> 2nd Deriv is Linear (2 points)
  // For Cubic Bezier:
  // S0 = 6(P2 - 2P1 + P0)
  // S1 = 6(P3 - 2P2 + P1)
  // P''(t) = (1-t)S0 + tS1
  if (n === 3) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const p3 = points[3];

    const mt = 1 - t;

    const s0x = 6 * (p2.x - 2 * p1.x + p0.x);
    const s0y = 6 * (p2.y - 2 * p1.y + p0.y);

    const s1x = 6 * (p3.x - 2 * p2.x + p1.x);
    const s1y = 6 * (p3.y - 2 * p2.y + p1.y);

    return {
      x: mt * s0x + t * s1x,
      y: mt * s0y + t * s1y,
    };
  }

  // Calculate first derivative control points Q
  const qPoints = [];
  for (let i = 0; i < n; i++) {
    qPoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y),
    });
  }

  const m = n - 1;
  const rPoints = [];
  for (let i = 0; i < m; i++) {
    rPoints.push({
      x: m * (qPoints[i + 1].x - qPoints[i].x),
      y: m * (qPoints[i + 1].y - qPoints[i].y),
    });
  }
  return getCurvePoint(t, rPoints);
}
