// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// How fast the robot goes at each point along a path it drives. A travel
// event holds the speed at each step boundary of its line (the steps are
// evenly spaced in the curve's t) and the time it reaches each boundary.
// Between boundaries the robot accelerates steadily, which is how the time
// calculator times each step (see motionProfile.ts).
import type { BasePoint, TimelineEvent } from "../../types";
import { getCurvePoint } from "../math";

/**
 * The robot's speed (inches per second) at any `t` from 0 to 1 along the
 * line a travel event drives, or null if the event has no speeds. `curve`
 * is the line's start, control points and end.
 */
export function travelSpeeds(
  event: TimelineEvent,
  curve: BasePoint[],
): ((t: number) => number) | null {
  const speeds = event.velocityProfile;
  const steps = (speeds?.length ?? 0) - 1;
  if (!speeds || steps < 1 || curve.length < 2) return null;
  const times =
    event.motionProfile?.length === speeds.length ? event.motionProfile : null;

  // Each step's length, measured as the time calculator measures it.
  const lengths: number[] = [];
  let previous = getCurvePoint(0, curve);
  for (let k = 1; k <= steps; k++) {
    const point = getCurvePoint(k / steps, curve);
    lengths.push(Math.hypot(point.x - previous.x, point.y - previous.y));
    previous = point;
  }

  return (t) => {
    const raw = Math.min(Math.max(t, 0), 1) * steps;
    const k = Math.min(Math.floor(raw), steps - 1);
    const v0 = speeds[k]!;
    const v1 = speeds[k + 1]!;
    const duration = times ? times[k + 1]! - times[k]! : 0;
    // Steady acceleration covers the step in 2d / (v0 + v1). A step that
    // takes longer, because the robot is held back while it turns, is
    // driven at an even, slower speed.
    if (duration > 1e-6) {
      const steady = v0 + v1 > 0 ? (2 * lengths[k]!) / (v0 + v1) : 0;
      if (duration > steady * (1 + 1e-6)) return lengths[k]! / duration;
    }
    // Under steady acceleration the square of the speed changes evenly
    // with distance.
    const f = raw - k;
    return Math.sqrt(Math.max(0, v0 * v0 + (v1 * v1 - v0 * v0) * f));
  };
}
