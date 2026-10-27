// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Prev: a blank linear start or constant angle takes the heading the robot has
// when it gets there. Consumers read lines after materializePrevHeadings.
import type { Line, PiecewiseSegment, Point, SequenceItem } from "../types";
import { MAX_MACRO_DEPTH } from "../config";
import {
  getCurvePoint,
  getLineEndHeading,
  getLineStartHeading,
  getTangentAngle,
  transformAngle,
  type HeadingSource,
} from "./math";
import { calculateGlobalChainMeta } from "./timeCalculator/chainMeta";
import {
  analyzePathSegment,
  unwrapAngle,
} from "./timeCalculator/segmentAnalyzer";
import {
  firstDrivenPath,
  startingHeading,
  stepsToRun,
} from "./timeCalculator/startingHeading";

export function isPrev(value: number | null | undefined): value is undefined {
  return value === undefined || value === null;
}

function segmentHasPrev(seg: PiecewiseSegment): boolean {
  return (
    (seg.heading === "linear" && isPrev(seg.startDeg)) ||
    (seg.heading === "constant" && isPrev(seg.degrees))
  );
}

export function hasPrev(source: HeadingSource | undefined): boolean {
  if (!source) return false;
  switch (source.heading) {
    case "linear":
      return isPrev(source.startDeg);
    case "constant":
      return isPrev(source.degrees);
    case "piecewise":
      return (source.segments ?? []).some(segmentHasPrev);
    default:
      return false;
  }
}

function globalSource(line: Line): HeadingSource | undefined {
  if (!line.globalHeading || line.globalHeading === "none") return undefined;
  return {
    heading: line.globalHeading,
    degrees: line.globalDegrees,
    startDeg: line.globalStartDeg,
    endDeg: line.globalEndDeg,
    segments: line.globalSegments,
  };
}

export function lineHasPrev(line: Line): boolean {
  return hasPrev(line.endPoint) || hasPrev(globalSource(line));
}

// Approximate for tangential and facing-point segments: read at tEnd on the curve.
function segmentEndHeading(
  seg: PiecewiseSegment,
  carry: number,
  line: Line,
  previousPoint: Point,
): number {
  const offset = seg.reverse ? 180 : 0;
  const curve = [previousPoint, ...(line.controlPoints ?? []), line.endPoint];
  const at = (t: number) => getCurvePoint(Math.min(1, Math.max(0, t)), curve);
  switch (seg.heading) {
    case "linear":
      return seg.endDeg;
    case "constant":
      return transformAngle((seg.degrees ?? carry) + offset);
    case "facingPoint":
      return transformAngle(
        getTangentAngle(at(seg.tEnd), {
          x: seg.targetX ?? 0,
          y: seg.targetY ?? 0,
        }) + offset,
      );
    case "tangential": {
      const from = at(seg.tEnd - 0.001);
      const to = at(seg.tEnd + 0.001);
      if (from.x === to.x && from.y === to.y) return carry;
      return transformAngle(getTangentAngle(from, to) + offset);
    }
  }
}

// The first blank angle takes `inherited`; later piecewise segments take the
// previous segment's end heading.
function resolveSource<T extends HeadingSource>(
  source: T,
  inherited: number,
  line: Line,
  previousPoint: Point,
): T {
  if (!hasPrev(source)) return source;
  if (source.heading === "linear") return { ...source, startDeg: inherited };
  if (source.heading === "constant") return { ...source, degrees: inherited };

  let carry = inherited;
  const segments = (source.segments ?? []).map((seg): PiecewiseSegment => {
    let filled = seg;
    if (seg.heading === "linear" && isPrev(seg.startDeg)) {
      filled = { ...seg, startDeg: carry };
    } else if (seg.heading === "constant" && isPrev(seg.degrees)) {
      filled = { ...seg, degrees: carry };
    }
    carry = segmentEndHeading(filled, carry, line, previousPoint);
    return filled;
  });
  return { ...source, segments };
}

export function resolveLinePrev(
  line: Line,
  inherited: number,
  previousPoint: Point,
): Line {
  let resolved = line;

  const global = globalSource(line);
  if (hasPrev(global)) {
    const filled = resolveSource(global!, inherited, line, previousPoint);
    resolved = {
      ...resolved,
      globalDegrees: filled.degrees,
      globalStartDeg: filled.startDeg,
      globalSegments: filled.segments,
    };
  }

  if (hasPrev(line.endPoint)) {
    resolved = {
      ...resolved,
      endPoint: resolveSource(line.endPoint, inherited, line, previousPoint),
    };
  }
  return resolved;
}

/** Lines with Prev filled in; unchanged lines (and the array) keep their identity. */
export function materializePrevHeadings(
  startPoint: Point,
  lines: Line[],
  sequence?: SequenceItem[],
): Line[] {
  if (!lines.some(lineHasPrev)) return lines;

  const lineById = new Map(lines.map((l) => [l.id!, l]));
  const resolved = new Map<string, Line>();
  let heading = startingHeading(startPoint, lines, sequence);
  let point: Point = startPoint;

  const walk = (steps: SequenceItem[], depth: number) => {
    if (depth > MAX_MACRO_DEPTH) return;
    const chains = calculateGlobalChainMeta(steps, lines, point);

    for (const item of steps) {
      if (item.kind === "rotate") {
        heading = item.degrees;
      } else if (item.kind === "macro") {
        if (item.sequence?.length) walk(item.sequence, depth + 1);
      } else if (item.kind === "path") {
        const line = lineById.get(item.lineId);
        if (!line?.endPoint) continue;

        const next = resolveLinePrev(line, heading, point);
        resolved.set(line.id!, next);

        const chain = chains.get(line.id!);
        const { length } = analyzePathSegment(
          point,
          next.controlPoints,
          next.endPoint,
          50,
          0,
        );
        const end = getLineEndHeading(
          next,
          point,
          chain ? (resolved.get(chain.rootLine.id!) ?? next) : undefined,
          chain?.chainTotalLength,
          (chain?.distanceBefore ?? 0) + length,
        );
        heading = unwrapAngle(end, heading);
        point = line.endPoint;
      }
    }
  };
  walk(stepsToRun(lines, sequence), 0);

  return lines.map((l) => resolved.get(l.id!) ?? l);
}

export function firstPathStartsPrev(
  startPoint: Point,
  lines: Line[],
  sequence?: SequenceItem[],
): boolean {
  const lineById = new Map(lines.map((l) => [l.id!, l]));
  const first = firstDrivenPath(stepsToRun(lines, sequence), lineById);
  if (!first) return false;
  const chain = calculateGlobalChainMeta(first.steps, lines, startPoint).get(
    first.line.id!,
  );
  return Number.isNaN(
    getLineStartHeading(
      first.line,
      startPoint,
      chain?.rootLine,
      chain?.chainTotalLength,
      chain?.distanceBefore,
    ),
  );
}
