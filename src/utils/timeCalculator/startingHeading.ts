// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Where the robot starts: the sequence it runs and the heading it begins with.
import type { Point, Line, SequenceItem } from "../../types";
import { getLineStartHeading, restingHeading } from "../math";
import { calculateGlobalChainMeta } from "./chainMeta";
import { MAX_MACRO_DEPTH } from "../../config";

/** The steps that get run: the sequence, or every line in order without one. */
export function stepsToRun(
  lines: Line[],
  sequence?: SequenceItem[],
): SequenceItem[] {
  return sequence?.length
    ? sequence
    : lines.map((l): SequenceItem => ({ kind: "path", lineId: l.id! }));
}

/**
 * The first path the robot drives, looking inside macros, and the list of
 * steps it's in (which decides its chain).
 */
export function firstDrivenPath(
  steps: SequenceItem[],
  lineById: Map<string, Line>,
  depth = 0,
): { line: Line; steps: SequenceItem[] } | null {
  if (depth > MAX_MACRO_DEPTH) return null;
  for (const item of steps) {
    if (item.kind === "path") {
      const line = lineById.get(item.lineId);
      if (line?.endPoint) return { line, steps };
    } else if (item.kind === "macro" && item.sequence?.length) {
      const found = firstDrivenPath(item.sequence, lineById, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * The heading the robot has before it does anything. Once there are paths,
 * it starts facing the way the first one it drives begins; anything before
 * that path (waits, turns) happens from there. With no path, the start
 * point's own heading applies.
 */
export function startingHeading(
  startPoint: Point,
  lines: Line[],
  sequence?: SequenceItem[],
): number {
  const lineById = new Map(lines.map((l) => [l.id!, l]));
  const first = firstDrivenPath(stepsToRun(lines, sequence), lineById);
  if (!first) return restingHeading(startPoint);

  const chain = calculateGlobalChainMeta(first.steps, lines, startPoint).get(
    first.line.id!,
  );
  const heading = getLineStartHeading(
    first.line,
    startPoint,
    chain?.rootLine,
    chain?.chainTotalLength,
    chain?.distanceBefore,
  );
  // A Prev start on the first path falls back to the start point's heading.
  return Number.isFinite(heading) ? heading : restingHeading(startPoint);
}
