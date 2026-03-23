<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import hotkeys from "hotkeys-js";
  import CommandPalette from "./CommandPalette.svelte";
  import { isSupportedProjectFileName } from "../../utils/fileExtensions";
  import {
    gridSize,
    showGrid,
    snapToGrid,
    showProtractor,
    showShortcuts,
    showSettings,
    isPresentationMode,
    selectedPointId,
    multiSelectedPointIds,
    selectedLineId,
    multiSelectedLineIds,
    toggleCollapseAllTrigger,
    fieldZoom,
    fieldPan,
    focusRequest,
    exportDialogState,
    showFileManager,
    fileManagerNewFileMode,
    showPluginManager,
    showRuler,
    settingsActiveTab,
    showTelemetryDialog,
    showStrategySheet,
    showHistory,
    showTransformDialog,
    protractorLockToRobot,
    showExportGif,
    notification,
    showRobot,
    showUpdateAvailableDialog as _showUpdateAvailableDialog,
    showFeedbackDialog,
    showRatingDialog,
    executeCommandBus,
    availableCommands,
  } from "../../stores";
  // keep a local binding for the update-available store
  const showUpdateAvailableDialog = _showUpdateAvailableDialog;
  import {
    startPointStore,
    linesStore,
    shapesStore,
    sequenceStore,
    settingsStore,
    playingStore,
    playbackSpeedStore,
    renumberDefaultPathNames,
    robotProfilesStore,
  } from "../projectStore";
  import type { Point } from "../../types";
  import {
    updateLinkedWaypoints,
    updateLinkedWaits,
    updateLinkedRotations,
  } from "../../utils/pointLinking";
  import { loadFile, loadRecentFile } from "../../utils/fileHandlers";
  import { validatePath } from "../../utils/validation";
  import { reversePathData } from "../../utils/pathTransform";
  import type { Line, SequenceItem } from "../../types/index";
  import { createTriangle } from "../../utils";
  import { toggleDiff } from "../../lib/diffStore";
  import {
    FIELD_SIZE,
    DEFAULT_SETTINGS,
    getDefaultStartPoint,
    AVAILABLE_FIELD_MAPS,
    SETTINGS_TAB_ORDER,
  } from "../../config";
  import { DEFAULT_KEY_BINDINGS } from "../../config/keybindings";
  import { getRandomColor } from "../../utils";
  import { computeZoomStep } from "../zoomHelpers";
  import { actionRegistry } from "../actionRegistry";
  import _ from "lodash";

  // Imports from shortcuts
  import {
    isUIElementFocused,
    isInputFocused,
    isButtonFocused,
    shouldBlockShortcut,
    getSelectedSequenceIndex,
  } from "./shortcuts/utils";
  import {
    addNewLine,
    addWait,
    addRotate,
    addEventMarker,
    addControlPoint,
    removeControlPoint,
  } from "./shortcuts/elements";
  import {
    clipboard,
    generateName,
    duplicate,
    copy,
    cut,
    paste,
  } from "./shortcuts/clipboard";
  import {
    removeSelected,
    movePoint,
    LEGACY_movePoint,
    getSelectableItems,
    syncSelectionToUI,
    cycleSelection,
    cycleSequenceSelection,
  } from "./shortcuts/selection";
  import {
    modifyValue,
    toggleHeadingMode,
    toggleReverse,
    toggleLock,
  } from "./shortcuts/properties";
  import {
    cycleGridSize,
    cycleGridSizeReverse,
    modifyZoom,
    resetZoom,
    snapSelection,
    resetStartPoint,
    panToStart,
    panToEnd,
    panView,
  } from "./shortcuts/view";
  import {
    changePlaybackSpeedBy,
    resetPlaybackSpeed,
  } from "./shortcuts/playback";
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
  } from "./shortcuts/misc";

  // Actions
  export let saveProject: () => void;
  export let resetProject: () => void;
  export let saveFileAs: () => void;
  export let exportGif: () => void;
  export let exportImage: () => void = () => {};
  export let undoAction: () => void;
  export let redoAction: () => void;
  export let play: () => void;
  export let pause: () => void;
  export let resetAnimation: () => void;
  export let stepForward: () => void;
  export let stepBackward: () => void;
  export let splitPath: () => void = () => {};
  export let recordChange: (action?: string) => void;
  export let controlTabRef: any = null;
  export let activeControlTab: "path" | "field" | "table" | "code" = "path";
  export let toggleStats: () => void = () => {};
  export let toggleSidebar: () => void = () => {};
  export let toggleControlTab: () => void = () => {};
  export let fieldRenderer: any = null;

  // Optional callback provided by App.svelte to open the What's New dialog
  export let openWhatsNew: () => void;

  // Reactive Values
  $: settings = $settingsStore;
  $: lines = $linesStore;
  $: startPoint = $startPointStore;
  $: shapes = $shapesStore;
  $: sequence = $sequenceStore;
  $: playing = $playingStore;
  $: playbackSpeed = $playbackSpeedStore;

  // Internal State
  let showCommandPalette = false;
  let fileInput: HTMLInputElement;
  let fileCommands: {
    id: string;
    label: string;
    action: () => void;
    category: string;
  }[] = [];

  async function fetchFiles() {
    if (!window.electronAPI) return;
    try {
      let dir: string | null = await window.electronAPI.getSavedDirectory();
      if (!dir) dir = await window.electronAPI.getDirectory();
      if (dir) {
        const files = await window.electronAPI.listFiles(dir);
        fileCommands = files
          .filter((f) => isSupportedProjectFileName(f.name))
          .map((f) => ({
            id: `file-${f.name}`,
            label: `Open File: ${f.name}`,
            action: () => loadRecentFile(f.path),
            category: "File",
          }));
      }
    } catch (err) {
      console.warn("Failed to fetch files for command palette", err);
    }
  }

  $: if (showCommandPalette) {
    fetchFiles();
  }

  // --- Registration ---

  // Create map of actionId -> handler
  $: actions = {
    saveProject: () => saveProject(),
    saveFileAs: () => saveFileAs(),
    exportGif: () => exportGif(),
    exportImage: () => exportImage(),
    addNewLine: () => addNewLine(recordChange),
    addWait: () => addWait(recordChange),
    addRotate: () => addRotate(recordChange),
    addEventMarker: () => addEventMarker(recordChange),
    addControlPoint: () => addControlPoint(recordChange),
    removeControlPoint: () => removeControlPoint(recordChange),
    duplicate: () => duplicate(recordChange),
    copy: () => copy(activeControlTab, controlTabRef),
    cut: () =>
      cut(activeControlTab, controlTabRef, () => removeSelected(recordChange)),
    paste: () => paste(recordChange),
    splitPath: () => splitPath && splitPath(),
    removeSelected: () => removeSelected(recordChange),
    undo: () => undoAction(),
    redo: () => redoAction(),
    resetAnimation: () => resetAnimation(),
    stepForward: () => stepForward(),
    stepBackward: () => stepBackward(),
    movePointUp: () => movePoint(0, 1, recordChange),
    movePointDown: () => movePoint(0, -1, recordChange),
    movePointLeft: () => movePoint(-1, 0, recordChange),
    movePointRight: () => movePoint(1, 0, recordChange),
    selectNextSequence: () => cycleSequenceSelection(1, controlTabRef),
    selectPrevSequence: () => cycleSequenceSelection(-1, controlTabRef),
    increaseValue: () => modifyValue(1, recordChange),
    decreaseValue: () => modifyValue(-1, recordChange),
    increaseValueSmall: () => modifyValue(0.1, recordChange),
    decreaseValueSmall: () => modifyValue(-0.1, recordChange),
    toggleHeadingMode: () => toggleHeadingMode(recordChange),
    toggleReverse: () => toggleReverse(recordChange),
    toggleLock: () => toggleLock(recordChange),
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
    increasePlaybackSpeed: () => changePlaybackSpeedBy(0.25, play),
    decreasePlaybackSpeed: () => changePlaybackSpeedBy(-0.25, play),
    resetPlaybackSpeed: () => resetPlaybackSpeed(),
    toggleProtractor: () => showProtractor.update((v) => !v),
    optimizeStart: () => {
      if (controlTabRef?.openAndStartOptimization)
        controlTabRef.openAndStartOptimization();
    },
    optimizeStop: () => {
      if (controlTabRef?.getOptimizationStatus?.().isRunning)
        controlTabRef.stopOptimization();
    },
    optimizeApply: () => {
      const status = controlTabRef?.getOptimizationStatus?.();
      if (status?.optimizedLines && !status.optimizationFailed)
        controlTabRef.applyOptimization();
    },
    optimizeDiscard: () => {
      const status = controlTabRef?.getOptimizationStatus?.();
      if (status?.optimizedLines || status?.optimizationFailed)
        controlTabRef.discardOptimization();
    },
    optimizeRetry: () => {
      const status = controlTabRef?.getOptimizationStatus?.();
      if (
        !status?.isRunning &&
        (status?.optimizedLines || status?.optimizationFailed)
      )
        controlTabRef.retryOptimization();
    },
    selectTabPaths: () => (activeControlTab = "path"),
    selectTabField: () => (activeControlTab = "field"),
    selectTabTable: () => (activeControlTab = "table"),
    selectTabCode: () => (activeControlTab = "code"),
    cycleTabNext: () => {
      if ($showSettings) {
        const tabs = SETTINGS_TAB_ORDER;
        const current = $settingsActiveTab;
        const idx = tabs.indexOf(current);
        const next = tabs[(idx + 1) % tabs.length];
        settingsActiveTab.set(next);
      } else {
        if (activeControlTab === "path") activeControlTab = "field";
        else if (activeControlTab === "field") activeControlTab = "table";
        else if (activeControlTab === "table") activeControlTab = "code";
        else activeControlTab = "path";
      }
    },
    cycleTabPrev: () => {
      if ($showSettings) {
        const tabs = SETTINGS_TAB_ORDER;
        const current = $settingsActiveTab;
        const idx = tabs.indexOf(current);
        const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
        settingsActiveTab.set(prev);
      } else {
        if (activeControlTab === "path") activeControlTab = "code";
        else if (activeControlTab === "code") activeControlTab = "table";
        else if (activeControlTab === "table") activeControlTab = "field";
        else activeControlTab = "path";
      }
    },
    toggleCollapseAll: () => toggleCollapseAllTrigger.update((v) => v + 1),
    toggleCollapseSelected: () => {
      if (isUIElementFocused()) return;
      if (controlTabRef && controlTabRef.toggleCollapseSelected) {
        controlTabRef.toggleCollapseSelected();
      }
    },
    showHelp: () => showShortcuts.update((v) => !v),
    openSettings: () => showSettings.update((v) => !v),
    openWhatsNew: () => {
      if (openWhatsNew) openWhatsNew();
    },
    toggleCommandPalette: () => {
      showCommandPalette = !showCommandPalette;
    },
    toggleStats: () => {
      if (toggleStats) toggleStats();
    },
    toggleSidebar: () => {
      if (toggleSidebar) toggleSidebar();
    },
    toggleControlTab: () => {
      if (toggleControlTab) toggleControlTab();
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
      activeControlTab = "field";
    },
    focusName: () => {
      const sel = $selectedPointId || $selectedLineId;
      if (sel) {
        focusRequest.set({
          field: "name",
          timestamp: Date.now(),
          id: sel,
        });
      }
    },
    editItem: () => {
      const sel = $selectedPointId;
      if (!sel) return;
      if (sel.startsWith("wait-")) {
        // Map 'x' to duration for Wait items
        focusRequest.set({ field: "x", timestamp: Date.now(), id: sel });
      } else if (sel.startsWith("rotate-")) {
        // Map 'heading' (or 'degrees') for Rotate items
        focusRequest.set({ field: "heading", timestamp: Date.now(), id: sel });
      } else {
        // Default to X for points/obstacles
        focusRequest.set({ field: "x", timestamp: Date.now(), id: sel });
      }
    },
    deselectAll: () => {
      if ($showSettings) {
        showSettings.set(false);
        return;
      }
      if ($showFileManager) {
        showFileManager.set(false);
        return;
      }
      if ($showPluginManager) {
        showPluginManager.set(false);
        return;
      }
      if ($showShortcuts) {
        showShortcuts.set(false);
        return;
      }
      if ($showExportGif) {
        showExportGif.set(false);
        return;
      }
      if ($exportDialogState.isOpen) {
        exportDialogState.update((s) => ({ ...s, isOpen: false }));
        return;
      }
      if ($showTelemetryDialog) {
        showTelemetryDialog.set(false);
        return;
      }
      if ($showStrategySheet) {
        showStrategySheet.set(false);
        return;
      }
      if ($showFeedbackDialog) {
        showFeedbackDialog.set(false);
        return;
      }
      if ($showRatingDialog) {
        showRatingDialog.set(false);
        return;
      }
      if ($showTransformDialog) {
        showTransformDialog.set(false);
        return;
      }
      if ($showUpdateAvailableDialog) {
        showUpdateAvailableDialog.set(false);
        return;
      }
      if (showCommandPalette) {
        showCommandPalette = false;
        return;
      }

      selectedPointId.set(null);
      multiSelectedPointIds.set([]);
      selectedLineId.set(null);
      multiSelectedLineIds.set([]);
      // Blur any active input
      if (
        document.activeElement &&
        (document.activeElement as HTMLElement).blur
      ) {
        (document.activeElement as HTMLElement).blur();
      }
    },
    focusX: () => focusRequest.set({ field: "x", timestamp: Date.now() }),
    focusY: () => focusRequest.set({ field: "y", timestamp: Date.now() }),
    focusHeading: () =>
      focusRequest.set({ field: "heading", timestamp: Date.now() }),
    togglePlay: () => {
      if (playing) pause();
      else play();
    },
    openFile: () => {
      if (fileInput) fileInput.click();
    },
    newProject: () => {
      resetProject();
    },
    toggleFileManager: () => {
      showFileManager.update((v) => !v);
    },
    exportJava: () => exportDialogState.set({ isOpen: true, format: "java" }),
    exportPoints: () =>
      exportDialogState.set({ isOpen: true, format: "points" }),
    exportSequential: () =>
      exportDialogState.set({ isOpen: true, format: "sequential" }),
    exportPP: () => exportDialogState.set({ isOpen: true, format: "json" }),
    // New Actions
    moveItemUp: () => {
      const idx = getSelectedSequenceIndex();
      if (idx !== null && controlTabRef && controlTabRef.moveSequenceItem) {
        controlTabRef.moveSequenceItem(idx, -1);
      }
    },
    moveItemDown: () => {
      const idx = getSelectedSequenceIndex();
      if (idx !== null && controlTabRef && controlTabRef.moveSequenceItem) {
        controlTabRef.moveSequenceItem(idx, 1);
      }
    },
    addPathAtStart: () => {
      if (controlTabRef && controlTabRef.addPathAtStart)
        controlTabRef.addPathAtStart();
    },
    addWaitAtStart: () => {
      if (controlTabRef && controlTabRef.addWaitAtStart)
        controlTabRef.addWaitAtStart();
    },
    addRotateAtStart: () => {
      if (controlTabRef && controlTabRef.addRotateAtStart)
        controlTabRef.addRotateAtStart();
    },
    validatePath: () => {
      validatePath(startPoint, lines, settings, sequence, shapes);
    },
    reversePath: () => {
      try {
        const transformedData = reversePathData({
          startPoint,
          lines,
          shapes,
          sequence,
        });

        if (transformedData) {
          startPointStore.set(transformedData.startPoint);
          linesStore.set(transformedData.lines);
          if (transformedData.shapes) {
            shapesStore.set(transformedData.shapes);
          }
          if (transformedData.sequence) {
            sequenceStore.set(transformedData.sequence);
          }
          recordChange("Reverse Path");
          notification.set({
            message: `Path reversed`,
            type: "success",
            timeout: 2000,
          });
        }
      } catch (e: any) {
        notification.set({
          message: `Failed to reverse path: ${e.message}`,
          type: "error",
          timeout: 5000,
        });
      }
    },
    clearObstacles: () => {
      shapesStore.set([]);
      recordChange("Clear Obstacles");
    },
    snapSelection: () => snapSelection(recordChange),
    resetStartPoint: () => resetStartPoint(recordChange),
    panToStart: () => panToStart(fieldRenderer),
    panToEnd: () => panToEnd(fieldRenderer),
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
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.openExternal) {
        // @ts-ignore
        window.electronAPI.openExternal(url);
      } else {
        window.open(url, "_blank");
      }
    },
    reportIssue: () => {
      const url = "https://github.com/Mallen220/TurtleTracer/issues";
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.openExternal) {
        // @ts-ignore
        window.electronAPI.openExternal(url);
      } else {
        window.open(url, "_blank");
      }
    },
    checkForUpdates: () => {
      const api = (window as any).electronAPI;
      if (api && api.checkForUpdates) {
        api
          .checkForUpdates()
          .catch((err: any) => console.warn("Manual update check failed", err));
      } else {
        const url = "https://github.com/Mallen220/TurtleTracer/releases";
        if (api && api.openExternal) api.openExternal(url);
        else window.open(url, "_blank");
      }
    },
    setFileManagerDirectory: async () => {
      if (window.electronAPI && window.electronAPI.setDirectory) {
        await window.electronAPI.setDirectory();
        // Optionally refresh files after setting directory
        fetchFiles();
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
      settingsStore.set(structuredClone(DEFAULT_SETTINGS));
    },
    cycleTheme: () => {
      settingsStore.update((s) => {
        const themes: ("light" | "dark" | "auto")[] = ["light", "dark", "auto"];
        const currentIndex = themes.indexOf(s.theme as any);
        const nextIndex = (currentIndex + 1) % themes.length;
        return { ...s, theme: themes[nextIndex] };
      });
    },
    setThemeLight: () => (actions as any).setTheme("light"),
    setThemeDark: () => (actions as any).setTheme("dark"),
    setAutoSaveNever: () => (actions as any).setAutosave("never"),
    setAutoSave1m: () => (actions as any).setAutosave("time", 1),
    setAutoSave5m: () => (actions as any).setAutosave("time", 5),
    setAutoSaveChange: () => (actions as any).setAutosave("change"),
    setAutoSaveClose: () => (actions as any).setAutosave("close"),
    startTutorial: () => {
      import("../../stores").then(({ startTutorial }) => {
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
    cyclePathColor: () => cyclePathColor(recordChange),
    toggleRobotVisibility: () => toggleRobotVisibility(),
    toggleRobotArrows: () =>
      settingsStore.update((s) => ({
        ...s,
        showRobotArrows: !s.showRobotArrows,
      })),
    copyCode: () => {
      if (controlTabRef && controlTabRef.copyCode) {
        controlTabRef.copyCode();
      }
    },
    copyTable: () => {
      if (controlTabRef && controlTabRef.copyTable) {
        controlTabRef.copyTable();
      }
    },
    downloadJava: () => {
      if (controlTabRef && controlTabRef.downloadJava) {
        controlTabRef.downloadJava();
      }
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
      // Simple heuristic match
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
    focusPathList: () => {
      activeControlTab = "path";
      setTimeout(() => {
        document.getElementById("path-list-container")?.focus();
      }, 50);
    },
    focusCodeEditor: () => {
      activeControlTab = "code";
      setTimeout(() => {
        document.getElementById("code-preview-container")?.focus();
      }, 50);
    },
    confirmDialog: () => {
      if ($showSettings) showSettings.set(false);
      else if ($showFileManager) showFileManager.set(false);
      else if ($showPluginManager) showPluginManager.set(false);
      else if ($showExportGif) showExportGif.set(false);
      else if ($exportDialogState.isOpen)
        exportDialogState.update((s) => ({ ...s, isOpen: false }));
      else if ($showFeedbackDialog) showFeedbackDialog.set(false);
      else if ($showRatingDialog) showRatingDialog.set(false);
      else if ($showTransformDialog) showTransformDialog.set(false);
      else if ($showUpdateAvailableDialog) showUpdateAvailableDialog.set(false);
      else if (showCommandPalette) showCommandPalette = false;
      // Add more as needed
    },
    cancelDialog: () => {
      (actions as any).deselectAll();
    },
  };

  // --- Derived Commands for Search ---
  $: lineCommands = lines.map((l, i) => ({
    id: `cmd-line-${l.id}`,
    label: l.name ? `Path: ${l.name}` : `Path ${i + 1}`,
    category: "Path Segment",
    action: () => {
      selectedLineId.set(l.id || null);
      const idx = lines.findIndex((ln) => ln.id === l.id);
      if (idx !== -1) {
        selectedPointId.set(`point-${idx + 1}-0`);
      }

      if (controlTabRef && controlTabRef.scrollToItem) {
        controlTabRef.scrollToItem("path", l.id || "");
      }
    },
  }));

  $: waitCommands = sequence
    .filter((s) => actionRegistry.get(s.kind)?.isWait)
    .map((s: any) => ({
      id: `cmd-wait-${s.id}`,
      label: s.name ? `Wait: ${s.name}` : "Wait",
      category: "Wait",
      action: () => {
        selectedPointId.set(`wait-${s.id}`);
        selectedLineId.set(null);
        if (controlTabRef && controlTabRef.scrollToItem) {
          controlTabRef.scrollToItem("wait", s.id);
        }
      },
    }));

  $: rotateCommands = sequence
    .filter((s) => actionRegistry.get(s.kind)?.isRotate)
    .map((s: any) => ({
      id: `cmd-rotate-${s.id}`,
      label: s.name ? `Rotate: ${s.name}` : "Rotate",
      category: "Rotate",
      action: () => {
        selectedPointId.set(`rotate-${s.id}`);
        selectedLineId.set(null);
        if (controlTabRef && controlTabRef.scrollToItem) {
          controlTabRef.scrollToItem("rotate", s.id);
        }
      },
    }));

  $: eventCommands = (() => {
    const cmds: any[] = [];

    lines.forEach((l, lIdx) => {
      if (l.eventMarkers) {
        l.eventMarkers.forEach((m) => {
          cmds.push({
            id: `cmd-event-${m.id}`,
            label: m.name ? `Event: ${m.name}` : `Event (Path ${lIdx + 1})`,
            category: "Event Marker",
            action: () => {
              if (controlTabRef && controlTabRef.scrollToItem) {
                controlTabRef.scrollToItem("event", m.id);
              }
            },
          });
        });
      }
    });

    sequence.forEach((s) => {
      const def = actionRegistry.get(s.kind);
      if (def?.isWait || def?.isRotate) {
        const item = s as any;
        if (item.eventMarkers) {
          item.eventMarkers.forEach((m: any) => {
            cmds.push({
              id: `cmd-event-${m.id}`,
              label: m.name ? `Event: ${m.name}` : `Event (${def.label})`,
              category: "Event Marker",
              action: () => {
                if (controlTabRef && controlTabRef.scrollToItem) {
                  controlTabRef.scrollToItem("event", m.id);
                }
              },
            });
          });
        }
      }
    });
    return cmds;
  })();

  // Derive commands list for Command Palette
  $: paletteCommands = [
    ...(settings?.keyBindings || DEFAULT_KEY_BINDINGS)
      .filter((b) => (actions as any)[b.action])
      .map((b) => ({
        id: b.id,
        label: b.description,
        shortcut: b.key,
        category: b.category,
        action: (actions as any)[b.action],
      })),
    ...fileCommands,
    ...lineCommands,
    ...waitCommands,
    ...rotateCommands,
    ...eventCommands,
  ];

  $: availableCommands.set(paletteCommands);

  $: if ($executeCommandBus) {
    const cmdId = $executeCommandBus;
    executeCommandBus.set(null);
    const cmd = paletteCommands.find((c) => c.id === cmdId);
    if (cmd && cmd.action) {
      cmd.action();
    }
  }

  $: if (settings && settings.keyBindings) {
    hotkeys.unbind();

    // Bind all actions defined in settings
    settings.keyBindings.forEach((binding) => {
      const handler = (actions as any)[binding.action];
      if (handler && binding.key) {
        hotkeys(binding.key, (e) => {
          if (shouldBlockShortcut(e, binding.id)) return;
          e.preventDefault();
          handler(e);
        });
      }
    });

    // Special case for Play/Pause toggle which is mapped to 'togglePlay' action
    // but the ID in defaults is 'play-pause' and action is 'togglePlay'.
    // The loop above covers it if keyBinding is correct.
  }
</script>

<CommandPalette
  isOpen={showCommandPalette}
  onClose={() => (showCommandPalette = false)}
  commands={paletteCommands}
/>

<!-- Hidden file input for Open File shortcut -->
<input
  bind:this={fileInput}
  type="file"
  accept=".turt,.pp"
  class="hidden"
  style="display:none;"
  on:change={(e) => {
    // @ts-ignore
    if (e.target.files && e.target.files.length > 0) {
      loadFile(e);
      // @ts-ignore
      e.target.value = "";
    }
  }}
/>
