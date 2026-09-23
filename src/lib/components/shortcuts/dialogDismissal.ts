// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  showSettings,
  showFileManager,
  showPluginManager,
  showShortcuts,
  showExportImage,
  showWhatsNew,
  showExportGif,
  exportDialogState,
  showTelemetryDialog,
  showStrategySheet,
  showFeedbackDialog,
  showRatingDialog,
  showTransformDialog,
  showUpdateAvailableDialog,
  clearAllSelections,
} from "../../../stores";

/**
 * Checks if any overlay or modal dialog is currently open and closes it.
 * @returns true if an open dialog was found and dismissed, false otherwise.
 */
export function dismissOpenDialog(): boolean {
  if (get(showSettings)) {
    showSettings.set(false);
    return true;
  }
  if (get(showFileManager)) {
    showFileManager.set(false);
    return true;
  }
  if (get(showPluginManager)) {
    showPluginManager.set(false);
    return true;
  }
  if (get(showShortcuts)) {
    showShortcuts.set(false);
    return true;
  }
  if (get(showExportImage)) {
    showExportImage.set(false);
    return true;
  }
  if (get(showWhatsNew)) {
    showWhatsNew.set(false);
    return true;
  }
  if (get(showExportGif)) {
    showExportGif.set(false);
    return true;
  }
  if (get(exportDialogState).isOpen) {
    exportDialogState.update((s) => ({ ...s, isOpen: false }));
    return true;
  }
  if (get(showTelemetryDialog)) {
    showTelemetryDialog.set(false);
    return true;
  }
  if (get(showStrategySheet)) {
    showStrategySheet.set(false);
    return true;
  }
  if (get(showFeedbackDialog)) {
    showFeedbackDialog.set(false);
    return true;
  }
  if (get(showRatingDialog)) {
    showRatingDialog.set(false);
    return true;
  }
  if (get(showTransformDialog)) {
    showTransformDialog.set(false);
    return true;
  }
  if (get(showUpdateAvailableDialog)) {
    showUpdateAvailableDialog.set(false);
    return true;
  }
  return false;
}

/**
 * Deselects all selected points and lines on the field and blurs active input element.
 */
export function deselectAllElements(): void {
  clearAllSelections();

  if (
    typeof document !== "undefined" &&
    document.activeElement &&
    (document.activeElement as HTMLElement).blur
  ) {
    (document.activeElement as HTMLElement).blur();
  }
}
