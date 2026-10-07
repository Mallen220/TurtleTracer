<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import debounce from "lodash/debounce";

  // Components
  import ControlTab from "./lib/ControlTab.svelte";
  import Navbar from "./lib/Navbar.svelte";
  import LeftSidebar from "./lib/components/LeftSidebar.svelte";
  import FieldRenderer from "./lib/components/FieldRenderer.svelte";
  import KeyboardShortcuts from "./lib/components/KeyboardShortcuts.svelte";
  import FileDropZone from "./lib/components/FileDropZone.svelte";
  import ResizeHandle from "./lib/components/ResizeHandle.svelte";
  import StoreDialogs from "./lib/components/StoreDialogs.svelte";
  import UnsavedChangesGuard from "./lib/components/UnsavedChangesGuard.svelte";
  import ExportGifDialog from "./lib/components/dialogs/ExportGifDialog.svelte";
  import ExportImageDialog from "./lib/components/dialogs/ExportImageDialog.svelte";
  import PathStatisticsDialog from "./lib/components/dialogs/PathStatisticsDialog.svelte";
  import NotificationToast from "./lib/components/NotificationToast.svelte";
  import OnboardingTutorial from "./lib/components/OnboardingTutorial.svelte";
  import WhatsNewDialog from "./lib/components/whats-new/WhatsNewDialog.svelte";
  import SetupDialog from "./lib/components/dialogs/SetupDialog.svelte";
  import ExportCodeDialog from "./lib/components/dialogs/ExportCodeDialog.svelte";
  import StrategySheetPreview from "./lib/components/dialogs/StrategySheetPreview.svelte";
  import DialogHost from "./lib/components/DialogHost.svelte";
  import FeedbackDialog from "./lib/components/dialogs/FeedbackDialog.svelte";
  import RatingDialog from "./lib/components/dialogs/RatingDialog.svelte";

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
    selectedLineId,
    showFileManager,
    fileManagerNewFileMode,
    currentDirectoryStore,
    showUpdateAvailableDialog,
    updateDataStore,
    gitStatusStore,
    notification,
  } from "./stores";

  import {
    startPointStore,
    linesStore,
    shapesStore,
    sequenceStore,
    settingsStore,
    percentStore,
    playingStore,
    loopAnimationStore,
    playbackSpeedStore,
    robotXYStore,
    robotHeadingStore,
    ensureSequenceConsistency,
    macrosStore,
    refreshMacros,
    loadMacro,
    resetProject,
    scaleShapesToField,
  } from "./lib/projectStore";

  // Logic
  import { FieldLayout } from "./lib/fieldLayout.svelte";
  import { Playback } from "./lib/playback.svelte";
  import {
    recordUsageTime,
    startRatingChecks,
    tryShowRatingDialog,
  } from "./lib/usageTracking";
  import { PluginManager } from "./lib/pluginManager";
  import { themesStore } from "./lib/pluginsStore";
  import { registerCoreUI } from "./lib/coreRegistrations";
  import { componentRegistry } from "./lib/registries";
  import {
    applyTheme,
    applyFontSize,
    applySquaredCorners,
  } from "./lib/appearance";
  import { loadSettings, saveSettings } from "./utils/settingsPersistence";
  import { createHistory, type AppState } from "./utils/history";
  import {
    saveProject,
    saveFileAs,
    handleExternalFileOpen,
    autoExportAfterChange,
  } from "./utils/fileHandlers";
  import { splitPathAtPercent } from "./utils/pathEditing";
  import { scanEventsInDirectory } from "./utils/eventScanner";
  import { checkLibraryVersion } from "./utils/libraryVersionChecker";
  import { trackMicrosoftStoreInstall } from "./utils/msStoreTracking";
  import { isBrowser, getElectronAPI } from "./utils/platform";
  import { firePotatoConfetti } from "./utils/potatoTheme";
  import { DEFAULT_ROBOT_LENGTH, DEFAULT_ROBOT_WIDTH } from "./config";
  import type { Line } from "./types/index";
  import pkg from "../package.json";

  // Register Default Components/Tabs
  registerCoreUI();

  const electronAPI = getElectronAPI();

  // Plugins can replace these components.
  const NavbarComponent = $derived($componentRegistry.Navbar || Navbar);
  const FieldRendererComponent = $derived(
    $componentRegistry.FieldRenderer || FieldRenderer,
  );
  const ControlTabComponent = $derived(
    $componentRegistry.ControlTab || ControlTab,
  );

  const layout = new FieldLayout(() => $isPresentationMode);
  const playback = new Playback();

  let settings = $derived($settingsStore);
  let robotLength = $derived(settings?.rLength || DEFAULT_ROBOT_LENGTH);
  let robotWidth = $derived(settings?.rWidth || DEFAULT_ROBOT_WIDTH);

  // --- Project state and history ---
  const history = createHistory();
  const { canUndoStore, canRedoStore } = history;
  let canUndo = $derived($canUndoStore);
  let canRedo = $derived($canRedoStore);

  /** Set once startup has finished, so loading the project doesn't count as an edit. */
  let isLoaded = $state(false);
  /** The project as last saved, to tell whether undo/redo brought it back to a saved state. */
  let lastSavedState = "";
  /** Shorter versions of the path shown while previewing an optimisation. */
  let previewOptimizedLines = $state<Line[] | null>(null);

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

  /** Call after every edit: records it for undo and handles autosave and auto-export. */
  async function recordChange(description: string = "Change") {
    ensureSequenceConsistency();
    refreshMacros();
    previewOptimizedLines = null;
    history.record(getAppState(), description);
    if (!isLoaded) return;

    isUnsaved.set(true);
    playback.seek(0);

    const path = get(currentFilePath);
    if (!path) return;

    if (settings?.autosaveMode === "change") {
      saveProject({ quiet: true }).then(fetchGitStatus);
    }
    if (settings?.autoExportCode) {
      // Fire and forget; the UI doesn't wait for the export.
      autoExportAfterChange(path).catch((e) => {
        console.error("Auto-export during change failed", e);
      });
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

  // --- Saving, resetting and closing ---
  let unsavedGuard: UnsavedChangesGuard | undefined = $state();

  function handleSaveProject() {
    if (get(currentFilePath)) {
      saveProject().then(fetchGitStatus);
    } else {
      showFileManager.set(true);
      fileManagerNewFileMode.set(true);
    }
  }

  function handleResetProject() {
    unsavedGuard?.requestReset();
  }

  function performReset() {
    resetProject();
    // A new project isn't saved anywhere yet.
    currentFilePath.set(null);

    recordChange("New Project");
    lastSavedState = getCurrentState();
    isUnsaved.set(false);
  }

  function performAutosave() {
    if (get(currentFilePath) && get(isUnsaved)) {
      saveProject({ quiet: true });
    }
  }

  // Desktop builds ask about unsaved changes through the main process
  // (see handleAppCloseRequested); this covers running in a browser.
  function handleBeforeUnload(e: BeforeUnloadEvent) {
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

    // With "save on close", a project that has a file is saved silently.
    // A new, never-saved project still gets the prompt.
    if (settings?.autosaveMode === "close" && unsaved && get(currentFilePath)) {
      await saveProject();
      electronAPI?.sendCloseApproved?.();
    } else if (unsaved) {
      unsavedGuard?.requestClose();
    } else {
      electronAPI?.sendCloseApproved?.();
    }
  }

  // Time-based autosave
  $effect(() => {
    if (settings?.autosaveMode !== "time" || !settings.autosaveInterval) return;
    const id = setInterval(performAutosave, settings.autosaveInterval * 60_000);
    return () => clearInterval(id);
  });

  // --- Git status and library version ---
  async function fetchGitStatus() {
    const dir = get(currentDirectoryStore);
    if (!dir || !get(settingsStore).gitIntegration) return;
    if (!electronAPI?.gitStatus) return;
    try {
      gitStatusStore.set(await electronAPI.gitStatus(dir));
    } catch (e) {
      console.warn("Failed to check git status", e);
    }
  }

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

  // --- Startup ---
  /** Shown on first launch to pick a project folder. */
  let setupMode = $state(false);

  onMount(() => {
    trackMicrosoftStoreInstall();

    electronAPI?.onUpdateAvailable?.((data: any) => {
      updateDataStore.set(data);
      showUpdateAvailableDialog.set(true);
    });

    electronAPI?.onStoreUpdateAvailable?.((data: any) => {
      notification.set({
        message: `Update ${data.version} is available in the Microsoft Store.`,
        type: "info",
        timeout: 0,
        actionLabel: "Open Store",
        action: () =>
          electronAPI.openExternal?.(
            "https://apps.microsoft.com/store/detail/9NK0B4FDJ3ZW?cid=DevShareMCLPCS",
          ),
      });
    });

    startUp();
    return startRatingChecks();
  });

  async function startUp() {
    if (!isBrowser) await PluginManager.init();

    const savedSettings = await loadSettings();
    settingsStore.set({ ...savedSettings });
    shapesStore.update((shapes) => scaleShapesToField(shapes, savedSettings));

    // Give the stores a moment to settle before treating the project as loaded.
    setTimeout(finishStartup, 500);

    if (electronAPI) connectToElectron();
  }

  async function finishStartup() {
    // Recorded before isLoaded is set, so it doesn't mark the project unsaved.
    recordChange("Initial State");
    isLoaded = true;
    lastSavedState = getCurrentState();

    try {
      ensureSequenceConsistency();
    } catch (err) {
      console.warn("ensureSequenceConsistency failed", err);
    }

    // The project folder comes first: without one, the setup dialog opens.
    if (await needsProjectFolder()) {
      setupMode = true;
    } else {
      const { lastSeenVersion, hasSeenOnboarding } = get(settingsStore);
      if (lastSeenVersion !== pkg.version && hasSeenOnboarding) {
        showWhatsNew.set(true);
      }
    }

    fadeOutLoadingScreen();
    tryShowRatingDialog();
  }

  /** Loads the saved project folder. Returns true if none has been chosen yet. */
  async function needsProjectFolder(): Promise<boolean> {
    if (!electronAPI?.getSavedDirectory) return false;
    try {
      const dir = await electronAPI.getSavedDirectory();
      if (!dir || dir.trim() === "") return true;
      currentDirectoryStore.set(dir);
      void scanEventsInDirectory(dir);
    } catch (e) {
      console.warn("Failed to check saved directory", e);
    }
    return false;
  }

  function fadeOutLoadingScreen() {
    const loader = document.getElementById("loading-screen");
    if (!loader) return;
    loader.style.opacity = "0";
    setTimeout(() => loader.remove(), 500);
  }

  /** Listens for events from the desktop app's main process. */
  function connectToElectron() {
    if (!electronAPI) return;

    // Listen for external file opens BEFORE signaling ready
    electronAPI.onOpenFilePath?.(async (filePath) => {
      await handleExternalFileOpen(filePath);
      recordChange("Load Project");
    });
    electronAPI.rendererReady?.();
    electronAPI.onAppCloseRequested?.(handleAppCloseRequested);
    electronAPI.onMenuAction?.(handleMenuAction);
  }

  /** Menu clicks. Keyboard shortcuts are handled in KeyboardShortcuts. */
  function handleMenuAction(action: string) {
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
        showExportGif.set(true);
        break;
      case "export-image":
        showExportImage.set(true);
        break;
      case "export-pp":
        // The JSON format is the .turt project file.
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
  }

  // --- Appearance and settings persistence ---
  const debouncedSaveSettings = debounce(saveSettings, 1000);

  $effect(() => {
    if (settings) debouncedSaveSettings(settings);
  });

  $effect(() => {
    if (!settings) return;
    applyTheme(settings, $themesStore);
    applyFontSize(settings);
    applySquaredCorners(settings);
  });

  function closeWhatsNew() {
    showWhatsNew.set(false);
    // Saved by the debounced settings save.
    settingsStore.update((s) => ({ ...s, lastSeenVersion: pkg.version }));
  }

  // --- Field, control tab and dialogs ---
  let activeControlTab: "path" | "field" | "table" = $state("path");
  let controlTabRef: any = $state(null);
  let statsOpen = $state(false);
  // The field renderer's Two.js instance is needed by the export dialogs.
  let fieldRenderer: any = $state();
  let exportDialog: ExportCodeDialog | undefined = $state();

  $effect(() => {
    if (!layout.effectiveShowSidebar && statsOpen) statsOpen = false;
  });

  function toggleStats() {
    if (layout.showSidebar) statsOpen = !statsOpen;
  }

  function handleSplitPath() {
    const prediction = playback.timePrediction;
    if (!prediction?.totalTime) return;
    const res = splitPathAtPercent(
      get(percentStore),
      prediction,
      get(linesStore),
      get(sequenceStore),
    );
    if (!res) return;

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

  function handleWindowClick(e: MouseEvent) {
    if (settings?.robotImage === "/JefferyThePotato.png") {
      firePotatoConfetti(e.clientX, e.clientY);
    }
  }

  // Opens the export dialog when something sets `exportDialogState`.
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
</script>

<svelte:window
  bind:innerWidth={layout.innerWidth}
  onclick={handleWindowClick}
  onfocus={fetchGitStatus}
  onbeforeunload={handleBeforeUnload}
  onmouseup={layout.stopResize}
  onmousemove={layout.handleMouseMove}
  ontouchend={layout.stopResize}
  ontouchmove={layout.handleTouchMove}
/>
<svelte:document onclick={clearWaitSelectionOnOutsideClick} />

<KeyboardShortcuts
  saveProject={handleSaveProject}
  resetProject={handleResetProject}
  {saveFileAs}
  exportGif={() => showExportGif.set(true)}
  exportImage={() => showExportImage.set(true)}
  {undoAction}
  {redoAction}
  play={playback.play}
  pause={playback.pause}
  resetAnimation={playback.reset}
  stepForward={playback.stepForward}
  stepBackward={playback.stepBackward}
  {recordChange}
  splitPath={handleSplitPath}
  bind:controlTabRef
  bind:activeControlTab
  {toggleStats}
  toggleControlTab={() => (layout.showSidebar = !layout.showSidebar)}
  openWhatsNew={() => showWhatsNew.set(true)}
  toggleSidebar={() => {
    settingsStore.update((s) => ({
      ...s,
      sidebarExpanded: !s.sidebarExpanded,
    }));
  }}
  {fieldRenderer}
/>

{#if $showExportGif && fieldRenderer && playback.controller}
  <ExportGifDialog
    bind:show={$showExportGif}
    twoInstance={fieldRenderer.getTwoInstance()}
    animationController={playback.controller}
    {settings}
    robotLengthPx={layout.xScale(robotLength)}
    robotWidthPx={layout.xScale(robotWidth)}
    robotStateFunction={(p) =>
      playback.poseAtPercent(p, layout.xScale, layout.yScale)}
    onclose={() => showExportGif.set(false)}
  />
{/if}

{#if $showExportImage && fieldRenderer}
  <ExportImageDialog
    bind:show={$showExportImage}
    twoInstance={fieldRenderer.getTwoInstance()}
    {settings}
    robotLengthPx={layout.xScale(robotLength)}
    robotWidthPx={layout.xScale(robotWidth)}
    xScale={layout.xScale}
    yScale={layout.yScale}
    robotState={{
      x: $startPointStore.x,
      y: $startPointStore.y,
      heading: playback.poseAtPercent(0).heading,
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
    timePrediction={playback.timePrediction}
  />
{/if}

{#if statsOpen}
  <PathStatisticsDialog
    bind:isOpen={statsOpen}
    lines={$linesStore}
    sequence={$sequenceStore}
    settings={$settingsStore}
    startPoint={$startPointStore}
    controlRect={layout.controlTabRect}
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

<UnsavedChangesGuard bind:this={unsavedGuard} onReset={performReset} />

<StoreDialogs />

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

<FileDropZone
  saveBeforeContinuing={async () =>
    (await unsavedGuard?.saveBeforeContinuing()) ?? false}
  onOpened={() => recordChange("Load Project")}
/>

<div
  class="h-screen w-full flex flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 font-sans"
>
  {#if !$isPresentationMode}
    <div class="flex-none z-50">
      <NavbarComponent
        bind:lines={$linesStore}
        bind:startPoint={$startPointStore}
        bind:shapes={$shapesStore}
        bind:sequence={$sequenceStore}
        bind:settings={$settingsStore}
        {robotLength}
        {robotWidth}
        bind:showSidebar={layout.showSidebar}
        isLargeScreen={layout.isLargeScreen}
        saveProject={handleSaveProject}
        resetProject={handleResetProject}
        {saveFileAs}
        exportGif={() => showExportGif.set(true)}
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
      bind:clientHeight={layout.mainContentHeight}
      bind:clientWidth={layout.mainContentWidth}
      bind:this={layout.mainContentDiv}
    >
      <div
        id="field-container"
        class="flex-none flex justify-center items-center relative transition-all duration-300 ease-in-out bg-white dark:bg-black lg:dark:bg-black/40 overflow-hidden"
        style:width={layout.fieldContainerWidth}
        style:height={layout.fieldContainerHeight}
        style:min-height={layout.fieldContainerMinHeight}
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
            width={layout.fieldRenderWidth}
            height={layout.fieldRenderHeight}
            timePrediction={playback.timePrediction}
            committedRobotState={playback.committedRobotState}
            {previewOptimizedLines}
            onRecordChange={recordChange}
          />
        </div>
      </div>

      {#if layout.isLargeScreen && layout.effectiveShowSidebar && !$isPresentationMode}
        <ResizeHandle
          direction="horizontal"
          onstart={() => layout.startResize("horizontal")}
          onkeydown={(e) => layout.resizeWithKeyboard(e, "horizontal")}
          onreset={() => layout.resetFieldWidth()}
        />
      {:else if !layout.isLargeScreen && layout.effectiveShowSidebar && !$isPresentationMode}
        <ResizeHandle
          direction="vertical"
          onstart={() => layout.startResize("vertical")}
          onkeydown={(e) => layout.resizeWithKeyboard(e, "vertical")}
          onreset={() => layout.resetFieldHeight()}
        />
      {/if}

      <div
        bind:this={layout.controlTabContainer}
        class="relative flex-1 h-auto lg:h-full min-h-0 min-w-0 transition-transform duration-300 ease-in-out transform bg-neutral-50 dark:bg-neutral-900"
        class:translate-x-full={!layout.effectiveShowSidebar &&
          layout.isLargeScreen}
        class:translate-y-full={!layout.effectiveShowSidebar &&
          !layout.isLargeScreen}
        class:overflow-hidden={!layout.effectiveShowSidebar}
        class:hidden={layout.controlTabHidden}
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
          play={playback.play}
          pause={playback.pause}
          bind:startPoint={$startPointStore}
          bind:lines={$linesStore}
          bind:sequence={$sequenceStore}
          bind:settings={$settingsStore}
          bind:percent={$percentStore}
          bind:robotXY={$robotXYStore}
          bind:robotHeading={$robotHeadingStore}
          bind:shapes={$shapesStore}
          handleSeek={playback.seek}
          bind:loopAnimation={$loopAnimationStore}
          {recordChange}
          playbackSpeed={$playbackSpeedStore}
          setPlaybackSpeed={(speed: number) => playbackSpeedStore.set(speed)}
          bind:statsOpen
          bind:activeTab={activeControlTab}
          onPreviewChange={(lines: Line[] | null) =>
            (previewOptimizedLines = lines)}
          totalSeconds={playback.effectiveDuration}
          splitPath={handleSplitPath}
        />
      </div>
    </div>
  </div>
</div>

<style>
  /* Dim the control tab when the stats panel is open; clicking the background closes the panel */
  .controlTabBlurred {
    opacity: 0.88;
    transition: opacity 0.15s ease;
    position: relative;
  }

  /* Overlay that sits above the control tab contents while stats are open */
  .control-tab-overlay {
    cursor: pointer;
    background: transparent; /* keep the dimmed control tab visible */
    outline: none;
  }

  .control-tab-overlay:focus {
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    border-radius: 8px;
  }
</style>
