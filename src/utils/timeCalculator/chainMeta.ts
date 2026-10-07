// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Chains: consecutive paths the robot drives without stopping. A chain's
// first ("root") line can set one heading for the whole chain.
import { unwrapAngle, analyzePathSegment } from "./segmentAnalyzer";
import {
  getAngularDifference,
  getEffectiveHeadingSource,
  getLineEndHeading,
  linearHeadingSweep,
  radiansToDegrees,
} from "../math";
import type { SequenceItem, Line, Point, BasePoint } from "../../types";
import type { PathAnalysis } from "./types";

/** Whether the chain's own heading, set on its first line, applies to its lines. */
export function hasGlobalHeading(rootLine: Line | undefined): boolean {
  return !!(rootLine?.globalHeading && rootLine.globalHeading !== "none");
}

/** Where a line sits within its chain. */
export interface ChainInfo {
  rootLine: Line;
  chainTotalLength: number;
  /** Length of the chain before this line. */
  distanceBefore: number;
}

/** Whether the path at `idx` carries on from the path before it. */
export function continuesChain(
  seq: SequenceItem[],
  idx: number,
  lineById: Map<string, Line>,
): boolean {
  const item = seq[idx];
  if (item?.kind !== "path" || seq[idx - 1]?.kind !== "path") return false;
  return item.isChain === true || lineById.get(item.lineId)?.isChain === true;
}

/** Chain information for every line driven in `seq`, keyed by line id. */
export function calculateGlobalChainMeta(
  seq: SequenceItem[],
  lines: Line[],
  startPoint: Point,
): Map<string, ChainInfo> {
  const lineById = new Map(lines.map((l) => [l.id!, l]));
  const meta = new Map<string, ChainInfo>();

  let chain: ChainInfo[] = [];
  let chainLength = 0;
  let rootLine: Line | null = null;
  let lastPoint: BasePoint = startPoint;

  seq.forEach((item, idx) => {
    if (item.kind !== "path") return;
    const line = lineById.get(item.lineId);
    if (!line?.endPoint) return;

    if (!continuesChain(seq, idx, lineById)) {
      rootLine = line;
      chain = [];
      chainLength = 0;
    }
    const info: ChainInfo = {
      rootLine: rootLine!,
      chainTotalLength: 0,
      distanceBefore: chainLength,
    };
    meta.set(line.id!, info);
    chain.push(info);

    const { length } = analyzePathSegment(
      lastPoint,
      line.controlPoints,
      line.endPoint,
      50,
      0,
    );
    chainLength += length;
    for (const member of chain) member.chainTotalLength = chainLength;
    lastPoint = line.endPoint;
  });

  return meta;
}

/** Speed through a corner: full speed straight on, none at 90 degrees or more. */
export function cornerSpeedForTurn(
  maxVelocity: number,
  turnDegrees: number,
): number {
  return maxVelocity * Math.max(0, Math.cos((turnDegrees * Math.PI) / 180));
}

/**
 * The direction the robot is travelling (degrees) as `line` starts and as it
 * ends, from the line's control points. Null for a line with no length.
 */
export function travelDirections(
  start: BasePoint,
  line: Line,
): { start: number; end: number } | null {
  const end = line.endPoint;
  const apart = (a: BasePoint, b: BasePoint) =>
    Math.hypot(a.x - b.x, a.y - b.y) > 1e-6;
  const path: BasePoint[] = [start, ...(line.controlPoints ?? []), end];
  // Control points sitting on an end don't say which way the path leaves it.
  const first = path.slice(1).find((p) => apart(p, start));
  const last = path
    .slice(0, -1)
    .reverse()
    .find((p) => apart(p, end));
  if (!first || !last) return null;
  return {
    start: radiansToDegrees(Math.atan2(first.y - start.y, first.x - start.x)),
    end: radiansToDegrees(Math.atan2(end.y - last.y, end.x - last.x)),
  };
}

/** How many degrees the direction of travel turns between two paths. */
export function travelTurn(
  before: { end: number } | null,
  after: { start: number } | null,
): number {
  if (!before || !after) return 0;
  return Math.abs(getAngularDifference(before.end, after.start));
}

/** A joint between two chained paths. */
export interface ChainJunction {
  /** Index in `lines` of the path the robot turns onto. */
  lineIndex: number;
  x: number;
  y: number;
  /** Change in the direction of travel, in degrees. */
  turnDegrees: number;
}

/** Changes of direction of at least this many degrees are flagged as sharp. */
export const SHARP_TURN_DEGREES = 60;

/**
 * Every joint between chained paths, with how far the direction of travel
 * changes there.
 */
export function chainJunctions(
  startPoint: Point,
  lines: Line[],
  seq: SequenceItem[],
): ChainJunction[] {
  const lineById = new Map(lines.map((l) => [l.id!, l]));
  const indexById = new Map(lines.map((l, i) => [l.id!, i]));
  const found: ChainJunction[] = [];

  let start: BasePoint = startPoint;
  let previous: ReturnType<typeof travelDirections> = null;
  seq.forEach((item, idx) => {
    if (item.kind !== "path") return;
    const line = lineById.get(item.lineId);
    if (!line?.endPoint) return;

    const directions = travelDirections(start, line);
    if (continuesChain(seq, idx, lineById)) {
      found.push({
        lineIndex: indexById.get(item.lineId)!,
        x: start.x,
        y: start.y,
        turnDegrees: travelTurn(previous, directions),
      });
    }
    // A line with no length keeps the direction the robot was already going.
    if (directions) previous = directions;
    start = line.endPoint;
  });
  return found;
}

/**
 * Chained joints where the direction of travel changes by `SHARP_TURN_DEGREES`
 * or more. A robot can't change direction instantly, so it swings wide there
 * (see `chainRecovery`), which a chain is meant to avoid.
 */
export function findSharpJunctions(
  startPoint: Point,
  lines: Line[],
  seq: SequenceItem[],
): ChainJunction[] {
  return chainJunctions(startPoint, lines, seq).filter(
    (joint) => joint.turnDegrees >= SHARP_TURN_DEGREES,
  );
}

/**
 * The heading the robot ends `line` at (kept near `currentHeading`), and how
 * far it has to turn along the way.
 */
export function calculateEndHeadingAndRotation(
  line: Line,
  prevPoint: BasePoint,
  rootLine: Line | undefined,
  chainMeta: ChainInfo | undefined,
  currentHeading: number,
  length: number,
  isChained: boolean,
  analysis: PathAnalysis,
): { endHeading: number; rotationRequired: number } {
  const endHeadingRaw = getLineEndHeading(
    line,
    prevPoint as Point,
    rootLine,
    chainMeta?.chainTotalLength,
    (chainMeta?.distanceBefore || 0) + length,
  );
  const { isGlobal, source } = getEffectiveHeadingSource(line, rootLine);
  const flip = (deg: number, reverse?: boolean) => (reverse ? deg + 180 : deg);
  const facing = (targetX = 0, targetY = 0) =>
    radiansToDegrees(
      Math.atan2(targetY - line.endPoint.y, targetX - line.endPoint.x),
    );
  const near = (deg: number) => unwrapAngle(deg, currentHeading);

  let endHeading = endHeadingRaw;
  let rotationRequired = 0;

  switch (source.heading) {
    case "tangential":
      if (isChained) {
        endHeading = near(endHeadingRaw);
        rotationRequired = Math.abs(endHeading - currentHeading);
      } else {
        endHeading = currentHeading + analysis.netRotation;
        rotationRequired = analysis.tangentRotation;
      }
      break;

    case "constant":
      endHeading = near(flip(source.degrees || 0, source.reverse));
      rotationRequired = Math.abs(endHeading - currentHeading);
      break;

    case "linear": {
      const startDeg = source.startDeg || 0;
      const endDeg = source.endDeg || 0;
      const sweep = linearHeadingSweep(startDeg, endDeg, source.reverse);
      // A reversed heading deliberately goes the long way round, so its end
      // can't simply be unwrapped next to the current heading.
      endHeading = source.reverse ? near(startDeg) + sweep : near(endDeg);
      rotationRequired = Math.abs(sweep);
      break;
    }

    case "facingPoint":
      endHeading = near(
        flip(facing(source.targetX, source.targetY), source.reverse),
      );
      rotationRequired = Math.abs(endHeading - currentHeading);
      break;

    case "piecewise": {
      // The heading of whichever segment covers the end of this line.
      const segments = source.segments ?? [];
      const chainLength = chainMeta ? chainMeta.chainTotalLength : length;
      const t =
        isGlobal && chainLength > 0
          ? ((chainMeta ? chainMeta.distanceBefore : 0) + length) / chainLength
          : 1;
      const seg =
        segments.find((s) => t >= s.tStart && t <= s.tEnd) ?? segments.at(-1);

      endHeading = currentHeading;
      if (seg?.heading === "constant") {
        endHeading = near(flip(seg.degrees ?? 0, seg.reverse));
      } else if (seg?.heading === "tangential") {
        endHeading = near(endHeadingRaw);
      } else if (seg?.heading === "linear") {
        endHeading = seg.reverse
          ? near(seg.startDeg ?? 0) +
            linearHeadingSweep(seg.startDeg ?? 0, seg.endDeg ?? 0, true)
          : near(seg.endDeg ?? 0);
      } else if (seg?.heading === "facingPoint") {
        endHeading = near(flip(facing(seg.targetX, seg.targetY), seg.reverse));
      }
      break;
    }
  }

  if (!Number.isFinite(endHeading)) endHeading = currentHeading;
  return { endHeading, rotationRequired };
}
