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

export function computePanForZoom({
  width,
  height,
  fieldSize,
  newZoom,
  focusScreenX,
  focusScreenY,
  fieldX,
  fieldY,
}: {
  width: number;
  height: number;
  fieldSize: number;
  newZoom: number;
  focusScreenX: number;
  focusScreenY: number;
  fieldX: number;
  fieldY: number;
}) {
  // For x: focusScreenX = width/2 - (width*newZoom)/2 + panX + (fieldX/fieldSize)*(width*newZoom)
  const panX =
    focusScreenX - (width / 2 - (width * newZoom) / 2 + (fieldX / fieldSize) * (width * newZoom));

  // For y: focusScreenY = height/2 + (height*newZoom)/2 + panY + (fieldY/fieldSize)*(-height*newZoom)
  const panY =
    focusScreenY - (height / 2 + (height * newZoom) / 2 + (fieldY / fieldSize) * (-height * newZoom));

  return { x: panX, y: panY };
}
