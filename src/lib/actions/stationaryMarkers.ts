// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type { Shape } from "two.js/src/shape";
import type {
  FieldRenderContext,
  SequenceRotateItem,
  SequenceWaitItem,
} from "../../types";
import { POINT_RADIUS } from "../../config";

interface MarkerStyle {
  /** Start of every element id, e.g. "wait" gives "wait-event-<id>-<n>". */
  prefix: "wait" | "rotate";
  fill: string;
  hoverFill: string;
  glyphName: "flag" | "arrow";
  /** The small symbol drawn on top of the circle, centred on (px, py). */
  glyph: (
    px: number,
    py: number,
    size: number,
    color: string,
    uiLength: (inches: number) => number,
  ) => Shape;
}

/**
 * The event markers of a wait or turn, drawn where the robot stands while
 * it runs. Both appear in the timeline as "wait" events.
 */
export function stationaryMarkerElements(
  item: SequenceWaitItem | SequenceRotateItem,
  context: FieldRenderContext,
  style: MarkerStyle,
): Shape[] {
  const { timePrediction, x, y, uiLength, hoveredId, selectedPointId } =
    context;
  const markers = item.eventMarkers ?? [];
  if (!timePrediction?.timeline || markers.length === 0) return [];

  const { prefix } = style;
  const isSelected = selectedPointId === `${prefix}-${item.id}`;
  const elements: Shape[] = [];

  for (const ev of timePrediction.timeline) {
    if (ev.type !== "wait" || ev.waitId !== item.id || !ev.atPoint) continue;
    const px = x(ev.atPoint.x);
    const py = y(ev.atPoint.y);

    markers.forEach((marker, idx) => {
      const isHovered = hoveredId === marker.id;

      const circle = new Two.Circle(
        px,
        py,
        uiLength(POINT_RADIUS * (isHovered ? 1.3 : 0.9)),
      );
      circle.id = `${prefix}-event-circle-${item.id}-${idx}`;
      if (isSelected) {
        circle.fill = "#f97316";
        circle.stroke = "#fffbeb";
        circle.linewidth = uiLength(0.6);
      } else {
        circle.fill = isHovered ? style.hoverFill : style.fill;
        circle.stroke = "#ffffff";
        circle.linewidth = uiLength(0.3);
      }

      const glyph = style.glyph(
        px,
        py,
        uiLength(isHovered ? 1 : 0.6),
        isSelected ? "#fffbeb" : "#ffffff",
        uiLength,
      );
      glyph.id = `${prefix}-event-${style.glyphName}-${item.id}-${idx}`;

      const group = new Two.Group();
      group.id = `${prefix}-event-${item.id}-${idx}`;
      group.add(circle, glyph);
      elements.push(group);
    });
  }

  return elements;
}
