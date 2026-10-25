// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Pedro's braking curve fitted to stops: the distance a robot needs to stop
// from each speed.

/** Braking distance = quadratic * v² + linear * v, both at least 0, fitted by least squares. */
export function fitBraking(points: { speed: number; distance: number }[]) {
  let s4 = 0;
  let s3 = 0;
  let s2 = 0;
  let b2 = 0;
  let b1 = 0;
  for (const { speed: v, distance: d } of points) {
    s4 += v ** 4;
    s3 += v ** 3;
    s2 += v * v;
    b2 += v * v * d;
    b1 += v * d;
  }
  const det = s4 * s2 - s3 * s3;
  let quadratic = det > 0 ? (b2 * s2 - b1 * s3) / det : 0;
  let linear = det > 0 ? (s4 * b1 - s3 * b2) / det : 0;
  if (quadratic < 0 || det <= 0) {
    quadratic = 0;
    linear = s2 > 0 ? b1 / s2 : 0;
  }
  if (linear < 0) {
    linear = 0;
    quadratic = s4 > 0 ? b2 / s4 : 0;
  }

  const meanD = points.reduce((sum, p) => sum + p.distance, 0) / points.length;
  let residual = 0;
  let total = 0;
  for (const { speed: v, distance: d } of points) {
    residual += (d - quadratic * v * v - linear * v) ** 2;
    total += (d - meanD) ** 2;
  }
  return { quadratic, linear, fit: total > 0 ? 1 - residual / total : 0 };
}
