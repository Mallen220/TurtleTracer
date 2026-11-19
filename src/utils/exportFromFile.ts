// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Exporting a file from the file manager without making it your open project.
import { get, type Writable } from "svelte/store";
import { tick } from "svelte";
import {
  currentFilePath,
  exportDialogState,
  exportSwap,
  isUnsaved,
  multiSelectedLineIds,
  multiSelectedPointIds,
  notification,
  selectedLineId,
  selectedPointId,
  showExportGif,
  showExportImage,
  showFileManager,
  showStrategySheet,
} from "../stores";
import {
  extraDataStore,
  linesStore,
  loadProjectData,
  mirrorPreviewStore,
  percentStore,
  sequenceStore,
  settingsStore,
  shapesStore,
  startPointStore,
} from "../lib/projectStore";
import { getElectronAPI } from "./platform";

/** Everything the swap replaces and then restores. Undo history is untouched. */
const SWAPPED: Writable<any>[] = [
  startPointStore,
  linesStore,
  shapesStore,
  sequenceStore,
  extraDataStore,
  mirrorPreviewStore,
  percentStore,
  currentFilePath,
  isUnsaved,
  selectedPointId,
  selectedLineId,
  multiSelectedPointIds,
  multiSelectedLineIds,
];

export function endExportSwap() {
  get(exportSwap)?.();
}

/** Opens the export dialog for `id` on the open project. */
export function openExport(id: string) {
  if (id === "image") showExportImage.set(true);
  else if (id === "gif") showExportGif.set(true);
  else if (id === "strategy") showStrategySheet.set(true);
  else if (id === "java" || id === "kotlin") {
    settingsStore.update((s) => ({ ...s, codeLanguage: id }));
    exportDialogState.set({ isOpen: true, format: "java" });
  } else if (id.startsWith("custom:")) {
    exportDialogState.set({
      isOpen: true,
      format: "custom",
      exporterName: id.slice("custom:".length),
    });
  } else {
    exportDialogState.set({ isOpen: true, format: id as any });
  }
}

/**
 * Exports `file` as `id`. Any file but the open one is swapped in as the open
 * project; App puts the original back when the export dialog closes. Nothing
 * is saved in between: autosave and auto-export only fire on edits, and
 * `isUnsaved` is false while the file is swapped in.
 */
export async function exportFile(
  file: { name: string; path: string },
  id: string,
) {
  endExportSwap();
  if (file.path === get(currentFilePath)) return openExport(id);

  let data;
  try {
    data = JSON.parse(await getElectronAPI()!.readFile(file.path));
    if (!data.startPoint || !data.lines) throw new Error("Invalid file format");
  } catch (e) {
    notification.set({
      message: `Couldn't export ${file.name}: ${e instanceof Error ? e.message : e}`,
      type: "error",
    });
    return;
  }

  const saved = SWAPPED.map((s) => get(s));
  const restore = () => {
    SWAPPED.forEach((s, i) => s.set(saved[i]));
    exportSwap.set(null);
  };
  exportSwap.set(restore);
  try {
    await loadProjectData(data, file.path);
    currentFilePath.set(file.path);
    isUnsaved.set(false);
    percentStore.set(0);
    showFileManager.set(false);
    await tick();
    openExport(id);
  } catch (e) {
    restore();
    notification.set({
      message: `Couldn't export ${file.name}: ${e instanceof Error ? e.message : e}`,
      type: "error",
    });
  }
}
