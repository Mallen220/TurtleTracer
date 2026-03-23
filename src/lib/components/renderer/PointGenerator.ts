// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type { Line, Point, Shape } from "../../../types";
import { POINT_RADIUS } from "../../../config";

interface RenderContext {
  x: d3.ScaleLinear<number, number>;
  y: d3.ScaleLinear<number, number>;
  uiLength: (inches: number) => number;
  multiSelectedPointIds: string[];
}

export function generatePointElements(
  startPoint: Point,
  lines: Line[],
  shapes: Shape[],
  ctx: RenderContext,
) {
  let _points: (
    | InstanceType<typeof Two.Circle>
    | InstanceType<typeof Two.Group>
  )[] = [];
  const { x, y, uiLength, multiSelectedPointIds } = ctx;

  let startPointElem = new Two.Circle(
    x(startPoint.x),
    y(startPoint.y),
    uiLength(POINT_RADIUS),
  );
  startPointElem.id = `point-0-0`;
  startPointElem.fill = multiSelectedPointIds.includes("point-0-0")
    ? "#4ade80"
    : lines[0]?.color || "#000000"; // Fallback color if lines empty
  startPointElem.noStroke();
  _points.push(startPointElem);

  lines.forEach((line, idx) => {
    if (!line || !line.endPoint || line.hidden) return;
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
          multiSelectedPointIds.length > 1 &&
          multiSelectedPointIds.includes(pointElem.id)
            ? "#4ade80"
            : line.color;
        pointElem.noStroke();
        let pointText = new Two.Text(
          `${idx1}`,
          x(point.x),
          y(point.y) - uiLength(0.15),
        );
        pointText.id = `point-${idx + 1}-${idx1}-text`;
        pointText.size = uiLength(1.55);
        pointText.leading = 1;
        pointText.family = "ui-sans-serif, system-ui, sans-serif";
        pointText.alignment = "center";
        pointText.baseline = "middle";
        pointText.fill = "white";
        pointText.noStroke();
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
          multiSelectedPointIds.length > 1 &&
          multiSelectedPointIds.includes(pointElem.id)
            ? "#4ade80"
            : line.color;
        pointElem.noStroke();
        _points.push(pointElem);
      }
    });

    if (line.endPoint.heading === "facingPoint") {
      const pathColor = line.color || "#60a5fa";
      let pointGroup = new Two.Group();
      pointGroup.id = `targetpoint-${idx + 1}`;
      let pointElem = new Two.Circle(
        x((line.endPoint as any).targetX || 72),
        y((line.endPoint as any).targetY || 72),
        uiLength(POINT_RADIUS * 0.85),
      );
      pointElem.id = `targetpoint-${idx + 1}-background`;
      pointElem.fill = pathColor;
      pointElem.noStroke();
      let pointText = new Two.Text(
        "T",
        x((line.endPoint as any).targetX || 72),
        y((line.endPoint as any).targetY || 72) - uiLength(0.05),
      );
      pointText.id = `targetpoint-${idx + 1}-text`;
      pointText.size = uiLength(1.4);
      pointText.family = "ui-sans-serif, system-ui, sans-serif";
      pointText.alignment = "center";
      pointText.baseline = "middle";
      pointText.fill = "white";
      pointText.weight = 700;
      pointGroup.add(pointElem, pointText);
      _points.push(pointGroup);
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
      pointText.id = `obstacle-${shapeIdx}-${vertexIdx}-text`;
      pointText.size = uiLength(1.55);
      pointText.leading = 1;
      pointText.family = "ui-sans-serif, system-ui, sans-serif";
      pointText.alignment = "center";
      pointText.baseline = "middle";
      pointText.fill = "white";
      pointText.noStroke();
      pointGroup.add(pointElem, pointText);
      _points.push(pointGroup);
    });
  });
  return _points;
}
