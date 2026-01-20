// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { writable, get } from "svelte/store";
import type {
  Line,
  Point,
  SequenceItem,
  Shape,
  Settings,
  SequencePathItem,
  PedroData,
} from "../types";
import {
  getDefaultStartPoint,
  getDefaultLines,
  getDefaultShapes,
  DEFAULT_SETTINGS,
} from "../config";
import { getRandomColor } from "../utils";
import { regenerateProjectMacros } from "./macroUtils";
import { notification } from "../stores";

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
  const missing = lines.filter(
    (l) => !presentIds.has(l.id) && !l.isMacroElement,
  );

  return [
    ...pruned,
    ...missing.map((l) => ({ kind: "path", lineId: l.id }) as SequencePathItem),
  ];
}

// Helper: renumber default path names to match display order
export function renumberDefaultPathNames(lines: Line[]): Line[] {
  return lines.map((l, idx) => {
    if (/^Path \d+$/.test(l.name || "")) {
      return { ...l, name: `Path ${idx + 1}` };
    }
    return l;
  });
}

// Create writable stores for the project state
export const startPointStore = writable<Point>(getDefaultStartPoint());

// Ensure we use the exact same default lines instance for both linesStore and sequenceStore
// to prevent ID mismatches when getDefaultLines() generates random IDs.
const initialDefaultLines = normalizeLines(getDefaultLines());

export const linesStore = writable<Line[]>(initialDefaultLines);
export const shapesStore = writable<Shape[]>(getDefaultShapes());

export const sequenceStore = writable<SequenceItem[]>(
  initialDefaultLines.map((ln) => ({
    kind: "path",
    lineId: ln.id!,
  })),
);
export const settingsStore = writable<Settings>({ ...DEFAULT_SETTINGS });
export const extraDataStore = writable<Record<string, any>>({});
export const macrosStore = writable<Map<string, PedroData>>(new Map());

// Track currently loading macros to prevent infinite recursion
const loadingMacros = new Set<string>();

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
  extraDataStore.set({});
  macrosStore.set(new Map());
  // We don't reset settings usually, or maybe we do?
  // The original App.svelte reset code:
  // startPoint = getDefaultStartPoint();
  // lines = normalizeLines(getDefaultLines());
  // sequence = ...
  // shapes = getDefaultShapes();
  // currentFilePath.set(null);
}

export function updateMacroContent(filePath: string, data: PedroData) {
  macrosStore.update((map) => {
    const newMap = new Map(map);
    // Normalize before storing
    if (data.lines) {
      data.lines = normalizeLines(data.lines);
    }
    newMap.set(filePath, data);
    return newMap;
  });
  refreshMacros();
}

export function refreshMacros() {
  const lines = get(linesStore);
  const sequence = get(sequenceStore);
  const startPoint = get(startPointStore);
  const macros = get(macrosStore);

  // Optimization: Check if any macros exist before doing heavy work
  const hasMacro = sequence.some((s) => s.kind === "macro");
  if (!hasMacro) return;

  try {
    const result = regenerateProjectMacros(startPoint, lines, sequence, macros);

    const oldLinesJson = JSON.stringify(lines);
    const newLinesJson = JSON.stringify(result.lines);

    if (oldLinesJson !== newLinesJson) {
      linesStore.set(result.lines);
    }

    const oldSeqJson = JSON.stringify(sequence);
    const newSeqJson = JSON.stringify(result.sequence);

    if (oldSeqJson !== newSeqJson) {
      sequenceStore.set(result.sequence);
    }
  } catch (error: any) {
    console.error("Failed to regenerate macros:", error);
    notification.set({
      message: `Macro Error: ${error.message}`,
      type: "error",
      timeout: 5000,
    });
  }
}

export async function loadMacro(filePath: string, force = false) {
  // Check if already loaded
  const currentMacros = get(macrosStore);
  if (!force && currentMacros.has(filePath)) {
    refreshMacros();
    return;
  }

  // Prevent infinite recursion during loading cycle
  if (loadingMacros.has(filePath)) {
    console.warn(`[projectStore] Cyclic dependency detected while loading: ${filePath}`);
    return;
  }

  loadingMacros.add(filePath);

  // Use electronAPI to read file
  const api = (window as any).electronAPI;
  if (api && api.readFile) {
    try {
      const content = await api.readFile(filePath);
      const data = JSON.parse(content);
      // Validate data
      if (data.startPoint && data.lines) {
        // Normalize lines in macro
        data.lines = normalizeLines(data.lines);
        macrosStore.update((map) => {
          const newMap = new Map(map);
          newMap.set(filePath, data);
          return newMap;
        });
        console.log(`[projectStore] Loaded macro: ${filePath}`);

        // Recursively load any macros nested within this macro
        const promises: Promise<void>[] = [];
        if (data.sequence && data.sequence.length > 0) {
          data.sequence.forEach((item: SequenceItem) => {
            if (item.kind === "macro") {
              promises.push(loadMacro(item.filePath));
            }
          });
        }
        await Promise.all(promises);

        refreshMacros();
      }
    } catch (e) {
      console.error("Failed to load macro:", filePath, e);
    } finally {
      loadingMacros.delete(filePath);
    }
  } else {
    loadingMacros.delete(filePath);
  }
}

export async function loadProjectData(data: any) {
  const sp = data.startPoint || {
    x: 72,
    y: 72,
    heading: "tangential",
    reverse: false,
  };
  startPointStore.set(sp);

  // Helper to strip " (##)" suffix from names to restore linkage
  const stripSuffix = (name?: string) => {
    if (!name) return name ?? "";
    const match = name.match(/^(.*) \(\d+\)$/);
    return match ? match[1] : name;
  };

  const normLines = normalizeLines(data.lines || []).map((l) => {
    const baseName = l._linkedName ?? l.name;
    return {
      ...l,
      name: stripSuffix(baseName),
      waitBeforeName: stripSuffix(l.waitBeforeName),
      waitAfterName: stripSuffix(l.waitAfterName),
    };
  });

  // Sanitize sequence with respect to normalized lines and set both stores
  const seqCandidate = (
    data.sequence && data.sequence.length
      ? data.sequence
      : normLines.map((ln) => ({ kind: "path", lineId: ln.id! }))
  ) as SequenceItem[];

  // Also apply name stripping to sequence items (waits)
  const processedSeq = seqCandidate.map((s) => {
    if (s.kind === "wait") {
      const newWait = { ...s };
      const baseName = (newWait as any)._linkedName ?? newWait.name;
      newWait.name = stripSuffix(baseName);
      return newWait;
    }
    return s;
  });

  const sanitized = sanitizeSequence(normLines, processedSeq);

  // Renumber default names to match displayed order
  const renamedLines = renumberDefaultPathNames(normLines);

  linesStore.set(renamedLines);
  shapesStore.set(data.shapes || []);
  sequenceStore.set(sanitized);
  extraDataStore.set(data.extraData || {});

  // Load referenced macros
  const promises: Promise<void>[] = [];
  sanitized.forEach((item) => {
    if (item.kind === "macro") {
      promises.push(loadMacro(item.filePath));
    }
  });

  // Wait for macros to load before refreshing to prevent flickering/clearing
  if (promises.length > 0) {
    await Promise.all(promises);
  }

  // Refresh macros immediately in case they are already loaded
  refreshMacros();

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
