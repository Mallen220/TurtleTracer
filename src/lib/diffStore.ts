// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { writable, get } from "svelte/store";
import { currentFilePath } from "../stores";
import {
  linesStore,
  startPointStore,
  sequenceStore,
  shapesStore,
  settingsStore,
  normalizeLines,
} from "./projectStore";
import type { Line, Point, SequenceItem, Shape, Settings } from "../types";
import { calculatePathTime } from "../utils";
import _ from "lodash";

export interface ProjectData {
  startPoint: Point;
  lines: Line[];
  sequence: SequenceItem[];
  shapes: Shape[];
  settings: Settings;
}

export interface DiffResult {
  addedLines: Line[];
  removedLines: Line[];
  changedLines: { old: Line; new: Line }[];
  sameLines: Line[];

  statsDiff: {
    time: { old: number; new: number; diff: number };
    distance: { old: number; new: number; diff: number };
  };

  eventDiff: {
    added: string[];
    removed: string[];
    changed: string[];
  };
}

export const diffMode = writable(false);
export const committedData = writable<ProjectData | null>(null);
export const diffResult = writable<DiffResult | null>(null);
export const isLoadingDiff = writable(false);

export async function toggleDiff() {
  const currentMode = get(diffMode);

  if (currentMode) {
    // Turn off
    diffMode.set(false);
    committedData.set(null);
    diffResult.set(null);
  } else {
    // Turn on
    const filePath = get(currentFilePath);
    if (!filePath) {
      console.warn("No file path to diff against");
      return;
    }

    const api = (window as any).electronAPI;
    if (!api || !api.gitShow) {
      console.warn("Git integration not available");
      return;
    }

    try {
      isLoadingDiff.set(true);
      const content = await api.gitShow(filePath);

      if (!content) {
        console.warn("Failed to fetch committed version");
        isLoadingDiff.set(false);
        return;
      }

      const parsed = JSON.parse(content);

      // Normalize data similar to projectStore.loadProjectData
      const normalizedCommitted: ProjectData = {
        startPoint: parsed.startPoint || { x: 0, y: 0, heading: "tangential", reverse: false },
        lines: normalizeLines(parsed.lines || []),
        sequence: parsed.sequence || [],
        shapes: parsed.shapes || [],
        settings: { ...get(settingsStore), ...parsed.settings }, // Merge with current settings as fallback? Or use parsed
      };

      committedData.set(normalizedCommitted);

      // Compute Diff
      const current: ProjectData = {
        startPoint: get(startPointStore),
        lines: get(linesStore),
        sequence: get(sequenceStore),
        shapes: get(shapesStore),
        settings: get(settingsStore),
      };

      const result = computeDiff(current, normalizedCommitted);
      diffResult.set(result);

      diffMode.set(true);
    } catch (err) {
      console.error("Error toggling diff mode:", err);
    } finally {
      isLoadingDiff.set(false);
    }
  }
}

function computeDiff(current: ProjectData, old: ProjectData): DiffResult {
  const result: DiffResult = {
    addedLines: [],
    removedLines: [],
    changedLines: [],
    sameLines: [],
    statsDiff: {
      time: { old: 0, new: 0, diff: 0 },
      distance: { old: 0, new: 0, diff: 0 },
    },
    eventDiff: {
      added: [],
      removed: [],
      changed: [],
    },
  };

  // 1. Compare Lines
  const currentLinesMap = new Map(current.lines.map(l => [l.id, l]));
  const oldLinesMap = new Map(old.lines.map(l => [l.id, l]));

  // Check for added and changed/same
  current.lines.forEach(line => {
    const oldLine = oldLinesMap.get(line.id);
    if (!oldLine) {
      result.addedLines.push(line);
    } else {
      if (areLinesEqual(line, oldLine)) {
        result.sameLines.push(line);
      } else {
        result.changedLines.push({ old: oldLine, new: line });
      }
    }
  });

  // Check for removed
  old.lines.forEach(line => {
    if (!currentLinesMap.has(line.id)) {
      result.removedLines.push(line);
    }
  });

  // 2. Stats Diff
  const currentStats = calculatePathTime(current.startPoint, current.lines, current.settings, current.sequence);
  const oldStats = calculatePathTime(old.startPoint, old.lines, old.settings, old.sequence);

  result.statsDiff = {
    time: {
      old: oldStats.totalTime,
      new: currentStats.totalTime,
      diff: currentStats.totalTime - oldStats.totalTime
    },
    distance: {
      old: oldStats.totalDistance,
      new: currentStats.totalDistance,
      diff: currentStats.totalDistance - oldStats.totalDistance
    }
  };

  // 3. Event Diff
  // This is complex because events can be on lines or in sequence (wait/rotate)
  // We can collect all event markers and sequence wait/rotates and compare them.
  // For simplicity, let's compare the timeline event names or similar.
  // But user wants "event changes".
  // Let's list events by ID or Name.

  const getEventSignatures = (data: ProjectData) => {
    const sigs = new Map<string, string>(); // ID -> Description

    // Line markers
    data.lines.forEach((l, lIdx) => {
      l.eventMarkers?.forEach((m, mIdx) => {
        sigs.set(m.id || `line-${l.id}-m-${mIdx}`, `Marker "${m.name}" on ${l.name || 'Path ' + (lIdx+1)}`);
      });
    });

    // Sequence events (wait/rotate and their markers)
    data.sequence.forEach(s => {
      if (s.kind === 'wait' || s.kind === 'rotate') {
        const desc = s.kind === 'wait' ? `Wait "${s.name}"` : `Rotate "${s.name}"`;
        // We track the item itself as an event-like thing? Or just markers ON it?
        // The prompt says "event changes". Usually implies markers.
        // But let's track the sequence items too as they affect timeline.
        sigs.set(s.id, desc);

        s.eventMarkers?.forEach((m, mIdx) => {
          sigs.set(m.id || `seq-${s.id}-m-${mIdx}`, `Marker "${m.name}" on ${s.name}`);
        });
      }
    });
    return sigs;
  };

  const currentEvents = getEventSignatures(current);
  const oldEvents = getEventSignatures(old);

  currentEvents.forEach((desc, id) => {
    if (!oldEvents.has(id)) {
      result.eventDiff.added.push(desc);
    } else {
      // Check if description changed? (e.g. name changed)
      const oldDesc = oldEvents.get(id);
      if (oldDesc !== desc) {
        result.eventDiff.changed.push(`${oldDesc} -> ${desc}`);
      }
      // Ideally we check properties like position, but keeping it simple for now.
    }
  });

  oldEvents.forEach((desc, id) => {
    if (!currentEvents.has(id)) {
      result.eventDiff.removed.push(desc);
    }
  });

  return result;
}

function areLinesEqual(l1: Line, l2: Line): boolean {
  // Deep compare relevant fields for path geometry and major properties
  // Exclude things that don't affect the path visually or functionally significantly if we want "Same" to be strict
  // Let's use strict deep equality on relevant fields.

  const clean = (l: Line) => ({
    endPoint: l.endPoint,
    controlPoints: l.controlPoints,
    // waitBefore/After affect timing but not path geometry.
    // If we want "Same" (Blue) to mean "Identical Path Geometry", we ignore waits.
    // If we want "Identical Object", we include them.
    // Given "Old = red, new = green" usually refers to geometry in CAD/path tools,
    // maybe we focus on geometry.
    // BUT, the prompt says "event changes" separately.
    // Let's stick to geometry + basic props for the "Blue" line check.

    // Actually, if I just compare the whole object (minus dynamic props if any), it's safer.
    // Using lodash isEqual.
  });

  // We should probably exclude 'selected', 'id' (we know match), etc if they were dynamic.
  // But store data should be clean.
  return _.isEqual(l1.endPoint, l2.endPoint) &&
         _.isEqual(l1.controlPoints, l2.controlPoints) &&
         l1.name === l2.name;
}
