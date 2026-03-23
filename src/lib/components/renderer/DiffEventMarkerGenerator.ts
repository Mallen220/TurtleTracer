// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type { Line, Point, SequenceItem } from "../../../types";
import { getCurvePoint } from "../../../utils/math";

interface RenderContext {
  x: d3.ScaleLinear<number, number>;
  y: d3.ScaleLinear<number, number>;
  uiLength: (inches: number) => number;
  hoveredMarkerId: string | null;
  ppI: number;
}

export function generateDiffEventMarkerElements(
  isDiffMode: boolean,
  diffData: any,
  oldData: any,
  lines: Line[],
  startPoint: Point,
  sequence: SequenceItem[],
  ctx: RenderContext,
) {
  if (!isDiffMode || !diffData) return [];

  const { x, y, uiLength, hoveredMarkerId, ppI } = ctx;
  const elems: InstanceType<typeof Two.Group>[] = [];

  // Helper to extract marker positions from a dataset
  const getMarkerMap = (
    dataLines: Line[],
    dataStart: Point,
    dataSequence: SequenceItem[],
  ) => {
    const map = new Map<string, { x: number; y: number }>();

    // Lines
    dataLines.forEach((l, idx) => {
      const parentName = l.name || `Path ${idx + 1}`;
      const start = idx === 0 ? dataStart : dataLines[idx - 1].endPoint;
      if (!start) return;

      l.eventMarkers?.forEach((m) => {
        const id = m.id || `${parentName}-${m.name}-${m.position}`;
        const t = Math.max(0, Math.min(1, m.position ?? 0.5));
        let pos = { x: 0, y: 0 };
        if (l.controlPoints.length > 0) {
          const cps = [start, ...l.controlPoints, l.endPoint];
          const pt = getCurvePoint(t, cps);
          pos.x = pt.x;
          pos.y = pt.y;
        } else {
          pos.x = start.x + (l.endPoint.x - start.x) * t;
          pos.y = start.y + (l.endPoint.y - start.y) * t;
        }
        map.set(id, pos);
      });
    });

    // Sequence
    dataSequence.forEach((s) => {
      if (s.kind === "wait" || s.kind === "rotate") {
        const parentName = s.name || (s.kind === "wait" ? "Wait" : "Rotate");
        // Sequence events usually attach to the end of a line.
        // Skip them in diff view when position data is unavailable and fall back to Path Events.
      }
    });

    return map;
  };

  const currentMap = getMarkerMap(lines, startPoint, sequence);
  const oldMap = oldData
    ? getMarkerMap(oldData.lines, oldData.startPoint, oldData.sequence)
    : new Map();

  diffData.eventDiff.forEach((change: any) => {
    // Helper to create marker
    const createMarker = (
      pos: { x: number; y: number },
      color: string,
      label: string,
      idSuffix: string,
    ) => {
      const grp = new Two.Group();
      // ID format for hover: diff-event-{id}-{suffix}
      // suffix: old or new
      grp.id = `diff-event-${change.id}-${idSuffix}`;

      const isHovered = hoveredMarkerId === change.id; // Match base ID
      const radius = isHovered ? 2.5 : 1.5;

      const circle = new Two.Circle(x(pos.x), y(pos.y), uiLength(radius));
      circle.fill = color;
      circle.noStroke();
      grp.add(circle);

      if (isHovered) {
        const text = new Two.Text(label, x(pos.x), y(pos.y) - uiLength(3));
        text.fill = "white"; // Dark mode friendly? or switch based on theme

        // Background for text
        const textMetrics = { width: label.length * 8, height: 14 }; // Approx
        const bg = new Two.Rectangle(
          x(pos.x),
          y(pos.y) - uiLength(3),
          uiLength(textMetrics.width / ppI),
          uiLength(1),
        );
        // Two.Text is easier.
        text.weight = 700;
        text.size = uiLength(1.5);
        text.stroke = "black";
        text.linewidth = 2;
        grp.add(text);
      }

      return grp;
    };

    if (change.changeType === "added") {
      const pos = currentMap.get(change.id);
      if (pos) {
        elems.push(createMarker(pos, "#22c55e", change.name, "new")); // Green
      }
    } else if (change.changeType === "removed") {
      const pos = oldMap.get(change.id);
      if (pos) {
        elems.push(createMarker(pos, "#ef4444", change.name, "old")); // Red
      }
    } else if (change.changeType === "changed") {
      const oldPos = oldMap.get(change.id);
      const newPos = currentMap.get(change.id);
      if (oldPos)
        elems.push(
          createMarker(oldPos, "#ef4444", change.name + " (Old)", "old"),
        );
      if (newPos)
        elems.push(
          createMarker(newPos, "#22c55e", change.name + " (New)", "new"),
        );

      // Optional: Draw arrow connecting them
      if (oldPos && newPos) {
        const arrowGroup = new Two.Group();
        arrowGroup.id = `diff-event-arrow-${change.id}`;
        const arrow = new Two.Line(
          x(oldPos.x),
          y(oldPos.y),
          x(newPos.x),
          y(newPos.y),
        );
        arrow.stroke = "#fbbf24"; // Amber
        arrow.linewidth = uiLength(0.5);
        arrow.dashes = [uiLength(1), uiLength(1)];
        arrowGroup.add(arrow);
        elems.push(arrowGroup);
      }
    }
  });

  return elems;
}
