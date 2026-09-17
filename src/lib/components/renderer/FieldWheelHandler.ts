// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { computeZoomStep } from "../../zoomHelpers";
import { getTransformedCoordinates } from "./CoordinateTransform";

export interface CalculateWheelZoomOptions {
  clientX: number;
  clientY: number;
  deltaY: number;
  wrapperRect: DOMRect;
  fieldRotation: number;
  currentZoom: number;
}

export interface WheelZoomResult {
  newZoom: number;
  focus: { x: number; y: number };
}

/**
 * Computes stepped zoom level bounded to [minZoom, maxZoom].
 */
export function calculateNextZoom(
  currentZoom: number,
  direction: 1 | -1,
  minZoom = 0.1,
  maxZoom = 5,
): number {
  const step = computeZoomStep(currentZoom, direction);
  const target = currentZoom + direction * step;
  return Math.min(maxZoom, Math.max(minZoom, Number(target.toFixed(2))));
}

/**
 * Calculates zoom level and focus anchor from a mouse wheel event.
 */
export function calculateWheelZoom(
  options: CalculateWheelZoomOptions,
): WheelZoomResult {
  const transformed = getTransformedCoordinates(
    options.clientX,
    options.clientY,
    options.wrapperRect,
    options.fieldRotation || 0,
  );
  const deltaSign = options.deltaY < 0 ? 1 : -1;
  const newZoom = calculateNextZoom(options.currentZoom, deltaSign);

  return {
    newZoom,
    focus: { x: transformed.x, y: transformed.y },
  };
}
