// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point, SequenceItem } from "../../types";
import { startingHeading } from "../../utils/timeCalculator/pathCalculator";
import { identifierFor } from "./javaFormat";

/** A named point the generated code uses. Control points have no heading. */
export interface PoseTableEntry {
  name: string;
  x: number;
  y: number;
  degrees?: number;
}

/** The pose a line ends at: named after the line, e.g. `Score`, or `point3` without a name. */
export function poseNameOf(lines: Line[], idx: number): string {
  return idx < 0
    ? "startPoint"
    : identifierFor(lines[idx].name, `point${idx + 1}`);
}

/**
 * Every pose and Bézier control point of a project, in the order the code
 * generator declares them. This is the one place that decides their names and
 * headings, so that code with the numbers written in, project files, and the
 * library that reads those files all agree.
 *
 * - The start pose uses the heading playback starts with.
 * - A line's pose has the heading it ends with when that is a fixed angle, and
 *   0 when it follows the path.
 * - Lines with the same name share the first one's pose.
 * - Control points are named `<line>_line<index>_control<n>`.
 */
export function buildPoseTable(
  startPoint: Point,
  lines: Line[],
  sequence?: SequenceItem[],
): PoseTableEntry[] {
  const entries: PoseTableEntry[] = [
    {
      name: "startPoint",
      x: startPoint.x,
      y: startPoint.y,
      degrees: startingHeading(startPoint, lines, sequence),
    },
  ];

  const seen = new Set(["startPoint"]);
  lines.forEach((line, lineIdx) => {
    const end = line.endPoint;
    if (!end) return;
    const name = poseNameOf(lines, lineIdx);
    let degrees = 0;
    if (end.heading === "constant") degrees = end.degrees ?? 0;
    else if (end.heading === "linear") degrees = end.endDeg ?? 0;

    if (!seen.has(name)) {
      seen.add(name);
      entries.push({ name, x: end.x, y: end.y, degrees });
    }

    (line.controlPoints ?? []).forEach((cp, i) => {
      entries.push({
        name: `${name}_line${lineIdx}_control${i + 1}`,
        x: cp.x,
        y: cp.y,
      });
    });
  });
  return entries;
}
