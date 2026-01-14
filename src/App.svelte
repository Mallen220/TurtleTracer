<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import * as d3 from "d3";
  import { debounce } from "lodash";

  // Components
  import ControlTab from "./lib/ControlTab.svelte";
  import Navbar from "./lib/Navbar.svelte";
  import FieldRenderer from "./lib/components/FieldRenderer.svelte";
  import KeyboardShortcuts from "./lib/components/KeyboardShortcuts.svelte";
  import ExportGifDialog from "./lib/components/ExportGifDialog.svelte";
  import PathStatisticsDialog from "./lib/components/PathStatisticsDialog.svelte";
  import NotificationToast from "./lib/components/NotificationToast.svelte";
  import WhatsNewDialog from "./lib/components/whats-new/WhatsNewDialog.svelte";
  import SaveNameDialog from "./lib/components/SaveNameDialog.svelte";

  // Stores
  import {
    currentFilePath,
    isUnsaved,
    showSettings,
    showExportGif,
    showShortcuts,
    exportDialogState,
    selectedPointId,
    collisionMarkers,
    showFileManager,
    fileManagerNewFileMode,
    projectMetadataStore,
  } from "./stores";
  import {
    startPointStore,
    linesStore,
    shapesStore,
    sequenceStore,
    settingsStore,
    robotXYStore,
    robotHeadingStore,
    percentStore,
    playingStore,
    loopAnimationStore,
    playbackSpeedStore,
    ensureSequenceConsistency,
  } from "./lib/projectStore";

  import { resetPath } from "./utils/projectLifecycle";

  // Utils
  import { createAnimationController } from "./utils/animation";
  import {
    calculatePathTime,
    getAnimationDuration,
    calculateRobotState,
  } from "./utils";
  import { loadSettings, saveSettings } from "./utils/settingsPersistence";
  import { createHistory, type AppState } from "./utils/history";
  import {
    saveProject,
    saveFileAs,
    loadFile,
    loadRecentFile,
    exportAsPP,
    handleExternalFileOpen,
  } from "./utils/fileHandlers";

  // Types
  import type { Settings } from "./types";
  import {
    DEFAULT_SETTINGS,
    FIELD_SIZE,
    DEFAULT_ROBOT_LENGTH,
    DEFAULT_ROBOT_WIDTH,
  } from "./config";

  // Package info
  import pkg from "../package.json";

  // Electron API
  interface ElectronAPI {
    onMenuAction?: (callback: (action: string) => void) => void;
    showSaveDialog?: (options: any) => Promise<string | null>;
    writeFileBase64?: (path: string, content: string) => Promise<boolean>;
    rendererReady?: () => Promise<void>;
    onOpenFilePath?: (callback: (path: string) => void) => void;
    // Open a link in the system default browser
    openExternal?: (url: string) => Promise<boolean>;
    getPathForFile?: (file: File) => string;
    getSavedDirectory?: () => Promise<string>;
  }
  const electronAPI = (window as any).electronAPI as ElectronAPI | undefined;

  // Delegated handler: open external links in the user's default browser when running in Electron
  function handleLinkClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target || !("closest" in target)) return;
    const anchor = target.closest("a") as HTMLAnchorElement | null;
    if (!anchor || !anchor.href) return;

    // Allow other handlers to prevent default behavior first
    if (e.defaultPrevented) return;

    // Special exception: allow links marked as internal
    if (anchor.hasAttribute("data-internal")) return;

    const href = anchor.href;
    const isExternal =
      href.startsWith("http://") || href.startsWith("https://");
    if (isExternal && electronAPI && electronAPI.openExternal) {
      e.preventDefault();
      electronAPI
        .openExternal(href)
        .catch((err) => console.warn("openExternal failed", err));
    }
  }

  onMount(() => {
    document.addEventListener("click", handleLinkClick);
    window.addEventListener("beforeunload", handleBeforeUnload);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleLinkClick);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    if (autosaveIntervalId) clearInterval(autosaveIntervalId);
  });

  // --- Drag and Drop Logic ---
  let isDraggingFile = false;
  let dragCounter = 0;

  // Custom Prompt State
  let showSaveNameDialog = false;
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

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    // Check if dragging files
    if (
      e.dataTransfer &&
      e.dataTransfer.types &&
      e.dataTransfer.types.includes("Files")
    ) {
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
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    isDraggingFile = false;

    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      // Refresh electronAPI reference from window to ensure it's available
      const api = (window as any).electronAPI;

      if (!api) return;

      // Case-insensitive check for .pp extension
      if (!file.name.toLowerCase().endsWith(".pp")) {
        alert("Please drop a .pp file.");
        return;
      }

      let path = (file as any).path;
      if (!path && api.getPathForFile) {
        try {
          path = api.getPathForFile(file);
        } catch (e) {
          console.warn("getPathForFile failed:", e);
        }
      }

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
            // Check if we need to name the file (new file)
            const currentPath = get(currentFilePath);
            let success = false;

            if (!currentPath && api.getSavedDirectory) {
              // Try to use default directory + prompt
              const savedDir = await api.getSavedDirectory();
              if (savedDir) {
                const name = await openSaveNamePrompt();
                if (name) {
                  const sep = savedDir.includes("\\") ? "\\" : "/";
                  const cleanDir = savedDir.endsWith(sep)
                    ? savedDir.slice(0, -1)
                    : savedDir;
                  const fullPath = `${cleanDir}${sep}${name}.pp`;
                  success = await saveProject(
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    false,
                    fullPath,
                  );
                } else {
                  // User cancelled name input
                  return;
                }
              } else {
                success = await saveProject();
              }
            } else {
              success = await saveProject();
            }

            if (!success) return; // Save failed or cancelled
          } else {
            if (
              !confirm(
                "This will discard your unsaved changes. Are you sure you want to open the new file?",
              )
            ) {
              return;
            }
          }
        }

        await handleExternalFileOpen(path);
      } catch (err) {
        console.error("Error opening dropped file:", err);
        alert("Failed to open file: " + err);
      }
    }
  }

  // --- Autosave Logic ---
  let autosaveIntervalId: any = null;

  function performAutosave() {
    const path = get(currentFilePath);
    if (path && get(isUnsaved)) {
      saveProject(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        {
          quiet: true,
        },
      );
      console.log("Autosaved project (time-based)");
    }
  }

  // Manage Time-based Autosave
  $: {
    if (autosaveIntervalId) {
      clearInterval(autosaveIntervalId);
      autosaveIntervalId = null;
    }

    if (settings?.autosaveMode === "time" && settings?.autosaveInterval) {
      const intervalMs = settings.autosaveInterval * 60 * 1000;
      autosaveIntervalId = setInterval(performAutosave, intervalMs);
    }
  }

  // Handle On Close Autosave
  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (settings?.autosaveMode === "close") {
      const path = get(currentFilePath);
      if (path && get(isUnsaved)) {
        saveProject();
      }
    }

    // Always warn if unsaved, even if we tried to autosave (async save might not finish)
    if (get(isUnsaved)) {
      e.preventDefault();
      e.returnValue = "";
    }
  }

  // --- Layout State ---
  let showSidebar = true;
  // DEBUG: force open Whats New during development to validate feature loading
  let showWhatsNew = false;
  let setupMode = false;
  // Set this to true to force the setup dialog for testing
  const TEST_SETUP_DIALOG = false;
  let activeControlTab: "path" | "field" | "table" = "path";
  let controlTabRef: any = null;
  // DOM container for the ControlTab; used to size/position the stats panel
  let controlTabContainer: HTMLDivElement | null = null;
  let controlTabRect = {
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    right: 0,
    bottom: 0,
  };
  let _controlTabObserver: ResizeObserver | null = null;

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

  $: if (controlTabContainer && _controlTabObserver) {
    try {
      _controlTabObserver.observe(controlTabContainer);
      updateControlRect();
    } catch (e) {}
  }

  onMount(() => {
    updateControlRect();
    _controlTabObserver = new ResizeObserver(updateControlRect);
    if (controlTabContainer) _controlTabObserver.observe(controlTabContainer);
    window.addEventListener("resize", updateControlRect);
  });

  onDestroy(() => {
    if (_controlTabObserver) _controlTabObserver.disconnect();
    window.removeEventListener("resize", updateControlRect);
  });

  let statsOpen = false;
  let mainContentHeight = 0;
  let mainContentWidth = 0;
  let mainContentDiv: HTMLDivElement;
  let innerWidth = 0;
  let innerHeight = 0;
  let userFieldLimit: number | null = null;
  let userFieldHeightLimit: number | null = null;
  let resizeMode: "horizontal" | "vertical" | null = null;
  $: isLargeScreen = innerWidth >= 1024;
  const MIN_SIDEBAR_WIDTH = 320;
  const MIN_FIELD_PANE_WIDTH = 300;

  // --- Animation State ---
  let animationController: ReturnType<typeof createAnimationController>;
  $: settings = $settingsStore;
  $: startPoint = $startPointStore;
  $: lines = $linesStore;
  $: shapes = $shapesStore;
  $: sequence = $sequenceStore;
  $: percent = $percentStore;
  $: playing = $playingStore;
  $: loopAnimation = $loopAnimationStore;
  $: playbackSpeed = $playbackSpeedStore;

  // --- D3 Scales (Used for resizing logic / math) ---
  $: x = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([0, fieldDrawSize || FIELD_SIZE]);
  $: y = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([fieldDrawSize || FIELD_SIZE, 0]);

  // --- Preview Optimization ---
  let previewOptimizedLines: any[] | null = null;

  // --- Robot Dimensions ---
  $: robotLength = settings?.rLength || DEFAULT_ROBOT_LENGTH;
  $: robotWidth = settings?.rWidth || DEFAULT_ROBOT_WIDTH;

  // --- History ---
  const history = createHistory();
  const { canUndoStore, canRedoStore } = history;
  $: canUndo = $canUndoStore;
  $: canRedo = $canRedoStore;

  // Clear collision markers when path/settings change
  // Note: We avoid depending on $collisionMarkers to prevent loops
  $: ($linesStore,
    $startPointStore,
    $shapesStore,
    $settingsStore,
    (() => {
      // Use get() to read without subscribing
      const current = get(collisionMarkers);
      if (current && current.length > 0) {
        collisionMarkers.set([]);
      }
    })());

  let isLoaded = false;
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

  function onRecordChange() {
    recordChange();
  }

  function recordChange() {
    previewOptimizedLines = null;
    history.record(getAppState());
    if (isLoaded) isUnsaved.set(true);

    // Autosave on change
    if (isLoaded && settings?.autosaveMode === "change") {
      const path = get(currentFilePath);
      if (path) {
        saveProject(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          false,
          { quiet: true },
        );
        console.log("Autosaved project (on change)");
      }
    }
  }

  function handleSaveProject() {
    const path = get(currentFilePath);
    if (!path) {
      showFileManager.set(true);
      fileManagerNewFileMode.set(true);
    } else {
      saveProject();
    }
  }

  async function handleResetProject() {
    const api = (window as any).electronAPI;
    if (get(isUnsaved)) {
      if (
        confirm(
          "You have unsaved changes. Press OK to save them before resetting. Press Cancel to proceed without saving."
        )
      ) {
        // Check if we need to name the file (new file)
        const currentPath = get(currentFilePath);
        let success = false;

        if (!currentPath && api && api.getSavedDirectory) {
          // Try to use default directory + prompt
          const savedDir = await api.getSavedDirectory();
          if (savedDir) {
            const name = await openSaveNamePrompt();
            if (name) {
              const sep = savedDir.includes("\\") ? "\\" : "/";
              const cleanDir = savedDir.endsWith(sep)
                ? savedDir.slice(0, -1)
                : savedDir;
              const fullPath = `${cleanDir}${sep}${name}.pp`;
              success = await saveProject(
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                false,
                fullPath
              );
            } else {
              // User cancelled name input
              return;
            }
          } else {
            success = await saveProject();
          }
        } else {
          success = await saveProject();
        }

        if (!success) return; // Save failed or cancelled
      } else {
        if (
          !confirm(
            "This will discard your unsaved changes. Are you sure you want to reset?"
          )
        ) {
          return;
        }
      }
    }

    resetPath();
    // Clear file association for the new project
    currentFilePath.set(null);
    projectMetadataStore.set({ filepath: "" });

    recordChange();
    // Mark as clean new project
    lastSavedState = getCurrentState();
    isUnsaved.set(false);
  }

  function undoAction() {
    const prev = history.undo();
    if (prev) {
      startPointStore.set(prev.startPoint);
      linesStore.set(prev.lines);
      shapesStore.set(prev.shapes);
      sequenceStore.set(prev.sequence);

      // Preserve the current onion layer visibility when undoing so that
      // toggling onion layers isn't overwritten by history operations.
      const currentShowOnion = get(settingsStore).showOnionLayers;
      const preservedShowOnion =
        typeof currentShowOnion === "boolean"
          ? currentShowOnion
          : prev.settings?.showOnionLayers;
      settingsStore.set({
        ...prev.settings,
        showOnionLayers: preservedShowOnion,
      });

      const currentState = getCurrentState();
      isUnsaved.set(currentState !== lastSavedState);
      // FieldRenderer will update reactively via stores
    }
  }

  function redoAction() {
    const next = history.redo();
    if (next) {
      startPointStore.set(next.startPoint);
      linesStore.set(next.lines);
      shapesStore.set(next.shapes);
      sequenceStore.set(next.sequence);

      // Preserve onion layer visibility when redoing as well.
      const currentShowOnion = get(settingsStore).showOnionLayers;
      const preservedShowOnion =
        typeof currentShowOnion === "boolean"
          ? currentShowOnion
          : next.settings?.showOnionLayers;
      settingsStore.set({
        ...next.settings,
        showOnionLayers: preservedShowOnion,
      });

      const currentState = getCurrentState();
      isUnsaved.set(currentState !== lastSavedState);
    }
  }

  function closeWhatsNew() {
    showWhatsNew = false;
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
    // Load Settings
    const savedSettings = await loadSettings();
    settingsStore.set({ ...savedSettings });

    // Stabilize
    setTimeout(async () => {
      isLoaded = true;
      lastSavedState = getCurrentState(); // Assume fresh start is "saved" unless loaded
      recordChange();
      // Ensure sequence/line consistency once initial load is stabilized
      try {
        ensureSequenceConsistency();
      } catch (err) {
        console.warn("ensureSequenceConsistency failed", err);
      }

      // Check for directory setup FIRST
      let needsSetup = false;
      if (electronAPI && electronAPI.getSavedDirectory) {
        try {
          const dir = await electronAPI.getSavedDirectory();
          if (!dir || dir.trim() === "") {
            needsSetup = true;
          }
        } catch (e) {
          console.warn("Failed to check saved directory", e);
        }
      }

      if (needsSetup || TEST_SETUP_DIALOG) {
        setupMode = true;
        showWhatsNew = true;
      } else {
        // Check for What's New
        const currentVersion = pkg.version;
        const lastSeen = get(settingsStore).lastSeenVersion;

        // If version mismatch or never seen, show dialog
        if (lastSeen !== currentVersion) {
          showWhatsNew = true;
        }
      }

      // Remove loading screen
      const loader = document.getElementById("loading-screen");
      if (loader) {
        loader.style.opacity = "0";
        setTimeout(() => loader.remove(), 500);
      }
    }, 500);

    // Expose debug trigger for testing setup dialog
    (window as any).triggerSetupDialog = () => {
      setupMode = true;
      showWhatsNew = true;
    };

    // Electron Menu Action Listener
    if (electronAPI) {
      // Listen for external file opens BEFORE signaling ready
      if (electronAPI.onOpenFilePath) {
        electronAPI.onOpenFilePath((filePath) => {
          handleExternalFileOpen(filePath);
        });
      }

      // Signal main process that we are ready to receive file paths
      if (electronAPI.rendererReady) {
        electronAPI.rendererReady();
      }

      if (electronAPI.onMenuAction) {
        electronAPI.onMenuAction((action) => {
          // Some actions are handled in KeyboardShortcuts via props or bindings,
          // but menu clicks come here.
          // We can invoke the functions directly.
          switch (action) {
            case "save-project":
              handleSaveProject();
              break;
            case "save-as":
              saveFileAs();
              break;
            case "open-file":
              const input = document.getElementById("file-upload");
              if (input) input.click();
              break;
            case "export-gif":
              exportGif();
              break;
            case "export-pp":
              // Open the Export Code dialog pre-selected to JSON (.pp) format
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
            // ... other cases ...
          }
        });
      }
    }
  });

  // Settings Auto-Save
  const debouncedSaveSettings = debounce(async (s: Settings) => {
    await saveSettings(s);
  }, 1000);
  $: if (settings) debouncedSaveSettings(settings);

  // --- Animation Logic ---
  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);
  $: animationDuration = getAnimationDuration(
    timePrediction.totalTime / 1000,
    playbackSpeed,
  );

  onMount(() => {
    animationController = createAnimationController(
      animationDuration,
      (newPercent) => percentStore.set(newPercent),
      () => {
        playingStore.set(false);
      },
    );
  });

  $: if (animationController) {
    animationController.setDuration(animationDuration);
    animationController.setLoop(loopAnimation);
    // If playing state changes externally (e.g. store update), sync controller?
    // Actually controller drives percent. `playing` store drives controller.
  }

  // Sync playing store -> controller
  $: if (animationController) {
    if (playing && !animationController.isPlaying()) animationController.play();
    if (!playing && animationController.isPlaying())
      animationController.pause();
  }

  // Sync controller updates to Robot State
  $: {
    if (timePrediction && timePrediction.timeline && lines.length > 0) {
      // Pass identity scales to get inches
      const state = calculateRobotState(
        percent,
        timePrediction.timeline,
        lines,
        startPoint,
        d3.scaleLinear(),
        d3.scaleLinear(),
      );
      robotXYStore.set({ x: state.x, y: state.y });
      robotHeadingStore.set(state.heading);
    } else {
      // Store position in inches
      robotXYStore.set({ x: startPoint.x, y: startPoint.y });
      robotHeadingStore.set(
        startPoint.heading === "constant" ? -startPoint.degrees : 0,
      );
    }
  }

  function play() {
    playingStore.set(true);
  }
  function pause() {
    playingStore.set(false);
  }
  function resetAnimation() {
    if (animationController) animationController.reset();
    playingStore.set(false);
  }
  function handleSeek(val: number) {
    if (animationController) animationController.seekToPercent(val);
  }

  function handlePreviewChange(newLines: any) {
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
  function changePlaybackSpeedBy(delta: number) {
    const val = Math.max(0.25, Math.min(3.0, playbackSpeed + delta));
    playbackSpeedStore.set(val);
  }
  // Compatibility alias expected by ControlTab props
  function changePlaybackSpeed(delta: number) {
    changePlaybackSpeedBy(delta);
  }
  function resetPlaybackSpeed() {
    playbackSpeedStore.set(1.0);
  }
  function setPlaybackSpeed(val: number) {
    playbackSpeedStore.set(val);
  }

  // --- Resizing Logic ---
  // When in vertical (mobile) mode, hide the control tab from layout after
  // its closing animation completes so the field can resize to the freed area.
  let controlTabHidden = false;
  let hideControlTabTimeout: ReturnType<typeof setTimeout> | null = null;

  $: if (!isLargeScreen) {
    // On small screens, when sidebar is closed, wait for animation then hide
    if (!showSidebar) {
      if (hideControlTabTimeout) clearTimeout(hideControlTabTimeout);
      hideControlTabTimeout = setTimeout(() => {
        controlTabHidden = true;
      }, 320); // slightly longer than the 300ms transition
    } else {
      if (hideControlTabTimeout) {
        clearTimeout(hideControlTabTimeout);
        hideControlTabTimeout = null;
      }
      controlTabHidden = false;
    }
  } else {
    // Ensure visible on large screens
    controlTabHidden = false;
    if (hideControlTabTimeout) {
      clearTimeout(hideControlTabTimeout);
      hideControlTabTimeout = null;
    }
  }
  $: if (userFieldLimit === null && mainContentWidth > 0 && isLargeScreen) {
    userFieldLimit = mainContentWidth * 0.49;
  }
  $: if (
    userFieldHeightLimit === null &&
    mainContentHeight > 0 &&
    !isLargeScreen
  ) {
    userFieldHeightLimit = mainContentHeight * 0.6;
  }
  $: leftPaneWidth = (() => {
    if (!isLargeScreen) return mainContentWidth;
    if (!showSidebar) return mainContentWidth;
    let target = userFieldLimit ?? mainContentWidth * 0.55;
    const max = mainContentWidth - MIN_SIDEBAR_WIDTH;
    const min = MIN_FIELD_PANE_WIDTH;
    if (max < min) return mainContentWidth * 0.5;
    return Math.max(min, Math.min(target, max));
  })();
  $: fieldDrawSize = (() => {
    if (!isLargeScreen) {
      const h = userFieldHeightLimit ?? mainContentHeight * 0.6;
      return Math.min(innerWidth - 32, h - 16);
    }
    const avW = leftPaneWidth - 16;
    const avH = mainContentHeight - 16;
    return Math.max(100, Math.min(avW, avH));
  })();

  // Compute a target height for the field container so it can animate smoothly
  // when the sidebar (control tab) opens/closes in vertical mode
  $: fieldContainerTargetHeight = (() => {
    if (isLargeScreen) return "100%";
    // when sidebar is visible, reserve space for it (use userFieldHeightLimit or default fraction)
    if (showSidebar) {
      const h = userFieldHeightLimit ?? mainContentHeight * 0.6;
      // ensure we don't exceed the available height
      const target = Math.min(h, mainContentHeight);
      return `${Math.max(120, Math.floor(target))}px`;
    } else {
      // sidebar not shown -> full available height
      return `${mainContentHeight}px`;
    }
  })();

  function startResize(mode: "horizontal" | "vertical") {
    if (
      (mode === "horizontal" && (!isLargeScreen || !showSidebar)) ||
      (mode === "vertical" && (isLargeScreen || !showSidebar))
    )
      return;
    resizeMode = mode;
  }
  function handleResize(cx: number, cy: number) {
    if (!resizeMode) return;
    if (resizeMode === "horizontal") userFieldLimit = cx;
    else if (resizeMode === "vertical" && mainContentDiv) {
      const rect = mainContentDiv.getBoundingClientRect();
      const nh = cy - rect.top;
      const max = rect.height - 100;
      userFieldHeightLimit = Math.max(200, Math.min(nh, max));
    }
  }
  function stopResize() {
    resizeMode = null;
  }

  // --- Document Click Handler (Wait Selection) ---
  function handleDocClick(e: MouseEvent) {
    const sel = get(selectedPointId);
    if (!sel || !sel.startsWith("wait-")) return;
    let el = e.target as Element | null;
    while (el) {
      if (el.classList && el.classList.contains("wait-row")) return;
      if (
        el.id &&
        (el.id.startsWith("wait-") || el.id.startsWith("wait-event-"))
      )
        return;
      el = el.parentElement;
    }
    selectedPointId.set(null);
  }
  onDestroy(() => {
    if (typeof document !== "undefined")
      document.removeEventListener("click", handleDocClick);
  });
  if (typeof document !== "undefined")
    document.addEventListener("click", handleDocClick);

  // --- Export GIF ---
  // Need reference to Two instance from FieldRenderer
  let fieldRenderer: FieldRenderer;
  function exportGif() {
    showExportGif.set(true);
  }

  // --- Apply Theme ---
  $: {
    if (settings?.theme) {
      let t = settings.theme;
      if (t === "auto") {
        t = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }
      if (t === "dark") document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    }
  }
</script>

<svelte:window
  bind:innerWidth
  bind:innerHeight
  on:dragenter={handleDragEnter}
  on:dragleave={handleDragLeave}
  on:dragover={handleDragOver}
  on:drop={handleDrop}
  on:mouseup={stopResize}
  on:mousemove={(e) => {
    if (resizeMode) {
      e.preventDefault();
      handleResize(e.clientX, e.clientY);
    }
  }}
  on:touchend={stopResize}
  on:touchmove={(e) => {
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
  {undoAction}
  {redoAction}
  {play}
  {pause}
  {resetAnimation}
  {stepForward}
  {stepBackward}
  {recordChange}
  bind:controlTabRef
  bind:activeControlTab
  toggleStats={() => (statsOpen = !statsOpen)}
  openWhatsNew={() => (showWhatsNew = true)}
  toggleSidebar={() => (showSidebar = !showSidebar)}
/>

{#if $showExportGif && fieldRenderer}
  <ExportGifDialog
    bind:show={$showExportGif}
    twoInstance={fieldRenderer.getTwoInstance()}
    {animationController}
    {settings}
    robotLengthPx={x(robotLength)}
    robotWidthPx={x(robotWidth)}
    robotStateFunction={(p) =>
      calculateRobotState(p, timePrediction.timeline, lines, startPoint, x, y)}
    {electronAPI}
    on:close={() => showExportGif.set(false)}
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
    onClose={() => (statsOpen = false)}
  />
{/if}

<WhatsNewDialog show={showWhatsNew} bind:setupMode on:close={closeWhatsNew} />
<NotificationToast />

<SaveNameDialog
  bind:show={showSaveNameDialog}
  onSave={handleSaveName}
  onCancel={handleCancelSaveName}
/>

<!-- Drag Overlay -->
{#if isDraggingFile}
  <div
    class="fixed inset-0 z-[100] bg-purple-500/20 backdrop-blur-sm border-4 border-purple-500 flex items-center justify-center pointer-events-none"
  >
    <div
      class="bg-white dark:bg-neutral-800 p-8 rounded-xl shadow-2xl flex flex-col items-center animate-bounce-slight"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-16 w-16 text-purple-600 dark:text-purple-400 mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      </svg>
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
  <div class="flex-none z-50">
    <Navbar
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
      on:previewOptimizedLines={(e) => (previewOptimizedLines = e.detail)}
    />
  </div>

  <div
    class="flex-1 min-h-0 flex flex-col lg:flex-row items-stretch lg:overflow-hidden relative gap-0"
    bind:clientHeight={mainContentHeight}
    bind:clientWidth={mainContentWidth}
    bind:this={mainContentDiv}
  >
    <!-- Field Container -->
    <div
      class="flex-none flex justify-center items-center relative transition-all duration-300 ease-in-out bg-white dark:bg-black lg:dark:bg-black/40 overflow-hidden"
      style={`
        width: ${isLargeScreen && showSidebar ? leftPaneWidth + "px" : "100%"};
        height: ${isLargeScreen ? "100%" : fieldContainerTargetHeight};
        min-height: ${!isLargeScreen ? (userFieldHeightLimit ? "0" : "60vh") : "0"};
      `}
    >
      <div
        class="relative shadow-inner w-full h-full flex justify-center items-center"
      >
        <FieldRenderer
          bind:this={fieldRenderer}
          width={fieldDrawSize}
          height={fieldDrawSize}
          {timePrediction}
          {previewOptimizedLines}
          {onRecordChange}
        />
      </div>
    </div>

    <!-- Resizer Handle (Desktop) -->
    {#if isLargeScreen && showSidebar}
      <button
        class="w-3 cursor-col-resize flex justify-center items-center hover:bg-purple-500/10 active:bg-purple-500/20 transition-colors select-none z-40 border-none bg-neutral-200 dark:bg-neutral-800 p-0 m-0 border-l border-r border-neutral-300 dark:border-neutral-700"
        on:mousedown={() => startResize("horizontal")}
        on:dblclick={() => {
          userFieldLimit = null;
        }}
        aria-label="Resize Sidebar"
        title="Drag to resize. Double-click to reset to default width"
      >
        <div
          class="w-1 h-8 bg-neutral-400 dark:bg-neutral-600 rounded-full"
        ></div>
      </button>
    {/if}

    <!-- Resizer Handle (Mobile) -->
    {#if !isLargeScreen && showSidebar}
      <button
        class="h-3 w-full cursor-row-resize flex justify-center items-center hover:bg-purple-500/10 active:bg-purple-500/20 transition-colors select-none z-40 border-none bg-neutral-200 dark:bg-neutral-800 p-0 m-0 border-t border-b border-neutral-300 dark:border-neutral-700 touch-none"
        on:mousedown={() => startResize("vertical")}
        on:touchstart={(e) => {
          e.preventDefault();
          startResize("vertical");
        }}
        on:dblclick={() => {
          userFieldHeightLimit = null;
        }}
        aria-label="Resize Tab"
        title="Drag to resize. Double-click to reset to default height"
      >
        <div
          class="h-1 w-8 bg-neutral-400 dark:bg-neutral-600 rounded-full"
        ></div>
      </button>
    {/if}

    <!-- Control Tab -->
    <div
      bind:this={controlTabContainer}
      class="relative flex-1 h-auto lg:h-full min-h-0 min-w-0 transition-transform duration-300 ease-in-out transform bg-neutral-50 dark:bg-neutral-900"
      class:translate-x-full={!showSidebar && isLargeScreen}
      class:translate-y-full={!showSidebar && !isLargeScreen}
      class:overflow-hidden={!showSidebar}
      class:hidden={controlTabHidden}
      class:controlTabBlurred={statsOpen}
    >
      {#if statsOpen}
        <div
          class="control-tab-overlay absolute inset-0 z-40"
          role="button"
          aria-label="Dismiss statistics"
          tabindex="0"
          on:click={() => (statsOpen = false)}
          on:keydown={(e) => {
            if (e.key === "Enter" || e.key === " " || e.key === "Spacebar")
              statsOpen = false;
          }}
        ></div>
      {/if}

      <ControlTab
        bind:this={controlTabRef}
        bind:playing={$playingStore}
        {play}
        {pause}
        bind:startPoint={$startPointStore}
        bind:lines={$linesStore}
        bind:sequence={$sequenceStore}
        bind:robotLength
        bind:robotWidth
        bind:settings={$settingsStore}
        bind:percent={$percentStore}
        bind:robotXY={$robotXYStore}
        bind:robotHeading={$robotHeadingStore}
        bind:shapes={$shapesStore}
        {handleSeek}
        bind:loopAnimation={$loopAnimationStore}
        {resetAnimation}
        {recordChange}
        playbackSpeed={$playbackSpeedStore}
        {resetPlaybackSpeed}
        {setPlaybackSpeed}
        bind:statsOpen
        bind:activeTab={activeControlTab}
        onPreviewChange={handlePreviewChange}
      />
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
