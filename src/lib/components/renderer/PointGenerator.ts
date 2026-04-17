// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import { type RenderContext, setupTextLabel } from "./GeneratorUtils";
import type { Line, Point, Shape, SequenceItem } from "../../../types";
import { POINT_RADIUS } from "../../../config";
import { calculateGlobalChainMeta } from "../../../utils/timeCalculator";

export function generatePointElements(
  startPoint: Point,
  lines: Line[],
  shapes: Shape[],
  sequence: SequenceItem[],
  ctx: RenderContext,
) {
  let _points: (
    | InstanceType<typeof Two.Circle>
    | InstanceType<typeof Two.Group>
  )[] = [];
  const { x, y, uiLength, multiSelectedPointIds } = ctx;
  const multiSelectedSet = new Set(multiSelectedPointIds);

  const chainMeta = calculateGlobalChainMeta(sequence, lines, startPoint);

  let startPointElem = new Two.Circle(
    x(startPoint.x),
    y(startPoint.y),
    uiLength(POINT_RADIUS),
  );
  startPointElem.id = `point-0-0`;
  startPointElem.fill = multiSelectedSet.has("point-0-0")
    ? "#4ade80"
    : lines[0]?.color || "#000000"; // Fallback color if lines empty
  startPointElem.noStroke();
  _points.push(startPointElem);

  lines.forEach((line, idx) => {
    if (!line?.endPoint || line.hidden) return;
    [line.endPoint, ...line.controlPoints].forEach((point, idx1) => {
      if (idx1 > 0) {
        let pointGroup = new Two.Group();
        pointGroup.id = `point-${idx + 1}-${idx1}`;
        let pointElem = new Two.Circle(
          x(point.x),
          y(point.y),
          uiLength(POINT_RADIUS),
        );
        pointElem.id = `point-${idx + 1}-${idx1}-background`;
        pointElem.fill =
          multiSelectedSet.size > 1 && multiSelectedSet.has(pointElem.id)
            ? "#4ade80"
            : line.color;
        pointElem.noStroke();
        let pointText = new Two.Text(
          `${idx1}`,
          x(point.x),
          y(point.y) - uiLength(0.15),
        );
        setupTextLabel(
          pointText,
          `point-${idx + 1}-${idx1}-text`,
          uiLength(1.55),
        );
        pointGroup.add(pointElem, pointText);
        _points.push(pointGroup);
      } else {
        let pointElem = new Two.Circle(
          x(point.x),
          y(point.y),
          uiLength(POINT_RADIUS),
        );
        pointElem.id = `point-${idx + 1}-${idx1}`;
        pointElem.fill =
          multiSelectedSet.size > 1 && multiSelectedSet.has(pointElem.id)
            ? "#4ade80"
            : line.color;
        pointElem.noStroke();
        _points.push(pointElem);
      }
    });

    const meta = chainMeta.get(line.id!);
    const rootLine = meta?.rootLine;
    const isGlobalOverride = !!(
      rootLine?.globalHeading && rootLine.globalHeading !== "none"
    );

    // Determine which heading info to use for dot rendering
    let targetX: number | undefined;
    let targetY: number | undefined;
    let headingType: string | undefined;
    let segments: any[] | undefined;

    if (isGlobalOverride) {
      headingType = rootLine!.globalHeading;
      targetX = rootLine!.globalTargetX;
      targetY = rootLine!.globalTargetY;
      segments = rootLine!.globalSegments;
    } else {
      // Standard local heading
      headingType = line.endPoint!.heading;
      targetX = (line.endPoint as any).targetX;
      targetY = (line.endPoint as any).targetY;
      segments = line.endPoint!.segments;
    }

    if (headingType === "facingPoint") {
      const pathColor = line.color || "#60a5fa";
      let pointGroup = new Two.Group();
      pointGroup.id = `targetpoint-${idx + 1}`;
      let pointElem = new Two.Circle(
        x(targetX || 72),
        y(targetY || 72),
        uiLength(POINT_RADIUS * 0.85),
      );
      pointElem.id = `targetpoint-${idx + 1}-background`;
      pointElem.fill = pathColor;
      pointElem.noStroke();
      let pointText = new Two.Text(
        "T",
        x(targetX || 72),
        y(targetY || 72) - uiLength(0.05),
      );
      setupTextLabel(
        pointText,
        `targetpoint-${idx + 1}-text`,
        uiLength(1.4),
        700,
      );
      pointGroup.add(pointElem, pointText);
      _points.push(pointGroup);
    } else if (headingType === "piecewise") {
      const segs = segments || [];
      segs.forEach((seg, segIdx) => {
        if (seg.heading === "facingPoint") {
          const pathColor = line.color || "#60a5fa";
          let pointGroup = new Two.Group();
          pointGroup.id = `targetpoint-${idx + 1}-piecewise-${segIdx}`;
          let pointElem = new Two.Circle(
            x(seg.targetX || 72),
            y(seg.targetY || 72),
            uiLength(POINT_RADIUS * 0.85),
          );
          pointElem.id = `targetpoint-${idx + 1}-piecewise-${segIdx}-background`;
          pointElem.fill = pathColor;
          pointElem.noStroke();
          let pointText = new Two.Text(
            "T",
            x(seg.targetX || 72),
            y(seg.targetY || 72) - uiLength(0.05),
          );
          setupTextLabel(
            pointText,
            `targetpoint-${idx + 1}-piecewise-${segIdx}-text`,
            uiLength(1.4),
            700,
          );
          pointGroup.add(pointElem, pointText);
          _points.push(pointGroup);
        }
      });
    }
  });

  shapes.forEach((shape, shapeIdx) => {
    shape.vertices.forEach((vertex, vertexIdx) => {
      let pointGroup = new Two.Group();
      pointGroup.id = `obstacle-${shapeIdx}-${vertexIdx}`;
      let pointElem = new Two.Circle(
        x(vertex.x),
        y(vertex.y),
        uiLength(POINT_RADIUS),
      );
      pointElem.id = `obstacle-${shapeIdx}-${vertexIdx}-background`;
      pointElem.fill = shape.color;
      pointElem.noStroke();
      let pointText = new Two.Text(
        `${vertexIdx + 1}`,
        x(vertex.x),
        y(vertex.y) - uiLength(0.15),
      );
      setupTextLabel(
        pointText,
        `obstacle-${shapeIdx}-${vertexIdx}-text`,
        uiLength(1.55),
      );
      pointGroup.add(pointElem, pointText);
      _points.push(pointGroup);
    });
  });
  return _points;
}
