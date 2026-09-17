// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point, SequenceItem } from "../../../types";
import { generateLinesFromDrawing } from "../../../utils/pathEditing";

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingGridConfig {
  snapToGrid: boolean;
  showGrid: boolean;
  gridSize: number;
}

/**
 * Snaps a coordinate point to grid if snapping is active.
 */
export function snapDrawingCoordinate(
  coord: number,
  gridConfig: DrawingGridConfig,
): number {
  if (gridConfig.snapToGrid && gridConfig.showGrid && gridConfig.gridSize > 0) {
    return Math.round(coord / gridConfig.gridSize) * gridConfig.gridSize;
  }
  return coord;
}

/**
 * Initializes drawing points array with the initial mouse point (pushed twice as start anchor).
 */
export function initDrawingPoints(
  rawX: number,
  rawY: number,
  gridConfig: DrawingGridConfig,
): DrawingPoint[] {
  const inchX = snapDrawingCoordinate(rawX, gridConfig);
  const inchY = snapDrawingCoordinate(rawY, gridConfig);
  return [
    { x: inchX, y: inchY },
    { x: inchX, y: inchY },
  ];
}

/**
 * Appends a new point to the drawing if the distance from the last point is at least minDistance (default 2 inches).
 * Mutates points array and returns whether a point was added.
 */
export function continueDrawing(
  points: DrawingPoint[],
  rawX: number,
  rawY: number,
  gridConfig: DrawingGridConfig,
  minDistance = 2,
): boolean {
  if (points.length === 0) return false;

  const inchX = snapDrawingCoordinate(rawX, gridConfig);
  const inchY = snapDrawingCoordinate(rawY, gridConfig);
  const lastPoint = points.at(-1);

  const dx = inchX - lastPoint.x;
  const dy = inchY - lastPoint.y;
  const dist = Math.hypot(dx, dy);

  if (dist >= minDistance) {
    points.push({ x: inchX, y: inchY });
    return true;
  }
  return false;
}

/**
 * Finalizes drawing stroke and converts drawn points into lines/startPoint/sequence.
 */
export function completeDrawingStroke(
  points: DrawingPoint[],
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  settings: unknown,
): { startPoint: Point; lines: Line[]; sequence: SequenceItem[] } | null {
  if (points.length <= 1) {
    return null;
  }
  return generateLinesFromDrawing(
    points,
    startPoint,
    lines,
    sequence,
    settings,
  );
}

/**
 * Generates an SVG path `d` string for rendering the currently drawn stroke.
 */
export function formatDrawingSvgPath(
  points: DrawingPoint[],
  xScale: (v: number) => number,
  yScale: (v: number) => number,
): string {
  if (points.length === 0) return "";
  const start = `M ${xScale(points[0].x)} ${yScale(points[0].y)}`;
  if (points.length === 1) return start;
  const rest = points
    .slice(1)
    .map((p) => `L ${xScale(p.x)} ${yScale(p.y)}`)
    .join(" ");
  return `${start} ${rest}`;
}
