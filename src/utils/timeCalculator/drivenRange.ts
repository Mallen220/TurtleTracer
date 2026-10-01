// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Which part of its line a travel event drives. A robot handed over to the next
// chained path doesn't drive the end of its line, and one picking a path up
// after a swing doesn't drive the start of it.
import type { TimelineEvent } from "../../types";

/** The fractions of the line (0 to 1) that a travel event covers. */
export function drivenRange(event: TimelineEvent): {
  from: number;
  to: number;
} {
  return { from: event.drivenFrom ?? 0, to: event.drivenTo ?? 1 };
}

/** How much of `lineLength` the event drives, in the same units. */
export function drivenLength(event: TimelineEvent, lineLength: number): number {
  const { from, to } = drivenRange(event);
  return Math.max(0, to - from) * lineLength;
}

/** When a path is on the go: its swing in from the one before, and its own travel. */
export interface PathTiming {
  startTime: number;
  endTime: number;
  /** The whole time, swing included. */
  duration: number;
  /** The part of it spent swinging back onto the path after the one before. */
  swingTime: number;
}

/**
 * The time each path takes, by line id, counting the swing back onto it after a
 * chained corner as part of it, so the times add up to the whole run. (A path's
 * own travel event stops where the next one takes over.)
 */
export function pathTimings(
  timeline: TimelineEvent[],
  lines: { id?: string }[],
): Map<string, PathTiming> {
  const timings = new Map<string, PathTiming>();
  for (const event of timeline) {
    if (event.type !== "travel" && event.type !== "recovery") continue;
    const id = lines[event.lineIndex ?? -1]?.id;
    if (!id) continue;
    const swing = event.type === "recovery" ? event.duration : 0;
    const existing = timings.get(id);
    if (existing) {
      existing.endTime = Math.max(existing.endTime, event.endTime);
      existing.startTime = Math.min(existing.startTime, event.startTime);
      existing.duration = existing.endTime - existing.startTime;
      existing.swingTime += swing;
    } else {
      timings.set(id, {
        startTime: event.startTime,
        endTime: event.endTime,
        duration: event.duration,
        swingTime: swing,
      });
    }
  }
  return timings;
}
