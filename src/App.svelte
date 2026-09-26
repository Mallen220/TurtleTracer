<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import * as d3 from "d3";
  import debounce from "lodash/debounce";

  const IDENTITY_SCALE = d3.scaleLinear();

  // Components
  import ControlTab from "./lib/ControlTab.svelte";
  import Navbar from "./lib/Navbar.svelte";
  import LeftSidebar from "./lib/components/LeftSidebar.svelte";
  import FieldRenderer from "./lib/components/FieldRenderer.svelte";
  import KeyboardShortcuts from "./lib/components/KeyboardShortcuts.svelte";
  import ExportGifDialog from "./lib/components/dialogs/ExportGifDialog.svelte";
  import ExportImageDialog from "./lib/components/dialogs/ExportImageDialog.svelte";
  import PathStatisticsDialog from "./lib/components/dialogs/PathStatisticsDialog.svelte";
  import NotificationToast from "./lib/components/NotificationToast.svelte";
  import OnboardingTutorial from "./lib/components/OnboardingTutorial.svelte";
  import WhatsNewDialog from "./lib/components/whats-new/WhatsNewDialog.svelte";
  import SetupDialog from "./lib/components/dialogs/SetupDialog.svelte";
  import SaveNameDialog from "./lib/components/dialogs/SaveNameDialog.svelte";
  import UnsavedChangesDialog from "./lib/components/dialogs/UnsavedChangesDialog.svelte";
  import FileManager from "./lib/FileManager.svelte";
  import SettingsDialog from "./lib/components/dialogs/SettingsDialog.svelte";
  import TelemetryDialog from "./lib/components/dialogs/TelemetryDialog.svelte";
  import PluginManagerDialog from "./lib/components/dialogs/PluginManagerDialog.svelte";
  import KeyboardShortcutsDialog from "./lib/components/dialogs/KeyboardShortcutsDialog.svelte";
  import ExportCodeDialog from "./lib/components/dialogs/ExportCodeDialog.svelte";
  import StrategySheetPreview from "./lib/components/dialogs/StrategySheetPreview.svelte";
  import DialogHost from "./lib/components/DialogHost.svelte";
  import UpdateAvailableDialog from "./lib/components/dialogs/UpdateAvailableDialog.svelte";
  import FeedbackDialog from "./lib/components/dialogs/FeedbackDialog.svelte";
  import RatingDialog from "./lib/components/dialogs/RatingDialog.svelte";
  import TransformDialog from "./lib/components/dialogs/TransformDialog.svelte";
  import { CloudArrowDownIcon } from "./lib/components/icons";

  // Stores
  import {
    currentFilePath,
    isUnsaved,
    showSettings,
    isPresentationMode,
    showWhatsNew,
    showExportGif,
    showExportImage,
    showStrategySheet,
    showShortcuts,
    startTutorial,
    exportDialogState,
    selectedPointId,
    collisionMarkers,
    showFileManager,
    fileManagerNewFileMode,
    currentDirectoryStore,
    showPluginManager,
    showTelemetryDialog,
    selectedLineId,
    showUpdateAvailableDialog,
    updateDataStore,
    showRatingDialog,
    ratingDialogAutoOpened,
    gitStatusStore,
    showTransformDialog,
    notification,
  } from "./stores";

  import {
    startPointStore,
    linesStore,
    shapesStore,
    sequenceStore,
    settingsStore,
    extraDataStore,
    robotXYStore,
    robotHeadingStore,
    percentStore,
    hoverPercentStore,
    hoverRobotXYStore,
    hoverRobotHeadingStore,
    playingStore,
    loopAnimationStore,
    playbackSpeedStore,
    ensureSequenceConsistency,
    macrosStore,
    refreshMacros,
    loadMacro,
    loopRangeStore,
    loopRangeActiveStore,
    isDraggingStore,
    timePredictionStore,
    resetProject,
    scaleShapesToField,
  } from "./lib/projectStore";
  import { diffMode, committedData } from "./lib/diffStore";

  // Utils
  import { createAnimationController } from "./utils/animation";
  import { calculatePathTime, calculateRobotState } from "./utils";
  import { validatePath } from "./utils/validation";
  import { loadSettings, saveSettings } from "./utils/settingsPersistence";
  import { createHistory, type AppState } from "./utils/history";
  import {
    saveProject,
    saveFileAs,
    handleExternalFileOpen,
    handleAutoExport,
    joinPath,
  } from "./utils/fileHandlers";
  import { splitPathAtPercent } from "./utils/pathEditing";
  import { scanEventsInDirectory } from "./utils/eventScanner";
  import { checkLibraryVersion } from "./utils/libraryVersionChecker";
  import { PluginManager } from "./lib/pluginManager";
  import { isBrowser, getElectronAPI, diskPathOf } from "./utils/platform";
  import { themesStore } from "./lib/pluginsStore";
  import { registerCoreUI } from "./lib/coreRegistrations";
  import { componentRegistry } from "./lib/registries";
  import {
    DEFAULT_PROJECT_EXTENSION,
    isSupportedProjectFileName,
  } from "./utils/fileExtensions";
  import { firePotatoConfetti } from "./utils/potatoTheme";
  import { applyTheme, applyFontSize } from "./lib/appearance";

  // Register Default Components/Tabs
  registerCoreUI();

  // Types
  import type { Settings, Line, Point, TimePrediction } from "./types/index";
  import {
    FIELD_SIZE,
    DEFAULT_ROBOT_LENGTH,
    DEFAULT_ROBOT_WIDTH,
  } from "./config";

  // Package info
  import pkg from "../package.json";

  let sessionStartTime = Date.now();
  const appStartTime = sessionStartTime;

  const electronAPI = getElectronAPI();

  async function checkMsStoreTracking() {
    if (!electronAPI?.isWindowsStore) return;
    try {
      const isStore = await electronAPI.isWindowsStore();
      if (isStore) {
        const tracked = localStorage.getItem("msStoreTracked");
        if (!tracked) {
          // Attempt to fetch the tracking asset to increment the download count on GitHub
          // This requires a release tagged 'tracker' with a file 'ms-store-tracker.zip'
          try {
            const response = await fetch(
              "https://github.com/Mallen220/TurtleTracer/releases/download/tracker/ms-store-tracker.zip",
            );
            if (response.ok) {
              localStorage.setItem("msStoreTracked", "true");
            } else {
              console.warn(
                "Microsoft Store tracking failed: Asset not found or network error",
              );
            }
          } catch (e) {
            console.warn("Microsoft Store tracking failed", e);
          }
        }
      }
    } catch (e) {
      console.warn("Error checking Microsoft Store status", e);
    }
  }

  async function fetchGitStatus() {
    const dir = get(currentDirectoryStore);
    if (!dir) return;
    const currentSettings = get(settingsStore);
    if (!currentSettings.gitIntegration) return;

    if (!electronAPI?.gitStatus) return;
    try {
      gitStatusStore.set(await electronAPI.gitStatus(dir));
    } catch (e) {
      console.warn("Failed to check git status", e);
    }
  }

  onMount(() => {
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("focus", fetchGitStatus);
    document.addEventListener("click", clearWaitSelectionOnOutsideClick);
    checkMsStoreTracking();

    if (electronAPI && electronAPI.onUpdateAvailable) {
      electronAPI.onUpdateAvailable((data: any) => {
        updateDataStore.set(data);
        showUpdateAvailableDialog.set(true);
      });
    }

    if (electronAPI && electronAPI.onStoreUpdateAvailable) {
      electronAPI.onStoreUpdateAvailable((data: any) => {
        notification.set({
          message: `Update ${data.version} is available in the Microsoft Store.`,
          type: "info",
          timeout: 0,
          actionLabel: "Open Store",
          action: () => {
            if (electronAPI.openExternal)
              electronAPI.openExternal(
                "https://apps.microsoft.com/store/detail/9NK0B4FDJ3ZW?cid=DevShareMCLPCS",
              );
          },
        });
      });
    }

    // Rating dialog interval logic
    const ratingInterval = setInterval(tryShowRatingDialog, 10 * 60 * 1000); // Check every 10 minutes

    return () => {
      clearInterval(ratingInterval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("focus", fetchGitStatus);
      document.removeEventListener("click", clearWaitSelectionOnOutsideClick);
    };
  });

  // Refresh git status when the folder, open file or git setting changes.
  $effect(() => {
    void [
      $currentDirectoryStore,
      $currentFilePath,
      $settingsStore.gitIntegration,
    ];
    fetchGitStatus();
  });

  $effect(() => {
    if ($currentDirectoryStore) {
      checkLibraryVersion(
        $currentDirectoryStore,
        electronAPI,
        notification.set,
      );
    }
  });

  /** Adds the time since the last call to the saved total usage time. */
  async function recordUsageTime() {
    const now = Date.now();
    const elapsed = now - sessionStartTime;
    sessionStartTime = now;
    settingsStore.update((s) => ({
      ...s,
      totalUsageTime: (s.totalUsageTime || 0) + elapsed,
    }));
    await saveSettings(get(settingsStore));
  }

  function tryShowRatingDialog() {
    // Disable rating dialog in browser mode
    if (isBrowser) {
      return;
    }

    const settings = get(settingsStore);

    // If they already rated ANY version, or dismissed the current version, or chose to never be asked again, don't show.
    const hasRatedAnyVersion =
      settings.submittedRatings &&
      Object.keys(settings.submittedRatings).length > 0;
    const hasDismissedCurrentVersion = settings.dismissedRatings?.[pkg.version];
    const hasDismissedAll = settings.dismissedRatings?.["all"];

    if (hasRatedAnyVersion || hasDismissedCurrentVersion || hasDismissedAll) {
      return;
    }

    // If offline, don't show. Wait for the interval to check again later.
    if (!navigator.onLine) {
      return;
    }

    // Don't pop it up if it's currently open
    if (get(showRatingDialog)) {
      return;
    }

    const now = Date.now();

    // Don't show the rating dialog within the first 5 minutes of app startup.
    const fiveMinutesMs = 5 * 60 * 1000;
    if (now - appStartTime < fiveMinutesMs) {
      return;
    }

    recordUsageTime().catch((e) =>
      console.error("Failed to save usage time", e),
    );

    // Only ask for a rating after 10 hours of total use.
    const tenHoursMs = 10 * 60 * 60 * 1000;
    if ((get(settingsStore).totalUsageTime || 0) >= tenHoursMs) {
      ratingDialogAutoOpened.set(true);
      showRatingDialog.set(true);
    }
  }

  // --- Drag and Drop Logic ---
  let isDraggingFile = $state(false);
  let dragCounter = 0;

  // Custom Prompt State
  let showSaveNameDialog = $state(false);
  let showUnsavedChangesDialog = $state(false);
  let pendingAction: "reset" | "close" | null = null;
  let saveNameResolve: ((name: string | null) => void) | null = null;

  function openSaveNamePrompt(): Promise<string | null> {
    return new Promise((resolve) => {
      saveNameResolve = resolve;
      showSaveNameDialog = true;
    });
  }

  function handleSaveName(name: string) {
    if (saveNameResolve) saveNameResolve(name);
    saveNameResolve = null;
  }

  function handleCancelSaveName() {
    if (saveNameResolve) saveNameResolve(null);
    saveNameResolve = null;
  }

  /**
   * Saves the project before the user moves on to something else. A project
   * that has never been saved is named and put in the project folder.
   * Returns false if the save failed or the user cancelled.
   */
  async function saveBeforeContinuing(): Promise<boolean> {
    const savedDir = get(currentFilePath)
      ? null
      : await electronAPI?.getSavedDirectory?.();
    if (!savedDir) return saveProject();

    const name = await openSaveNamePrompt();
    if (!name) return false;
    return saveProject({
      path: joinPath(savedDir, `${name}${DEFAULT_PROJECT_EXTENSION}`),
    });
  }

  // --- Unsaved Changes Dialog Logic ---
  function continuePendingAction() {
    if (pendingAction === "close") electronAPI?.sendCloseApproved?.();
    else performReset();
    pendingAction = null;
  }

  async function handleUnsavedSave() {
    showUnsavedChangesDialog = false;
    if (await saveBeforeContinuing()) continuePendingAction();
    else pendingAction = null;
  }

  function handleUnsavedDiscard() {
    showUnsavedChangesDialog = false;
    continuePendingAction();
  }

  function handleUnsavedCancel() {
    showUnsavedChangesDialog = false;
    pendingAction = null;
  }

  function performReset() {
    resetProject();
    // A new project isn't saved anywhere yet.
    currentFilePath.set(null);

    recordChange("New Project");
    // Mark as clean new project
    lastSavedState = getCurrentState();
    isUnsaved.set(false);
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    // Check if dragging files
    if (e.dataTransfer?.types?.includes("Files")) {
      dragCounter++;
      isDraggingFile = true;
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      isDraggingFile = false;
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
  }

  async function handleDrop(e: DragEvent) {
    // Reset drag indicators regardless of type
    dragCounter = 0;
    isDraggingFile = false;

    // Only intercept if it's an OS file drop we care about (avoids blocking internal drags)
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();

      if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const api = electronAPI;
        if (!api) return;

        // Case-insensitive check for supported extension
        if (!isSupportedProjectFileName(file.name)) {
          alert("Please drop a .turt or .pp file.");
          return;
        }

        const path = diskPathOf(file);

        if (!path) {
          alert(
            "Cannot determine file path. If you are running in a browser, this feature is not supported.",
          );
          return;
        }

        try {
          if (get(isUnsaved)) {
            if (
              confirm(
                "You have unsaved changes. Press OK to save them before opening. Press Cancel to proceed without saving.",
              )
            ) {
              if (!(await saveBeforeContinuing())) return;
            } else if (
              !confirm(
                "This will discard your unsaved changes. Are you sure you want to open the new file?",
              )
            ) {
              return;
            }
          }

          await handleExternalFileOpen(path);
          recordChange("Load Project");
        } catch (err) {
          console.error("Error opening dropped file:", err);
          alert("Failed to open file: " + err);
        }
      }
    }
  }

  // --- Autosave Logic ---
  function performAutosave() {
    if (get(currentFilePath) && get(isUnsaved)) {
      saveProject({ quiet: true });
    }
  }

  // Handle On Close Autosave
  function handleBeforeUnload(e: BeforeUnloadEvent) {
    // Legacy web behavior - mostly unused in Electron due to main process interception
    // but kept for safety if running in browser
    if (!electronAPI && get(isUnsaved)) {
      e.preventDefault();
      e.returnValue = "";
    }
  }

  async function handleAppCloseRequested() {
    try {
      await recordUsageTime();
    } catch (e) {
      console.error("Failed to save usage time", e);
    }

    const unsaved = get(isUnsaved);
    const autosaveMode = settings?.autosaveMode;

    // With "save on close", a project that has a file is saved silently.
    // A new, never-saved project still gets the prompt.
    if (autosaveMode === "close" && unsaved && get(currentFilePath)) {
      await saveProject();
      electronAPI?.sendCloseApproved?.();
      return;
    }

    if (unsaved) {
      pendingAction = "close";
      showUnsavedChangesDialog = true;
    } else if (electronAPI?.sendCloseApproved) {
      electronAPI.sendCloseApproved();
    }
  }

  // --- Layout State ---
  let showSidebar = $state(true);

  // Shown on first launch to pick a project folder.
  let setupMode = $state(false);
  let activeControlTab: "path" | "field" | "table" = $state("path");
  let controlTabRef: any = $state(null);
  // DOM container for the ControlTab; used to size/position the stats panel
  let controlTabContainer: HTMLDivElement | null = $state(null);
  let controlTabRect = $state({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    right: 0,
    bottom: 0,
  });

  function updateControlRect() {
    if (!controlTabContainer) return;
    const r = controlTabContainer.getBoundingClientRect();
    controlTabRect = {
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
    };
  }

  $effect(() => {
    if (!controlTabContainer) return;
    const observer = new ResizeObserver(updateControlRect);
    observer.observe(controlTabContainer);
    window.addEventListener("resize", updateControlRect);
    updateControlRect();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateControlRect);
    };
  });

  let statsOpen = $state(false);
  let mainContentHeight = $state(0);
  let mainContentWidth = $state(0);
  let mainContentDiv: HTMLDivElement | undefined = $state();
  let innerWidth = $state(0);
  let innerHeight = $state(0);
  let userFieldLimit: number | null = $state(null);
  let userFieldHeightLimit: number | null = $state(null);
  let resizeMode: "horizontal" | "vertical" | null = $state(null);
  const MIN_SIDEBAR_WIDTH = 320;
  const MIN_FIELD_PANE_WIDTH = 300;

  // --- Animation State ---
  let animationController:
    | ReturnType<typeof createAnimationController>
    | undefined = $state();

  // --- Preview Optimization ---
  let previewOptimizedLines = $state<Line[] | null>(null);
  let timePrediction = $state.raw<TimePrediction | null>(null);

  // --- History ---
  const history = createHistory();
  const { canUndoStore, canRedoStore } = history;

  let isLoaded = $state(false);
  let lastSavedState: string = "";

  function getAppState(): AppState {
    return {
      startPoint: get(startPointStore),
      lines: get(linesStore),
      shapes: get(shapesStore),
      sequence: get(sequenceStore),
      settings: get(settingsStore),
    };
  }

  function getCurrentState(): string {
    return JSON.stringify(getAppState());
  }

  // Exported for tests
  export async function recordChange(description: string = "Change") {
    ensureSequenceConsistency();
    refreshMacros();
    previewOptimizedLines = null;
    history.record(getAppState(), description);
    if (isLoaded) isUnsaved.set(true);
    if (isLoaded) animationController?.seekToPercent(0);

    // Autosave on change
    if (
      isLoaded &&
      settings?.autosaveMode === "change" &&
      get(currentFilePath)
    ) {
      saveProject({ quiet: true }).then(fetchGitStatus);
    }

    // Auto-export on any change when enabled
    if (isLoaded && settings?.autoExportCode) {
      const path = get(currentFilePath);
      if (path) {
        // Build minimal project data (full header included for JSON export)
        const projectData = {
          version: pkg.version,
          header: {
            info: "Created with Turtle Tracer",
            copyright:
              "Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.",
            link: "https://github.com/Mallen220/TurtleTracer",
          },
          startPoint: get(startPointStore),
          lines: get(linesStore),
          sequence: get(sequenceStore),
          shapes: get(shapesStore),
          extraData: get(extraDataStore),
        };

        // fire-and-forget; don't care about awaiting in the UI path
        handleAutoExport(
          get(startPointStore),
          get(linesStore),
          get(sequenceStore),
          get(settingsStore),
          get(shapesStore),
          projectData,
          path,
        ).catch((e) => {
          console.error("Auto-export during change failed", e);
        });
      }
    }
  }

  function handleSaveProject() {
    const path = get(currentFilePath);
    if (path) {
      saveProject().then(() => {
        fetchGitStatus();
      });
    } else {
      showFileManager.set(true);
      fileManagerNewFileMode.set(true);
    }
  }

  async function handleResetProject() {
    if (get(isUnsaved)) {
      pendingAction = "reset";
      showUnsavedChangesDialog = true;
    } else {
      performReset();
    }
  }

  function restoreHistoryState(state: AppState) {
    startPointStore.set(state.startPoint);
    linesStore.set(state.lines);
    shapesStore.set(state.shapes);
    sequenceStore.set(state.sequence);

    // Undoing a reset can bring back macros that are no longer loaded.
    const loadedMacros = get(macrosStore);
    for (const item of state.sequence ?? []) {
      if (item.kind === "macro" && !loadedMacros.has(item.filePath)) {
        loadMacro(item.filePath);
      }
    }

    // Onion layer visibility is a view preference, so undo/redo leave it alone.
    const showOnion = get(settingsStore).showOnionLayers;
    settingsStore.set({
      ...state.settings,
      showOnionLayers:
        typeof showOnion === "boolean"
          ? showOnion
          : state.settings?.showOnionLayers,
    });

    isUnsaved.set(getCurrentState() !== lastSavedState);
  }

  function undoAction() {
    const prev = history.undo();
    if (prev) restoreHistoryState(prev);
  }

  function redoAction() {
    const next = history.redo();
    if (next) restoreHistoryState(next);
  }

  function closeWhatsNew() {
    showWhatsNew.set(false);
    // Update settings with new version
    const currentVersion = pkg.version;
    const s = get(settingsStore);
    settingsStore.set({
      ...s,
      lastSeenVersion: currentVersion,
    });
    // Persistence handled by debounced auto-save
  }

  // --- Initialization ---
  onMount(async () => {
    // Initialize Plugins
    if (!isBrowser) {
      await PluginManager.init();
    }

    // Load Settings
    const savedSettings = await loadSettings();
    settingsStore.set({ ...savedSettings });

    shapesStore.update((shapes) => scaleShapesToField(shapes, savedSettings));

    // Stabilize
    setTimeout(async () => {
      // Record initial state before marking as loaded to prevent unsaved flag
      recordChange("Initial State");
      isLoaded = true;
      lastSavedState = getCurrentState(); // Assume fresh start is "saved" unless loaded

      // Ensure sequence/line consistency once initial load is stabilized
      try {
        ensureSequenceConsistency();
      } catch (err) {
        console.warn("ensureSequenceConsistency failed", err);
      }

      // Check for directory setup FIRST
      let needsSetup = false;
      if (electronAPI?.getSavedDirectory) {
        try {
          const dir = await electronAPI.getSavedDirectory();
          if (!dir || dir.trim() === "") {
            needsSetup = true;
          } else {
            currentDirectoryStore.set(dir);
            scanEventsInDirectory(dir);
          }
        } catch (e) {
          console.warn("Failed to check saved directory", e);
        }
      }

      if (needsSetup) {
        setupMode = true;
      } else {
        // Check for What's New
        const currentVersion = pkg.version;
        const s = get(settingsStore);
        const lastSeen = s.lastSeenVersion;
        const hasSeenTutorial = s.hasSeenOnboarding;

        // If version mismatch or never seen, show dialog
        if (lastSeen !== currentVersion && hasSeenTutorial) {
          showWhatsNew.set(true);
        }
      }

      // Remove loading screen
      const loader = document.getElementById("loading-screen");
      if (loader) {
        loader.style.opacity = "0";
        setTimeout(() => loader.remove(), 500);
      }

      // Rating dialog logic
      tryShowRatingDialog();
    }, 500);

    // Electron Menu Action Listener
    if (electronAPI) {
      // Listen for external file opens BEFORE signaling ready
      if (electronAPI.onOpenFilePath) {
        electronAPI.onOpenFilePath(async (filePath) => {
          await handleExternalFileOpen(filePath);
          recordChange("Load Project");
        });
      }

      // Signal main process that ready to receive file paths
      if (electronAPI.rendererReady) {
        electronAPI.rendererReady();
      }

      if (electronAPI.onAppCloseRequested) {
        electronAPI.onAppCloseRequested(() => {
          handleAppCloseRequested();
        });
      }

      if (electronAPI.onMenuAction) {
        electronAPI.onMenuAction((action) => {
          // Some actions are handled in KeyboardShortcuts via props or bindings,
          // but menu clicks come here.
          switch (action) {
            case "save-project":
              handleSaveProject();
              break;
            case "save-as":
              saveFileAs();
              break;
            case "open-file":
              document.getElementById("file-upload")?.click();
              break;
            case "export-gif":
              exportGif();
              break;
            case "export-image":
              showExportImage.set(true);
              break;
            case "export-pp":
              // Open the Export Code dialog pre-selected to JSON (.turt) format
              exportDialogState.set({ isOpen: true, format: "json" });
              break;
            case "export-java":
              exportDialogState.set({ isOpen: true, format: "java" });
              break;
            case "export-points":
              exportDialogState.set({ isOpen: true, format: "points" });
              break;
            case "export-sequential":
              exportDialogState.set({ isOpen: true, format: "sequential" });
              break;
            case "undo":
              if (canUndo) undoAction();
              break;
            case "redo":
              if (canRedo) redoAction();
              break;
            case "open-settings":
              showSettings.set(true);
              break;
            case "open-shortcuts":
              showShortcuts.set(true);
              break;
          }
        });
      }
    }
  });

  // Settings Auto-Save
  const debouncedSaveSettings = debounce(async (s: Settings) => {
    await saveSettings(s);
  }, 1000);

  onMount(() => {
    animationController = createAnimationController(
      animationDuration,
      (newPercent) => percentStore.set(newPercent),
      () => {
        playingStore.set(false);
      },
    );
  });

  // Sync controller updates to Robot State
  let committedRobotState: { x: number; y: number; heading: number } | null =
    $state(null);

  function play() {
    playingStore.set(true);
  }
  function pause() {
    playingStore.set(false);
  }
  function resetAnimation() {
    animationController?.reset();
    playingStore.set(false);
  }
  function handleSeek(val: number) {
    animationController?.seekToPercent(val);
  }

  function handlePreviewChange(newLines: Line[] | null) {
    previewOptimizedLines = newLines;
  }

  function stepForward() {
    const p = Math.min(100, percent + 1);
    percentStore.set(p);
    handleSeek(p);
  }
  function stepBackward() {
    const p = Math.max(0, percent - 1);
    percentStore.set(p);
    handleSeek(p);
  }
  function setPlaybackSpeed(val: number) {
    playbackSpeedStore.set(val);
  }

  function handleSplitPath() {
    if (!timePrediction?.totalTime) return;
    const res = splitPathAtPercent(
      get(percentStore),
      timePrediction,
      get(linesStore),
      get(sequenceStore),
    );

    if (res) {
      linesStore.set(res.lines);
      sequenceStore.set(res.sequence);
      recordChange("Split Path");

      // Select the split point
      const splitLine = res.lines[res.splitIndex];
      if (splitLine?.id) {
        selectedLineId.set(splitLine.id);
        selectedPointId.set(`point-${res.splitIndex + 1}-0`);
      }
    }
  }

  // --- Resizing Logic ---
  // When in vertical (mobile) mode, hide the control tab from layout after
  // its closing animation completes so the field can resize to the freed area.
  let controlTabHidden = $state(false);

  function startResize(mode: "horizontal" | "vertical") {
    if (
      (mode === "horizontal" && (!isLargeScreen || !effectiveShowSidebar)) ||
      (mode === "vertical" && (isLargeScreen || !effectiveShowSidebar))
    )
      return;
    resizeMode = mode;
  }
  function handleResize(cx: number, cy: number) {
    if (!resizeMode) return;
    if (resizeMode === "horizontal") userFieldLimit = cx;
    else if (resizeMode === "vertical" && mainContentDiv) {
      const rect = mainContentDiv!.getBoundingClientRect();
      const nh = cy - rect.top;
      const max = rect.height - 100;
      userFieldHeightLimit = Math.max(200, Math.min(nh, max));
    }
  }

  function handleResizeKeyDown(
    e: KeyboardEvent,
    mode: "horizontal" | "vertical",
  ) {
    const step = e.shiftKey ? 50 : 10;

    if (mode === "horizontal") {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        // Initialize if null
        if (userFieldLimit === null) {
          userFieldLimit = mainContentWidth * 0.55;
        }

        let current = userFieldLimit;
        if (e.key === "ArrowLeft") current -= step;
        else current += step;

        // Clamp to min/max
        const min = MIN_FIELD_PANE_WIDTH;
        const max = mainContentWidth - MIN_SIDEBAR_WIDTH;

        userFieldLimit = Math.max(min, Math.min(current, max));
      }
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      // Vertical
      e.preventDefault();

      if (userFieldHeightLimit === null) {
        userFieldHeightLimit = mainContentHeight * 0.6;
      }

      let current = userFieldHeightLimit;
      // ArrowUp decreases height (pulls up), ArrowDown increases height (pulls down)
      if (e.key === "ArrowUp") current -= step;
      else current += step;

      const rect = mainContentDiv!.getBoundingClientRect();
      const max = rect.height - 100;
      userFieldHeightLimit = Math.max(200, Math.min(current, max));
    }
  }

  function stopResize() {
    resizeMode = null;
  }

  // Clicking anywhere outside a selected wait deselects it.
  function clearWaitSelectionOnOutsideClick(e: MouseEvent) {
    const sel = get(selectedPointId);
    if (!sel || !sel.startsWith("wait-")) return;
    let el = e.target as Element | null;
    while (el) {
      if (el.classList?.contains("wait-row")) return;
      if (el.id?.startsWith("wait-") || el.id?.startsWith("wait-event-"))
        return;
      el = el.parentElement;
    }
    selectedPointId.set(null);
  }

  // --- Export GIF ---
  // Need reference to Two instance from FieldRenderer
  let fieldRenderer: any = $state();
  function exportGif() {
    showExportGif.set(true);
  }

  // --- Export Dialog Logic ---
  let exportDialog: ExportCodeDialog | undefined = $state();

  let settings = $derived($settingsStore);
  // Time-based autosave
  $effect(() => {
    if (settings?.autosaveMode !== "time" || !settings.autosaveInterval) return;
    const id = setInterval(performAutosave, settings.autosaveInterval * 60_000);
    return () => clearInterval(id);
  });
  let effectiveShowSidebar = $derived(
    $isPresentationMode ? false : showSidebar,
  );
  $effect(() => {
    if (!effectiveShowSidebar && statsOpen) statsOpen = false;
  });
  let isLargeScreen = $derived(innerWidth >= 1024);
  let startPoint = $derived($startPointStore);
  let lines = $derived($linesStore);
  let sequence = $derived($sequenceStore);
  let percent = $derived($percentStore);
  let hoverPercent = $derived($hoverPercentStore);
  let playing = $derived($playingStore);
  let loopAnimation = $derived($loopAnimationStore);
  let playbackSpeed = $derived($playbackSpeedStore);
  let loopRange = $derived($loopRangeStore);
  let loopRangeActive = $derived($loopRangeActiveStore);
  $effect(() => {
    if (
      userFieldHeightLimit === null &&
      mainContentHeight > 0 &&
      !isLargeScreen
    ) {
      userFieldHeightLimit = mainContentHeight * 0.6;
    }
  });
  $effect(() => {
    if (userFieldLimit === null && mainContentWidth > 0 && isLargeScreen) {
      userFieldLimit = mainContentWidth * 0.49;
    }
  });
  let leftPaneWidth = $derived(
    (() => {
      if (!isLargeScreen) return mainContentWidth;
      if (!effectiveShowSidebar) return mainContentWidth;
      let target = userFieldLimit ?? mainContentWidth * 0.55;
      const max = mainContentWidth - MIN_SIDEBAR_WIDTH;
      const min = MIN_FIELD_PANE_WIDTH;
      if (max < min) return mainContentWidth * 0.5;
      return Math.max(min, Math.min(target, max));
    })(),
  );
  let fieldDrawSize = $derived(
    (() => {
      if (!isLargeScreen) {
        const h = userFieldHeightLimit ?? mainContentHeight * 0.6;
        return Math.min(innerWidth - 32, h - 16);
      }
      const avW = leftPaneWidth - 16;
      const avH = mainContentHeight - 16;
      return Math.max(100, Math.min(avW, avH));
    })(),
  );
  // --- D3 Scales (Used for resizing logic / math) ---
  let x = $derived(
    d3
      .scaleLinear()
      .domain([0, FIELD_SIZE])
      .range([0, fieldDrawSize || FIELD_SIZE]),
  );
  let y = $derived(
    d3
      .scaleLinear()
      .domain([0, FIELD_SIZE])
      .range([fieldDrawSize || FIELD_SIZE, 0]),
  );
  // --- Robot Dimensions ---
  let robotLength = $derived(settings?.rLength || DEFAULT_ROBOT_LENGTH);
  let robotWidth = $derived(settings?.rWidth || DEFAULT_ROBOT_WIDTH);
  let canUndo = $derived($canUndoStore);
  let canRedo = $derived($canRedoStore);
  // --- Animation Logic ---
  $effect(() => {
    // Too slow to recompute on every frame of a drag; it catches up on drop.
    if (!$isDraggingStore) {
      const prediction = calculatePathTime(
        startPoint,
        lines,
        settings,
        sequence,
      );
      timePrediction = prediction;
      timePredictionStore.set(prediction);
    }
  });
  // Continuous validation when path/settings change
  $effect(() => {
    // depend on timePrediction to ensure validation with the latest timeline
    if (
      $startPointStore &&
      $linesStore &&
      $settingsStore &&
      $sequenceStore &&
      $shapesStore &&
      timePrediction &&
      !$settingsStore.validationDisabled &&
      !$isDraggingStore
    ) {
      validatePath(
        $startPointStore,
        $linesStore,
        $settingsStore,
        $sequenceStore,
        $shapesStore,
        true, // silent
        timePrediction.timeline,
      );
    } else if (
      $settingsStore?.validationDisabled &&
      get(collisionMarkers).length > 0
    ) {
      collisionMarkers.set([]);
    }
  });
  $effect(() => {
    if (settings) debouncedSaveSettings(settings);
  });
  // Diff Mode Animation Logic
  let isDiffMode = $derived($diffMode);
  let committed = $derived($committedData);
  let committedTimePrediction = $derived(
    isDiffMode && committed
      ? calculatePathTime(
          committed.startPoint,
          committed.lines,
          committed.settings,
          committed.sequence,
        )
      : null,
  );
  // Durations are in seconds.
  let currentTotalTime = $derived(timePrediction?.totalTime ?? 0);
  let committedTotalTime = $derived(committedTimePrediction?.totalTime ?? 0);
  // In diff mode both paths play on one timeline, as long as the longer one.
  let effectiveDuration = $derived(
    isDiffMode
      ? Math.max(currentTotalTime, committedTotalTime)
      : currentTotalTime,
  );
  let animationDuration = $derived(effectiveDuration / playbackSpeed);
  $effect(() => {
    if (animationController) {
      animationController.setDuration(animationDuration);
      animationController.setLoop(loopAnimation);
      animationController.setPlaybackRange(
        loopRange[0],
        loopRange[1],
        loopRangeActive,
      );
    }
  });
  // Sync playing store -> controller
  $effect(() => {
    if (animationController) {
      if (playing && animationController.isPlaying() === false)
        animationController.play();
      if (!playing && animationController.isPlaying())
        animationController.pause();
    }
  });
  /**
   * The robot's pose (in inches) `globalTime` seconds into playback. In diff
   * mode both paths share one timeline, so the shorter one waits at its end.
   */
  function robotPoseAt(
    globalTime: number,
    prediction: TimePrediction,
    totalTime: number,
    pathLines: Line[],
    start: Point,
  ) {
    const pathPercent =
      totalTime > 0 ? Math.min(100, (globalTime / totalTime) * 100) : 0;
    return calculateRobotState(
      pathPercent,
      prediction.timeline,
      pathLines,
      start,
      IDENTITY_SCALE,
      IDENTITY_SCALE,
    );
  }

  const hasPath = $derived(lines.length > 0 || sequence.length > 0);

  $effect(() => {
    if (!timePrediction?.timeline || !hasPath) {
      // Nothing to animate: show the robot at the start point.
      robotXYStore.set({ x: startPoint.x, y: startPoint.y });
      let heading = 0;
      if (startPoint.heading === "constant") heading = -startPoint.degrees;
      else if (startPoint.heading === "linear") heading = -startPoint.startDeg;
      robotHeadingStore.set(heading);
      committedRobotState = null;
      return;
    }

    const globalTime = (percent / 100) * effectiveDuration;
    const state = robotPoseAt(
      globalTime,
      timePrediction,
      currentTotalTime,
      lines,
      startPoint,
    );
    robotXYStore.set({ x: state.x, y: state.y });
    robotHeadingStore.set(state.heading);

    committedRobotState =
      isDiffMode && committed && committedTimePrediction
        ? robotPoseAt(
            globalTime,
            committedTimePrediction,
            committedTotalTime,
            committed.lines,
            committed.startPoint,
          )
        : null;
  });

  $effect(() => {
    if (hoverPercent === null || !timePrediction?.timeline || !hasPath) {
      hoverRobotXYStore.set(null);
      hoverRobotHeadingStore.set(null);
      return;
    }
    const state = robotPoseAt(
      (hoverPercent / 100) * effectiveDuration,
      timePrediction,
      currentTotalTime,
      lines,
      startPoint,
    );
    hoverRobotXYStore.set({ x: state.x, y: state.y });
    hoverRobotHeadingStore.set(state.heading);
  });
  $effect(() => {
    if (isLargeScreen || effectiveShowSidebar) {
      controlTabHidden = false;
      return;
    }
    // On small screens, remove the closed control tab from the layout once
    // its 300ms slide-out has finished, so the field can use the space.
    const id = setTimeout(() => (controlTabHidden = true), 320);
    return () => clearTimeout(id);
  });
  let fieldRenderWidth = $derived(
    $isPresentationMode ? mainContentWidth : fieldDrawSize,
  );
  let fieldRenderHeight = $derived(
    $isPresentationMode ? mainContentHeight : fieldDrawSize,
  );
  // Compute a target height for the field container so it can animate smoothly
  // when the sidebar (control tab) opens/closes in vertical mode
  let fieldContainerTargetHeight = $derived(
    (() => {
      if (isLargeScreen) return "100%";
      // when sidebar is visible, reserve space for it (use userFieldHeightLimit or default fraction)
      if (effectiveShowSidebar) {
        const h = userFieldHeightLimit ?? mainContentHeight * 0.6;
        const target = Math.min(h, mainContentHeight);
        return `${Math.max(120, Math.floor(target))}px`;
      } else {
        // sidebar not shown -> full available height
        return `${mainContentHeight}px`;
      }
    })(),
  );
  $effect(() => {
    if ($exportDialogState.isOpen && exportDialog) {
      exportDialog.openWithFormat(
        $exportDialogState.format,
        $exportDialogState.exporterName,
      );
      // Reset the trigger so Svelte reactivity doesn't re-open it unintentionally
      exportDialogState.update((s) => ({ ...s, isOpen: false }));
    }
  });
  $effect(() => {
    if (!settings) return;
    applyTheme(settings, $themesStore);
    applyFontSize(settings);
  });

  // Plugins can replace these components.
  const FieldRendererComponent = $derived(
    $componentRegistry.FieldRenderer || FieldRenderer,
  );
  const ControlTabComponent = $derived(
    $componentRegistry.ControlTab || ControlTab,
  );
</script>

<svelte:window
  bind:innerWidth
  bind:innerHeight
  onclick={(e) => {
    if (settings?.robotImage === "/JefferyThePotato.png") {
      firePotatoConfetti(e.clientX, e.clientY);
    }
  }}
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondragover={handleDragOver}
  ondrop={handleDrop}
  onmouseup={stopResize}
  onmousemove={(e) => {
    if (resizeMode) {
      e.preventDefault();
      handleResize(e.clientX, e.clientY);
    }
  }}
  ontouchend={stopResize}
  ontouchmove={(e) => {
    if (resizeMode) {
      const t = e.touches[0];
      handleResize(t.clientX, t.clientY);
    }
  }}
/>

<KeyboardShortcuts
  saveProject={handleSaveProject}
  resetProject={handleResetProject}
  {saveFileAs}
  {exportGif}
  exportImage={() => showExportImage.set(true)}
  {undoAction}
  {redoAction}
  {play}
  {pause}
  {resetAnimation}
  {stepForward}
  {stepBackward}
  {recordChange}
  splitPath={handleSplitPath}
  bind:controlTabRef
  bind:activeControlTab
  toggleStats={() => {
    if (showSidebar) {
      statsOpen = !statsOpen;
    }
  }}
  toggleControlTab={() => (showSidebar = !showSidebar)}
  openWhatsNew={() => showWhatsNew.set(true)}
  toggleSidebar={() => {
    settingsStore.update((s) => ({
      ...s,
      sidebarExpanded: !s.sidebarExpanded,
    }));
  }}
  {fieldRenderer}
/>

{#if $showExportGif && fieldRenderer && animationController}
  <ExportGifDialog
    bind:show={$showExportGif}
    twoInstance={fieldRenderer.getTwoInstance()}
    {animationController}
    {settings}
    robotLengthPx={x(robotLength)}
    robotWidthPx={x(robotWidth)}
    robotStateFunction={(p) =>
      calculateRobotState(
        p,
        timePrediction?.timeline ?? [],
        lines,
        startPoint,
        x,
        y,
      )}
    onclose={() => showExportGif.set(false)}
  />
{/if}

{#if $showExportImage && fieldRenderer}
  <ExportImageDialog
    bind:show={$showExportImage}
    twoInstance={fieldRenderer.getTwoInstance()}
    {settings}
    robotLengthPx={x(robotLength)}
    robotWidthPx={x(robotWidth)}
    xScale={x}
    yScale={y}
    robotState={{
      x: $startPointStore.x,
      y: $startPointStore.y,
      heading: calculateRobotState(
        0,
        timePrediction?.timeline ?? [],
        lines,
        startPoint,
        IDENTITY_SCALE,
        IDENTITY_SCALE,
      ).heading,
    }}
    onclose={() => showExportImage.set(false)}
  />
{/if}

{#if $showStrategySheet && fieldRenderer}
  <StrategySheetPreview
    bind:isOpen={$showStrategySheet}
    twoInstance={fieldRenderer.getTwoInstance()}
    startPoint={$startPointStore}
    lines={$linesStore}
    sequence={$sequenceStore}
    settings={$settingsStore}
    {timePrediction}
  />
{/if}

{#if statsOpen}
  <PathStatisticsDialog
    bind:isOpen={statsOpen}
    lines={$linesStore}
    sequence={$sequenceStore}
    settings={$settingsStore}
    startPoint={$startPointStore}
    controlRect={controlTabRect}
    percent={$percentStore}
    onClose={() => (statsOpen = false)}
  />
{/if}

<WhatsNewDialog bind:show={$showWhatsNew} onclose={closeWhatsNew} />
<SetupDialog bind:show={setupMode} />
<NotificationToast />
<OnboardingTutorial
  whatsNewOpen={$showWhatsNew}
  setupDialogOpen={setupMode}
  {isLoaded}
  ontutorialComplete={() => showWhatsNew.set(true)}
/>

<SaveNameDialog
  bind:show={showSaveNameDialog}
  onSave={handleSaveName}
  onCancel={handleCancelSaveName}
/>

<UnsavedChangesDialog
  bind:show={showUnsavedChangesDialog}
  onSave={handleUnsavedSave}
  onDiscard={handleUnsavedDiscard}
  onCancel={handleUnsavedCancel}
/>

<UpdateAvailableDialog bind:show={$showUpdateAvailableDialog} />

<SettingsDialog bind:isOpen={$showSettings} bind:settings={$settingsStore} />
<TelemetryDialog bind:isOpen={$showTelemetryDialog} />
<TransformDialog bind:isOpen={$showTransformDialog} />
<KeyboardShortcutsDialog
  bind:isOpen={$showShortcuts}
  bind:settings={$settingsStore}
/>
<PluginManagerDialog bind:isOpen={$showPluginManager} />

{#if $showFileManager}
  <FileManager bind:isOpen={$showFileManager} bind:settings={$settingsStore} />
{/if}

<ExportCodeDialog
  bind:this={exportDialog}
  bind:startPoint={$startPointStore}
  bind:lines={$linesStore}
  bind:sequence={$sequenceStore}
  bind:shapes={$shapesStore}
/>

<DialogHost />
<FeedbackDialog />
<RatingDialog />

<!-- Drag Overlay -->
{#if isDraggingFile}
  <div
    class="fixed inset-0 z-[100] bg-purple-500/20 backdrop-blur-sm border-4 border-purple-500 flex items-center justify-center pointer-events-none"
  >
    <div
      class="bg-white dark:bg-neutral-800 p-8 rounded-xl shadow-2xl flex flex-col items-center animate-bounce-slight"
    >
      <CloudArrowDownIcon
        className="h-16 w-16 text-purple-600 dark:text-purple-400 mb-4"
      />
      <h2 class="text-2xl font-bold mb-2 dark:text-white">Drop to Open</h2>
      <p class="text-neutral-500 dark:text-neutral-400">
        Release the file to open project
      </p>
    </div>
  </div>
{/if}

<!-- Main Container -->
<div
  class="h-screen w-full flex flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-sans"
>
  {#if !$isPresentationMode}
    {@const SvelteComponent = $componentRegistry.Navbar || Navbar}
    <div class="flex-none z-50">
      <SvelteComponent
        bind:lines={$linesStore}
        bind:startPoint={$startPointStore}
        bind:shapes={$shapesStore}
        bind:sequence={$sequenceStore}
        bind:settings={$settingsStore}
        bind:robotLength
        bind:robotWidth
        bind:showSidebar
        bind:isLargeScreen
        saveProject={handleSaveProject}
        resetProject={handleResetProject}
        {saveFileAs}
        {exportGif}
        {undoAction}
        {redoAction}
        {recordChange}
        {canUndo}
        {canRedo}
        {history}
      />
    </div>
  {/if}

  <div
    class="flex-1 min-h-0 flex flex-row items-stretch overflow-hidden relative gap-0 w-full"
  >
    {#if !$isPresentationMode}
      <LeftSidebar
        {undoAction}
        {redoAction}
        {canUndo}
        {canRedo}
        {history}
        resetProject={handleResetProject}
        settings={$settingsStore}
      />
    {/if}

    <div
      class="flex-1 min-h-0 flex flex-col lg:flex-row items-stretch lg:overflow-hidden relative gap-0"
      bind:clientHeight={mainContentHeight}
      bind:clientWidth={mainContentWidth}
      bind:this={mainContentDiv}
    >
      <!-- Field Container -->
      <div
        id="field-container"
        class="flex-none flex justify-center items-center relative transition-all duration-300 ease-in-out bg-white dark:bg-black lg:dark:bg-black/40 overflow-hidden"
        style={`
        width: ${isLargeScreen && effectiveShowSidebar ? leftPaneWidth + "px" : "100%"};
        height: ${isLargeScreen ? "100%" : fieldContainerTargetHeight};
        min-height: ${isLargeScreen ? "0" : userFieldHeightLimit ? "0" : "60vh"};
      `}
      >
        <div
          class="relative shadow-inner w-full h-full flex justify-center items-center"
        >
          <button
            id="field-container-anchor"
            type="button"
            class="absolute inset-0 opacity-0 pointer-events-none"
            aria-label="Field workspace tutorial target"
            title="Field workspace tutorial target"
            tabindex={$startTutorial ? 0 : -1}
          ></button>
          <FieldRendererComponent
            bind:this={fieldRenderer}
            width={fieldRenderWidth}
            height={fieldRenderHeight}
            {timePrediction}
            {committedRobotState}
            {previewOptimizedLines}
            onRecordChange={recordChange}
          />
        </div>
      </div>

      <!-- Resizer Handle (Desktop) -->
      {#if isLargeScreen && effectiveShowSidebar && !$isPresentationMode}
        <button
          class="group w-4 cursor-col-resize flex justify-center items-center hover:bg-purple-500/10 active:bg-purple-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 transition-colors select-none z-40 border-none bg-neutral-200 dark:bg-neutral-800 p-0 m-0 border-l border-r border-neutral-300 dark:border-neutral-700"
          onmousedown={() => startResize("horizontal")}
          onkeydown={(e) => handleResizeKeyDown(e, "horizontal")}
          ondblclick={() => {
            userFieldLimit = null;
          }}
          aria-label="Resize Sidebar"
          title="Drag to resize. Double-click to reset. Use Arrow keys to adjust width."
        >
          <div
            class="w-0.5 h-8 bg-neutral-400 dark:bg-neutral-600 group-hover:bg-purple-500 dark:group-hover:bg-purple-400 group-focus-visible:bg-purple-500 dark:group-focus-visible:bg-purple-400 transition-colors rounded-full"
          ></div>
        </button>
      {/if}

      <!-- Resizer Handle (Mobile) -->
      {#if !isLargeScreen && effectiveShowSidebar && !$isPresentationMode}
        <button
          class="group h-3 w-full cursor-row-resize flex justify-center items-center hover:bg-purple-500/10 active:bg-purple-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 transition-colors select-none z-40 border-none bg-neutral-200 dark:bg-neutral-800 p-0 m-0 border-t border-b border-neutral-300 dark:border-neutral-700 touch-none"
          onmousedown={() => startResize("vertical")}
          onkeydown={(e) => handleResizeKeyDown(e, "vertical")}
          ontouchstart={(e) => {
            e.preventDefault();
            startResize("vertical");
          }}
          ondblclick={() => {
            userFieldHeightLimit = null;
          }}
          aria-label="Resize Tab"
          title="Drag to resize. Double-click to reset. Use Arrow keys to adjust height."
        >
          <div
            class="h-1 w-8 bg-neutral-400 dark:bg-neutral-600 group-hover:bg-purple-500 dark:group-hover:bg-purple-400 group-focus-visible:bg-purple-500 dark:group-focus-visible:bg-purple-400 transition-colors rounded-full"
          ></div>
        </button>
      {/if}

      <!-- Control Tab -->
      <div
        bind:this={controlTabContainer}
        class="relative flex-1 h-auto lg:h-full min-h-0 min-w-0 transition-transform duration-300 ease-in-out transform bg-neutral-50 dark:bg-neutral-900"
        class:translate-x-full={!effectiveShowSidebar && isLargeScreen}
        class:translate-y-full={!effectiveShowSidebar && !isLargeScreen}
        class:overflow-hidden={!effectiveShowSidebar}
        class:hidden={controlTabHidden}
        class:controlTabBlurred={statsOpen}
      >
        {#if statsOpen}
          <div
            class="control-tab-overlay absolute inset-0 z-40"
            role="button"
            aria-label="Dismiss statistics"
            tabindex="0"
            onclick={() => (statsOpen = false)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " " || e.key === "Spacebar")
                statsOpen = false;
            }}
          ></div>
        {/if}

        <ControlTabComponent
          bind:this={controlTabRef}
          bind:playing={$playingStore}
          {play}
          {pause}
          bind:startPoint={$startPointStore}
          bind:lines={$linesStore}
          bind:sequence={$sequenceStore}
          bind:settings={$settingsStore}
          bind:percent={$percentStore}
          bind:robotXY={$robotXYStore}
          bind:robotHeading={$robotHeadingStore}
          bind:shapes={$shapesStore}
          {handleSeek}
          bind:loopAnimation={$loopAnimationStore}
          {recordChange}
          playbackSpeed={$playbackSpeedStore}
          {setPlaybackSpeed}
          bind:statsOpen
          bind:activeTab={activeControlTab}
          onPreviewChange={handlePreviewChange}
          totalSeconds={effectiveDuration}
          splitPath={handleSplitPath}
        />
      </div>
    </div>
  </div>
</div>

<style>
  /* Blur the control tab when the stats panel is open; clicking the background closes the panel */
  .controlTabBlurred {
    filter: blur(4px);
    opacity: 0.88;
    transition:
      filter 0.15s ease,
      opacity 0.15s ease;
    position: relative;
  }

  /* Overlay that sits above the control tab contents while stats are open */
  .control-tab-overlay {
    cursor: pointer;
    background: transparent; /* keep blurred visuals visible */
    outline: none;
  }

  .control-tab-overlay:focus {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    border-radius: 8px;
  }
</style>
