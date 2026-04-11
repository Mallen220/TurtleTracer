// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { type RenderContext, findActiveEvent } from "./GeneratorUtils";
import type { Line } from "../../../types";

export function generateFacingLineElements(lines: Line[], ctx: RenderContext) {
  const { x, y, robotXY, timePrediction, percentStore } = ctx;

  if (!robotXY || !timePrediction?.timeline?.length) return [];

  const totalDuration =
    timePrediction.timeline[timePrediction.timeline.length - 1]?.endTime || 0;
  const currentSeconds = (percentStore! / 100) * totalDuration;

  // Determine the currently active travel event
  const activeEvent = findActiveEvent(timePrediction, percentStore!);
  if (!activeEvent || activeEvent.type !== "travel") return [];

  const activeLine: Line | undefined =
    activeEvent.line ?? lines[activeEvent.lineIndex];
  if (!activeLine || !activeLine.endPoint) return [];

  const isGlobal = activeEvent.isGlobalOverride;
  const rootLine = activeEvent.rootLine;
  const headingMode = isGlobal
    ? activeEvent.globalHeading
    : activeLine.endPoint.heading;

  if (headingMode === "piecewise") {
    const segments =
      isGlobal && rootLine
        ? rootLine.globalSegments || []
        : activeLine.endPoint.segments || [];
    const t =
      activeEvent.endTime > activeEvent.startTime
        ? (currentSeconds - activeEvent.startTime) /
          (activeEvent.endTime - activeEvent.startTime)
        : 1.0;

    let activeSeg = null;
    for (const seg of segments) {
      if (t >= seg.tStart && t <= seg.tEnd) {
        activeSeg = seg;
        break;
      }
    }

    if (activeSeg && activeSeg.heading === "facingPoint") {
      const targetX = activeSeg.targetX ?? 72;
      const targetY = activeSeg.targetY ?? 72;
      const pathColor = activeLine.color || "#60a5fa";
      return [
        {
          x1: x(robotXY.x),
          y1: y(robotXY.y),
          x2: x(targetX),
          y2: y(targetY),
          color: pathColor,
        },
      ];
    }
  }

  if (headingMode !== "facingPoint") return [];

  const targetX =
    isGlobal && rootLine
      ? (rootLine.globalTargetX ?? 72)
      : ((activeLine.endPoint as any).targetX ?? 72);

  const targetY =
    isGlobal && rootLine
      ? (rootLine.globalTargetY ?? 72)
      : ((activeLine.endPoint as any).targetY ?? 72);

  const pathColor = activeLine.color || "#60a5fa";
  return [
    {
      x1: x(robotXY.x),
      y1: y(robotXY.y),
      x2: x(targetX),
      y2: y(targetY),
      color: pathColor,
    },
  ];
}
