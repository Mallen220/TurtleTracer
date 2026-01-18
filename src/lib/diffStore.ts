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
import type { Line, Point, SequenceItem, Shape, Settings, EventMarker } from "../types";
import { calculatePathTime } from "../utils";
import _ from "lodash";

export interface ProjectData {
  startPoint: Point;
  lines: Line[];
  sequence: SequenceItem[];
  shapes: Shape[];
  settings: Settings;
}

export interface EventChangeDetail {
  property: string;
  oldVal: string | number;
  newVal: string | number;
}

export interface EventChange {
  id: string;
  name: string;
  parentName?: string;
  changeType: "added" | "removed" | "changed";
  description: string;
  details?: EventChangeDetail[];
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

  eventDiff: EventChange[];
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
        settings: { ...get(settingsStore), ...parsed.settings }, // Merge with current settings as fallback
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

interface MarkerInfo {
  id: string;
  name: string;
  parentName: string;
  position: number;
}

function extractMarkers(data: ProjectData): Map<string, MarkerInfo> {
  const markers = new Map<string, MarkerInfo>();

  // Helper to add marker
  const add = (m: EventMarker, parentName: string) => {
    // If id is missing, generate one based on parent and index?
    // Ideally markers have IDs. If not, we might have trouble matching.
    // Assuming they have IDs or we fallback to name.
    const id = m.id || `${parentName}-${m.name}-${m.position}`;
    markers.set(id, {
      id,
      name: m.name,
      parentName,
      position: m.position
    });
  };

  // Line markers
  data.lines.forEach((l, idx) => {
    const parentName = l.name || `Path ${idx + 1}`;
    l.eventMarkers?.forEach(m => add(m, parentName));
  });

  // Sequence markers
  data.sequence.forEach((s) => {
    if (s.kind === 'wait' || s.kind === 'rotate') {
      const parentName = s.name || (s.kind === 'wait' ? 'Wait' : 'Rotate');
      s.eventMarkers?.forEach(m => add(m, parentName));
    }
  });

  return markers;
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
    eventDiff: [],
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
  const currentMarkers = extractMarkers(current);
  const oldMarkers = extractMarkers(old);

  // Added & Changed
  currentMarkers.forEach((m, id) => {
    const oldM = oldMarkers.get(id);
    if (!oldM) {
      result.eventDiff.push({
        id,
        name: m.name,
        parentName: m.parentName,
        changeType: "added",
        description: `Added "${m.name}" to ${m.parentName} at ${(m.position * 100).toFixed(0)}%`
      });
    } else {
      const changes: string[] = [];
      const details: EventChangeDetail[] = [];

      if (m.name !== oldM.name) {
        changes.push(`renamed to "${m.name}"`);
        details.push({ property: "Name", oldVal: oldM.name, newVal: m.name });
      }
      if (m.parentName !== oldM.parentName) {
        changes.push(`moved to ${m.parentName}`);
        details.push({
          property: "Location",
          oldVal: oldM.parentName,
          newVal: m.parentName,
        });
      }

      const posDiff = m.position - oldM.position;
      if (Math.abs(posDiff) > 0.005) {
        // 0.5% tolerance
        changes.push(
          `position changed ${(oldM.position * 100).toFixed(0)}% -> ${(m.position * 100).toFixed(0)}%`,
        );
        details.push({
          property: "Position",
          oldVal: `${(oldM.position * 100).toFixed(0)}%`,
          newVal: `${(m.position * 100).toFixed(0)}%`,
        });
      }

      if (changes.length > 0) {
        result.eventDiff.push({
          id,
          name: m.name,
          parentName: m.parentName,
          changeType: "changed",
          description: `Changed "${oldM.name}": ${changes.join(", ")}`,
          details,
        });
      }
    }
  });

  // Removed
  oldMarkers.forEach((m, id) => {
    if (!currentMarkers.has(id)) {
      result.eventDiff.push({
        id,
        name: m.name,
        parentName: m.parentName,
        changeType: "removed",
        description: `Removed "${m.name}" from ${m.parentName}`
      });
    }
  });

  return result;
}

function areLinesEqual(l1: Line, l2: Line): boolean {
  return _.isEqual(l1.endPoint, l2.endPoint) &&
         _.isEqual(l1.controlPoints, l2.controlPoints) &&
         l1.name === l2.name;
}
