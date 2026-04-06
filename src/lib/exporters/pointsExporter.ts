// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Point, Line, BasePoint, TurtleData } from "../../types";
import { exporterRegistry } from "./index";

export function generatePointsArray(
  startPoint: Point,
  lines: Line[],
  codeUnits: "imperial" | "metric" = "imperial",
): string {
  const points: BasePoint[] = [];

  // Add start point
  points.push(startPoint);

  // Add all waypoints (end points and control points)
  lines.forEach((line) => {
    // Add control points for this line
    line.controlPoints.forEach((controlPoint) => {
      points.push(controlPoint);
    });

    // Add end point of this line
    points.push(line.endPoint);
  });

  // Format as string array, removing decimal places for whole numbers
  const pointsString = points
    .map((point) => {
      let xVal = point.x;
      let yVal = point.y;
      if (codeUnits === "metric") {
        xVal *= 2.54;
        yVal *= 2.54;
      }
      const x = Number.isInteger(xVal) ? xVal.toFixed(1) : xVal.toFixed(3);
      const y = Number.isInteger(yVal) ? yVal.toFixed(1) : yVal.toFixed(3);
      return `(${x}, ${y})`;
    })
    .join(", ");

  return `[${pointsString}]`;
}

exporterRegistry.register({
  id: "points",
  name: "Export Points",
  description: "Export the path points array for basic usage.",
  exportCode: (data: TurtleData, settings: any) => {
    return generatePointsArray(data.startPoint, data.lines, settings.codeUnits ?? "imperial");
  }
});
