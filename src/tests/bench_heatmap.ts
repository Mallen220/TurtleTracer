// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { getCurvePoint } from "../utils/math";

// Mock Data
const line = {
  startPoint: { x: 0, y: 0 },
  endPoint: { x: 100, y: 100 },
  controlPoints: [
    { x: 50, y: 0 },
    { x: 50, y: 100 },
  ],
};
const startPoint = line.startPoint;
const cps = [startPoint, ...line.controlPoints, line.endPoint];

// Mock Velocity Profile (100 samples)
// 0-20: Ramp up
// 21-80: Constant max
// 81-100: Ramp down
const vProfile: number[] = [];
for (let i = 0; i < 100; i++) {
  if (i < 20)
    vProfile.push(i * 5); // 0, 5, 10... 95
  else if (i < 80) vProfile.push(100);
  else vProfile.push(Math.max(0, 100 - (i - 80) * 5)); // 100, 95...
}
const maxVel = 100;

function runBaseline() {
  let objectCount = 0;
  const samples = 100;
  let prevPt = getCurvePoint(0, cps);

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const currPt = getCurvePoint(t, cps);

    const profileIndex = Math.floor(t * (vProfile.length - 1));
    const safeIndex = Math.min(vProfile.length - 1, Math.max(0, profileIndex));

    const vAvg = vProfile[safeIndex] || 0;
    const ratio = Math.min(1, Math.max(0, vAvg / maxVel));
    const hue = 120 - ratio * 120;
    // const color = `hsl(${hue}, 100%, 40%)`;

    // Simulate new Two.Line
    objectCount++;

    prevPt = currPt;
  }
  return objectCount;
}

function runOptimized() {
  let objectCount = 0;
  const samples = 100;

  // State for optimization
  let currentPoints: any[] = [];
  let currentColor: string | null = null;

  let prevPt = getCurvePoint(0, cps);

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const currPt = getCurvePoint(t, cps);

    const profileIndex = Math.floor(t * (vProfile.length - 1));
    const safeIndex = Math.min(vProfile.length - 1, Math.max(0, profileIndex));

    const vAvg = vProfile[safeIndex] || 0;
    const ratio = Math.min(1, Math.max(0, vAvg / maxVel));
    const hue = 120 - ratio * 120;
    const color = `hsl(${hue}, 100%, 40%)`;

    if (color !== currentColor) {
      // Color changed.
      // If we have an active path, flush it.
      if (currentPoints.length > 0) {
        objectCount++;
      }

      // Start new segment with previous point as anchor
      currentPoints = [prevPt, currPt];
      currentColor = color;
    } else {
      // Color same. Extend current path.
      currentPoints.push(currPt);
    }

    prevPt = currPt;
  }

  // Flush last segment
  if (currentPoints.length > 0) {
    objectCount++;
  }

  return objectCount;
}

console.log("Running Heatmap Generation Benchmark...");
const baseline = runBaseline();
const optimized = runOptimized();

console.log(`Baseline Objects: ${baseline}`);
console.log(`Optimized Objects: ${optimized}`);
console.log(
  `Reduction: ${(((baseline - optimized) / baseline) * 100).toFixed(1)}%`,
);
