// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  Line,
  SequenceItem,
  TimePrediction,
  Point,
  EventMarker,
  Settings,
} from "../types";
import {
  splitBezier,
  easeInOutQuad,
  shortestRotation,
  getDistance,
  interpolateTFromProfile,
} from "./math";
import { getRandomColor } from "./draw";
import { makeId } from "./nameGenerator";

type XY = { x: number; y: number };
type Vec = { dx: number; dy: number };

export interface PathSplitResult {
  lines: Line[];
  sequence: SequenceItem[];
  splitIndex: number;
}

/**
 * Splits the line the robot is driving at `percent` (0-100) of the timeline
 * into two lines that meet at the robot's position.
 * Returns null if the robot isn't travelling along a line at that moment.
 */
export function splitPathAtPercent(
  percent: number,
  timePrediction: TimePrediction,
  lines: Line[],
  sequence: SequenceItem[],
): PathSplitResult | null {
  if (!(timePrediction?.totalTime > 0)) return null;

  const globalTime = (percent / 100) * timePrediction.totalTime;
  const activeEvent = timePrediction.timeline.find(
    (e) => globalTime >= e.startTime && globalTime <= e.endTime,
  );
  if (activeEvent?.type !== "travel") return null;

  const lineIndex = activeEvent.lineIndex ?? -1;
  const originalLine = lines[lineIndex];
  const prevPoint = activeEvent.prevPoint;
  if (!originalLine || !prevPoint) return null;

  // Convert the time into a position (t) along the curve.
  const relativeTime = globalTime - activeEvent.startTime;
  let t: number;
  if (activeEvent.motionProfile?.length) {
    t = interpolateTFromProfile(relativeTime, activeEvent.motionProfile);
  } else {
    const duration = Math.max(0.001, activeEvent.duration);
    t = easeInOutQuad(Math.max(0, Math.min(1, relativeTime / duration)));
  }
  // Splitting right at an end would create a zero-length line.
  t = Math.max(0.001, Math.min(0.999, t));

  const [leftPoints, rightPoints] = splitBezier(t, [
    prevPoint,
    ...originalLine.controlPoints,
    originalLine.endPoint,
  ]);
  const { x, y } = leftPoints.at(-1)!;

  // The first half ends at the split point. Keep the original heading mode
  // where it makes sense; otherwise use tangential for a smooth join.
  const end = originalLine.endPoint;
  let firstEnd: Point = {
    x,
    y,
    heading: "tangential",
    reverse: end.heading === "tangential" ? end.reverse : false,
  };
  let secondEnd: Point = { ...end };
  if (end.heading === "constant") {
    firstEnd = { x, y, heading: "constant", degrees: end.degrees };
  } else if (end.heading === "linear") {
    const midDeg = shortestRotation(end.startDeg, end.endDeg, t);
    firstEnd = {
      x,
      y,
      heading: "linear",
      startDeg: end.startDeg,
      endDeg: midDeg,
    };
    secondEnd = {
      x: end.x,
      y: end.y,
      locked: end.locked,
      isMacroElement: end.isMacroElement,
      macroId: end.macroId,
      originalId: end.originalId,
      heading: "linear",
      startDeg: midDeg,
      endDeg: end.endDeg,
    };
  }

  // Markers keep their place on the path, rescaled to whichever half they
  // end up on.
  const firstMarkers: EventMarker[] = [];
  const secondMarkers: EventMarker[] = [];
  for (const m of originalLine.eventMarkers ?? []) {
    if (m.position <= t) {
      firstMarkers.push({ ...m, position: m.position / t });
    } else {
      secondMarkers.push({ ...m, position: (m.position - t) / (1 - t) });
    }
  }

  const firstHalfId = makeId();
  const firstHalf: Line = {
    ...originalLine,
    id: firstHalfId,
    endPoint: firstEnd,
    controlPoints: leftPoints.slice(1, -1),
    name: "",
    eventMarkers: firstMarkers,
    waitAfterMs: 0,
    waitAfterName: "",
  };
  // The second half keeps the original line's id so existing references
  // (sequence items, macros) still point at the part that reaches the end.
  const secondHalf: Line = {
    ...originalLine,
    endPoint: secondEnd,
    controlPoints: rightPoints.slice(1, -1),
    name: "",
    eventMarkers: secondMarkers,
    waitBeforeMs: 0,
    waitBeforeName: "",
  };

  const newLines = [...lines];
  newLines.splice(lineIndex, 1, firstHalf, secondHalf);

  const newSequence = sequence.flatMap((item): SequenceItem[] =>
    item.kind === "path" && item.lineId === originalLine.id
      ? [{ kind: "path", lineId: firstHalfId }, item]
      : [item],
  );

  return { lines: newLines, sequence: newSequence, splitIndex: lineIndex };
}

function perpendicularDistance(pt: XY, lineStart: XY, lineEnd: XY): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return getDistance(pt, lineStart);

  // |cross product| is the area of the parallelogram; divide by the base to
  // get its height, which is the distance from the line.
  return (
    Math.abs(dx * (lineStart.y - pt.y) - (lineStart.x - pt.x) * dy) / length
  );
}

/** Ramer-Douglas-Peucker line simplification. */
function douglasPeucker(points: XY[], epsilon: number): XY[] {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax <= epsilon) return [points[0], points[end]];

  const left = douglasPeucker(points.slice(0, index + 1), epsilon);
  const right = douglasPeucker(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

function indexOfClosest(points: XY[], target: XY): number {
  let best = 0;
  let bestDist = Infinity;
  points.forEach((p, i) => {
    const d = getDistance(p, target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/** True if the part of the stroke between `from` and `to` is within 1 inch of a straight line. */
function isStrokeStraight(stroke: XY[], from: XY, to: XY): boolean {
  const a = indexOfClosest(stroke, from);
  const b = indexOfClosest(stroke, to);
  const section = stroke.slice(Math.min(a, b), Math.max(a, b) + 1);
  return section.every((p) => perpendicularDistance(p, from, to) < 1);
}

function normalize(v: Vec): Vec {
  const mag = Math.hypot(v.dx, v.dy) || 1;
  return { dx: v.dx / mag, dy: v.dy / mag };
}

const vectorBetween = (from: XY, to: XY): Vec => ({
  dx: to.x - from.x,
  dy: to.y - from.y,
});

/**
 * Turns a freehand stroke (in field inches) into smooth path lines appended
 * to the existing path. If there is no path yet, the stroke's first point
 * becomes the start point.
 */
export function generateLinesFromDrawing(
  drawnPoints: XY[],
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  settings?: Pick<Settings, "drawToolTolerance" | "drawToolTension">,
): { startPoint: Point; lines: Line[]; sequence: SequenceItem[] } | null {
  if (drawnPoints.length < 2) return null;

  // Simplify the stroke, loosening the tolerance until it has at most 12
  // points so a wobbly stroke doesn't become dozens of tiny lines.
  let epsilon = settings?.drawToolTolerance ?? 5;
  let simplified = douglasPeucker(drawnPoints, epsilon);
  while (simplified.length > 12 && epsilon < 60) {
    epsilon += 5;
    simplified = douglasPeucker(drawnPoints, epsilon);
  }

  // How far control points sit from their endpoints, as a fraction of the
  // line's length. 0.38 follows the stroke closely without overshooting.
  const tension = settings?.drawToolTension ?? 0.38;

  let newStartPoint = { ...startPoint };
  // Direction the path is already heading in, so the join is smooth.
  let initialTangent: Vec | null = null;
  // The points the new lines pass through, in order.
  let waypoints: XY[];

  const lastLine = lines.at(-1);
  if (lastLine) {
    const end = lastLine.endPoint;
    const beforeEnd =
      lastLine.controlPoints.at(-1) ?? lines.at(-2)?.endPoint ?? startPoint;
    initialTangent = vectorBetween(beforeEnd, end);
    // Don't add a tiny connecting line if the stroke starts at the path's end.
    const skipFirst = getDistance(end, simplified[0]) < 2;
    waypoints = [end, ...simplified.slice(skipFirst ? 1 : 0)];
  } else {
    newStartPoint = {
      ...newStartPoint,
      x: simplified[0].x,
      y: simplified[0].y,
    };
    waypoints = simplified;
  }

  const newLines = [...lines];
  const newSequence = [...sequence];

  for (let k = 0; k < waypoints.length - 1; k++) {
    const from = waypoints[k];
    const to = waypoints[k + 1];
    const chord = vectorBetween(from, to);

    let controlPoints: XY[] = [];
    if (!isStrokeStraight(drawnPoints, from, to)) {
      // Catmull-Rom style tangents: each point's tangent runs from the
      // point before it to the point after it.
      const before = waypoints[k - 1];
      const after = waypoints[k + 2];
      const startTangent = normalize(
        before ? vectorBetween(before, to) : (initialTangent ?? chord),
      );
      const endTangent = normalize(after ? vectorBetween(from, after) : chord);
      const reach = getDistance(from, to) * tension;
      controlPoints = [
        {
          x: from.x + startTangent.dx * reach,
          y: from.y + startTangent.dy * reach,
        },
        { x: to.x - endTangent.dx * reach, y: to.y - endTangent.dy * reach },
      ];
    }

    const newLine: Line = {
      id: makeId(),
      name: "",
      endPoint: { x: to.x, y: to.y, heading: "tangential", reverse: false },
      controlPoints,
      color: getRandomColor(),
      locked: false,
      eventMarkers: [],
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };
    newLines.push(newLine);
    newSequence.push({ kind: "path", lineId: newLine.id! });
  }

  return { startPoint: newStartPoint, lines: newLines, sequence: newSequence };
}
