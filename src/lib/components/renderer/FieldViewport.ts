// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import * as d3 from "d3";

export interface PanToFieldParams {
  fx: number;
  fy: number;
  fieldW: number;
  fieldH: number;
  visualW: number;
  visualH: number;
  zoom: number;
}

export interface ZoomToParams {
  newZoom: number;
  focus?: { x: number; y: number };
  width: number;
  height: number;
  fieldW: number;
  fieldH: number;
  visualW: number;
  visualH: number;
  xInvert: (px: number) => number;
  yInvert: (py: number) => number;
}

/**
 * Calculates the pan required to center the field view on a given (fx, fy) field position in inches.
 */
export function calculatePanToField(params: PanToFieldParams): {
  x: number;
  y: number;
} {
  const { fx, fy, fieldW, fieldH, visualW, visualH, zoom } = params;
  const px = visualW * zoom * (0.5 - fx / fieldW);
  const py = visualH * zoom * (fy / fieldH - 0.5);
  return { x: px, y: py };
}

/**
 * Calculates updated zoom and pan when zooming towards an optional focus point.
 */
export function calculateZoomTo(params: ZoomToParams): {
  zoom: number;
  pan: { x: number; y: number };
} {
  const {
    newZoom,
    focus,
    width,
    height,
    fieldW,
    fieldH,
    visualW,
    visualH,
    xInvert,
    yInvert,
  } = params;

  const fx = focus?.x ?? width / 2;
  const fy = focus?.y ?? height / 2;

  const fieldX = xInvert(fx);
  const fieldY = yInvert(fy);

  const newPanX = fx - width / 2 - (fieldX / fieldW - 0.5) * visualW * newZoom;
  const newPanY = fy - height / 2 - (0.5 - fieldY / fieldH) * visualH * newZoom;

  return {
    zoom: Number(newZoom.toFixed(2)),
    pan: { x: newPanX, y: newPanY },
  };
}

export interface CreateFieldScalesParams {
  fieldW: number;
  fieldH: number;
  width: number;
  height: number;
  visualW: number;
  visualH: number;
  scaleFactor: number;
  pan: { x: number; y: number };
}

/**
 * Creates linear D3 scales for converting field inches to screen pixels.
 */
export function createFieldScales(params: CreateFieldScalesParams): {
  x: d3.ScaleLinear<number, number>;
  y: d3.ScaleLinear<number, number>;
} {
  const { fieldW, fieldH, width, height, visualW, visualH, scaleFactor, pan } =
    params;
  const x = d3
    .scaleLinear()
    .domain([0, fieldW])
    .range([
      width / 2 - (visualW * scaleFactor) / 2 + pan.x,
      width / 2 + (visualW * scaleFactor) / 2 + pan.x,
    ]);
  const y = d3
    .scaleLinear()
    .domain([0, fieldH])
    .range([
      height / 2 + (visualH * scaleFactor) / 2 + pan.y,
      height / 2 - (visualH * scaleFactor) / 2 + pan.y,
    ]);
  return { x, y };
}
