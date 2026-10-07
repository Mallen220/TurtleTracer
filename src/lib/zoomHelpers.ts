// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/**
 * Compute adaptive zoom step to make zooming feel faster after 1x.
 * direction: +1 for zoom in, -1 for zoom out
 */
export function computeZoomStep(
  currentZoom: number,
  direction: number,
  baseStep = 0.1,
  gain = 1.5,
) {
  if (direction > 0 && currentZoom > 1) return baseStep * gain;
  return baseStep;
}
