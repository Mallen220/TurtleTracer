// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point, TimelineEvent } from "../../../types";
import { closestPointOnPath } from "../../../utils/geometry";
import { timeAtProfileT } from "../../../utils/math";
import { travelCurve } from "../../../utils/animation";
import { analyzePathSegment } from "../../../utils/timeCalculator/segmentAnalyzer";

export interface VelocityTooltipResult {
  visible: boolean;
  velocity?: number;
  time?: number;
  distance?: number;
  x?: number;
  y?: number;
}

export interface CalculateVelocityTooltipParams {
  rawInchX: number;
  rawInchY: number;
  lines: Line[];
  startPoint: Point;
  timeline?: TimelineEvent[];
  clientX: number;
  clientY: number;
  snapThreshold?: number;
}

/** Length of the curve a travel event drives, measured as the timer does. */
function travelLength(
  event: TimelineEvent,
  lines: Line[],
  startPoint: Point,
): number {
  const travel = travelCurve(event, lines, startPoint);
  if (!travel) return 0;
  const { curve } = travel;
  return analyzePathSegment(curve[0], curve.slice(1, -1), curve.at(-1)!, 100, 0)
    .length;
}

/**
 * Computes velocity tooltip position and values (velocity, elapsed time, cumulative distance)
 * along bezier paths on mouse move.
 */
export function calculateVelocityTooltip(
  params: CalculateVelocityTooltipParams,
): VelocityTooltipResult {
  const {
    rawInchX,
    rawInchY,
    lines,
    startPoint,
    timeline,
    clientX,
    clientY,
    snapThreshold = 0.5,
  } = params;

  if (!timeline || timeline.length === 0) {
    return { visible: false };
  }

  const closest = closestPointOnPath(lines, startPoint, {
    x: rawInchX,
    y: rawInchY,
  });
  if (!closest || closest.dist >= snapThreshold) {
    return { visible: false };
  }
  const tlEvent = timeline.find(
    (e) => e.type === "travel" && e.lineIndex === closest.lineIdx,
  );
  const vProfile = tlEvent?.velocityProfile;
  if (!tlEvent || !vProfile?.length) return { visible: false };

  const t = closest.t;
  const profileIndex = Math.floor(t * (vProfile.length - 1));
  const velocity = vProfile[Math.min(vProfile.length - 1, profileIndex)];
  const time =
    tlEvent.startTime +
    (tlEvent.motionProfile
      ? timeAtProfileT(t, tlEvent.motionProfile)
      : t * tlEvent.duration);

  // Everything driven before this path, plus the part of it up to the cursor
  let distance = 0;
  for (const ev of timeline) {
    if (ev === tlEvent) break;
    if (ev.type === "travel") distance += travelLength(ev, lines, startPoint);
  }
  distance += travelLength(tlEvent, lines, startPoint) * t;

  return {
    visible: true,
    velocity,
    time,
    distance,
    x: clientX,
    y: clientY,
  };
}
