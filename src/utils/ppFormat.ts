// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, PiecewiseSegment, Point } from "../types";

/**
 * Pedro Pathing Visualizer files (.pp) come in two layouts. Some keep a
 * path's heading on its end point, which is the layout the app uses. Others
 * keep it on the line, as `heading: { type, ... }`, and give the start point
 * a `headingDeg`. These helpers convert the line-level layout to the
 * end-point one; files already in it pass through unchanged.
 */

type LineHeadingSegment = {
  startProgress: number;
  endProgress: number;
  interpolationType: string;
  reversed?: boolean;
  parameters?: {
    startDeg?: number;
    endDeg?: number;
    degrees?: number;
    point?: { x: number; y: number };
  };
};

type LineHeading = {
  type: string;
  reverse?: boolean;
  startDeg?: number;
  endDeg?: number;
  degrees?: number;
  point?: { x: number; y: number };
  piecewiseHeading?: { segments?: LineHeadingSegment[] };
};

const kind = (type: string) => (type === "facing-point" ? "facingPoint" : type);

function toSegment(s: LineHeadingSegment): PiecewiseSegment {
  const p = s.parameters ?? {};
  return {
    tStart: s.startProgress,
    tEnd: s.endProgress,
    heading: kind(s.interpolationType),
    ...(s.reversed ? { reverse: true } : {}),
    ...(p.startDeg !== undefined && { startDeg: p.startDeg, endDeg: p.endDeg }),
    ...(p.degrees !== undefined && { degrees: p.degrees }),
    ...(p.point && { targetX: p.point.x, targetY: p.point.y }),
  } as PiecewiseSegment;
}

function toHeading(h: LineHeading): Partial<Point> {
  const type = kind(h.type);
  const { startDeg, endDeg, degrees, point } = h;
  return {
    heading: type,
    ...(h.reverse ? { reverse: true } : {}),
    ...(type === "linear" && { startDeg, endDeg }),
    ...(type === "constant" && { degrees }),
    ...(type === "facingPoint" &&
      point && { targetX: point.x, targetY: point.y }),
    ...(type === "piecewise" && {
      segments: (h.piecewiseHeading?.segments ?? []).map(toSegment),
    }),
  } as Partial<Point>;
}

export function normalizeLineHeading<T extends Line>(line: T): T {
  const { heading, ...rest } = line as T & { heading?: LineHeading };
  if (!heading || typeof heading !== "object") return line;
  return {
    ...rest,
    endPoint: { ...line.endPoint, ...toHeading(heading) },
  } as T;
}

export function normalizeStartPoint<T extends Point>(start: T): T {
  const { headingDeg, ...rest } = start as T & { headingDeg?: number };
  if (typeof headingDeg !== "number") return start;
  return {
    ...rest,
    heading: "linear",
    startDeg: headingDeg,
    endDeg: headingDeg,
  } as unknown as T;
}
