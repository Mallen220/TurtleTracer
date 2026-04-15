// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { type RenderContext, findActiveEvent } from "./GeneratorUtils";
import type { Line, Point } from "../../../types";
import { generateOnionLayers } from "../../../utils";

export function generateOnionLayerElements(
  lines: Line[],
  startPoint: Point,
  ctx: RenderContext,
) {
  const { settings, timePrediction, percentStore } = ctx;

  if (settings.showOnionLayers && lines.length > 0) {
    const spacing = settings.onionLayerSpacing || 6;

    let targetLines = lines;
    let targetStartPoint = startPoint;

    // If "Current Path Only" is enabled, filter the lines based on animation time
    if (settings.onionSkinCurrentPathOnly) {
      if (timePrediction?.timeline) {
        const activeEvent = findActiveEvent(timePrediction, percentStore ?? 0);

        if (
          activeEvent?.type === "travel" &&
          typeof activeEvent.lineIndex === "number"
        ) {
          const idx = activeEvent.lineIndex;
          if (lines[idx]) {
            targetLines = [lines[idx]];
            targetStartPoint = idx === 0 ? startPoint : lines[idx - 1].endPoint;
          }
        } else {
          // Not traveling (e.g. waiting), show nothing
          targetLines = [];
        }
      }
    }

    return generateOnionLayers(
      targetStartPoint,
      targetLines,
      settings.rLength,
      settings.rWidth,
      spacing,
    );
  }
  return [];
}
