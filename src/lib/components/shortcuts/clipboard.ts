// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  linesStore,
  sequenceStore,
  startPointStore,
  renumberDefaultPathNames,
} from "../../projectStore";
import { selectedLineId, selectedPointId, notification } from "../../../stores";
import { actionRegistry } from "../../actionRegistry";
import type { Line, SequenceItem } from "../../../types/index";
import { isUIElementFocused, getSelectedSequenceIndex } from "./utils";
import { parseSelectionId, findSequenceItem } from "./itemUtils";
import { makeId, generateName } from "../../../utils/nameGenerator";

type WaitOrRotate = "wait" | "rotate";

// What the copy/cut/paste shortcuts are holding. This is separate from the
// system clipboard.
export let clipboard: SequenceItem | Line | null = null;

// Unnamed items stay unnamed when copied.
function copyName(name: string | undefined, existingNames: string[]) {
  return name?.trim() ? generateName(name, existingNames) : "";
}

function getWaitOrRotateKind(item: SequenceItem): WaitOrRotate | null {
  const def = actionRegistry.get(item.kind);
  if (def?.isWait) return "wait";
  if (def?.isRotate) return "rotate";
  return null;
}

/** A copy of a wait/rotate item with a new id and a name that doesn't clash. */
function cloneSequenceItem(
  item: SequenceItem,
  kind: WaitOrRotate,
  sequence: SequenceItem[],
): SequenceItem & { id: string } {
  const existingNames = sequence
    .filter((s) => getWaitOrRotateKind(s) === kind)
    .map((s) => (s as { name?: string }).name || "");
  return {
    ...structuredClone(item),
    id: makeId(),
    name: copyName((item as { name?: string }).name, existingNames),
  } as SequenceItem & { id: string };
}

/** A copy of a line with a new id and a name that doesn't clash. */
function cloneLine(line: Line, lines: Line[]): Line {
  return {
    ...structuredClone(line),
    id: makeId("line"),
    name: copyName(
      line.name,
      lines.map((l) => l.name || ""),
    ),
  };
}

/** The selected line, whether it was selected directly or via one of its points. */
function getTargetLine(selection: string, lines: Line[]): Line | undefined {
  const lineId = get(selectedLineId);
  if (lineId) return lines.find((l) => l.id === lineId);

  const info = parseSelectionId(selection);
  if (info.type === "point" && info.lineNum > 0) return lines[info.lineNum - 1];
  return undefined;
}

function insertAfter<T>(items: T[], index: number | null, item: T): T[] {
  if (index === null) return [...items, item];
  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
}

export function duplicate(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const sel = get(selectedPointId);
  if (!sel) return;

  const sequence = get(sequenceStore);
  const lines = get(linesStore);
  const info = parseSelectionId(sel);

  if (info.type === "wait" || info.type === "rotate") {
    const item = findSequenceItem(sequence, info.id, info.type);
    const insertIdx = getSelectedSequenceIndex();
    if (!item || insertIdx === null) return;

    const newItem = cloneSequenceItem(item, info.type, sequence);
    sequenceStore.set(insertAfter(sequence, insertIdx, newItem));
    selectedPointId.set(`${info.type}-${newItem.id}`);
    recordChange("Duplicate Selection");
    return;
  }

  const originalLine = getTargetLine(sel, lines);
  if (!originalLine) return;
  const lineIndex = lines.indexOf(originalLine);

  // The copy makes the same move again, starting from where the original ends.
  const start =
    lineIndex > 0 ? lines[lineIndex - 1].endPoint : get(startPointStore);
  const dx = originalLine.endPoint.x - start.x;
  const dy = originalLine.endPoint.y - start.y;

  const newLine = cloneLine(originalLine, lines);
  for (const p of [newLine.endPoint, ...newLine.controlPoints]) {
    p.x += dx;
    p.y += dy;
  }

  linesStore.set(
    renumberDefaultPathNames(insertAfter(lines, lineIndex, newLine)),
  );

  const seqIdx = sequence.findIndex(
    (s) =>
      actionRegistry.get(s.kind)?.isPath &&
      (s as { lineId?: string }).lineId === originalLine.id,
  );
  sequenceStore.set(
    insertAfter(sequence, seqIdx === -1 ? null : seqIdx, {
      kind: "path",
      lineId: newLine.id!,
    }),
  );

  selectedLineId.set(newLine.id!);
  selectedPointId.set(`point-${lineIndex + 2}-0`);
  recordChange("Duplicate Selection");
}

export function copy(activeControlTab: string, controlTabRef: any) {
  if (isUIElementFocused()) return;

  // The code and table tabs copy their own contents instead.
  if (activeControlTab === "code" && controlTabRef?.copyCode) {
    controlTabRef.copyCode();
    return;
  }
  if (activeControlTab === "table" && controlTabRef?.copyTable) {
    controlTabRef.copyTable();
    return;
  }

  const sel = get(selectedPointId);
  if (!sel) return;

  const info = parseSelectionId(sel);
  let copied: SequenceItem | Line | undefined;
  if (info.type === "wait" || info.type === "rotate") {
    copied = findSequenceItem(get(sequenceStore), info.id, info.type);
  } else {
    copied = getTargetLine(sel, get(linesStore));
  }
  if (!copied) return;

  clipboard = structuredClone(copied);
  notification.set({
    message: "Selection copied",
    type: "info",
    timeout: 1500,
  });
}

export function cut(
  activeControlTab: string,
  controlTabRef: any,
  removeSelected: () => void,
) {
  if (isUIElementFocused()) return;
  copy(activeControlTab, controlTabRef);
  removeSelected();
  notification.set({
    message: "Selection cut",
    type: "info",
    timeout: 1500,
  });
}

export function paste(recordChange: (action?: string) => void) {
  if (isUIElementFocused() || !clipboard) return;

  const sequence = get(sequenceStore);
  const lines = get(linesStore);
  const insertIdx = getSelectedSequenceIndex();

  if ("kind" in clipboard) {
    const kind = getWaitOrRotateKind(clipboard);
    if (!kind) return;

    const newItem = cloneSequenceItem(clipboard, kind, sequence);
    sequenceStore.set(insertAfter(sequence, insertIdx, newItem));
    selectedPointId.set(`${kind}-${newItem.id}`);
    recordChange("Paste");
    notification.set({
      message: kind === "wait" ? "Wait pasted" : "Rotate pasted",
      type: "success",
      timeout: 1500,
    });
    return;
  }

  const newLine = cloneLine(clipboard, lines);

  // Put the line after the last path at or before the selected sequence item
  // (or at the very start if there isn't one).
  let lineIndex = lines.length - 1;
  if (insertIdx !== null) {
    const pathBefore = sequence
      .slice(0, insertIdx + 1)
      .findLast((s) => actionRegistry.get(s.kind)?.isPath);
    lineIndex = pathBefore
      ? lines.findIndex(
          (l) => l.id === (pathBefore as { lineId?: string }).lineId,
        )
      : -1;
  }

  linesStore.set(
    renumberDefaultPathNames([
      ...lines.slice(0, lineIndex + 1),
      newLine,
      ...lines.slice(lineIndex + 1),
    ]),
  );
  sequenceStore.set(
    insertAfter(sequence, insertIdx, { kind: "path", lineId: newLine.id! }),
  );

  selectedLineId.set(newLine.id!);
  recordChange("Paste");
  notification.set({
    message: "Path pasted",
    type: "success",
    timeout: 1500,
  });
}
