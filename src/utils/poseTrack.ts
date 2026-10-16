// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Pose tracks: poses over time as parallel arrays (see PoseTrack).
import type { PoseTrack } from "../types";

/**
 * The pose `time` seconds along a track, between samples by straight-line
 * interpolation. Before the start or after the end, the first or last pose.
 * Null for an empty track.
 */
export function poseOnTrack(
  track: PoseTrack,
  time: number,
): { x: number; y: number; heading: number } | null {
  const { t, x, y, heading } = track;
  const n = t.length;
  if (n === 0) return null;
  if (time <= t[0]) return { x: x[0], y: y[0], heading: heading[0] };
  if (time >= t[n - 1]) {
    return { x: x[n - 1], y: y[n - 1], heading: heading[n - 1] };
  }
  // The last sample at or before `time`.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= time) lo = mid;
    else hi = mid;
  }
  const span = t[hi] - t[lo];
  const f = span > 0 ? (time - t[lo]) / span : 0;
  return {
    x: x[lo] + (x[hi] - x[lo]) * f,
    y: y[lo] + (y[hi] - y[lo]) * f,
    heading: heading[lo] + (heading[hi] - heading[lo]) * f,
  };
}
