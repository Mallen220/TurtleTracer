// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { findActiveEvent } from "./GeneratorUtils";
import type { Line, Point, Settings, TimePrediction } from "../../../types";
import { generateOnionLayers } from "../../../utils";

/**
 * Which line the robot is driving at `percent` of playback: its index, null
 * while it isn't driving one (waiting or turning), or undefined when there is
 * no timeline. This only changes when playback moves onto another step, so
 * the onion layers aren't rebuilt on every frame.
 */
export function activeTravelLineIndex(
  timePrediction: TimePrediction | null | undefined,
  percent: number,
): number | null | undefined {
  if (!timePrediction?.timeline) return undefined;
  const activeEvent = findActiveEvent(timePrediction, percent);
  return activeEvent?.type === "travel" &&
    typeof activeEvent.lineIndex === "number"
    ? activeEvent.lineIndex
    : null;
}

/**
 * Robot outlines along the path. With "current path only" on, only the line
 * at `activeLineIndex` (see activeTravelLineIndex) gets them.
 */
export function generateOnionLayerElements(
  lines: Line[],
  startPoint: Point,
  settings: Settings,
  activeLineIndex: number | null | undefined,
) {
  if (!settings.showOnionLayers || lines.length === 0) return [];

  const spacing = settings.onionLayerSpacing || 6;
  let targetLines = lines;
  let targetStartPoint = startPoint;

  if (settings.onionSkinCurrentPathOnly && activeLineIndex !== undefined) {
    if (activeLineIndex === null) {
      // Not traveling (e.g. waiting), show nothing
      targetLines = [];
    } else if (lines[activeLineIndex]) {
      targetLines = [lines[activeLineIndex]];
      targetStartPoint =
        activeLineIndex === 0
          ? startPoint
          : lines[activeLineIndex - 1].endPoint;
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
