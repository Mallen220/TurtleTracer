// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import { linesStore, sequenceStore, startPointStore } from "../../projectStore";
import { selectedLineId, selectedPointId } from "../../../stores";
import { actionRegistry } from "../../actionRegistry";
import {
  updateLinkedWaits,
  updateLinkedRotations,
} from "../../../utils/pointLinking";
import type { Point } from "../../../types/index";
import { isUIElementFocused } from "./utils";

export function modifyValue(
  delta: number,
  recordChange: (action?: string) => void,
) {
  if (isUIElementFocused()) return;
  const current = get(selectedPointId);
  const sequence = get(sequenceStore);
  const lines = get(linesStore);
  if (!current) return;

  if (current.startsWith("wait-")) {
    const waitId = current.substring(5);
    const item = sequence.find(
      (s) => actionRegistry.get(s.kind)?.isWait && (s as any).id === waitId,
    ) as any;
    if (item) {
      if (item.locked) return; // Don't modify locked waits
      item.durationMs = Math.max(0, item.durationMs + delta * 100);
      // Update linked waits so waits that share a name keep the same duration
      sequenceStore.set(updateLinkedWaits(sequence, item.id));
      recordChange("Modify Duration");
    }
    return;
  }
  if (current.startsWith("rotate-")) {
    const rotateId = current.substring(7);
    const item = sequence.find(
      (s) => actionRegistry.get(s.kind)?.isRotate && (s as any).id === rotateId,
    ) as any;
    if (item) {
      if (item.locked) return; // Don't modify locked rotates
      const step = 5;
      item.degrees = Number((item.degrees + delta * step).toFixed(2));
      sequenceStore.set(updateLinkedRotations(sequence, item.id));
      recordChange("Modify Rotation");
    }
    return;
  }
  if (current.startsWith("event-wait-")) {
    const parts = current.split("-");
    const evIdx = Number(parts.pop());
    const waitId = parts.slice(2).join("-");

    const item = sequence.find(
      (s) => actionRegistry.get(s.kind)?.isWait && (s as any).id === waitId,
    ) as any;
    if (item && item.eventMarkers && item.eventMarkers[evIdx]) {
      if (item.locked) return; // Don't modify event markers on locked waits
      const step = 0.01 * delta;
      let newPos = item.eventMarkers[evIdx].position + step;
      newPos = Math.max(0, Math.min(1, newPos));
      item.eventMarkers[evIdx].position = newPos;
      sequenceStore.set(sequence);
      recordChange("Move Event Marker");
    }
    return;
  }
  if (current.startsWith("event-rotate-")) {
    const parts = current.split("-");
    const evIdx = Number(parts.pop());
    const rotateId = parts.slice(2).join("-");

    const item = sequence.find(
      (s) => actionRegistry.get(s.kind)?.isRotate && (s as any).id === rotateId,
    ) as any;
    if (item && item.eventMarkers && item.eventMarkers[evIdx]) {
      if (item.locked) return; // Don't modify event markers on locked rotates
      const step = 0.01 * delta;
      let newPos = item.eventMarkers[evIdx].position + step;
      newPos = Math.max(0, Math.min(1, newPos));
      item.eventMarkers[evIdx].position = newPos;
      sequenceStore.set(sequence);
      recordChange("Move Event Marker");
    }
    return;
  }
  if (current.startsWith("event-")) {
    const parts = current.split("-");
    const lineIdx = Number(parts[1]);
    const evIdx = Number(parts[2]);
    const line = lines[lineIdx];
    if (line && line.eventMarkers && line.eventMarkers[evIdx]) {
      if (line.locked) return; // Don't modify event markers on locked lines
      const step = 0.01 * delta;
      let newPos = line.eventMarkers[evIdx].position + step;
      newPos = Math.max(0, Math.min(1, newPos));
      line.eventMarkers[evIdx].position = newPos;
      linesStore.set(lines);
      recordChange("Move Event Marker");
    }
    return;
  }
  // Modify last event if line selected
  if (get(selectedLineId)) {
    const line = lines.find((l) => l.id === get(selectedLineId));
    if (line && line.eventMarkers && line.eventMarkers.length > 0) {
      if (line.locked) return; // Don't modify event markers on locked lines
      const lastIdx = line.eventMarkers.length - 1;
      const step = 0.01 * delta;
      let newPos = line.eventMarkers[lastIdx].position + step;
      newPos = Math.max(0, Math.min(1, newPos));
      line.eventMarkers[lastIdx].position = newPos;
      linesStore.set(lines);
      recordChange("Move Event Marker");
    }
  }
}

export function toggleHeadingMode(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const sel = get(selectedPointId);
  if (!sel || !sel.startsWith("point-")) return;

  const startPoint = get(startPointStore);
  const lines = get(linesStore);

  const parts = sel.split("-");
  const lineNum = Number(parts[1]);
  const ptIdx = Number(parts[2]);

  // Only Start Point (lineNum=0, ptIdx=0) and Line End Points (ptIdx=0) have heading modes
  if (lineNum === 0 && ptIdx === 0) {
    if (startPoint.locked) return;
    // Cycle: tangential -> constant -> linear
    const modes = ["tangential", "constant", "linear"];
    const current = startPoint.heading;
    const next = modes[(modes.indexOf(current as string) + 1) % modes.length];

    // Update start point structure based on new mode
    if (next === "tangential") {
      startPointStore.set({
        ...startPoint,
        heading: "tangential",
        reverse: false,
        degrees: undefined,
        startDeg: undefined,
        endDeg: undefined,
      } as unknown as Point);
    } else if (next === "constant") {
      startPointStore.set({
        ...startPoint,
        heading: "constant",
        degrees: 0,
        reverse: undefined,
        startDeg: undefined,
        endDeg: undefined,
      } as unknown as Point);
    } else {
      startPointStore.set({
        ...startPoint,
        heading: "linear",
        startDeg: 90,
        endDeg: 180,
        reverse: undefined,
        degrees: undefined,
      } as unknown as Point);
    }
    recordChange("Toggle Heading Mode");
    return;
  }

  if (lineNum > 0 && ptIdx === 0) {
    const lineIndex = lineNum - 1;
    const line = lines[lineIndex];
    if (!line || line.locked) return;

    const modes = ["tangential", "constant", "linear"];
    const current = line.endPoint.heading;
    const next = modes[(modes.indexOf(current as string) + 1) % modes.length];

    if (next === "tangential") {
      line.endPoint = {
        ...line.endPoint,
        heading: "tangential",
        reverse: false,
        degrees: undefined,
        startDeg: undefined,
        endDeg: undefined,
      } as unknown as Point;
    } else if (next === "constant") {
      line.endPoint = {
        ...line.endPoint,
        heading: "constant",
        degrees: 0,
        reverse: undefined,
        startDeg: undefined,
        endDeg: undefined,
      } as unknown as Point;
    } else {
      line.endPoint = {
        ...line.endPoint,
        heading: "linear",
        startDeg: 90,
        endDeg: 180,
        reverse: undefined,
        degrees: undefined,
      } as unknown as Point;
    }
    linesStore.set(lines);
    recordChange("Toggle Heading Mode");
  }
}

export function toggleReverse(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const sel = get(selectedPointId);
  const startPoint = get(startPointStore);
  const lines = get(linesStore);
  if (!sel || !sel.startsWith("point-")) return;

  const parts = sel.split("-");
  const lineNum = Number(parts[1]);
  const ptIdx = Number(parts[2]);

  if (lineNum === 0 && ptIdx === 0) {
    if (startPoint.locked) return;
    if (startPoint.heading === "tangential") {
      startPointStore.set({
        ...startPoint,
        reverse: !startPoint.reverse,
      });
      recordChange("Toggle Reverse");
    }
    return;
  }

  if (lineNum > 0 && ptIdx === 0) {
    const lineIndex = lineNum - 1;
    const line = lines[lineIndex];
    if (!line || line.locked) return;

    if (line.endPoint.heading === "tangential") {
      line.endPoint.reverse = !line.endPoint.reverse;
      linesStore.set(lines);
      recordChange("Toggle Reverse");
    }
  }
}

export function toggleLock(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const sel = get(selectedPointId);
  const lines = get(linesStore);
  const selLineId = get(selectedLineId);

  if (!sel) return;

  if (sel.startsWith("wait-")) {
    const waitId = sel.substring(5);
    sequenceStore.update((seq) =>
      seq.map((s) => {
        if (actionRegistry.get(s.kind)?.isWait && (s as any).id === waitId) {
          return { ...s, locked: !(s as any).locked };
        }
        return s;
      }),
    );
    recordChange("Toggle Lock");
    return;
  }

  if (sel.startsWith("rotate-")) {
    const rotateId = sel.substring(7);
    sequenceStore.update((seq) =>
      seq.map((s) => {
        if (
          actionRegistry.get(s.kind)?.isRotate &&
          (s as any).id === rotateId
        ) {
          return { ...s, locked: !(s as any).locked };
        }
        return s;
      }),
    );
    recordChange("Toggle Lock");
    return;
  }

  if (sel.startsWith("point-")) {
    const parts = sel.split("-");
    const lineNum = Number(parts[1]);

    if (lineNum === 0) {
      startPointStore.update((p) => ({ ...p, locked: !p.locked }));
      recordChange("Toggle Lock");
      return;
    }

    const lineIndex = lineNum - 1;
    linesStore.update((l) => {
      const newLines = [...l];
      if (newLines[lineIndex]) {
        newLines[lineIndex] = {
          ...newLines[lineIndex],
          locked: !newLines[lineIndex].locked,
        };
      }
      return newLines;
    });
    recordChange("Toggle Lock");
    return;
  }

  if (selLineId) {
    linesStore.update((l) => {
      const newLines = [...l];
      const idx = newLines.findIndex((line) => line.id === selLineId);
      if (idx !== -1) {
        newLines[idx] = {
          ...newLines[idx],
          locked: !newLines[idx].locked,
        };
      }
      return newLines;
    });
    recordChange("Toggle Lock");
  }
}
