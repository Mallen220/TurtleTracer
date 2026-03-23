import { get } from "svelte/store";
import {
  linesStore,
  sequenceStore,
  startPointStore,
  renumberDefaultPathNames
} from "../../projectStore";
import {
  selectedLineId,
  selectedPointId,
  notification
} from "../../../stores";
import { actionRegistry } from "../../actionRegistry";
import type { Line, SequenceItem } from "../../../types/index";
import { isUIElementFocused, getSelectedSequenceIndex } from "./utils";

// Internal clipboard state for shortcuts
export let clipboard: SequenceItem | Line | null = null;

// Helper to generate unique name
export const generateName = (baseName: string, existingNames: string[]) => {
  // Regex to match "Name duplicate" or "Name duplicate N"
  const match = baseName.match(/^(.*?) duplicate(?: (\d+))?$/);

  let rootName = baseName;
  let startNum = 1;

  if (match) {
    rootName = match[1];
    startNum = match[2] ? parseInt(match[2], 10) : 1;
    startNum++;
  }

  // Try candidates starting from the determined number
  let candidate = "";
  let i = startNum;

  // Safety/Sanity: loop limit to prevent infinite hangs in weird edge cases
  while (i < 1000) {
    if (i === 1) {
      candidate = rootName + " duplicate";
    } else {
      candidate = rootName + " duplicate " + i;
    }

    if (!existingNames.includes(candidate)) {
      return candidate;
    }
    i++;
  }
  return rootName + " duplicate " + Date.now(); // Fallback
};

export function duplicate(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const sel = get(selectedPointId);
  const sequence = get(sequenceStore);
  const lines = get(linesStore);
  const startPoint = get(startPointStore);

  if (!sel) return;

  if (sel.startsWith("wait-")) {
    const waitId = sel.substring(5);
    const waitItem = sequence.find(
      (s) => actionRegistry.get(s.kind)?.isWait && (s as any).id === waitId,
    ) as any;
    if (!waitItem) return;

    const newWait = structuredClone(waitItem);
    newWait.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const existingWaitNames = sequence
      .filter((s) => actionRegistry.get(s.kind)?.isWait)
      .map((s) => (s as any).name || "");
    // Preserve empty name when duplicating unnamed waits
    if (waitItem.name && waitItem.name.trim() !== "") {
      newWait.name = generateName(waitItem.name, existingWaitNames);
    } else {
      newWait.name = "";
    }

    const insertIdx = getSelectedSequenceIndex();
    if (insertIdx !== null) {
      sequenceStore.update((s) => {
        const s2 = [...s];
        s2.splice(insertIdx + 1, 0, newWait);
        return s2;
      });
      selectedPointId.set(`wait-${newWait.id}`);
      recordChange("Duplicate Selection");
    }
    return;
  }

  if (sel.startsWith("rotate-")) {
    const rotateId = sel.substring(7);
    const rotateItem = sequence.find(
      (s) =>
        actionRegistry.get(s.kind)?.isRotate && (s as any).id === rotateId,
    ) as any;
    if (!rotateItem) return;

    const newRotate = structuredClone(rotateItem);
    newRotate.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const existingRotateNames = sequence
      .filter((s) => actionRegistry.get(s.kind)?.isRotate)
      .map((s) => (s as any).name || "");
    // Preserve empty name when duplicating unnamed rotates
    if (rotateItem.name && rotateItem.name.trim() !== "") {
      newRotate.name = generateName(rotateItem.name, existingRotateNames);
    } else {
      newRotate.name = "";
    }

    const insertIdx = getSelectedSequenceIndex();
    if (insertIdx !== null) {
      sequenceStore.update((s) => {
        const s2 = [...s];
        s2.splice(insertIdx + 1, 0, newRotate);
        return s2;
      });
      selectedPointId.set(`rotate-${newRotate.id}`);
      recordChange("Duplicate Selection");
    }
    return;
  }

  // Path duplication
  let targetLineId: string | null = null;
  if (sel.startsWith("point-")) {
    const parts = sel.split("-");
    const lineNum = Number(parts[1]);
    if (lineNum > 0) {
      targetLineId = lines[lineNum - 1].id || null;
    }
  }
  if (get(selectedLineId)) targetLineId = get(selectedLineId);

  if (targetLineId) {
    const lineIndex = lines.findIndex((l) => l.id === targetLineId);
    if (lineIndex === -1) return;
    const originalLine = lines[lineIndex];

    // Calculate relative offset
    // Previous point (start of original line)
    let prevPoint: { x: number; y: number } = startPoint;
    if (lineIndex > 0) {
      prevPoint = lines[lineIndex - 1].endPoint;
    }

    const deltaX = originalLine.endPoint.x - prevPoint.x;
    const deltaY = originalLine.endPoint.y - prevPoint.y;

    const newLine = structuredClone(originalLine);
    newLine.id = `line-${Math.random().toString(36).slice(2)}`;

    // Update name (preserve empty name if original was unnamed)
    const existingLineNames = lines.map((l) => l.name || "");
    if (originalLine.name && originalLine.name.trim() !== "") {
      newLine.name = generateName(originalLine.name, existingLineNames);
    } else {
      newLine.name = "";
    }

    // Apply offset to endPoint
    newLine.endPoint.x += deltaX;
    newLine.endPoint.y += deltaY;

    // Apply offset to control points
    newLine.controlPoints.forEach((cp) => {
      cp.x += deltaX;
      cp.y += deltaY;
    });

    // Insert line
    linesStore.update((l) => {
      const newLines = [...l];
      newLines.splice(lineIndex + 1, 0, newLine);
      return renumberDefaultPathNames(newLines);
    });

    // Insert into sequence
    // Find original line's sequence index
    const seqIdx = sequence.findIndex(
      (s) =>
        actionRegistry.get(s.kind)?.isPath &&
        (s as any).lineId === originalLine.id,
    );
    if (seqIdx !== -1) {
      sequenceStore.update((s) => {
        const s2 = [...s];
        s2.splice(seqIdx + 1, 0, { kind: "path", lineId: newLine.id! });
        return s2;
      });
    } else {
      // Fallback: append
      sequenceStore.update((s) => [
        ...s,
        { kind: "path", lineId: newLine.id! },
      ]);
    }

    selectedLineId.set(newLine.id!);
    selectedPointId.set(`point-${lineIndex + 2}-0`); // Selected the end point of new line
    recordChange("Duplicate Selection");
  }
}

export function copy(activeControlTab: string, controlTabRef: any) {
  if (isUIElementFocused()) return;

  // Context-aware copy
  if (activeControlTab === "code") {
    if (controlTabRef && controlTabRef.copyCode) {
      controlTabRef.copyCode();
      return;
    }
  } else if (activeControlTab === "table") {
    if (controlTabRef && controlTabRef.copyTable) {
      controlTabRef.copyTable();
      return;
    }
  }

  const sel = get(selectedPointId);
  const sequence = get(sequenceStore);
  const lines = get(linesStore);

  if (!sel) return;

  if (sel.startsWith("wait-")) {
    const waitId = sel.substring(5);
    const waitItem = sequence.find(
      (s) => actionRegistry.get(s.kind)?.isWait && (s as any).id === waitId,
    ) as any;
    if (waitItem) {
      clipboard = structuredClone(waitItem);
    }
    return;
  }

  if (sel.startsWith("rotate-")) {
    const rotateId = sel.substring(7);
    const rotateItem = sequence.find(
      (s) =>
        actionRegistry.get(s.kind)?.isRotate && (s as any).id === rotateId,
    ) as any;
    if (rotateItem) {
      clipboard = structuredClone(rotateItem);
    }
    return;
  }

  let targetLineId: string | null = null;
  if (sel.startsWith("point-")) {
    const parts = sel.split("-");
    const lineNum = Number(parts[1]);
    if (lineNum > 0) {
      targetLineId = lines[lineNum - 1].id || null;
    }
  }
  if (get(selectedLineId)) targetLineId = get(selectedLineId);

  if (targetLineId) {
    const line = lines.find((l) => l.id === targetLineId);
    if (line) {
      clipboard = structuredClone(line);
    }
  }

  if (clipboard) {
    notification.set({
      message: "Selection copied",
      type: "info",
      timeout: 1500,
    });
  }
}

export function cut(activeControlTab: string, controlTabRef: any, removeSelected: () => void) {
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
  if (isUIElementFocused()) return;
  if (!clipboard) return;

  const sequence = get(sequenceStore);
  const lines = get(linesStore);
  const startPoint = get(startPointStore);

  const clipKind = (clipboard as any).kind;
  const clipDef = clipKind ? actionRegistry.get(clipKind) : null;

  // Handle Wait
  if (clipDef?.isWait) {
    const waitItem = clipboard as SequenceItem;
    const newWait = structuredClone(waitItem) as any;
    newWait.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Generate unique name
    const existingWaitNames = sequence
      .filter((s) => actionRegistry.get(s.kind)?.isWait)
      .map((s) => (s as any).name || "");
    if (newWait.name && newWait.name.trim() !== "") {
      newWait.name = generateName(newWait.name, existingWaitNames);
    } else {
      newWait.name = "";
    }

    const insertIdx = getSelectedSequenceIndex();
    if (insertIdx !== null) {
      sequenceStore.update((s) => {
        const s2 = [...s];
        s2.splice(insertIdx + 1, 0, newWait);
        return s2;
      });
    } else {
      sequenceStore.update((s) => [...s, newWait]);
    }
    selectedPointId.set(`wait-${newWait.id}`);
    recordChange("Paste");
    notification.set({
      message: "Wait pasted",
      type: "success",
      timeout: 1500,
    });
    return;
  }

  // Handle Rotate
  if (clipDef?.isRotate) {
    const rotateItem = clipboard as SequenceItem;
    const newRotate = structuredClone(rotateItem) as any;
    newRotate.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Generate unique name
    const existingRotateNames = sequence
      .filter((s) => actionRegistry.get(s.kind)?.isRotate)
      .map((s) => (s as any).name || "");
    if (newRotate.name && newRotate.name.trim() !== "") {
      newRotate.name = generateName(newRotate.name, existingRotateNames);
    } else {
      newRotate.name = "";
    }

    const insertIdx = getSelectedSequenceIndex();
    if (insertIdx !== null) {
      sequenceStore.update((s) => {
        const s2 = [...s];
        s2.splice(insertIdx + 1, 0, newRotate);
        return s2;
      });
    } else {
      sequenceStore.update((s) => [...s, newRotate]);
    }
    selectedPointId.set(`rotate-${newRotate.id}`);
    recordChange("Paste");
    notification.set({
      message: "Rotate pasted",
      type: "success",
      timeout: 1500,
    });
    return;
  }

  // Handle Path (Line)
  // Line interface has 'id', 'endPoint', 'controlPoints'
  if (!(clipboard as any).kind && (clipboard as any).endPoint) {
    const originalLine = clipboard as Line;

    // Paste path: determine insertion point and clone the line

    // Determine insertion point
    const insertIdx = getSelectedSequenceIndex(); // index in sequence
    let prevPoint: { x: number; y: number } = startPoint;

    if (insertIdx !== null) {
      // Find path element at or before insertIdx
      for (let i = insertIdx; i >= 0; i--) {
        if (actionRegistry.get(sequence[i].kind)?.isPath) {
          const lineId = (sequence[i] as any).lineId;
          const l = lines.find((line) => line.id === lineId);
          if (l) {
            prevPoint = l.endPoint;
            break;
          }
        }
      }
    } else if (lines.length > 0) {
      prevPoint = lines[lines.length - 1].endPoint;
    }

    // Clone originalLine; the placement above accounts for insertion index.

    const newLine = structuredClone(originalLine);
    newLine.id = `line-${Math.random().toString(36).slice(2)}`;

    const existingLineNames = lines.map((l) => l.name || "");
    if (newLine.name && newLine.name.trim() !== "") {
      newLine.name = generateName(newLine.name, existingLineNames);
    } else {
      newLine.name = "";
    }

    // Insert
    if (insertIdx !== null) {
      // Find the last path item in sequence up to insertIdx.

      let insertionLineIndex = -1;
      for (let i = insertIdx; i >= 0; i--) {
        if (actionRegistry.get(sequence[i].kind)?.isPath) {
          const lid = (sequence[i] as any).lineId;
          insertionLineIndex = lines.findIndex((l) => l.id === lid);
          break;
        }
      }

      // If no path found before, insert at 0?
      // If found, insert after.
      if (insertionLineIndex === -1) {
        linesStore.update((l) => {
          const newLines = [...l];
          newLines.splice(0, 0, newLine);
          return renumberDefaultPathNames(newLines);
        });
      } else {
        linesStore.update((l) => {
          const newLines = [...l];
          newLines.splice(insertionLineIndex + 1, 0, newLine);
          return renumberDefaultPathNames(newLines);
        });
      }

      sequenceStore.update((s) => {
        const s2 = [...s];
        s2.splice(insertIdx + 1, 0, { kind: "path", lineId: newLine.id! });
        return s2;
      });
    } else {
      // Append
      linesStore.update((l) => renumberDefaultPathNames([...l, newLine]));
      sequenceStore.update((s) => [
        ...s,
        { kind: "path", lineId: newLine.id! },
      ]);
    }

    selectedLineId.set(newLine.id!);
    // select end point after paste and record change.
    recordChange("Paste");
    notification.set({
      message: "Path pasted",
      type: "success",
      timeout: 1500,
    });
  }
}
