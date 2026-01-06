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
} from "../types";

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
  const markers: CollisionMarker[] = optimizer.getCollisions();

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
        type: "boundary", // Use boundary type for now as it's a severe geometric issue
      });
    }
    currentStart = line.endPoint;
  });

  collisionMarkers.set(markers);

  if (markers.length > 0) {
    const boundaryCount = markers.filter((m) => m.type === "boundary").length;
    const obstacleCount = markers.length - boundaryCount;

    // Check if we have zero-length segments specifically to give a better message?
    // We didn't distinguish them in the type, but we can infer or just generic warning.
    // The requirement says: "Display a UI warning when this occurs."
    // The existing boundary/obstacle message is fine, but maybe we can be more specific if possible.
    // For now, grouping them into "Boundary/Validation" is acceptable.

    let msg = `Found ${markers.length} collisions! `;
    if (boundaryCount > 0 && obstacleCount > 0) {
      msg += `(${obstacleCount} obstacle, ${boundaryCount} boundary/geometry)`;
    } else if (boundaryCount > 0) {
      msg += "(Field Boundary Violation or Zero-Length Path)";
    } else {
      msg += "(Obstacle Collision)";
    }
    notification.set({
      message: msg,
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
