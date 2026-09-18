// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Edits to the sequence that both the path list and the table offer.
import { get } from "svelte/store";
import type { Line, SequenceItem, SequenceMacroItem } from "../types";
import {
  loadMacro,
  macrosStore,
  renumberDefaultPathNames,
} from "./projectStore";
import { wouldCreateCycle } from "./macroUtils";
import { currentFilePath, notification } from "../stores";
import { makeId } from "../utils/nameGenerator";
import { isSupportedProjectFileName } from "../utils/fileExtensions";

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
