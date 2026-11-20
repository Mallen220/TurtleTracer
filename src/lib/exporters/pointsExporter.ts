// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Point, Line, SequenceItem, TurtleData } from "../../types";
import { exporterRegistry } from "./index";
import { getLineEndHeading, transformAngle } from "../../utils/math";
import { materializePrevHeadings } from "../../utils/prevHeading";
import { startingHeading } from "../../utils/timeCalculator/startingHeading";

// Whole numbers keep one decimal (10.0), everything else gets three.
const fmt = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : v.toFixed(3));

/**
 * `[(x, y, heading), ...]`, one pose per line: the start pose, then each line's end pose. A pose
 * with control points ends with them as a nested list of `(x, y)`:
 * `(x, y, heading, [(cx, cy), ...])`. Headings are degrees; ones the path
 * works out (tangential, facing a point, ...) are wrapped to [-180, 180),
 * typed ones are left as typed.
 */
export function generatePointsArray(
  startPoint: Point,
  lines: Line[],
  codeUnits: "imperial" | "metric" = "imperial",
  sequence?: SequenceItem[],
): string {
  const scale = codeUnits === "metric" ? 2.54 : 1;
  const xy = (p: { x: number; y: number }) =>
    `${fmt(p.x * scale)}, ${fmt(p.y * scale)}`;

  const poses = [
    `(${xy(startPoint)}, ${fmt(startingHeading(startPoint, lines, sequence))})`,
  ];
  const driven = materializePrevHeadings(startPoint, lines, sequence);
  let prev: Point = startPoint;
  driven.forEach((line) => {
    const end = line.endPoint;
    const heading =
      end.heading === "constant"
        ? (end.degrees ?? 0)
        : end.heading === "linear"
          ? end.endDeg
          : transformAngle(getLineEndHeading(line, prev));
    const cps = (line.controlPoints ?? [])
      .map((cp) => `(${xy(cp)})`)
      .join(", ");
    poses.push(
      `(${xy(line.endPoint)}, ${fmt(heading)}${cps ? `, [${cps}]` : ""})`,
    );
    prev = line.endPoint;
  });

  return `[\n${poses.map((p) => `  ${p},`).join("\n")}\n]`;
}

exporterRegistry.register({
  id: "points",
  name: "Export Points",
  description: "Export the path points array for basic usage.",
  exportCode: (data: TurtleData, settings: any) => {
    return generatePointsArray(
      data.startPoint,
      data.lines,
      settings.codeUnits ?? "imperial",
      data.sequence,
    );
  },
});
