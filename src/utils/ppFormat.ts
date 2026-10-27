// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, PiecewiseSegment, Point } from "../types";

/**
 * Pedro Pathing Visualizer files (.pp) come in two layouts. Some keep a
 * path's heading on its end point, which is the layout the app uses. Others
 * keep it on the line, as `heading: { type, ... }`, and give the start point
 * a `headingDeg`. These helpers convert the line-level layout to the
 * end-point one; files already in it pass through unchanged.
 *
 * The line-level layout is read the way the Pedro Visualizer reads it: a
 * reverse flag counts only where it does there (a tangent heading, and
 * piecewise segments other than constant), and a segment that continues from
 * the previous one starts where that one ends (a blank Prev angle here).
 */

type LineHeadingSegment = {
  startProgress: number;
  endProgress: number;
  interpolationType: string;
  reversed?: boolean;
  continueFromPrevious?: boolean;
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

function toSegment(s: LineHeadingSegment, index: number): PiecewiseSegment {
  const p = s.parameters ?? {};
  const type = kind(s.interpolationType);
  const linked = s.continueFromPrevious && index > 0;
  return {
    tStart: s.startProgress,
    tEnd: s.endProgress,
    heading: type,
    ...(s.reversed && type !== "constant" ? { reverse: true } : {}),
    ...(p.startDeg !== undefined && {
      startDeg: linked ? undefined : p.startDeg,
      endDeg: p.endDeg,
    }),
    ...(p.degrees !== undefined && { degrees: linked ? undefined : p.degrees }),
    ...(p.point && { targetX: p.point.x, targetY: p.point.y }),
  } as PiecewiseSegment;
}

function toHeading(h: LineHeading): Partial<Point> {
  const type = kind(h.type);
  const { startDeg, endDeg, degrees, point } = h;
  return {
    heading: type,
    ...(h.reverse && type === "tangential" ? { reverse: true } : {}),
    ...(type === "linear" && { startDeg, endDeg }),
    ...(type === "constant" && { degrees }),
    ...(type === "facingPoint" &&
      point && { targetX: point.x, targetY: point.y }),
    ...(type === "piecewise" && {
      segments: (h.piecewiseHeading?.segments ?? []).map((segment, index) =>
        toSegment(segment, index),
      ),
    }),
  } as Partial<Point>;
}

export function normalizeLineHeading<T extends Line>(line: T): T {
  const { heading, ...rest } = line as T & { heading?: LineHeading };
  if (!heading || typeof heading !== "object") return line;
  // The end point's own reverse is an older copy; the line's heading decides.
  const { reverse: _stale, ...endPoint } = line.endPoint ?? {};
  return {
    ...rest,
    endPoint: { ...endPoint, ...toHeading(heading) },
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
