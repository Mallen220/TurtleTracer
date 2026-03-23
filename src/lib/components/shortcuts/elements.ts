// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  linesStore,
  sequenceStore,
  renumberDefaultPathNames,
} from "../../projectStore";
import { selectedLineId, selectedPointId } from "../../../stores";
import { actionRegistry } from "../../actionRegistry";
import type { Line, SequenceItem } from "../../../types/index";
import _ from "lodash";
import { getRandomColor } from "../../../utils";
import { getSelectedSequenceIndex } from "./utils";

export function addNewLine(recordChange: (action?: string) => void) {
  const newLine: Line = {
    id: `line-${Math.random().toString(36).slice(2)}`,
    name: "",
    endPoint: {
      x: _.random(36, 108),
      y: _.random(36, 108),
      heading: "tangential",
      reverse: false,
    },
    controlPoints: [],
    color: getRandomColor(),
    locked: false,
  };

  const insertIdx = getSelectedSequenceIndex();
  if (insertIdx === null) {
    linesStore.update((l) => renumberDefaultPathNames([...l, newLine]));
    sequenceStore.update((s) => [...s, { kind: "path", lineId: newLine.id! }]);
    selectedLineId.set(newLine.id!);
    const newIndex = get(linesStore).length - 1;
    selectedPointId.set(`point-${newIndex + 1}-0`);
  } else {
    linesStore.update((l) => renumberDefaultPathNames([...l, newLine]));
    sequenceStore.update((s) => {
      const s2 = [...s];
      s2.splice(insertIdx + 1, 0, { kind: "path", lineId: newLine.id! });
      return s2;
    });
    selectedLineId.set(newLine.id!);
    const newIndex = get(linesStore).length - 1;
    selectedPointId.set(`point-${newIndex + 1}-0`);
  }

  recordChange("Add Path");
}

export function addWait(recordChange: (action?: string) => void) {
  const wait: SequenceItem = {
    kind: "wait",
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    durationMs: 1000,
    locked: false,
  };

  const insertIdx = getSelectedSequenceIndex();
  if (insertIdx === null) {
    sequenceStore.update((s) => [...s, wait]);
  } else {
    sequenceStore.update((s) => {
      const s2 = [...s];
      s2.splice(insertIdx + 1, 0, wait);
      return s2;
    });
  }

  selectedPointId.set(`wait-${wait.id}`);
  selectedLineId.set(null);
  recordChange("Add Wait");
}

export function addRotate(recordChange: (action?: string) => void) {
  const rotate: SequenceItem = {
    kind: "rotate",
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    degrees: 0,
    locked: false,
  };

  const insertIdx = getSelectedSequenceIndex();
  if (insertIdx === null) {
    sequenceStore.update((s) => [...s, rotate]);
  } else {
    sequenceStore.update((s) => {
      const s2 = [...s];
      s2.splice(insertIdx + 1, 0, rotate);
      return s2;
    });
  }

  selectedPointId.set(`rotate-${rotate.id}`);
  selectedLineId.set(null);
  recordChange("Add Rotate");
}

export function addEventMarker(recordChange: (action?: string) => void) {
  const selPoint = get(selectedPointId);
  const sequence = get(sequenceStore);

  if (selPoint && selPoint.startsWith("wait-")) {
    const waitId = selPoint.substring(5);
    const waitItem = sequence.find(
      (s) => actionRegistry.get(s.kind)?.isWait && (s as any).id === waitId,
    ) as any;

    if (waitItem) {
      if (waitItem.locked) return;
      waitItem.eventMarkers = waitItem.eventMarkers || [];
      waitItem.eventMarkers.push({
        id: `event-${Date.now()}`,
        name: "",
        position: 0.5,
      });
      sequenceStore.set(sequence);
      selectedPointId.set(
        `event-wait-${waitId}-${waitItem.eventMarkers.length - 1}`,
      );
      recordChange("Add Event Marker");
      return;
    }
  }

  if (selPoint && selPoint.startsWith("rotate-")) {
    const rotateId = selPoint.substring(7);
    const rotateItem = sequence.find(
      (s) => actionRegistry.get(s.kind)?.isRotate && (s as any).id === rotateId,
    ) as any;

    if (rotateItem) {
      if (rotateItem.locked) return;
      rotateItem.eventMarkers = rotateItem.eventMarkers || [];
      rotateItem.eventMarkers.push({
        id: `event-${Date.now()}`,
        name: "",
        position: 0.5,
      });
      sequenceStore.set(sequence);
      selectedPointId.set(
        `event-rotate-${rotateId}-${rotateItem.eventMarkers.length - 1}`,
      );
      recordChange("Add Event Marker");
      return;
    }
  }

  const lines = get(linesStore);
  const selLine = get(selectedLineId);
  const targetId =
    selLine || (lines.length > 0 ? lines[lines.length - 1].id : null);
  const targetLine = targetId ? lines.find((l) => l.id === targetId) : null;

  if (targetLine) {
    if (targetLine.locked) return; // Don't allow adding event markers to locked lines
    targetLine.eventMarkers = targetLine.eventMarkers || [];
    targetLine.eventMarkers.push({
      id: `event-${Date.now()}`,
      name: "",
      position: 0.5,
    });
    linesStore.set(lines);
    const lineIdx = lines.findIndex((l) => l.id === targetId);
    if (lineIdx !== -1) {
      selectedPointId.set(
        `event-${lineIdx}-${targetLine.eventMarkers.length - 1}`,
      );
    }
    recordChange("Add Event Marker");
  }
}

export function addControlPoint(recordChange: (action?: string) => void) {
  const lines = get(linesStore);
  if (lines.length === 0) return;
  const targetId = get(selectedLineId) || lines[lines.length - 1].id;
  const targetLine =
    lines.find((l) => l.id === targetId) || lines[lines.length - 1];
  if (!targetLine) return;
  if (targetLine.locked) return; // Don't allow adding control points to locked lines

  targetLine.controlPoints.push({
    x: _.random(36, 108),
    y: _.random(36, 108),
  });
  linesStore.set(lines);
  const lineIndex = lines.findIndex((l) => l.id === targetLine.id);
  const cpIndex = targetLine.controlPoints.length;
  selectedLineId.set(targetLine.id as string);
  selectedPointId.set(`point-${lineIndex + 1}-${cpIndex}`);
  recordChange("Add Control Point");
}

export function removeControlPoint(recordChange: (action?: string) => void) {
  const lines = get(linesStore);
  if (lines.length > 0) {
    const targetId = get(selectedLineId) || lines[lines.length - 1].id;
    const targetLine =
      lines.find((l) => l.id === targetId) || lines[lines.length - 1];
    if (targetLine && targetLine.controlPoints.length > 0) {
      if (targetLine.locked) return; // Don't allow removing control points from locked lines
      targetLine.controlPoints.pop();
      linesStore.set(lines);
      recordChange("Remove Control Point");
    }
  }
}
