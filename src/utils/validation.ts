// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { PathOptimizer } from "./pathOptimizer";
import { collisionMarkers, notification } from "../stores";
import type { Line, Point, SequenceItem, Settings, Shape } from "../types";

export function validatePath(
  startPoint: Point,
  lines: Line[],
  settings: Settings,
  sequence: SequenceItem[],
  shapes: Shape[],
) {
  const optimizer = new PathOptimizer(
    startPoint,
    lines,
    settings,
    sequence,
    shapes,
  );
  const markers = optimizer.getCollisions();
  collisionMarkers.set(markers);

  if (markers.length > 0) {
    notification.set({
      message: `Found ${markers.length} collisions! Check the field.`,
      type: "error",
      timeout: 5000,
    });
  } else {
    notification.set({
      message: "Path is valid! No collisions detected.",
      type: "success",
      timeout: 3000,
    });
  }
}
