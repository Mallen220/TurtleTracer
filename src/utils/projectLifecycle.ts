// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  startPointStore,
  linesStore,
  shapesStore,
  sequenceStore,
} from "../lib/projectStore";
import {
  getDefaultStartPoint,
  getDefaultLines,
  getDefaultShapes,
} from "../config";
import { isUnsaved, currentFilePath } from "../stores";

/**
 * Resets the project to the default state.
 */
export function resetPath() {
  startPointStore.set(getDefaultStartPoint());
  const lines = getDefaultLines();
  linesStore.set(lines);
  sequenceStore.set(
    lines.map((ln) => ({
      kind: "path",
      lineId: ln.id || `line-${Math.random().toString(36).slice(2)}`,
    }))
  );
  shapesStore.set(getDefaultShapes());
}

/**
 * Prompts the user to confirm resetting the project if there are unsaved changes.
 * @param recordChange Callback to record the change in history
 */
export function handleResetPathWithConfirmation(recordChange?: () => void) {
  const lines = get(linesStore);
  const shapes = get(shapesStore);
  const unsaved = get(isUnsaved);
  const filePath = get(currentFilePath);

  // Check if there's unsaved work
  // We consider it "changed" if unsaved flag is true, or if content differs from default significantly
  const hasChanges = unsaved || lines.length > 1 || shapes.length > 0;

  let message = "Are you sure you want to reset the path?\n\n";

  if (hasChanges) {
    if (filePath) {
      message += `This will reset "${filePath.split(/[\\/]/).pop()}" to the default path.`;
    } else {
      message += "This will reset your current work to the default path.";
    }

    if (unsaved) {
      message += "\n\n⚠ WARNING: You have unsaved changes that will be lost!";
    }
  } else {
    message += "This will reset to the default starting path.";
  }

  message += "\n\nClick OK to reset, or Cancel to keep your current path.";

  if (confirm(message)) {
    resetPath();
    if (recordChange) recordChange();
  }
}
