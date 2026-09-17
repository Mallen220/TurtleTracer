// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point } from "../../../types";
import { findClosestT, getCurvePoint, getDistance } from "../../../utils/math";

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
  timeline?: any[];
  clientX: number;
  clientY: number;
  snapThreshold?: number;
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

  let bestDist = snapThreshold;
  let bestLineIdx = -1;
  let bestT = 0;

  lines.forEach((line, idx) => {
    if (line.hidden) return;
    const prevP = idx === 0 ? startPoint : lines[idx - 1].endPoint;
    const cps = [prevP, ...line.controlPoints, line.endPoint];
    const t = findClosestT({ x: rawInchX, y: rawInchY }, cps);
    const pt = getCurvePoint(t, cps);
    const dist = getDistance({ x: rawInchX, y: rawInchY }, pt);
    if (dist < bestDist) {
      bestDist = dist;
      bestLineIdx = idx;
      bestT = t;
    }
  });

  if (bestLineIdx === -1) {
    return { visible: false };
  }

  const tlEvent = timeline.find(
    (e: any) => e.type === "travel" && e.lineIndex === bestLineIdx,
  );

  if (!tlEvent?.velocityProfile || tlEvent.velocityProfile.length === 0) {
    return { visible: false };
  }

  const vProfile = tlEvent.velocityProfile;
  const profileIndex = Math.floor(bestT * (vProfile.length - 1));
  const safeIndex = Math.min(vProfile.length - 1, Math.max(0, profileIndex));

  const velocity = vProfile[safeIndex];
  const time = tlEvent.startTime + bestT * tlEvent.duration;

  let priorDist = 0;
  for (let i = 0; i < timeline.length; i++) {
    const evtItem = timeline[i];
    if (evtItem === tlEvent) break;
    if (evtItem.type === "travel" && evtItem.lineIndex !== undefined) {
      const line = lines[evtItem.lineIndex];
      if ((line as any)?.length) {
        priorDist += (line as any).length;
      } else if (line) {
        const p1 =
          evtItem.lineIndex === 0
            ? startPoint
            : lines[evtItem.lineIndex - 1].endPoint;
        priorDist += getDistance(p1, line.endPoint);
      }
    }
  }

  const currentLine = lines[bestLineIdx];
  const prevPForCurrent =
    bestLineIdx === 0 ? startPoint : lines[bestLineIdx - 1].endPoint;
  const approxLineLength =
    (currentLine as any)?.length ||
    getDistance(prevPForCurrent, currentLine.endPoint);

  const distance = priorDist + approxLineLength * bestT;

  return {
    visible: true,
    velocity,
    time,
    distance,
    x: clientX,
    y: clientY,
  };
}
