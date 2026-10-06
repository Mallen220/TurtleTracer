// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type { Anchor } from "two.js/src/anchor";
import type { Path } from "two.js/src/path";
import type { Line as PathLine } from "two.js/src/shapes/line";
import type { Line, Point, TimelineEvent } from "../../../types";
import { getCurvePoint } from "../../../utils/math";
import { drivenRange } from "../../../utils/timeCalculator/drivenRange";
import { type RenderContext, createLineElement } from "./GeneratorUtils";
import type { ElementCache } from "./ElementCache";

/** The heatmap colour of the part of a line the robot doesn't drive. */
const UNDRIVEN_COLOR = "hsl(0, 0%, 60%)";

export type PathElement = Path | PathLine;

interface LineStyle {
  /** Element id, without the heatmap segment suffix. */
  id: string;
  color: string;
  width: number;
  isDimmed: boolean;
}

export function generatePathElements(
  targetLines: Line[],
  targetStartPoint: Point,
  getColor: (line: Line) => string,
  getWidth: (line: Line) => number,
  idPrefix: string,
  ctx: RenderContext,
  /**
   * The timeline event holding a line's speeds, for the velocity heatmap.
   * Lines without one are drawn in their own colour.
   */
  velocityEventFor?: (line: Line) => TimelineEvent | undefined,
  cache?: ElementCache<PathElement[]>,
) {
  const _path: PathElement[] = [];
  const { x, y, uiLength, settings, dimmedIds } = ctx;

  targetLines.forEach((line, idx) => {
    if (!line?.endPoint || line.hidden) return;
    const _startPoint =
      idx === 0 ? targetStartPoint : targetLines[idx - 1]?.endPoint || null;
    if (!_startPoint) return;

    const event = settings.showVelocityHeatmap
      ? velocityEventFor?.(line)
      : undefined;
    const style: LineStyle = {
      id: `${idPrefix}-line-${idx + 1}`,
      color: getColor(line),
      width: getWidth(line),
      isDimmed: !!line.id && dimmedIds.includes(line.id),
    };

    const build = () => lineElements(line, _startPoint, event, style, ctx);
    const elements = cache
      ? cache.get(
          style.id,
          [
            line,
            _startPoint,
            event,
            style.color,
            style.width,
            style.isDimmed,
            x,
            y,
            uiLength,
            settings,
          ],
          build,
        )
      : build();
    _path.push(...elements);
  });
  return _path;
}

/** The shapes for one line: velocity heatmap segments, or a single stroke. */
function lineElements(
  line: Line,
  startPoint: Point,
  event: TimelineEvent | undefined,
  style: LineStyle,
  ctx: RenderContext,
): PathElement[] {
  const { uiLength } = ctx;
  const heatmap = event
    ? heatmapSegments(line, startPoint, event, style, ctx)
    : [];
  if (heatmap.length > 0) return heatmap;

  const lineElem = createLineElement(line, startPoint, ctx);
  lineElem.id = style.id;

  lineElem.stroke = style.isDimmed ? "#9ca3af" : style.color;
  lineElem.linewidth = style.width;
  lineElem.noFill();
  if (line.locked) {
    lineElem.dashes = [uiLength(2), uiLength(2)];
    lineElem.opacity = 0.7;
  } else if (style.isDimmed) {
    lineElem.dashes = [uiLength(1), uiLength(1)];
  } else {
    lineElem.dashes = [];
    lineElem.opacity = 1;
  }
  return [lineElem];
}

/**
 * The line split into runs coloured by speed, green (slow) to red (fast).
 * Empty if the event has no velocity profile.
 */
function heatmapSegments(
  line: Line,
  startPoint: Point,
  event: TimelineEvent,
  style: LineStyle,
  ctx: RenderContext,
): PathElement[] {
  const { x, y, uiLength, settings } = ctx;
  const segments: PathElement[] = [];
  if (!event.velocityProfile || event.velocityProfile.length === 0) {
    return segments;
  }

  const vProfile = event.velocityProfile as number[];
  const maxVel = Math.max(1, settings.maxVelocity);

  // Re-sample geometry to match profile (100 samples)
  const samples = 100;
  const drivenParts = drivenRange(event);
  let cps = [startPoint, ...line.controlPoints, line.endPoint];
  let prevPt = getCurvePoint(0, cps);

  let currentAnchors: Anchor[] = [];
  let currentColor: string | null = null;
  let segmentCounter = 0;

  const createHeatmapSegment = (
    anchors: Anchor[],
    color: string,
    segIdx: number,
  ) => {
    const path = new Two.Path(anchors, false, false);
    path.noFill();
    path.linewidth = style.width;
    path.id = `${style.id}-heatmap-${segIdx}`;

    path.stroke = style.isDimmed ? "#9ca3af" : color;

    if (line.locked) {
      path.dashes = [uiLength(2), uiLength(2)];
      path.opacity = 0.7;
    } else if (style.isDimmed) {
      path.dashes = [uiLength(1), uiLength(1)];
      path.opacity = 0.3;
    }
    return path;
  };

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const currPt = getCurvePoint(t, cps);

    // Calculate the proportional index in the velocity profile
    const profileIndex = Math.floor(t * (vProfile.length - 1));
    const safeIndex = Math.min(vProfile.length - 1, Math.max(0, profileIndex));

    const vAvg = vProfile[safeIndex] || 0;
    const ratio = Math.min(1, Math.max(0, vAvg / maxVel));

    // Green (120) -> Red (0). The part of the line the robot doesn't
    // drive (handed over early, or picked up after a swing) is grey.
    const hue = 120 - ratio * 120;
    const driven = t > drivenParts.from && t - 1 / samples < drivenParts.to;
    const color = driven ? `hsl(${hue}, 100%, 40%)` : UNDRIVEN_COLOR;

    if (color === currentColor) {
      // Extend current path
      currentAnchors.push(
        new Two.Anchor(x(currPt.x), y(currPt.y), 0, 0, 0, 0, Two.Commands.line),
      );
    } else {
      if (currentAnchors.length > 0) {
        segments.push(
          createHeatmapSegment(currentAnchors, currentColor!, segmentCounter++),
        );
      }

      // Start new path with previous point
      currentAnchors = [
        new Two.Anchor(x(prevPt.x), y(prevPt.y), 0, 0, 0, 0, Two.Commands.move),
        new Two.Anchor(x(currPt.x), y(currPt.y), 0, 0, 0, 0, Two.Commands.line),
      ];
      currentColor = color;
    }

    prevPt = currPt;
  }

  // Flush last segment
  if (currentAnchors.length > 0 && currentColor) {
    segments.push(
      createHeatmapSegment(currentAnchors, currentColor, segmentCounter++),
    );
  }
  return segments;
}
