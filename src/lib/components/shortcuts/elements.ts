// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import { linesStore, sequenceStore, startPointStore } from "../../projectStore";
import { selectedLineId, selectedPointId } from "../../../stores";
import type { EventMarker, InsertionContext } from "../../../types/index";
import { insertPath } from "../../actions/PathAction";
import { WaitAction } from "../../actions/WaitAction";
import { RotateAction } from "../../actions/RotateAction";
import { parseSelectionId, findSequenceItemIndex } from "./itemUtils";
import random from "lodash/random";
import { getSelectedSequenceIndex } from "./utils";
import { makeId } from "../../../utils/nameGenerator";

/**
 * Inserts a new step right after the selected one (or at the end) and
 * selects it.
 */
function insertStep(
  label: string,
  insert: (ctx: InsertionContext) => void,
  recordChange: (action?: string) => void,
) {
  const sequence = [...get(sequenceStore)];
  const lines = [...get(linesStore)];
  const index = (getSelectedSequenceIndex() ?? sequence.length - 1) + 1;
  insert({
    index,
    sequence,
    lines,
    startPoint: get(startPointStore),
    triggerReactivity: () => {},
  });
  linesStore.set(lines);
  sequenceStore.set(sequence);

  const added = sequence[index];
  if (added?.kind === "path") {
    const lineNum = lines.findIndex((l) => l.id === added.lineId) + 1;
    selectedLineId.set(added.lineId);
    selectedPointId.set(`point-${lineNum}-0`);
  } else if (added) {
    selectedPointId.set(`${added.kind}-${added.id}`);
    selectedLineId.set(null);
  }
  recordChange(`Add ${label}`);
}

/** P: a new path to a random spot near the middle of the field. */
export const addNewLine = (recordChange: (action?: string) => void) =>
  insertStep(
    "Path",
    (ctx) =>
      insertPath(ctx, () => ({ x: random(36, 108), y: random(36, 108) })),
    recordChange,
  );
export const addWait = (recordChange: (action?: string) => void) =>
  insertStep("Wait", (ctx) => WaitAction.onInsert?.(ctx), recordChange);
export const addRotate = (recordChange: (action?: string) => void) =>
  insertStep("Rotate", (ctx) => RotateAction.onInsert?.(ctx), recordChange);

const newMarker = (): EventMarker => ({
  id: makeId("event"),
  name: "",
  position: 0.5,
});

/** Adds an event marker to the selected wait, turn or path. */
export function addEventMarker(recordChange: (action?: string) => void) {
  const sequence = get(sequenceStore);
  const selection = parseSelectionId(get(selectedPointId) ?? "");

  if (selection.type === "wait" || selection.type === "rotate") {
    const index = findSequenceItemIndex(sequence, selection.id, selection.type);
    const item = sequence[index];
    if (item?.kind === "wait" || item?.kind === "rotate") {
      if (item.locked) return;
      const eventMarkers = [...(item.eventMarkers ?? []), newMarker()];
      sequenceStore.set(sequence.with(index, { ...item, eventMarkers }));
      selectedPointId.set(
        `event-${item.kind}-${item.id}-${eventMarkers.length - 1}`,
      );
      recordChange("Add Event Marker");
      return;
    }
  }

  const lines = get(linesStore);
  const targetId = get(selectedLineId) || lines.at(-1)?.id;
  const lineIdx = lines.findIndex((l) => l.id === targetId);
  const line = lines[lineIdx];
  if (!line || line.locked) return;

  const eventMarkers = [...(line.eventMarkers ?? []), newMarker()];
  linesStore.set(lines.with(lineIdx, { ...line, eventMarkers }));
  selectedPointId.set(`event-${lineIdx}-${eventMarkers.length - 1}`);
  recordChange("Add Event Marker");
}

export function addControlPoint(recordChange: (action?: string) => void) {
  const lines = get(linesStore);
  const targetLine =
    lines.find((l) => l.id === get(selectedLineId)) ?? lines.at(-1);
  if (targetLine) {
    if (targetLine.locked) return; // Don't allow adding control points to locked lines

    const newCp = {
      x: random(36, 108),
      y: random(36, 108),
    };
    const lineIndex = lines.findIndex((l) => l.id === targetLine.id);
    if (lineIndex !== -1) {
      const newCps = [...targetLine.controlPoints, newCp];
      lines[lineIndex] = { ...targetLine, controlPoints: newCps };
      linesStore.set([...lines]);
      selectedLineId.set(targetLine.id as string);
      selectedPointId.set(`point-${lineIndex + 1}-${newCps.length}`);
      recordChange("Add Control Point");
    }
  }
}

export function removeControlPoint(recordChange: (action?: string) => void) {
  const lines = get(linesStore);
  if (lines.length > 0) {
    const targetLine =
      lines.find((l) => l.id === get(selectedLineId)) ?? lines.at(-1);
    if (targetLine && targetLine.controlPoints.length > 0) {
      if (targetLine.locked) return; // Don't allow removing control points from locked lines
      const lineIndex = lines.findIndex((l) => l.id === targetLine.id);
      if (lineIndex !== -1) {
        const newCps = [...targetLine.controlPoints];
        newCps.pop();
        lines[lineIndex] = { ...targetLine, controlPoints: newCps };
        linesStore.set([...lines]);
        recordChange("Remove Control Point");
      }
    }
  }
}
