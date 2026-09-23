// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TransformedCoordinate {
  x: number;
  y: number;
}

/**
 * Transforms client mouse coordinates (from mouse/touch events) relative to a bounding rect
 * while accounting for field rotation.
 *
 * @param clientX Mouse event clientX
 * @param clientY Mouse event clientY
 * @param rect Target element bounding rect
 * @param rotation Rotation in degrees (e.g. 0, 90, 180, 270)
 * @returns Transformed (x, y) coordinates relative to the unrotated field
 */
export function getTransformedCoordinates(
  clientX: number,
  clientY: number,
  rect: RectLike,
  rotation: number,
): TransformedCoordinate {
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const w = rect.width;
  const h = rect.height;
  const cx = px - w / 2;
  const cy = py - h / 2;
  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const nx = cx * cos - cy * sin;
  const ny = cx * sin + cy * cos;
  const newPx = nx + w / 2;
  const newPy = ny + h / 2;
  return { x: newPx, y: newPy };
}
