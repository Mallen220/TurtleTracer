// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point } from "../../../types/index";
import { getRandomColor } from "../../../utils";
import { getTransformedCoordinates } from "./CoordinateTransform";

export interface CreatePathAtPointOptions {
  inchX: number;
  inchY: number;
  existingLines: Line[];
}

/**
 * Creates a new Line object at the specified coordinates, automatically matching
 * or adapting the heading format to follow the preceding path segment.
 */
export function createPathAtPoint(options: CreatePathAtPointOptions): Line {
  const { inchX, inchY, existingLines } = options;
  const prevEndPoint =
    existingLines.length > 0 ? existingLines.at(-1)?.endPoint : null;

  let endPoint: Point;
  if (!prevEndPoint) {
    endPoint = {
      x: inchX,
      y: inchY,
      heading: "tangential",
      reverse: false,
    };
  } else if (prevEndPoint.heading === "linear") {
    const linPrev = prevEndPoint as Extract<Point, { heading: "linear" }>;
    const deg = linPrev.endDeg ?? linPrev.startDeg ?? 0;
    endPoint = {
      x: inchX,
      y: inchY,
      heading: "linear",
      startDeg: deg,
      endDeg: deg,
    };
  } else if (prevEndPoint.heading === "constant") {
    endPoint = {
      x: inchX,
      y: inchY,
      heading: "constant",
      degrees: prevEndPoint.degrees ?? 0,
    };
  } else {
    endPoint = {
      x: inchX,
      y: inchY,
      heading: "tangential",
      reverse: (prevEndPoint as any).reverse ?? false,
    };
  }

  return {
    id: `line-${Math.random().toString(36).slice(2)}`,
    name: "",
    endPoint,
    controlPoints: [],
    color: getRandomColor(),
    locked: false,
  };
}

export interface CreatePathFromEventOptions {
  targetId: string | undefined;
  clientX: number;
  clientY: number;
  domRect: DOMRect;
  fieldRotation: number;
  xInvert: (v: number) => number;
  yInvert: (v: number) => number;
  snapToGrid: boolean;
  showGrid: boolean;
  gridSize: number;
  restrictDraggingToField: boolean;
  fieldW: number;
  fieldH: number;
  existingLines: Line[];
}

/**
 * Validates double click target and creates a new Line if clicked on empty field area.
 */
export function tryCreatePathFromDoubleClick(
  options: CreatePathFromEventOptions,
): Line | null {
  const { targetId } = options;
  if (
    targetId &&
    (targetId.startsWith("point") ||
      targetId.startsWith("obstacle") ||
      targetId.startsWith("line"))
  ) {
    return null;
  }

  const transformed = getTransformedCoordinates(
    options.clientX,
    options.clientY,
    options.domRect,
    options.fieldRotation || 0,
  );
  let inchX = options.xInvert(transformed.x);
  let inchY = options.yInvert(transformed.y);

  if (options.snapToGrid && options.showGrid && options.gridSize > 0) {
    inchX = Math.round(inchX / options.gridSize) * options.gridSize;
    inchY = Math.round(inchY / options.gridSize) * options.gridSize;
  }
  if (options.restrictDraggingToField) {
    inchX = Math.max(0, Math.min(options.fieldW, inchX));
    inchY = Math.max(0, Math.min(options.fieldH, inchY));
  }

  return createPathAtPoint({
    inchX,
    inchY,
    existingLines: options.existingLines,
  });
}
