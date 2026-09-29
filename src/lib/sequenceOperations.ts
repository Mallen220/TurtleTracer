// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Edits to the sequence that both the path list and the table offer.
import { get } from "svelte/store";
import type { Line, Point, SequenceItem, SequenceMacroItem } from "../types";
import {
  loadMacro,
  macrosStore,
  renumberDefaultPathNames,
} from "./projectStore";
import { wouldCreateCycle } from "./macroUtils";
import { currentFilePath, notification } from "../stores";
import { generateName, makeId } from "../utils/nameGenerator";
import { FIELD_SIZE } from "../config";
import { isSupportedProjectFileName } from "../utils/fileExtensions";

const DEFAULT_FIELD = { width: FIELD_SIZE, height: FIELD_SIZE };

/** What identifies an item in the sequence: a path's line id, else its own id. */
export function sequenceItemKey(item: SequenceItem): string {
  return item.kind === "path" ? item.lineId : item.id;
}

/**
 * Chains or unchains the path at `index` to the one before it. Unchaining
 * clears the chain-wide heading of every path that was in that chain.
 */
export function toggleChain(
  lines: Line[],
  sequence: SequenceItem[],
  index: number,
): { lines: Line[]; sequence: SequenceItem[] } {
  const item = sequence[index];
  if (item?.kind !== "path") return { lines, sequence };
  const chain = !item.isChain;
  let newLines = [...lines];

  if (!chain) {
    const chainedToPrevious = (i: number) => {
      const s = sequence[i];
      return (
        s?.kind === "path" && !!s.isChain && sequence[i - 1]?.kind === "path"
      );
    };
    let first = index;
    while (first > 0 && chainedToPrevious(first)) first--;
    let last = index;
    while (chainedToPrevious(last + 1)) last++;

    const chainLineIds = new Set(
      sequence
        .slice(first, last + 1)
        .flatMap((s) => (s.kind === "path" ? [s.lineId] : [])),
    );
    newLines = newLines.map((l) =>
      chainLineIds.has(l.id!) && l.globalHeading !== undefined
        ? { ...l, globalHeading: undefined }
        : l,
    );
  }

  const newSequence = [...sequence];
  newSequence[index] = { ...item, isChain: chain };
  newLines = newLines.map((l) =>
    l.id === item.lineId ? { ...l, isChain: chain } : l,
  );
  return { lines: newLines, sequence: newSequence };
}

/** Paths are locked through their line; other items carry their own flag. */
export function isSequenceItemLocked(
  item: SequenceItem | undefined,
  lines: Line[],
): boolean {
  if (!item) return false;
  if (item.kind === "path") {
    return lines.find((l) => l.id === item.lineId)?.locked ?? false;
  }
  return (item as { locked?: boolean }).locked ?? false;
}

/**
 * The line indexes in the order their paths appear in the sequence. Lines
 * that aren't in the sequence keep their relative order at the end.
 */
export function lineOrderForSequence(
  lines: Line[],
  sequence: SequenceItem[],
): number[] {
  const indexById = new Map(lines.map((l, i) => [l.id, i]));
  const order: number[] = [];
  for (const item of sequence) {
    if (item.kind !== "path") continue;
    const index = indexById.get(item.lineId);
    if (index === undefined) continue;
    order.push(index);
    indexById.delete(item.lineId);
  }
  return [...order, ...indexById.values()];
}

/** Lines reordered to match the sequence, with default names renumbered. */
export function linesInSequenceOrder(
  lines: Line[],
  sequence: SequenceItem[],
): Line[] {
  return renumberDefaultPathNames(
    lineOrderForSequence(lines, sequence).map((i) => lines[i]),
  );
}

/**
 * Moves the item at `index` up (delta -1) or down (+1). Returns null if it
 * can't move: it's at the end, or it or its neighbour is locked.
 */
export function moveSequenceItem(
  sequence: SequenceItem[],
  lines: Line[],
  index: number,
  delta: number,
): SequenceItem[] | null {
  const target = index + delta;
  if (target < 0 || target >= sequence.length) return null;
  if (
    isSequenceItemLocked(sequence[index], lines) ||
    isSequenceItemLocked(sequence[target], lines)
  ) {
    return null;
  }

  const moved = [...sequence];
  const [item] = moved.splice(index, 1);
  moved.splice(target, 0, item);
  return moved;
}

function withoutMacroLink<T extends { macroId?: string }>(item: T): T {
  return { ...item, isMacroElement: false, macroId: undefined, locked: false };
}

/**
 * Turns a macro into ordinary, editable items: its lines stop being tied to
 * the macro file and its steps replace it in the sequence.
 */
export function unlinkMacro(
  lines: Line[],
  sequence: SequenceItem[],
  macro: SequenceMacroItem,
  seqIndex: number,
): { lines: Line[]; sequence: SequenceItem[] } {
  const newLines = lines.map((line) =>
    line.macroId === macro.id
      ? {
          ...withoutMacroLink(line),
          endPoint: withoutMacroLink(line.endPoint),
          controlPoints: line.controlPoints.map(withoutMacroLink),
        }
      : line,
  );
  const steps = (macro.sequence ?? []).map((item) => ({
    ...item,
    locked: false,
  }));
  const newSequence = [...sequence];
  newSequence.splice(seqIndex, 1, ...steps);
  return { lines: newLines, sequence: newSequence };
}

const MACRO_DRAG_TYPES = [
  "application/x-turtle-tracer-macro",
  "application/x-pedro-macro",
];

/** True if the drag carries something that can be added as a macro. */
export function isMacroDrag(e: DragEvent): boolean {
  const types = e.dataTransfer?.types ?? [];
  if (MACRO_DRAG_TYPES.some((t) => types.includes(t))) return true;
  const file = e.dataTransfer?.files?.[0];
  return !!file && isSupportedProjectFileName(file.name);
}

/**
 * Path of the project file being dropped: from the file manager, or from
 * the operating system (Electron exposes `path` on dropped files).
 */
export function getDroppedMacroPath(e: DragEvent): string | null {
  for (const type of MACRO_DRAG_TYPES) {
    const path = e.dataTransfer?.getData(type);
    if (path) return path;
  }
  const file = e.dataTransfer?.files?.[0] as
    | (File & { path?: string })
    | undefined;
  return file?.path || null;
}

/**
 * Inserts the project at `filePath` as a macro at `index`. Returns the new
 * sequence, or null (after telling the user) if the macro would end up
 * including the open project, which would recurse forever.
 */
export async function insertMacro(
  sequence: SequenceItem[],
  filePath: string,
  index: number,
): Promise<{ sequence: SequenceItem[]; macro: SequenceMacroItem } | null> {
  // Load it fresh so the cycle check sees its current macros.
  await loadMacro(filePath, true);

  const openFile = get(currentFilePath);
  if (openFile && wouldCreateCycle(filePath, openFile, get(macrosStore))) {
    notification.set({
      message: "Cannot add macro: this would create a recursive loop.",
      type: "error",
      timeout: 5000,
    });
    return null;
  }

  const fileName = filePath.split(/[\\/]/).pop() || "Macro";
  const macro: SequenceMacroItem = {
    kind: "macro",
    id: makeId(),
    filePath,
    name: fileName.replaceAll(/\.(pp|turt)$/gi, ""),
    locked: false,
  };
  const at = Math.max(0, Math.min(index, sequence.length));
  return {
    sequence: [...sequence.slice(0, at), macro, ...sequence.slice(at)],
    macro,
  };
}

/** A name for a copy that doesn't clash. Unnamed items stay unnamed. */
export function copyName(name: string | undefined, existingNames: string[]) {
  return name?.trim() ? generateName(name, existingNames) : "";
}

/**
 * A copy of the wait, turn or path at `index`, placed right after it. A
 * copied path makes the same move again from where the original ends, kept
 * on the field. Copies are unlocked and get names that don't clash. Returns
 * null for anything else (macros).
 */
export function duplicateStep(
  project: { startPoint: Point; lines: Line[]; sequence: SequenceItem[] },
  index: number,
  field = DEFAULT_FIELD,
): { lines: Line[]; sequence: SequenceItem[]; copy: SequenceItem } | null {
  const { startPoint, lines, sequence } = project;
  const item = sequence[index];
  const after = <T>(items: T[], i: number, value: T) =>
    items.toSpliced(i + 1, 0, value);

  if (item?.kind === "wait" || item?.kind === "rotate") {
    const names = sequence.flatMap((s) =>
      s.kind === item.kind ? [s.name] : [],
    );
    const copy = {
      ...structuredClone(item),
      id: makeId(),
      name: copyName(item.name, names),
      locked: false,
    };
    return { lines, sequence: after(sequence, index, copy), copy };
  }

  if (item?.kind !== "path") return null;
  const lineIndex = lines.findIndex((l) => l.id === item.lineId);
  const line = lines[lineIndex];
  if (!line) return null;

  const lineById = new Map(lines.map((l) => [l.id, l]));
  const previousPath = sequence
    .slice(0, index)
    .findLast((s) => s.kind === "path" && lineById.has(s.lineId));
  const start =
    previousPath?.kind === "path"
      ? lineById.get(previousPath.lineId)!.endPoint
      : startPoint;
  const dx = line.endPoint.x - start.x;
  const dy = line.endPoint.y - start.y;
  const shift = <P extends { x: number; y: number }>(p: P): P => ({
    ...p,
    x: Math.max(0, Math.min(field.width, p.x + dx)),
    y: Math.max(0, Math.min(field.height, p.y + dy)),
  });

  const copyLine: Line = {
    ...structuredClone(line),
    id: makeId(),
    name: copyName(
      line.name,
      lines.map((l) => l.name || ""),
    ),
    locked: false,
  };
  copyLine.endPoint = shift(copyLine.endPoint);
  copyLine.controlPoints = copyLine.controlPoints.map(shift);

  const copy: SequenceItem = { kind: "path", lineId: copyLine.id! };
  return {
    lines: renumberDefaultPathNames(after(lines, lineIndex, copyLine)),
    sequence: after(sequence, index, copy),
    copy,
  };
}
