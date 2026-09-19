// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point, SequenceItem } from "../../../types/index";
import { getLineStartHeading } from "../../../utils";

/**
 * Checks if startPoint needs its linear startDeg synchronized with the first
 * path the robot drives. Returns the derived startDeg if an update is needed,
 * or null if no update is needed.
 */
export function getUpdatedLinearStartHeading(
  startPoint: Point | null | undefined,
  lines: Line[],
  sequence?: SequenceItem[],
): number | null {
  const first = sequence?.find((s) => s.kind === "path");
  const firstLine = first ? lines.find((l) => l.id === first.lineId) : lines[0];
  if (startPoint?.heading === "linear" && firstLine) {
    const derived = getLineStartHeading(firstLine, startPoint, firstLine);

    if (
      typeof startPoint.startDeg !== "number" ||
      Math.abs(startPoint.startDeg - derived) > 1e-6
    ) {
      return derived;
    }
  }
  return null;
}
