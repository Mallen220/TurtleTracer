// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
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
  // Pass both the timeline and the exact lines array used to generate it so
  // segment indices stay aligned even when macros reorder or inject lines.
  const markers: CollisionMarker[] = optimizer.getCollisions(timeline, lines);

  // Zero-length path validation & Bezier control point warnings
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

    // Bezier curve degenerate checks (3+ control points, identical/collinear)
    const controlPts = line.controlPoints || [];
    let hasWarning = false;

    if (controlPts.length >= 3) {
      hasWarning = true;
    }

    if (!hasWarning) {
      // Check for collinearity or identical consecutive points among Start -> Control -> End
      const allPts = [currentStart, ...controlPts, line.endPoint];
      for (let i = 0; i < allPts.length - 1; i++) {
        const p1 = allPts[i];
        const p2 = allPts[i + 1];
        const distSq = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
        if (distSq < 0.000001) {
          hasWarning = true;
          break;
        }
      }

      if (!hasWarning) {
        for (let i = 0; i < allPts.length - 2; i++) {
          const p1 = allPts[i];
          const p2 = allPts[i + 1];
          const p3 = allPts[i + 2];
          const area = Math.abs(p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2;
          if (area < 0.001) {
            hasWarning = true;
            break;
          }
        }
      }
    }

    if (hasWarning) {
      markers.push({
        x: currentStart.x + dx / 2, // Put marker roughly in the middle
        y: currentStart.y + dy / 2,
        time: 0,
        segmentIndex: index,
        type: "warning"
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
      const warningCount = markers.filter((m) => m.type === "warning").length;
      const obstacleCount = markers.length - boundaryCount - zeroLengthCount - warningCount;

      let msg = `Found ${markers.length} issues! `;
      const parts = [];
      if (obstacleCount > 0) parts.push(`${obstacleCount} obstacle`);
      if (boundaryCount > 0) parts.push(`${boundaryCount} boundary`);
      if (zeroLengthCount > 0) parts.push(`${zeroLengthCount} zero-length`);
      if (warningCount > 0) parts.push(`${warningCount} path warning`);

      msg += `(${parts.join(", ")})`;

      notification.set({
        message: msg,
        type: obstacleCount > 0 || boundaryCount > 0 || zeroLengthCount > 0 ? "error" : "warning",
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
