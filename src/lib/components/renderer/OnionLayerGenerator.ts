// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Point } from "../../../types";
import { generateOnionLayers } from "../../../utils";

interface RenderContext {
  settings: any;
  timePrediction: any;
  percentStore: number;
}

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
      if (timePrediction && timePrediction.timeline) {
        const totalDuration =
          timePrediction.timeline[timePrediction.timeline.length - 1]
            ?.endTime || 0;
        const currentSeconds = (percentStore / 100) * totalDuration;
        const activeEvent =
          timePrediction.timeline.find(
            (e: any) =>
              currentSeconds >= e.startTime && currentSeconds <= e.endTime,
          ) || timePrediction.timeline[timePrediction.timeline.length - 1];

        if (
          activeEvent &&
          activeEvent.type === "travel" &&
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
