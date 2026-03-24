// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type { Line, Point, SequenceItem } from "../../../types";
import { getCurvePoint } from "../../../utils/math";

interface RenderContext {
  x: d3.ScaleLinear<number, number>;
  y: d3.ScaleLinear<number, number>;
  uiLength: (inches: number) => number;
  hoveredMarkerId: string | null;
  multiSelectedPointIds: string[];
  settings: any;
  timePrediction: any;
  selectedLineId: string | null;
  selectedPointId: string | null;
  actionRegistry: any;
}

export function generateEventMarkerElements(
  lines: Line[],
  startPoint: Point,
  sequence: SequenceItem[],
  ctx: RenderContext,
) {
  let twoMarkers: InstanceType<typeof Two.Group>[] = [];
  const {
    x,
    y,
    uiLength,
    hoveredMarkerId,
    multiSelectedPointIds,
    timePrediction,
    settings,
    selectedLineId,
    selectedPointId,
    actionRegistry,
  } = ctx;
  const multiSelectedSet = new Set(multiSelectedPointIds);

  // Build a map of lineId -> startPoint from timePrediction if available
  // This handles cases where lines are out of order in the array (e.g. mixed with macros)
  const startPointMap = new Map<string, Point>();
  if (timePrediction && timePrediction.timeline) {
    timePrediction.timeline.forEach((ev: any) => {
      if (ev.type === "travel" && ev.line && ev.prevPoint) {
        startPointMap.set(ev.line.id, ev.prevPoint);
      }
    });
  }

  lines.forEach((line, idx) => {
    if (!line || !line.endPoint || line.hidden) return;

    let _startPoint = startPointMap.get(line.id!);
    if (!_startPoint) {
      // Fallback for lines not in timeline or if timeline missing
      _startPoint = idx === 0 ? startPoint : lines[idx - 1]?.endPoint || null;
    }

    if (!_startPoint) return;
    if (!line.eventMarkers || line.eventMarkers.length === 0) return;

    line.eventMarkers.forEach((ev, evIdx) => {
      const isHovered =
        hoveredMarkerId === ev.id ||
        multiSelectedSet.has(`event-${idx}-${evIdx}`);
      const radius = isHovered ? 1.8 : 0.9;
      const color = isHovered ? "#a78bfa" : "#c4b5fd";

      const t = Math.max(0, Math.min(1, ev.position ?? 0.5));
      let pos = { x: 0, y: 0 };
      if (line.controlPoints.length > 0) {
        const cps = [_startPoint, ...line.controlPoints, line.endPoint];
        const pt = getCurvePoint(t, cps);
        pos.x = pt.x;
        pos.y = pt.y;
      } else {
        pos.x = _startPoint.x + (line.endPoint.x - _startPoint.x) * t;
        pos.y = _startPoint.y + (line.endPoint.y - _startPoint.y) * t;
      }
      const px = x(pos.x);
      const py = y(pos.y);
      let grp = new Two.Group();
      grp.id = `event-${idx}-${evIdx}`;
      let circle = new Two.Circle(px, py, uiLength(radius));
      circle.id = `event-circle-${idx}-${evIdx}`;
      circle.fill = color;
      circle.noStroke();
      grp.add(circle);
      twoMarkers.push(grp);
    });
  });

  if (
    timePrediction &&
    timePrediction.timeline &&
    sequence &&
    sequence.length > 0
  ) {
    // Use Registry for registered actions (e.g. Wait)
    sequence.forEach((item) => {
      if ((item as any).hidden) return;
      const action = actionRegistry.get(item.kind);
      if (action && action.renderField) {
        const elems = action.renderField(item, {
          x,
          y,
          uiLength,
          settings,
          hoveredId: hoveredMarkerId,
          selectedId: selectedLineId,
          selectedPointId: selectedPointId,
          timePrediction,
        });
        if (elems) {
          elems.forEach((el: any) => twoMarkers.push(el));
        }
      }
    });
  }
  return twoMarkers;
}
