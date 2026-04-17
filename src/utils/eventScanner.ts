// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { diskEventNamesStore } from "../stores";
import type { Line, SequenceItem, EventMarker, Point } from "../types";
import { isSupportedProjectFileName } from "./fileExtensions";

export interface EventMatch {
  marker: EventMarker;
  point: Point;
  distance: number;
}

export function scanForEvents(
  path: Point[],
  markers: EventMarker[],
): EventMatch[] {
  if (!path || path.length === 0 || !markers || markers.length === 0) {
    return [];
  }

  const distances: number[] = [0];
  let totalDistance = 0;
  for (let i = 1; i < path.length; i++) {
    const p1 = path[i - 1];
    const p2 = path[i];
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    totalDistance += dist;
    distances.push(totalDistance);
  }

  const matches: EventMatch[] = [];

  for (const marker of markers) {
    const targetDistance =
      totalDistance * Math.max(0, Math.min(1, marker.position));

    let closestPoint = path[0];
    let closestPointDistance = distances[0];
    let minDiff = Math.abs(distances[0] - targetDistance);

    for (let i = 1; i < path.length; i++) {
      const diff = Math.abs(distances[i] - targetDistance);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = path[i];
        closestPointDistance = distances[i];
      }
    }

    matches.push({
      marker,
      point: closestPoint,
      distance: closestPointDistance,
    });
  }

  return matches;
}

export async function scanEventsInDirectory(directory: string) {
  const electronAPI = (globalThis as any).electronAPI;
  if (!electronAPI?.listFiles || !electronAPI.readFile) return;

  try {
    const files = await electronAPI.listFiles(directory);
    // Filter for project files
    const projectFiles = files.filter((f: any) =>
      isSupportedProjectFileName(f.name),
    );

    const eventNames = new Set<string>();

    await Promise.all(
      projectFiles.map(async (file: any) => {
        try {
          const content = await electronAPI.readFile(file.path);
          const data = JSON.parse(content);

          // Extract from lines
          if (Array.isArray(data.lines)) {
            data.lines.forEach((line: Line) => {
              if (line.eventMarkers) {
                line.eventMarkers.forEach((m) => {
                  if (m.name && m.name.trim() !== "") {
                    eventNames.add(m.name.trim());
                  }
                });
              }
            });
          }

          // Extract from sequence (waits/rotates)
          if (Array.isArray(data.sequence)) {
            data.sequence.forEach((item: SequenceItem) => {
              if (item.kind === "wait" || item.kind === "rotate") {
                const waitOrRotate = item as any; // Cast to access eventMarkers if not in type def
                if (waitOrRotate.eventMarkers) {
                  waitOrRotate.eventMarkers.forEach((m: any) => {
                    if (m.name && m.name.trim() !== "") {
                      eventNames.add(m.name.trim());
                    }
                  });
                }
              }
            });
          }
        } catch (e) {
          console.warn(
            `Failed to parse file ${file.name} during event scan:`,
            e,
          );
        }
      }),
    );

    diskEventNamesStore.set(
      Array.from(eventNames).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      ),
    );
  } catch (err) {
    console.error("Error scanning events in directory:", err);
  }
}
