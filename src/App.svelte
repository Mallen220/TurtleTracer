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
  import NotificationToast from "./lib/components/NotificationToast.svelte";

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

  // Electron API
  interface ElectronAPI {
    onMenuAction?: (callback: (action: string) => void) => void;
    showSaveDialog?: (options: any) => Promise<string | null>;
    writeFileBase64?: (path: string, content: string) => Promise<boolean>;
    rendererReady?: () => Promise<void>;
    onOpenFilePath?: (callback: (path: string) => void) => void;
  }
  const electronAPI = (window as any).electronAPI as ElectronAPI | undefined;

  // --- Layout State ---
  let showSidebar = true;
  let activeControlTab: "path" | "field" | "table" = "path";
  let controlTabRef: any = null;
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

  // --- Initialization ---
  onMount(async () => {
    // Load Settings
    const savedSettings = await loadSettings();
    settingsStore.set({ ...savedSettings });

    // Stabilize
    setTimeout(() => {
      isLoaded = true;
      lastSavedState = getCurrentState(); // Assume fresh start is "saved" unless loaded
      recordChange();
      // Ensure sequence/line consistency once initial load is stabilized
      try {
        ensureSequenceConsistency();
      } catch (err) {
        console.warn("ensureSequenceConsistency failed", err);
      }

      // Remove loading screen
      const loader = document.getElementById("loading-screen");
      if (loader) {
        loader.style.opacity = "0";
        setTimeout(() => loader.remove(), 500);
      }
    }, 500);

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

<NotificationToast />

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
      class="flex-1 h-auto lg:h-full min-h-0 min-w-0 transition-transform duration-300 ease-in-out transform bg-neutral-50 dark:bg-neutral-900"
      class:translate-x-full={!showSidebar && isLargeScreen}
      class:translate-y-full={!showSidebar && !isLargeScreen}
      class:overflow-hidden={!showSidebar}
      class:hidden={controlTabHidden}
    >
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
        bind:activeTab={activeControlTab}
        onPreviewChange={handlePreviewChange}
      />
    </div>
  </div>
</div>
