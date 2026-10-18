// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { PathOptimizer } from "./pathOptimizer";
import { calculatePathTime } from "./timeCalculator";
import { chainCornerIssues } from "./timeCalculator/chainIssues";
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

/** A marker on every path that starts and ends in the same place. */
function zeroLengthMarkers(
  startPoint: Point,
  lines: Line[],
): CollisionMarker[] {
  const markers: CollisionMarker[] = [];
  let currentStart = startPoint;
  lines.forEach((line, index) => {
    const dist = Math.hypot(
      line.endPoint.x - currentStart.x,
      line.endPoint.y - currentStart.y,
    );
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
  return markers;
}

/** A marker at each chained corner the robot struggles with, where the paths join. */
function chainCornerMarkers(
  timeline: TimelineEvent[],
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  settings: Settings,
): CollisionMarker[] {
  return chainCornerIssues(timeline, startPoint, lines, sequence, settings).map(
    (issue) => ({
      x: issue.x,
      y: issue.y,
      time: issue.startTime,
      segmentIndex: issue.lineIndex,
      type: "chain-corner",
    }),
  );
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** "Found 3 issues! (1 obstacle, 2 boundaries)" */
function issueSummary(markers: CollisionMarker[]): string {
  const count = (type: CollisionMarker["type"]) =>
    markers.filter((m) => m.type === type).length;
  const boundaries = count("boundary");
  const zeroLength = count("zero-length");
  const corners = count("chain-corner");
  const obstacles = markers.length - boundaries - zeroLength - corners;

  const parts = [];
  if (obstacles > 0) parts.push(plural(obstacles, "obstacle", "obstacles"));
  if (boundaries > 0) parts.push(plural(boundaries, "boundary", "boundaries"));
  if (zeroLength > 0) parts.push(`${zeroLength} zero-length`);
  if (corners > 0) {
    parts.push(`${corners} chained ${corners === 1 ? "corner" : "corners"}`);
  }
  return `Found ${plural(markers.length, "issue", "issues")}! (${parts.join(", ")})`;
}

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
  const markers: CollisionMarker[] = [
    ...optimizer.getCollisions(timeline, lines),
    ...zeroLengthMarkers(startPoint, lines),
    ...chainCornerMarkers(
      timeline ??
        calculatePathTime(startPoint, lines, settings, sequence).timeline,
      startPoint,
      lines,
      sequence,
      settings,
    ),
  ];
  collisionMarkers.set(markers);
  if (silent) return;

  if (markers.length > 0) {
    notification.set({
      message: issueSummary(markers),
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
