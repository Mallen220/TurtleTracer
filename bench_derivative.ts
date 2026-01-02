import { getCurvePoint } from "./src/utils/math";

// Original implementation
function getBezierDerivativeOriginal(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  const n = points.length - 1;
  if (n < 1) return { x: 0, y: 0 };

  const derivativePoints = [];
  for (let i = 0; i < n; i++) {
    derivativePoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y),
    });
  }

  // Use the existing getCurvePoint (De Casteljau) to evaluate the derivative curve
  return getCurvePoint(t, derivativePoints);
}

function getBezierSecondDerivativeOriginal(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  const n = points.length - 1;
  if (n < 2) return { x: 0, y: 0 };

  // Calculate first derivative control points Q
  const qPoints = [];
  for (let i = 0; i < n; i++) {
    qPoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y),
    });
  }

  // Calculate second derivative control points R from Q
  // R has degree n-2, derived from Q (degree n-1)
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

// Optimized implementation
function getBezierDerivativeOptimized(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  const n = points.length - 1;
  if (n < 1) return { x: 0, y: 0 };

  // Quadratic (3 points) -> Derivative is Linear (2 points)
  if (n === 2) {
    // 3 points P0, P1, P2
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];

    // Q0 = 2(P1-P0), Q1 = 2(P2-P1)
    // Lerp(t, Q0, Q1) = (1-t)Q0 + tQ1
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

  // Cubic (4 points) -> Derivative is Quadratic (3 points)
  if (n === 3) {
    // 4 points P0..P3
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const p3 = points[3];

    // Q0 = 3(P1-P0), Q1 = 3(P2-P1), Q2 = 3(P3-P2)
    // Quad(t, Q0, Q1, Q2) = (1-t)^2 Q0 + 2(1-t)t Q1 + t^2 Q2
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

  // Fallback
  const derivativePoints = [];
  for (let i = 0; i < n; i++) {
    derivativePoints.push({
      x: n * (points[i + 1].x - points[i].x),
      y: n * (points[i + 1].y - points[i].y),
    });
  }
  return getCurvePoint(t, derivativePoints);
}

function getBezierSecondDerivativeOptimized(
  t: number,
  points: { x: number; y: number }[],
): { x: number; y: number } {
  const n = points.length - 1;
  if (n < 2) return { x: 0, y: 0 };

  // Quadratic (3 points) -> 2nd Deriv is Constant (1 point)
  // P'' = 2(Q1-Q0) = 2( 2(P2-P1) - 2(P1-P0) ) = 4(P2 - 2P1 + P0)
  if (n === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    return {
      x: 2 * (2 * (p2.x - p1.x) - 2 * (p1.x - p0.x)),
      y: 2 * (2 * (p2.y - p1.y) - 2 * (p1.y - p0.y)),
    };
  }

  // Cubic (4 points) -> 2nd Deriv is Linear (2 points)
  // S0 = 6(P2 - 2P1 + P0)
  // S1 = 6(P3 - 2P2 + P1)
  // Val = (1-t)S0 + tS1
  if (n === 3) {
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[2];
    const p3 = points[3];

    const mt = 1 - t;

    // S0 components
    const s0x = 6 * (p2.x - 2 * p1.x + p0.x);
    const s0y = 6 * (p2.y - 2 * p1.y + p0.y);

    // S1 components
    const s1x = 6 * (p3.x - 2 * p2.x + p1.x);
    const s1y = 6 * (p3.y - 2 * p2.y + p1.y);

    return {
      x: mt * s0x + t * s1x,
      y: mt * s0y + t * s1y,
    };
  }

  // Fallback
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

// Benchmark
const ITERATIONS = 1000000;
const pointsCubic = [
  { x: 0, y: 0 },
  { x: 10, y: 20 },
  { x: 50, y: 50 },
  { x: 100, y: 0 },
];

console.log(`Running ${ITERATIONS} iterations...`);

const start1 = performance.now();
let chk1 = 0;
for (let i = 0; i < ITERATIONS; i++) {
  const d = getBezierDerivativeOriginal(0.5, pointsCubic);
  chk1 += d.x;
}
const end1 = performance.now();
console.log(`Original Derivative: ${(end1 - start1).toFixed(2)}ms`);

const start2 = performance.now();
let chk2 = 0;
for (let i = 0; i < ITERATIONS; i++) {
  const d = getBezierDerivativeOptimized(0.5, pointsCubic);
  chk2 += d.x;
}
const end2 = performance.now();
console.log(`Optimized Derivative: ${(end2 - start2).toFixed(2)}ms`);

const start3 = performance.now();
let chk3 = 0;
for (let i = 0; i < ITERATIONS; i++) {
  const d = getBezierSecondDerivativeOriginal(0.5, pointsCubic);
  chk3 += d.x;
}
const end3 = performance.now();
console.log(`Original 2nd Derivative: ${(end3 - start3).toFixed(2)}ms`);

const start4 = performance.now();
let chk4 = 0;
for (let i = 0; i < ITERATIONS; i++) {
  const d = getBezierSecondDerivativeOptimized(0.5, pointsCubic);
  chk4 += d.x;
}
const end4 = performance.now();
console.log(`Optimized 2nd Derivative: ${(end4 - start4).toFixed(2)}ms`);

if (Math.abs(chk1 - chk2) > 0.001) console.error("Mismatch in Derivative!");
if (Math.abs(chk3 - chk4) > 0.001) console.error("Mismatch in 2nd Derivative!");
