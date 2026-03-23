// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line } from "../../../types";

interface RenderContext {
  x: d3.ScaleLinear<number, number>;
  y: d3.ScaleLinear<number, number>;
  robotXY: { x: number; y: number } | null;
  timePrediction: any;
  percentStore: number;
}

export function generateFacingLineElements(lines: Line[], ctx: RenderContext) {
  const { x, y, robotXY, timePrediction, percentStore } = ctx;

  if (!robotXY || !timePrediction?.timeline?.length) return [];

  // Determine the currently active travel event
  const totalDuration =
    timePrediction.timeline[timePrediction.timeline.length - 1].endTime;
  const currentSeconds = (percentStore / 100) * totalDuration;
  const activeEvent =
    timePrediction.timeline.find(
      (e: any) => currentSeconds >= e.startTime && currentSeconds <= e.endTime,
    ) ?? timePrediction.timeline[timePrediction.timeline.length - 1];

  // Only render if it's a travel event on a facingPoint segment
  if (activeEvent.type !== "travel") return [];
  const activeLine: Line | undefined =
    activeEvent.line ?? lines[activeEvent.lineIndex];
  if (!activeLine || activeLine.endPoint.heading !== "facingPoint") return [];

  const targetX = (activeLine.endPoint as any).targetX ?? 72;
  const targetY = (activeLine.endPoint as any).targetY ?? 72;
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
