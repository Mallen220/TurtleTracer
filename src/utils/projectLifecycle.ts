// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  startPointStore,
  linesStore,
  shapesStore,
  sequenceStore,
  settingsStore,
} from "../lib/projectStore";
import {
  getDefaultStartPoint,
  getDefaultLines,
  getDefaultShapes,
  DEFAULT_SETTINGS,
} from "../config";
import { isUnsaved, currentFilePath } from "../stores";
import { saveProject } from "./fileHandlers";

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
    })),
  );
  let newShapes = getDefaultShapes();
  const currentSettings = get(settingsStore);
  if (
    (currentSettings.fieldWidth !== DEFAULT_SETTINGS.fieldWidth ||
      currentSettings.fieldHeight !== DEFAULT_SETTINGS.fieldHeight) &&
    !currentSettings.customMaps?.some((m) => m.id === currentSettings.fieldMap)
  ) {
    const scaleX = (currentSettings.fieldWidth ?? 144) / (DEFAULT_SETTINGS.fieldWidth ?? 144);
    const scaleY = (currentSettings.fieldHeight ?? 144) / (DEFAULT_SETTINGS.fieldHeight ?? 144);
    newShapes = newShapes.map((shape) => ({
      ...shape,
      vertices: shape.vertices.map((v) => ({
        ...v,
        x: v.x * scaleX,
        y: v.y * scaleY,
      })),
    }));
  }
  shapesStore.set(newShapes);
}

/**
 * Prompts the user to confirm resetting the project if there are unsaved changes.
 * @param recordChange Callback to record the change in history
 */
export async function handleResetPathWithConfirmation(
  recordChange?: () => void,
) {
  // Autosave on Close Logic
  const settings = get(settingsStore);
  if (
    settings.autosaveMode === "close" &&
    get(isUnsaved) &&
    get(currentFilePath)
  ) {
    await saveProject(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      { quiet: true },
    );
  }

  const lines = get(linesStore);
  const shapes = get(shapesStore);
  const unsaved = get(isUnsaved);
  const filePath = get(currentFilePath);

  // Check if there's unsaved work
  const hasChanges = unsaved || lines.length > 1 || shapes.length > 0;

  let message = "Are you sure you want to reset the path?\n\n";

  if (hasChanges) {
    if (filePath) {
      message += `This will reset "${filePath.split(/[\\/]/).pop()}" to the default path.`;
    } else {
      message += "This will reset your current work to the default path.";
    }

    if (unsaved) {
      message += "\n\nWARNING: You have unsaved changes that will be lost!";
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
