// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { PathOptimizer } from "./pathOptimizer";
import { collisionMarkers, notification } from "../stores";
import type {
  Line,
  Point,
  SequenceItem,
  Settings,
  Shape,
  CollisionMarker,
  TimelineEvent,
} from "../types";

export function validatePath(
  startPoint: Point,
  lines: Line[],
  settings: Settings,
  sequence: SequenceItem[],
  shapes: Shape[],
  silent: boolean = false,
  timeline: TimelineEvent[] | null = null,
) {
  const optimizer = new PathOptimizer(
    startPoint,
    lines,
    settings,
    sequence,
    shapes,
  );
  const markers: CollisionMarker[] = optimizer.getCollisions(timeline);

  // Zero-length path validation
  let currentStart = startPoint;
  lines.forEach((line, index) => {
    const dx = line.endPoint.x - currentStart.x;
    const dy = line.endPoint.y - currentStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // If distance is effectively zero (epsilon check), add a boundary marker
    if (dist < 0.001) {
      markers.push({
        x: currentStart.x,
        y: currentStart.y,
        time: 0, // Not really applicable, but needed for type
        segmentIndex: index,
        type: "zero-length",
      });
    }
    currentStart = line.endPoint;
  });

  collisionMarkers.set(markers);

  if (!silent) {
    if (markers.length > 0) {
      const boundaryCount = markers.filter((m) => m.type === "boundary").length;
      const zeroLengthCount = markers.filter(
        (m) => m.type === "zero-length",
      ).length;
      const obstacleCount = markers.length - boundaryCount - zeroLengthCount;

      let msg = `Found ${markers.length} issues! `;
      const parts = [];
      if (obstacleCount > 0) parts.push(`${obstacleCount} obstacle`);
      if (boundaryCount > 0) parts.push(`${boundaryCount} boundary`);
      if (zeroLengthCount > 0) parts.push(`${zeroLengthCount} zero-length`);

      msg += `(${parts.join(", ")})`;

      notification.set({
        message: msg,
        type: "error", // Maybe separate later if needed, but error is fine for invalid state
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
}
