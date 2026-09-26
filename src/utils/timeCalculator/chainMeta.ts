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

/**
 * How fast the robot can go through a joint between two paths: full speed
 * when the headings match, slowing to a stop for a 90 degree (or sharper)
 * change.
 */
export function cornerSpeed(
  maxVelocity: number,
  headingBefore: number,
  headingAfter: number,
): number {
  const turn = Math.abs(getAngularDifference(headingBefore, headingAfter));
  return maxVelocity * Math.max(0, Math.cos((turn * Math.PI) / 180));
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
