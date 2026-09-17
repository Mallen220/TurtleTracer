// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  showGrid,
  snapToGrid,
  showProtractor,
  showShortcuts,
  showSettings,
  isPresentationMode,
  selectedPointId,
  selectedLineId,
  toggleCollapseAllTrigger,
  focusRequest,
  exportDialogState,
  showFileManager,
  showPluginManager,
  showRuler,
  settingsActiveTab,
  showStrategySheet,
  showHistory,
  showTransformDialog,
  protractorLockToRobot,
  notification,
  isDrawingMode,
} from "../../../stores";
import {
  shapesStore,
  settingsStore,
  robotProfilesStore,
  loopAnimationStore,
  loopRangeActiveStore,
  loopRangeStore,
  percentStore,
} from "../../projectStore";
import { createTriangle } from "../../../utils";
import { getElectronAPI } from "../../../utils/platform";
import { toggleDiff } from "../../diffStore";
import { DEFAULT_SETTINGS, SETTINGS_TAB_ORDER } from "../../../config";
import { DEFAULT_KEY_BINDINGS } from "../../../config/keybindings";
import { isUIElementFocused } from "./utils";
import {
  addNewLine,
  addWait,
  addRotate,
  addEventMarker,
  addControlPoint,
  removeControlPoint,
} from "./elements";
import { duplicate, copy, cut, paste } from "./clipboard";
import {
  removeSelected,
  movePoint,
  cycleSequenceSelection,
  selectAll,
} from "./selection";
import { dismissOpenDialog, deselectAllElements } from "./dialogDismissal";
import {
  modifyValue,
  toggleHeadingMode,
  toggleReverse,
  toggleLock,
  togglePathChain,
  togglePiecewise,
  toggleGlobalHeading,
} from "./properties";
import {
  cycleGridSize,
  cycleGridSizeReverse,
  modifyZoom,
  resetZoom,
  panToStart,
  panToEnd,
  panView,
} from "./view";
import { changePlaybackSpeedBy, resetPlaybackSpeed } from "./playback";
import {
  cyclePathColor,
  toggleRobotVisibility,
  selectFirst,
  selectLast,
  copyPathJson,
  cycleFieldMap,
  rotateField,
  toggleContinuousValidation,
  toggleOnionCurrentPath,
} from "./misc";

export interface ShortcutActionContext {
  saveProject: () => void;
  resetProject: () => void;
  saveFileAs: () => void;
  exportGif: () => void;
  exportImage?: () => void;
  undoAction: () => void;
  redoAction: () => void;
  play: () => void;
  pause: () => void;
  resetAnimation: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  splitPath?: () => void;
  recordChange: (action?: string) => void;
  controlTabRef?: any;
  getActiveControlTab: () => "path" | "field" | "table" | "code";
  setActiveControlTab: (tab: "path" | "field" | "table" | "code") => void;
  toggleStats?: () => void;
  toggleSidebar?: () => void;
  toggleControlTab?: () => void;
  fieldRenderer?: any;
  openWhatsNew?: () => void;
  toggleCommandPalette: () => void;
  closeCommandPalette: () => void;
  isCommandPaletteOpen: () => boolean;
  openFileInput: () => void;
  fetchFiles: () => void;
  isPlaying: () => boolean;
}

export type ActionHandler = (...args: any[]) => void;

/**
 * Builds the comprehensive mapping of action identifiers to executable shortcut functions.
 */
export function buildActionHandlers(
  ctx: ShortcutActionContext,
): Record<string, ActionHandler> {
  const handlers: Record<string, ActionHandler> = {
    saveProject: () => ctx.saveProject(),
    saveFileAs: () => ctx.saveFileAs(),
    exportGif: () => ctx.exportGif(),
    exportImage: () => ctx.exportImage?.(),
    addNewLine: () => addNewLine(ctx.recordChange),
    addWait: () => addWait(ctx.recordChange),
    addRotate: () => addRotate(ctx.recordChange),
    addEventMarker: () => addEventMarker(ctx.recordChange),
    addControlPoint: () => addControlPoint(ctx.recordChange),
    removeControlPoint: () => removeControlPoint(ctx.recordChange),
    duplicate: () => duplicate(ctx.recordChange),
    copy: () => copy(ctx.getActiveControlTab(), ctx.controlTabRef),
    cut: () =>
      cut(ctx.getActiveControlTab(), ctx.controlTabRef, () =>
        removeSelected(ctx.recordChange),
      ),
    paste: () => paste(ctx.recordChange),
    splitPath: () => ctx.splitPath?.(),
    removeSelected: () => removeSelected(ctx.recordChange),
    undo: () => ctx.undoAction(),
    redo: () => ctx.redoAction(),
    resetAnimation: () => ctx.resetAnimation(),
    stepForward: () => ctx.stepForward(),
    stepBackward: () => ctx.stepBackward(),
    movePointUp: () => movePoint(0, 1, ctx.recordChange),
    movePointDown: () => movePoint(0, -1, ctx.recordChange),
    movePointLeft: () => movePoint(-1, 0, ctx.recordChange),
    movePointRight: () => movePoint(1, 0, ctx.recordChange),
    selectNextSequence: () => cycleSequenceSelection(1, ctx.controlTabRef),
    selectPrevSequence: () => cycleSequenceSelection(-1, ctx.controlTabRef),
    increaseValue: () => modifyValue(1, ctx.recordChange),
    decreaseValue: () => modifyValue(-1, ctx.recordChange),
    increaseValueSmall: () => modifyValue(0.1, ctx.recordChange),
    decreaseValueSmall: () => modifyValue(-0.1, ctx.recordChange),
    toggleHeadingMode: () => toggleHeadingMode(ctx.recordChange),
    toggleReverse: () => toggleReverse(ctx.recordChange),
    toggleLock: () => toggleLock(ctx.recordChange),
    togglePathChain: () => togglePathChain(ctx.recordChange),
    togglePiecewise: () => togglePiecewise(ctx.recordChange),
    toggleGlobalHeading: () => toggleGlobalHeading(ctx.recordChange),
    toggleOnion: () =>
      settingsStore.update((s) => ({
        ...s,
        showOnionLayers: !s.showOnionLayers,
      })),
    toggleGrid: () => showGrid.update((v) => !v),
    cycleGridSize: () => cycleGridSize(),
    cycleGridSizeReverse: () => cycleGridSizeReverse(),
    toggleSnap: () => snapToGrid.update((v) => !v),
    zoomIn: () => modifyZoom(0.1),
    zoomOut: () => modifyZoom(-0.1),
    zoomReset: () => resetZoom(),
    increasePlaybackSpeed: () => changePlaybackSpeedBy(0.25, ctx.play),
    decreasePlaybackSpeed: () => changePlaybackSpeedBy(-0.25, ctx.play),
    resetPlaybackSpeed: () => resetPlaybackSpeed(),
    toggleLoop: () => loopAnimationStore.update((v) => !v),
    toggleSectionLoop: () => {
      let currentActive = false;
      loopRangeActiveStore.subscribe((v) => (currentActive = v))();
      const newVal = !currentActive;
      loopRangeActiveStore.set(newVal);
      if (newVal) {
        let currentPercent = 0;
        percentStore.subscribe((v) => (currentPercent = v))();
        loopRangeStore.set([Math.floor(currentPercent), 100]);
      }
    },
    toggleProtractor: () => showProtractor.update((v) => !v),
    optimizeStart: () => {
      ctx.controlTabRef?.openAndStartOptimization?.();
    },
    optimizeStop: () => {
      if (ctx.controlTabRef?.getOptimizationStatus?.().isRunning)
        ctx.controlTabRef?.stopOptimization?.();
    },
    optimizeApply: () => {
      const status = ctx.controlTabRef?.getOptimizationStatus?.();
      if (status?.optimizedLines && !status.optimizationFailed)
        ctx.controlTabRef?.applyOptimization?.();
    },
    optimizeDiscard: () => {
      const status = ctx.controlTabRef?.getOptimizationStatus?.();
      if (status?.optimizedLines || status?.optimizationFailed)
        ctx.controlTabRef?.discardOptimization?.();
    },
    optimizeRetry: () => {
      const status = ctx.controlTabRef?.getOptimizationStatus?.();
      if (
        !status?.isRunning &&
        (status?.optimizedLines || status?.optimizationFailed)
      )
        ctx.controlTabRef?.retryOptimization?.();
    },
    selectTabPaths: () => ctx.setActiveControlTab("path"),
    selectTabField: () => ctx.setActiveControlTab("field"),
    selectTabTable: () => ctx.setActiveControlTab("table"),
    selectTabCode: () => ctx.setActiveControlTab("code"),
    cycleTabNext: () => {
      if (get(showSettings)) {
        const tabs = SETTINGS_TAB_ORDER;
        const current = get(settingsActiveTab);
        const idx = tabs.indexOf(current);
        const next = tabs[(idx + 1) % tabs.length];
        settingsActiveTab.set(next);
      } else {
        const tab = ctx.getActiveControlTab();
        if (tab === "path") ctx.setActiveControlTab("field");
        else if (tab === "field") ctx.setActiveControlTab("table");
        else if (tab === "table") ctx.setActiveControlTab("code");
        else ctx.setActiveControlTab("path");
      }
    },
    cycleTabPrev: () => {
      if (get(showSettings)) {
        const tabs = SETTINGS_TAB_ORDER;
        const current = get(settingsActiveTab);
        const idx = tabs.indexOf(current);
        const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
        settingsActiveTab.set(prev);
      } else {
        const tab = ctx.getActiveControlTab();
        if (tab === "path") ctx.setActiveControlTab("code");
        else if (tab === "code") ctx.setActiveControlTab("table");
        else if (tab === "table") ctx.setActiveControlTab("field");
        else ctx.setActiveControlTab("path");
      }
    },
    toggleCollapseAll: () => toggleCollapseAllTrigger.update((v) => v + 1),
    toggleCollapseSelected: () => {
      if (isUIElementFocused()) return;
      ctx.controlTabRef?.toggleCollapseSelected?.();
    },
    showHelp: () => showShortcuts.update((v) => !v),
    openSettings: () => showSettings.update((v) => !v),
    openWhatsNew: () => {
      ctx.openWhatsNew?.();
    },
    toggleCommandPalette: () => {
      ctx.toggleCommandPalette();
    },
    toggleStats: () => {
      ctx.toggleStats?.();
    },
    toggleSidebar: () => {
      ctx.toggleSidebar?.();
    },
    toggleControlTab: () => {
      ctx.toggleControlTab?.();
    },
    toggleDraw: () => {
      isDrawingMode.update((v) => !v);
    },
    togglePresentationMode: () => isPresentationMode.update((v) => !v),
    toggleVelocityHeatmap: () =>
      settingsStore.update((s) => ({
        ...s,
        showVelocityHeatmap: !s.showVelocityHeatmap,
      })),
    toggleHistory: () => showHistory.update((v) => !v),
    toggleStrategySheet: () => showStrategySheet.update((v) => !v),
    toggleProtractorLock: () => protractorLockToRobot.update((v) => !v),
    toggleTransformDialog: () => showTransformDialog.update((v) => !v),
    addObstacle: () => {
      shapesStore.update((s) => [...s, createTriangle(s.length)]);
      ctx.setActiveControlTab("field");
    },
    focusName: () => {
      const sel = get(selectedPointId) || get(selectedLineId);
      if (sel) {
        focusRequest.set({
          field: "name",
          timestamp: Date.now(),
          id: sel,
        });
      }
    },
    editItem: () => {
      const sel = get(selectedPointId);
      if (!sel) return;
      if (sel.startsWith("wait-")) {
        focusRequest.set({ field: "x", timestamp: Date.now(), id: sel });
      } else if (sel.startsWith("rotate-")) {
        focusRequest.set({ field: "heading", timestamp: Date.now(), id: sel });
      } else {
        focusRequest.set({ field: "x", timestamp: Date.now(), id: sel });
      }
    },
    selectAll: () => selectAll(),
    deselectAll: () => {
      if (dismissOpenDialog()) return;
      if (ctx.isCommandPaletteOpen()) {
        ctx.closeCommandPalette();
        return;
      }
      deselectAllElements();
    },
    focusX: () =>
      focusRequest.set({
        field: "x",
        timestamp: Date.now(),
        id: get(selectedPointId) || undefined,
      }),
    focusY: () =>
      focusRequest.set({
        field: "y",
        timestamp: Date.now(),
        id: get(selectedPointId) || undefined,
      }),
    focusHeading: () =>
      focusRequest.set({
        field: "heading",
        timestamp: Date.now(),
        id: get(selectedPointId) || undefined,
      }),
    togglePlay: () => {
      if (ctx.isPlaying()) ctx.pause();
      else ctx.play();
    },
    openFile: () => {
      ctx.openFileInput();
    },
    newProject: () => {
      ctx.resetProject();
    },
    toggleFileManager: () => {
      showFileManager.update((v) => !v);
    },
    exportJava: () => exportDialogState.set({ isOpen: true, format: "java" }),
    panToStart: () => panToStart(ctx.fieldRenderer),
    panToEnd: () => panToEnd(ctx.fieldRenderer),
    panViewUp: () => panView(0, 50),
    panViewDown: () => panView(0, -50),
    panViewLeft: () => panView(50, 0),
    panViewRight: () => panView(-50, 0),
    selectLast: () => selectLast(),
    selectFirst: () => selectFirst(),
    copyPathJson: () => copyPathJson(),
    toggleDebugSequence: () =>
      settingsStore.update((s) => ({
        ...s,
        showDebugSequence: !(s as any).showDebugSequence,
      })),
    toggleFieldBoundaries: () =>
      settingsStore.update((s) => ({
        ...s,
        validateFieldBoundaries: !s.validateFieldBoundaries,
      })),
    toggleDragRestriction: () =>
      settingsStore.update((s) => ({
        ...s,
        restrictDraggingToField: !s.restrictDraggingToField,
      })),
    setTheme: (theme: any) => settingsStore.update((s) => ({ ...s, theme })),
    setAutosave: (mode: any, interval?: any) => {
      if (mode === "never")
        settingsStore.update((s) => ({ ...s, autosaveMode: "never" }));
      else if (mode === "time")
        settingsStore.update((s) => ({
          ...s,
          autosaveMode: "time",
          autosaveInterval: interval,
        }));
      else if (mode === "change")
        settingsStore.update((s) => ({ ...s, autosaveMode: "change" }));
      else if (mode === "close")
        settingsStore.update((s) => ({ ...s, autosaveMode: "close" }));
    },
    openDocs: () => {
      const url =
        "https://www.turtletracer.com/turtle-tracer-lib/installation/";
      const api = getElectronAPI();
      if (api?.openExternal) {
        api.openExternal(url);
      } else {
        window.open(url, "_blank");
      }
    },
    reportIssue: () => {
      const url = "https://github.com/Mallen220/TurtleTracer/issues";
      const api = getElectronAPI();
      if (api?.openExternal) {
        api.openExternal(url);
      } else {
        window.open(url, "_blank");
      }
    },
    checkForUpdates: () => {
      const api = getElectronAPI();
      if (api?.checkForUpdates) {
        api
          .checkForUpdates()
          .catch((err: any) => console.warn("Manual update check failed", err));
      } else {
        const url = "https://github.com/Mallen220/TurtleTracer/releases";
        if (api?.openExternal) api.openExternal(url);
        else window.open(url, "_blank");
      }
    },
    setFileManagerDirectory: async () => {
      const api = getElectronAPI();
      if (api?.setDirectory) {
        await api.setDirectory();
        ctx.fetchFiles();
      }
    },
    resetKeybinds: () => {
      if (
        confirm(
          "Reset all key bindings to defaults? This will overwrite any custom key bindings.",
        )
      ) {
        settingsStore.update((s) => ({
          ...s,
          keyBindings: DEFAULT_KEY_BINDINGS.map((b) => ({ ...b })),
        }));
      }
    },
    resetSettings: () => {
      settingsStore.set({ ...DEFAULT_SETTINGS });
    },
    cycleTheme: () => {
      settingsStore.update((s) => {
        const themes: ("light" | "dark" | "auto")[] = ["light", "dark", "auto"];
        const currentIndex = themes.indexOf(s.theme as any);
        const nextIndex = (currentIndex + 1) % themes.length;
        return { ...s, theme: themes[nextIndex] };
      });
    },
    setThemeLight: () => handlers.setTheme("light"),
    setThemeDark: () => handlers.setTheme("dark"),
    setAutoSaveNever: () => handlers.setAutosave("never"),
    setAutoSave1m: () => handlers.setAutosave("time", 1),
    setAutoSave5m: () => handlers.setAutosave("time", 5),
    setAutoSaveChange: () => handlers.setAutosave("change"),
    setAutoSaveClose: () => handlers.setAutosave("close"),
    startTutorial: () => {
      import("../../../stores").then(({ startTutorial }) => {
        startTutorial.set(true);
      });
    },
    toggleDiff: () => toggleDiff(),
    togglePluginManager: () => showPluginManager.update((v) => !v),
    toggleRuler: () => showRuler.update((v) => !v),
    cycleFieldMap: () => cycleFieldMap(),
    rotateField: () => rotateField(),
    toggleContinuousValidation: () => toggleContinuousValidation(),
    toggleOnionCurrentPath: () => toggleOnionCurrentPath(),
    cyclePathColor: () => cyclePathColor(ctx.recordChange),
    toggleRobotVisibility: () => toggleRobotVisibility(),
    toggleRobotArrows: () =>
      settingsStore.update((s) => ({
        ...s,
        showRobotArrows: !s.showRobotArrows,
      })),
    copyCode: () => {
      ctx.controlTabRef?.copyCode?.();
    },
    copyTable: () => {
      ctx.controlTabRef?.copyTable?.();
    },
    downloadJava: () => {
      ctx.controlTabRef?.downloadJava?.();
    },
    cycleRobotProfile: () => {
      const profiles = get(robotProfilesStore);
      if (profiles.length === 0) {
        notification.set({
          message: "No robot profiles found.",
          type: "warning",
        });
        return;
      }

      const currentSettings = get(settingsStore);
      const currentIndex = profiles.findIndex(
        (p) =>
          p.rLength === currentSettings.rLength &&
          p.rWidth === currentSettings.rWidth &&
          p.maxVelocity === currentSettings.maxVelocity,
      );

      const nextIndex = (currentIndex + 1) % profiles.length;
      const nextProfile = profiles[nextIndex];

      settingsStore.update((s) => ({
        ...s,
        rLength: nextProfile.rLength,
        rWidth: nextProfile.rWidth,
        maxVelocity: nextProfile.maxVelocity,
        maxAcceleration: nextProfile.maxAcceleration,
        maxDeceleration: nextProfile.maxDeceleration,
        maxAngularAcceleration:
          nextProfile.maxAngularAcceleration ?? s.maxAngularAcceleration,
        kFriction: nextProfile.kFriction,
        aVelocity: nextProfile.aVelocity,
        xVelocity: nextProfile.xVelocity,
        yVelocity: nextProfile.yVelocity,
        robotImage: nextProfile.robotImage || s.robotImage,
      }));

      notification.set({
        message: `Switched to profile: ${nextProfile.name}`,
        type: "success",
      });
    },
    toggleFollowRobot: () => {
      settingsStore.update((s) => {
        const newVal = !s.followRobot;
        notification.set({
          message: `Follow Robot: ${newVal ? "On" : "Off"}`,
          type: "info",
          timeout: 1500,
        });
        return { ...s, followRobot: newVal };
      });
    },
    toggleLockFieldView: () => {
      settingsStore.update((s) => {
        const newVal = !s.lockFieldView;
        notification.set({
          message: `Lock Field View: ${newVal ? "On" : "Off"}`,
          type: "info",
          timeout: 1500,
        });
        return { ...s, lockFieldView: newVal };
      });
    },
    toggleVelocityTooltip: () => {
      settingsStore.update((s) => ({
        ...s,
        showVelocityTooltip: !s.showVelocityTooltip,
      }));
    },
    focusPathList: () => {
      ctx.setActiveControlTab("path");
      setTimeout(() => {
        document.getElementById("path-list-container")?.focus();
      }, 50);
    },
    focusCodeEditor: () => {
      ctx.setActiveControlTab("code");
      setTimeout(() => {
        document.getElementById("code-preview-container")?.focus();
      }, 50);
    },
    confirmDialog: () => {
      if (!dismissOpenDialog()) {
        if (ctx.isCommandPaletteOpen()) ctx.closeCommandPalette();
      }
    },
    cancelDialog: () => {
      handlers.deselectAll();
    },
  };

  return handlers;
}
