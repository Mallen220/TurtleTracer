// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Exporting files from the file manager without making them your open project.
import { get, type Writable } from "svelte/store";
import { tick } from "svelte";
import {
  currentFilePath,
  exportCycle,
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

type ExportFile = { name: string; path: string };

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

/** The open project and the format, while several files are exported in turn. */
let cycle: { saved: unknown[]; id: string } | null = null;

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

const failure = (file: ExportFile, e: unknown) =>
  notification.set({
    message: `Couldn't export ${file.name}: ${e instanceof Error ? e.message : e}`,
    type: "error",
  });

/** Makes `file` the open project; the caller puts the real one back afterwards. */
async function loadForExport(file: ExportFile) {
  const data = JSON.parse(await getElectronAPI()!.readFile(file.path));
  if (!data.startPoint || !data.lines) throw new Error("Invalid file format");
  await loadProjectData(data, file.path);
  currentFilePath.set(file.path);
  isUnsaved.set(false);
  percentStore.set(0);
  await tick();
}

/**
 * Starts a swap: remembers the open project and returns how to put it back.
 * Nothing is saved while swapped: autosave and auto-export only fire on edits,
 * and `isUnsaved` is false.
 */
function beginSwap() {
  endExportSwap();
  const saved = SWAPPED.map((s) => get(s));
  const restore = () => {
    SWAPPED.forEach((s, i) => s.set(saved[i]));
    cycle = null;
    exportCycle.set(null);
    exportSwap.set(null);
  };
  exportSwap.set(restore);
  return { saved, restore };
}

/**
 * Exports `file` as `id`. Any file but the open one is swapped in as the open
 * project; App puts the original back when the export dialog closes.
 */
export async function exportFile(file: ExportFile, id: string) {
  endExportSwap();
  if (file.path === get(currentFilePath)) return openExport(id);

  const { restore } = beginSwap();
  try {
    await loadForExport(file);
    showFileManager.set(false);
    openExport(id);
  } catch (e) {
    restore();
    failure(file, e);
  }
}

/**
 * Exports several files as `id`, a dialog for each in turn. The first opens
 * now; App calls advanceExportCycle as each dialog closes.
 */
export async function exportFiles(files: ExportFile[], id: string) {
  const { saved } = beginSwap();
  cycle = { saved, id };
  exportCycle.set({ files, index: 0 });
  showFileManager.set(false);
  await showCycleFile(0, true);
}

/** Loads file `index` of the cycle, and opens its dialog if `open`. */
export async function showCycleFile(index: number, open: boolean) {
  const c = get(exportCycle);
  const file = c?.files[index];
  if (!c || !cycle || !file) return;
  exportCycle.set({ ...c, index });
  try {
    if (file.path === cycle.saved[SWAPPED.indexOf(currentFilePath)]) {
      // The open file exports as it is, unsaved edits included.
      SWAPPED.forEach((s, i) => s.set(cycle!.saved[i]));
      await tick();
    } else {
      await loadForExport(file);
    }
    if (open) openExport(cycle.id);
  } catch (e) {
    failure(file, e);
    if (open) await advanceExportCycle();
    else throw e;
  }
}

/** Moves on to the next file, or puts the open project back after the last. */
export async function advanceExportCycle() {
  const c = get(exportCycle);
  if (!c) return;
  if (c.index + 1 >= c.files.length) endExportSwap();
  else await showCycleFile(c.index + 1, true);
}
