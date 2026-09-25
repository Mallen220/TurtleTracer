// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point, BasePoint, MenuEntry } from "../types";

type Axis = "x" | "y";

/**
 * Looks up the points behind selection ids like "point-<line>-<index>",
 * skipping anything locked. Index 0 is a line's end point; higher indexes are
 * its control points. "point-0-0" is the start point.
 */
function getEditablePoints(
  ids: string[],
  startPoint: Point,
  lines: Line[],
): BasePoint[] {
  const points: BasePoint[] = [];
  for (const id of ids) {
    const [, lineNum, ptIdx] = id.split("-").map(Number);
    if (lineNum === 0 && ptIdx === 0) {
      if (!startPoint.locked) points.push(startPoint);
      continue;
    }
    const line = lines[lineNum - 1];
    if (!line || line.locked) continue;
    const point = ptIdx === 0 ? line.endPoint : line.controlPoints[ptIdx - 1];
    if (point) points.push(point);
  }
  return points;
}

/** Moves every point to their average position along `axis`. */
function align(points: BasePoint[], axis: Axis) {
  const average = points.reduce((sum, p) => sum + p[axis], 0) / points.length;
  for (const p of points) p[axis] = average;
}

/** Spaces points evenly along `axis`, keeping the two outermost in place. */
function distribute(points: BasePoint[], axis: Axis) {
  const sorted = [...points].sort((a, b) => a[axis] - b[axis]);
  const min = sorted[0][axis];
  const step = (sorted.at(-1)![axis] - min) / (sorted.length - 1);
  for (let i = 1; i < sorted.length - 1; i++) {
    sorted[i][axis] = min + step * i;
  }
}

/**
 * Context menu entries for lining up several selected points. The points are
 * edited in place and then handed back through `onUpdate`.
 */
export function getAlignmentMenuItems(
  multiSel: string[],
  startPoint: Point,
  lines: Line[],
  onUpdate: (newLines: Line[], newStartPoint: Point) => void,
  onRecordChange: (action?: string) => void,
): MenuEntry[] {
  const makeItem = (
    label: string,
    historyLabel: string,
    minPoints: number,
    apply: (points: BasePoint[]) => void,
  ): MenuEntry => ({
    label,
    onClick: () => {
      const points = getEditablePoints(multiSel, startPoint, lines);
      if (points.length < minPoints) return;
      apply(points);
      onUpdate(lines, startPoint);
      onRecordChange(historyLabel);
    },
  });

  const items: MenuEntry[] = [
    { label: `Selected Points: ${multiSel.length}`, disabled: true },
    { separator: true },
    makeItem("Align Horizontal (Y)", "Align Horizontal", 1, (pts) =>
      align(pts, "y"),
    ),
    makeItem("Align Vertical (X)", "Align Vertical", 1, (pts) =>
      align(pts, "x"),
    ),
  ];

  if (multiSel.length > 2) {
    items.push(
      makeItem(
        "Distribute Horizontally (X)",
        "Distribute Horizontally",
        3,
        (pts) => distribute(pts, "x"),
      ),
      makeItem("Distribute Vertically (Y)", "Distribute Vertically", 3, (pts) =>
        distribute(pts, "y"),
      ),
    );
  }

  return items;
}
