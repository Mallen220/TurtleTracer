// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point, PiecewiseSegment } from "../types";

type Point2D = { x: number; y: number };

// The fields of Point / PiecewiseSegment / a line's global override that
// describe how the robot should be facing.
/** The heading fields shared by points, piecewise segments and chain headings. */
export type HeadingSource = {
  heading?: Point["heading"] | "none";
  degrees?: number;
  startDeg?: number;
  endDeg?: number;
  targetX?: number;
  targetY?: number;
  reverse?: boolean;
  segments?: PiecewiseSegment[];
};

export function rotateVector(x: number, y: number, angleRad: number) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

export function quadraticToCubic(P0: Point2D, P1: Point2D, P2: Point2D) {
  const Q1 = lerp2d(2 / 3, P0, P1);
  const Q2 = lerp2d(2 / 3, P2, P1);
  return { Q1, Q2 };
}

export function easeInOutQuad(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/**
 * Finds which step of a motion profile `time` falls in. `profile[i]` is the
 * cumulative time at step i. Returns the step index and how far (0..1) we are
 * towards the next step.
 */
export function locateInProfile(
  time: number,
  profile: number[],
): { index: number; fraction: number } {
  let i = 0;
  while (i < profile.length - 2 && time > profile[i + 1]) {
    i++;
  }
  const span = profile[i + 1] - profile[i];
  const fraction = span > 0 ? (time - profile[i]) / span : 0;
  return { index: i, fraction: Math.max(0, Math.min(1, fraction)) };
}

/**
 * Converts a time into the curve parameter t (0..1) using a motion profile
 * whose entries are timestamps at evenly spaced values of t.
 */
export function interpolateTFromProfile(
  relativeTime: number,
  profile: number[],
): number {
  if (!profile || profile.length < 2) return 0;

  const { index, fraction } = locateInProfile(relativeTime, profile);
  return (index + fraction) / (profile.length - 1);
}

/** The reverse of interpolateTFromProfile: the time at curve parameter t. */
export function timeAtProfileT(t: number, profile: number[]): number {
  const steps = profile.length - 1;
  if (steps < 1) return 0;
  const raw = t * steps;
  const i = Math.min(Math.floor(raw), steps - 1);
  return profile[i] + (raw - i) * (profile[i + 1] - profile[i]);
}

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** Wraps an angle into the range [-180, 180). */
export function transformAngle(angle: number) {
  return normalizeAngle(angle + 180) - 180;
}

/** Signed difference from `start` to `end`, taking the short way around. */
export function getAngularDifference(start: number, end: number): number {
  let diff = normalizeAngle(end) - normalizeAngle(start);

  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;

  return diff;
}

/**
 * How many degrees a linear heading turns going from `startDeg` to
 * `endDeg`: the short way, or the long way round when `reverse` is set.
 */
export function linearHeadingSweep(
  startDeg: number,
  endDeg: number,
  reverse?: boolean,
): number {
  if (!reverse) return getAngularDifference(startDeg, endDeg);
  const clockwise = (((endDeg - startDeg) % 360) + 360) % 360;
  return clockwise <= 180 ? clockwise - 360 : clockwise;
}

export function shortestRotation(
  startAngle: number,
  endAngle: number,
  percentage: number,
) {
  const diff = getAngularDifference(startAngle, endAngle);
  return startAngle + diff * percentage;
}

export function radiansToDegrees(radians: number) {
  return radians * (180 / Math.PI);
}

export function lerp(ratio: number, start: number, end: number) {
  return start + (end - start) * ratio;
}

export function lerp2d(ratio: number, start: Point2D, end: Point2D) {
  return {
    x: lerp(ratio, start.x, end.x),
    y: lerp(ratio, start.y, end.y),
  };
}

/**
 * Returns the first control point that isn't sitting on top of `refPoint`.
 * Used to get a usable tangent when a control point overlaps an endpoint.
 */
function getFirstValidControlPoint(
  controlPoints: Point2D[],
  refPoint: Point2D,
  reverse: boolean = false,
): Point2D | null {
  const pts = reverse ? [...controlPoints].reverse() : controlPoints;
  return pts.find((cp) => getDistance(cp, refPoint) > 1e-6) ?? null;
}

export function getDistance(p1: Point2D, p2: Point2D) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/** Evaluates a Bezier curve of any degree at t. */
export function getCurvePoint(t: number, points: Point2D[]): Point2D {
  const len = points.length;

  if (len === 0)
    throw new Error("getCurvePoint: points array must not be empty");
  if (len === 1) return points[0];
  if (len === 2) return lerp2d(t, points[0], points[1]);

  // Closed forms for the common quadratic and cubic cases.
  const mt = 1 - t;
  if (len === 3) {
    const [p0, p1, p2] = points;
    const a = mt * mt;
    const b = 2 * mt * t;
    const c = t * t;
    return {
      x: a * p0.x + b * p1.x + c * p2.x,
      y: a * p0.y + b * p1.y + c * p2.y,
    };
  }
  if (len === 4) {
    const [p0, p1, p2, p3] = points;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    };
  }

  // De Casteljau's algorithm for higher degrees.
  const work = points.map((p) => ({ x: p.x, y: p.y }));
  for (let n = len - 1; n > 0; n--) {
    for (let i = 0; i < n; i++) {
      work[i].x = lerp(t, work[i].x, work[i + 1].x);
      work[i].y = lerp(t, work[i].y, work[i + 1].y);
    }
  }
  return work[0];
}

/** Splits a Bezier curve at t into two curves with the same degree. */
export function splitBezier(
  t: number,
  points: Point2D[],
): [Point2D[], Point2D[]] {
  const left: Point2D[] = [points[0]];
  const right: Point2D[] = [points.at(-1)!];

  let currentPoints = points;
  while (currentPoints.length > 1) {
    const nextPoints: Point2D[] = [];
    for (let j = 0; j < currentPoints.length - 1; j++) {
      nextPoints.push(lerp2d(t, currentPoints[j], currentPoints[j + 1]));
    }
    currentPoints = nextPoints;
    left.push(currentPoints[0]);
    right.push(currentPoints.at(-1)!);
  }

  right.reverse();
  return [left, right];
}

export function getTangentAngle(p1: Point2D, p2: Point2D): number {
  return radiansToDegrees(Math.atan2(p2.y - p1.y, p2.x - p1.x));
}

/**
 * Heading for the non-interpolating modes (constant, facingPoint, tangential).
 * `from` is where the robot is; `towards` is the next point along the path,
 * which is only used for tangential headings.
 */
function getPointHeading(
  source: HeadingSource,
  from: Point2D,
  towards: Point2D,
): number {
  const reverseOffset = source.reverse ? 180 : 0;
  switch (source.heading) {
    case "constant":
      return transformAngle((source.degrees ?? 0) + reverseOffset);
    case "facingPoint": {
      const target = { x: source.targetX || 0, y: source.targetY || 0 };
      return transformAngle(getTangentAngle(from, target) + reverseOffset);
    }
    case "tangential":
      return transformAngle(getTangentAngle(from, towards) + reverseOffset);
    default:
      return 0;
  }
}

function getHeadingAtLineStart(
  source: HeadingSource,
  line: Line,
  previousPoint: Point2D,
): number {
  let towards: Point2D = line.endPoint;
  if (source.heading === "tangential" && line.controlPoints?.length) {
    towards =
      getFirstValidControlPoint(line.controlPoints, previousPoint) ?? towards;
  }
  return getPointHeading(source, previousPoint, towards);
}

function getHeadingAtLineEnd(
  source: HeadingSource,
  line: Line,
  previousPoint: Point2D,
): number {
  if (source.heading === "facingPoint") {
    return getPointHeading(source, line.endPoint, line.endPoint);
  }
  let from: Point2D = previousPoint;
  if (source.heading === "tangential" && line.controlPoints?.length) {
    from =
      getFirstValidControlPoint(line.controlPoints, line.endPoint, true) ??
      from;
  }
  return getPointHeading(source, from, line.endPoint);
}

function getLinearSegmentHeading(seg: PiecewiseSegment, t: number): number {
  const startDeg = seg.startDeg ?? 0;
  const endDeg = seg.endDeg ?? 0;
  const localT =
    seg.tEnd > seg.tStart ? (t - seg.tStart) / (seg.tEnd - seg.tStart) : 0;

  return transformAngle(
    startDeg + linearHeadingSweep(startDeg, endDeg, seg.reverse) * localT,
  );
}

/**
 * A chained line can override its own heading with the chain's global
 * heading. Returns whichever source actually applies.
 */
export function getEffectiveHeadingSource(line: Line, globalOverride?: Line) {
  if (
    !globalOverride?.globalHeading ||
    globalOverride.globalHeading === "none"
  ) {
    return { isGlobal: false, source: line.endPoint as HeadingSource };
  }
  return {
    isGlobal: true,
    source: {
      heading: globalOverride.globalHeading,
      degrees: globalOverride.globalDegrees,
      startDeg: globalOverride.globalStartDeg,
      endDeg: globalOverride.globalEndDeg,
      targetX: globalOverride.globalTargetX,
      targetY: globalOverride.globalTargetY,
      reverse: globalOverride.globalReverse,
      segments: globalOverride.globalSegments,
    } as HeadingSource,
  };
}

function findSegmentAt(segments: PiecewiseSegment[], t: number) {
  return segments.find((seg) => t >= seg.tStart && t <= seg.tEnd);
}

/**
 * The heading the robot should have at the start of `line`.
 * For a line inside a chain, pass the chain's first line as `globalOverride`
 * and the distances so piecewise headings can be evaluated chain-wide.
 */
export function getLineStartHeading(
  line: Line | undefined,
  previousPoint: Point,
  globalOverride?: Line,
  totalChainDistance?: number,
  distanceBefore?: number,
): number {
  if (!line?.endPoint) return 0;

  const { isGlobal, source } = getEffectiveHeadingSource(line, globalOverride);

  if (source.heading === "linear") return source.startDeg as number;

  if (source.heading === "piecewise") {
    const segments = source.segments ?? [];
    const t =
      isGlobal && totalChainDistance && totalChainDistance > 0
        ? (distanceBefore || 0) / totalChainDistance
        : 0;

    const seg = findSegmentAt(segments, t) ?? segments[0];
    if (!seg) return 0;
    if (seg.heading === "linear") return getLinearSegmentHeading(seg, t);
    return getHeadingAtLineStart(seg, line, previousPoint);
  }

  return getHeadingAtLineStart(source, line, previousPoint);
}

/**
 * The heading a point's own settings give when there's no path to follow:
 * its (start) angle, or the way it faces. Tangential has no direction on its
 * own, so it's 0, or 180 reversed.
 */
export function restingHeading(point: Point): number {
  if (point.heading === "linear") return point.startDeg;
  if (point.heading === "piecewise") {
    const first = point.segments?.[0];
    if (!first) return 0;
    if (first.heading === "linear") return first.startDeg;
    return getPointHeading(first, point, point);
  }
  return getPointHeading(point, point, point);
}

export function getInitialTangentialHeading(
  startPoint: Point,
  nextPoint: Point2D,
): number {
  const angle = getTangentAngle(startPoint, nextPoint);
  return startPoint.reverse ? angle + 180 : angle;
}

/** The heading the robot should have at the end of `line`. */
export function getLineEndHeading(
  line: Line | undefined,
  previousPoint: Point,
  globalOverride?: Line,
  totalChainDistance?: number,
  distanceAtEnd?: number,
): number {
  if (!line?.endPoint) return 0;

  const { isGlobal, source } = getEffectiveHeadingSource(line, globalOverride);

  if (source.heading === "linear") return source.endDeg as number;

  if (source.heading === "piecewise") {
    const segments = source.segments ?? [];
    const t =
      isGlobal && totalChainDistance && totalChainDistance > 0
        ? (distanceAtEnd || 0) / totalChainDistance
        : 1;

    const seg = findSegmentAt(segments, t) ?? segments.at(-1);
    if (!seg) return 0;
    if (seg.heading === "linear") return getLinearSegmentHeading(seg, t);
    return getHeadingAtLineEnd(seg, line, previousPoint);
  }

  return getHeadingAtLineEnd(source, line, previousPoint);
}

/**
 * Finds the parametric value t [0, 1] on a Bezier curve (defined by points)
 * that is closest to the given target point.
 */
export function findClosestT(
  target: Point2D,
  points: Point2D[],
  iterations: number = 3,
): number {
  let bestT = 0;
  let minDistance = Infinity;

  const tryT = (t: number) => {
    const dist = getDistance(target, getCurvePoint(t, points));
    if (dist < minDistance) {
      minDistance = dist;
      bestT = t;
    }
  };

  // Coarse search over evenly spaced samples.
  const samples = 20;
  for (let i = 0; i <= samples; i++) {
    tryT(i / samples);
  }

  // Then repeatedly search a narrower window around the best sample.
  let range = 1 / samples;
  for (let iter = 0; iter < iterations; iter++) {
    const startT = Math.max(0, bestT - range);
    const endT = Math.min(1, bestT + range);
    if (endT <= startT) break;

    const step = (endT - startT) / 10;
    for (let i = 0; i <= 10; i++) {
      tryT(startT + i * step);
    }
    range = step;
  }

  return bestT;
}
