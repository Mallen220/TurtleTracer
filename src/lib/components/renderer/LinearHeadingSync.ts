// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point } from "../../../types/index";
import { getLineStartHeading } from "../../../utils";

/**
 * Checks if startPoint needs its linear startDeg synchronized with the first path segment.
 * Returns the derived startDeg if an update is needed, or null if no update is needed.
 */
export function getUpdatedLinearStartHeading(
  startPoint: Point | null | undefined,
  lines: Line[],
): number | null {
  if (startPoint?.heading === "linear" && lines?.length > 0) {
    const derived = getLineStartHeading(lines[0], startPoint, lines[0]);

    if (
      typeof startPoint.startDeg !== "number" ||
      Math.abs(startPoint.startDeg - derived) > 1e-6
    ) {
      return derived;
    }
  }
  return null;
}
