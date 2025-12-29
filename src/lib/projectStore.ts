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

// Helper: sanitize sequence to remove references to non-existent lines and append any missing lines
export function sanitizeSequence(
  lines: Line[],
  seq: SequenceItem[] | undefined,
): SequenceItem[] {
  const candidate = Array.isArray(seq) ? [...seq] : [];
  const lineIds = new Set(lines.map((l) => l.id));

  // Remove path entries that reference lines not present
  const pruned = candidate.filter(
    (s) => s.kind !== "path" || lineIds.has((s as any).lineId),
  );

  // Append any lines that are missing from the sequence
  const presentIds = new Set(
    pruned.filter((s) => s.kind === "path").map((s) => (s as any).lineId),
  );
  const missing = lines.filter((l) => !presentIds.has(l.id));

  return [...pruned, ...missing.map((l) => ({ kind: "path", lineId: l.id }))];
}

// Helper: renumber default path names to match display order
export function renumberDefaultPathNames(lines: Line[]): Line[] {
  return lines.map((l, idx) => {
    if (/^Path \d+$/.test(l.name)) {
      return { ...l, name: `Path ${idx + 1}` };
    }
    return l;
  });
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
  })),
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
    })),
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

  // Sanitize sequence with respect to normalized lines and set both stores
  const seqCandidate = (
    data.sequence && data.sequence.length
      ? data.sequence
      : normLines.map((ln) => ({ kind: "path", lineId: ln.id! }))
  ) as SequenceItem[];

  const sanitized = sanitizeSequence(normLines, seqCandidate);

  // Renumber default names to match displayed order
  const renamedLines = renumberDefaultPathNames(normLines);

  linesStore.set(renamedLines);
  shapesStore.set(data.shapes || []);
  sequenceStore.set(sanitized);

  // settings are usually loaded separately or merged?
  // In App.svelte loadData does NOT load settings from the file data usually,
  // except if it's a full project save.
}

// Public repair function: ensure sequence and line names are consistent at runtime
export function ensureSequenceConsistency() {
  const lines = get(linesStore);
  const seq = get(sequenceStore);
  const sanitized = sanitizeSequence(lines, seq);

  if (JSON.stringify(sanitized) !== JSON.stringify(seq)) {
    console.warn("[projectStore] ensureSequenceConsistency: updating sequence");
    sequenceStore.set(sanitized);
  }

  const renamed = renumberDefaultPathNames(lines);
  if (JSON.stringify(renamed) !== JSON.stringify(lines)) {
    console.warn(
      "[projectStore] ensureSequenceConsistency: renaming default path names",
    );
    linesStore.set(renamed);
  }
}
// The App.svelte `loadData` function DOES NOT update settings.
