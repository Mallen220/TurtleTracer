// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  linesStore,
  sequenceStore,
  startPointStore,
  settingsStore,
  renumberDefaultPathNames,
} from "../../projectStore";
import { copyName, duplicateStep } from "../../sequenceOperations";
import { selectedLineId, selectedPointId, notification } from "../../../stores";
import type { Line, SequenceItem } from "../../../types/index";
import { isUIElementFocused, getSelectedSequenceIndex } from "./utils";
import { parseSelectionId, findSequenceItem } from "./itemUtils";
import { makeId } from "../../../utils/nameGenerator";

type WaitOrRotate = "wait" | "rotate";

// What the copy/cut/paste shortcuts are holding. This is separate from the
// system clipboard.
let clipboard: SequenceItem | Line | null = null;

export const getClipboard = () => clipboard;

function getWaitOrRotateKind(item: SequenceItem): WaitOrRotate | null {
  return item.kind === "wait" || item.kind === "rotate" ? item.kind : null;
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

/** Ctrl+D: copies the selected wait, turn or path right after it. */
export function duplicate(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const sel = get(selectedPointId);
  if (!sel) return;

  const sequence = get(sequenceStore);
  const lines = get(linesStore);
  const info = parseSelectionId(sel);

  let index: number | null;
  if (info.type === "wait" || info.type === "rotate") {
    index = getSelectedSequenceIndex();
  } else {
    const line = getTargetLine(sel, lines);
    index = sequence.findIndex(
      (s) => s.kind === "path" && s.lineId === line?.id,
    );
  }
  if (index === null || index < 0) return;

  const { fieldWidth, fieldHeight } = get(settingsStore);
  const result = duplicateStep(
    { startPoint: get(startPointStore), lines, sequence },
    index,
    { width: fieldWidth ?? 144, height: fieldHeight ?? 144 },
  );
  if (!result) return;

  linesStore.set(result.lines);
  sequenceStore.set(result.sequence);
  const { copy } = result;
  if (copy.kind === "path") {
    selectedLineId.set(copy.lineId);
    const lineNum = result.lines.findIndex((l) => l.id === copy.lineId) + 1;
    selectedPointId.set(`point-${lineNum}-0`);
  } else if (copy.kind === "wait" || copy.kind === "rotate") {
    selectedPointId.set(`${copy.kind}-${copy.id}`);
  }
  recordChange("Duplicate Selection");
}

/** The tabs that copy their own content (code, table) instead of a selection. */
type CopySource = { copyCode?: () => void; copyTable?: () => void } | null;

export function copy(activeControlTab: string, controlTabRef?: CopySource) {
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
  controlTabRef: CopySource | undefined,
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
      .findLast((s) => s.kind === "path");
    lineIndex = pathBefore
      ? lines.findIndex((l) => l.id === pathBefore.lineId)
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
