// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type { Line, Point, Shape } from "../../../types";

export interface BoxPoint {
  x: number;
  y: number;
}

export interface BoxBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  hasArea: boolean;
}

export interface BoxPixelDimensions {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export function isPointInBox(
  px: number,
  py: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): boolean {
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

/**
 * Calculates ordered min/max bounds and verifies whether selection box has meaningful area (>0.5 inch).
 */
export function calculateBoxBounds(
  start: BoxPoint,
  current: BoxPoint,
): BoxBounds {
  const minX = Math.min(start.x, current.x);
  const maxX = Math.max(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const maxY = Math.max(start.y, current.y);
  const hasArea = maxX - minX > 0.5 || maxY - minY > 0.5;

  return { minX, maxX, minY, maxY, hasArea };
}

/**
 * Calculates pixel dimensions and center for the visual rectangle in Two.js.
 */
export function calculateBoxPixelDimensions(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  xScale: (v: number) => number,
  yScale: (v: number) => number,
): BoxPixelDimensions {
  const px1 = xScale(bounds.minX);
  const py1 = yScale(bounds.minY);
  const px2 = xScale(bounds.maxX);
  const py2 = yScale(bounds.maxY);

  const width = Math.abs(px2 - px1);
  const height = Math.abs(py2 - py1);
  const centerX = Math.min(px1, px2) + width / 2;
  const centerY = Math.min(py1, py2) + height / 2;

  return { centerX, centerY, width, height };
}

/**
 * Extracts the first line ID associated with points selected by box selection.
 */
export function extractFirstSelectedLineId(
  selections: string[],
  lines: Line[],
): string | null {
  const firstPointId = selections.find((s) => s.startsWith("point-"));
  if (firstPointId && firstPointId !== "point-0-0") {
    const parts = firstPointId.split("-");
    const lIdx = Number(parts[1]) - 1;
    if (lines[lIdx]?.id) {
      return lines[lIdx].id as string;
    }
  }
  return null;
}

export function findPointsInBox(
  startPoint: Point,
  lines: Line[],
  shapes: Shape[],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): string[] {
  const selections: string[] = [];

  if (isPointInBox(startPoint.x, startPoint.y, minX, maxX, minY, maxY)) {
    selections.push("point-0-0");
  }

  lines.forEach((line, lIdx) => {
    if (
      isPointInBox(line.endPoint.x, line.endPoint.y, minX, maxX, minY, maxY)
    ) {
      selections.push(`point-${lIdx + 1}-0`);
    }

    line.controlPoints?.forEach((cp, cpIdx) => {
      if (isPointInBox(cp.x, cp.y, minX, maxX, minY, maxY)) {
        selections.push(`point-${lIdx + 1}-${cpIdx + 1}`);
      }
    });

    line.eventMarkers?.forEach((em: any, eIdx: number) => {
      if (
        em.type === "pose" &&
        em.poseX !== undefined &&
        em.poseY !== undefined
      ) {
        if (isPointInBox(em.poseX, em.poseY, minX, maxX, minY, maxY)) {
          selections.push(`event-${lIdx}-${eIdx}`);
        }
      }
    });
  });

  shapes.forEach((shape, sIdx) => {
    shape.vertices?.forEach((v, vIdx) => {
      if (isPointInBox(v.x, v.y, minX, maxX, minY, maxY)) {
        selections.push(`obstacle-${sIdx}-${vIdx}`);
      }
    });
  });

  return selections;
}

/**
 * Creates the Two.js visual selection box rectangle.
 */
export function createBoxSelectionShape(
  startInch: { x: number; y: number },
  xScale: (inch: number) => number,
  yScale: (inch: number) => number,
): InstanceType<typeof Two.Rectangle> {
  const rect = new Two.Rectangle(
    xScale(startInch.x),
    yScale(startInch.y),
    0,
    0,
  );
  rect.fill = "rgba(59, 130, 246, 0.2)";
  rect.stroke = "#3b82f6";
  rect.linewidth = 1;
  return rect;
}

/**
 * Updates selection stores and triggers notification when box selection completes.
 */
export function applyBoxSelections(params: {
  newSelections: string[];
  lines: Line[];
  multiSelectedPointIds: { update: (fn: (ids: string[]) => string[]) => void };
  selectedLineId: { set: (id: string | null) => void };
  notification: {
    set: (n: { message: string; type: "info"; timeout: number }) => void;
  };
}): void {
  const {
    newSelections,
    lines,
    multiSelectedPointIds,
    selectedLineId,
    notification,
  } = params;
  if (newSelections.length > 0) {
    multiSelectedPointIds.update((ids) => {
      const set = new Set([...ids, ...newSelections]);
      return Array.from(set);
    });

    const firstLineId = extractFirstSelectedLineId(newSelections, lines);
    if (firstLineId) selectedLineId.set(firstLineId);

    notification.set({
      message: `Selected ${newSelections.length} items`,
      type: "info",
      timeout: 1500,
    });
  }
}
