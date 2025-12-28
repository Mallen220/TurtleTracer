import { writable, get } from "svelte/store";
import type { Line, Point, SequenceItem, Shape, Settings } from "../types";
import {
  getDefaultStartPoint,
  getDefaultLines,
  getDefaultShapes,
  DEFAULT_SETTINGS,
} from "../config";
import { getRandomColor } from "../utils";

export function normalizeLines(input: Line[]): Line[] {
  return (input || []).map((line) => ({
    ...line,
    id: line.id || `line-${Math.random().toString(36).slice(2)}`,
    controlPoints: line.controlPoints || [],
    eventMarkers: line.eventMarkers || [],
    color: line.color || getRandomColor(),
    name: line.name || "",
    waitBeforeMs: Math.max(
      0,
      Number(line.waitBeforeMs ?? line.waitBefore?.durationMs ?? 0),
    ),
    waitAfterMs: Math.max(
      0,
      Number(line.waitAfterMs ?? line.waitAfter?.durationMs ?? 0),
    ),
    waitBeforeName: line.waitBeforeName ?? line.waitBefore?.name ?? "",
    waitAfterName: line.waitAfterName ?? line.waitAfter?.name ?? "",
  }));
}

// Create writable stores for the project state
export const startPointStore = writable<Point>(getDefaultStartPoint());
export const linesStore = writable<Line[]>(normalizeLines(getDefaultLines()));
export const shapesStore = writable<Shape[]>(getDefaultShapes());
// We need to initialize sequence store after lines, but for now we'll just set it to default
// dependent on lines. Since this is a module, we can't easily access the initial lines value
// if it were dynamic, but here we use defaults.
const initialLines = normalizeLines(getDefaultLines());
export const sequenceStore = writable<SequenceItem[]>(
  initialLines.map((ln) => ({
    kind: "path",
    lineId: ln.id!,
  }))
);
export const settingsStore = writable<Settings>({ ...DEFAULT_SETTINGS });

// Animation state
export const percentStore = writable(0);
export const playingStore = writable(false);
export const playbackSpeedStore = writable(1.0);
export const loopAnimationStore = writable(true);

// Robot State (derived or managed)
export const robotXYStore = writable({ x: 0, y: 0 });
export const robotHeadingStore = writable(0);

export function resetProject() {
  startPointStore.set(getDefaultStartPoint());
  const newLines = normalizeLines(getDefaultLines());
  linesStore.set(newLines);
  shapesStore.set(getDefaultShapes());
  sequenceStore.set(
    newLines.map((ln) => ({
      kind: "path",
      lineId: ln.id!,
    }))
  );
  // We don't reset settings usually, or maybe we do?
  // The original App.svelte reset code:
  // startPoint = getDefaultStartPoint();
  // lines = normalizeLines(getDefaultLines());
  // sequence = ...
  // shapes = getDefaultShapes();
  // currentFilePath.set(null);
}

export function loadProjectData(data: any) {
    const sp = data.startPoint || {
      x: 72,
      y: 72,
      heading: "tangential",
      reverse: false,
    };
    startPointStore.set(sp);

    const normLines = normalizeLines(data.lines || []);
    linesStore.set(normLines);

    shapesStore.set(data.shapes || []);

    const seq = (data.sequence && data.sequence.length
        ? data.sequence
        : normLines.map((ln) => ({
            kind: "path",
            lineId: ln.id!,
          }))) as SequenceItem[];
    sequenceStore.set(seq);

    // settings are usually loaded separately or merged?
    // In App.svelte loadData does NOT load settings from the file data usually,
    // except if it's a full project save.
    // The App.svelte `loadData` function DOES NOT update settings.
}
