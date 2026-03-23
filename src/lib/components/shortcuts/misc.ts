// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  linesStore,
  settingsStore,
  shapesStore,
  startPointStore,
} from "../../projectStore";
import {
  selectedLineId,
  selectedPointId,
  showRobot,
  notification,
} from "../../../stores";
import { AVAILABLE_FIELD_MAPS } from "../../../config";
import { getRandomColor } from "../../../utils";
import { isUIElementFocused } from "./utils";

export function cyclePathColor(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const selLineId = get(selectedLineId);
  if (selLineId) {
    linesStore.update((l) => {
      const newLines = [...l];
      const idx = newLines.findIndex((line) => line.id === selLineId);
      if (idx !== -1) {
        newLines[idx] = { ...newLines[idx], color: getRandomColor() };
      }
      return newLines;
    });
    recordChange("Cycle Path Color");
  }
}

export function toggleRobotVisibility() {
  showRobot.update((v) => !v);
}

export function selectFirst() {
  const lines = get(linesStore);
  if (lines.length > 0) {
    selectedPointId.set(`point-0-0`);
    selectedLineId.set(null);
  }
}

export function selectLast() {
  const lines = get(linesStore);
  if (lines.length > 0) {
    const lastLineIdx = lines.length - 1;
    selectedPointId.set(`point-${lastLineIdx + 1}-0`);
    selectedLineId.set(lines[lastLineIdx].id!);
  }
}

export function copyPathJson() {
  const startPoint = get(startPointStore);
  const lines = get(linesStore);
  const shapes = get(shapesStore);

  const data = {
    startPoint,
    lines,
    shapes,
  };
  navigator.clipboard
    .writeText(JSON.stringify(data, null, 2))
    .then(() => {
      notification.set({
        message: "Path data copied to clipboard!",
        type: "success",
      });
    })
    .catch((err) => {
      console.error("Failed to copy", err);
      notification.set({
        message: "Failed to copy path data.",
        type: "error",
      });
    });
}

export function cycleFieldMap() {
  settingsStore.update((s) => {
    const current = s.fieldMap;
    const idx = AVAILABLE_FIELD_MAPS.findIndex((m) => m.value === current);
    const nextIdx = (idx + 1) % AVAILABLE_FIELD_MAPS.length;
    const nextMap = AVAILABLE_FIELD_MAPS[idx === -1 ? 0 : nextIdx].value;
    return { ...s, fieldMap: nextMap };
  });
}

export function rotateField() {
  settingsStore.update((s) => {
    const current = s.fieldRotation || 0;
    const next = (current + 90) % 360;
    return { ...s, fieldRotation: next };
  });
}

export function toggleContinuousValidation() {
  settingsStore.update((s) => ({
    ...s,
    continuousValidation: !s.continuousValidation,
  }));
}

export function toggleOnionCurrentPath() {
  settingsStore.update((s) => ({
    ...s,
    onionSkinCurrentPathOnly: !s.onionSkinCurrentPathOnly,
  }));
}
