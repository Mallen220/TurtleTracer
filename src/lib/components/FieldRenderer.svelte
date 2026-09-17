<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import {
    hoverRobotXYStore,
    hoverRobotHeadingStore,
  } from "../../lib/projectStore";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import Two from "two.js";
  import {
    isPresentationMode,
    selectedPointId,
    multiSelectedPointIds,
    selectedLineId,
    collisionMarkers,
    forceShowValidation,
    fieldZoom,
    fieldPan,
    hoveredMarkerId,
    fieldViewStore,
    pluginRedrawTrigger,
    notification,
    showRobot,
    isDrawingMode,
  } from "../../stores";
  import {
    hookRegistry,
    fieldContextMenuRegistry,
    fieldRenderRegistry,
  } from "../registries";
  import { actionRegistry } from "../actionRegistry";
  import ContextMenu from "./tools/ContextMenu.svelte";
  import VelocityTooltip from "./VelocityTooltip.svelte";
  import {
    linesStore,
    startPointStore,
    shapesStore,
    settingsStore,
    robotXYStore,
    robotHeadingStore,
    sequenceStore, // Imported for potential use, though main logic uses lines
    percentStore,
    followRobotStore,
    playingStore,
    isDraggingStore,
  } from "../projectStore";
  import {
    diffMode,
    toggleDiff,
    committedData,
    diffResult,
    isLoadingDiff,
  } from "../diffStore";
  import {
    showTelemetry,
    showTelemetryGhost,
    importedTelemetryData,
    telemetryOffset,
    calculateTelemetryGhostState,
  } from "../telemetryStore";
  import LiveRobotLayer from "./telemetry/LiveRobotLayer.svelte";
  import LiveFieldLayer from "./telemetry/LiveFieldLayer.svelte";
  import {
    currentFilePath,
    gitStatusStore,
    isUnsaved,
    dimmedLinesStore,
    showTransformDialog,
  } from "../../stores";
  import { updateRobotImageDisplay } from "../../utils";
  import { calculateDrivetrainSpeeds } from "../../utils/drivetrain";
  import {
    calculateWheelZoom,
    calculateNextZoom,
  } from "./renderer/FieldWheelHandler";
  import { getUpdatedLinearStartHeading } from "./renderer/LinearHeadingSync";
  import { generateAllSceneElements } from "./renderer/FieldSceneElements";
  import { syncFieldScene } from "./renderer/FieldSceneRenderer";
  import {
    buildContextMenuForEvent,
    createContextMenuStoreCallbacks,
    type ContextMenuItemDescriptor,
  } from "./renderer/FieldContextMenuBuilder";
  import {
    calculatePanToField,
    calculateZoomTo,
    createFieldScales,
  } from "./renderer/FieldViewport";
  import { FieldInteractionController } from "./renderer/FieldInteractionController";
  import { type RenderContext } from "./renderer/GeneratorUtils";
  import type { Line } from "../../types/index";
  import MathTools from "../MathTools.svelte";
  import FieldCoordinates from "./FieldCoordinates.svelte";
  import RobotOverlay from "./renderer/RobotOverlay.svelte";
  import FieldZoomControls from "./renderer/FieldZoomControls.svelte";
  import FieldImageLayer from "./renderer/FieldImageLayer.svelte";
  import FieldSvgOverlay from "./renderer/FieldSvgOverlay.svelte";

  interface Props {
    // State from props
    width?: number;
    height?: number;
    timePrediction?: any;
    committedRobotState?: {
      x: number;
      y: number;
      heading: number;
    } | null;
    previewOptimizedLines?: Line[] | null;
    isMouseOverField?: boolean;
    currentMouseX?: number;
    currentMouseY?: number;
    isObstructingHUD?: boolean;
    // Callback props for interactions
    onRecordChange: (action?: string) => void;
  }

  let {
    width = 0,
    height = 0,
    timePrediction = null,
    committedRobotState = null,
    previewOptimizedLines = null,
    isMouseOverField = $bindable(false),
    currentMouseX = $bindable(0),
    currentMouseY = $bindable(0),
    isObstructingHUD = $bindable(false),
    onRecordChange,
  }: Props = $props();

  let fieldW = $derived($settingsStore.fieldWidth ?? 144);
  let fieldH = $derived($settingsStore.fieldHeight ?? 144);
  let basePpI = $derived(Math.min(width / fieldW, height / fieldH));
  let visualW = $derived(fieldW * basePpI);
  let visualH = $derived(fieldH * basePpI);

  // Local state
  let two: Two | undefined = $state();
  let ghostRobotState: { x: number; y: number; heading: number } | null =
    $state(null);

  let twoElement: HTMLDivElement | undefined = $state();
  let wrapperDiv: HTMLDivElement | undefined = $state();
  let overlayContainer: HTMLDivElement | undefined = $state();

  // Smart Snapping State
  let snapGuides: InstanceType<typeof Two.Line>[] = $state([]);

  // Context Menu State
  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextMenuItems: ContextMenuItemDescriptor[] = $state([]);

  let isDrawing = $state(false);
  let drawPoints: { x: number; y: number }[] = $state([]);

  let hoverRobotXY = $derived($hoverRobotXYStore);
  let hoverRobotHeading = $derived($hoverRobotHeadingStore);

  // Velocity Tooltip State
  let tooltipVisible = $state(false);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let tooltipVelocity = $state(0);
  let tooltipTime = $state(0);
  let tooltipDistance = $state(0);

  let interactionController: FieldInteractionController | undefined;

  // Follow Robot Logic (Loop for playback)
  let followLoopId: number;
  function followLoop() {
    if ($followRobotStore && $playingStore && robotXY) {
      panToField(robotXY.x, robotXY.y);
    }
    followLoopId = requestAnimationFrame(followLoop);
  }

  function zoomTo(newZoom: number, focus?: { x: number; y: number }) {
    const res = calculateZoomTo({
      newZoom,
      focus,
      width,
      height,
      fieldW,
      fieldH,
      visualW,
      visualH,
      xInvert: x.invert,
      yInvert: y.invert,
    });
    fieldZoom.set(res.zoom);
    fieldPan.set(res.pan);
  }

  function handleWheel(e: WheelEvent) {
    if (!wrapperDiv || settings.lockFieldView) return;
    if (e.ctrlKey || e.metaKey) {
      followRobotStore.set(false);
      e.preventDefault();
      const rect = wrapperDiv.getBoundingClientRect();
      const res = calculateWheelZoom({
        clientX: e.clientX,
        clientY: e.clientY,
        deltaY: e.deltaY,
        wrapperRect: rect,
        fieldRotation: settings.fieldRotation || 0,
        currentZoom: zoom,
      });
      zoomTo(res.newZoom, res.focus);
    }
  }

  onMount(() => {
    two = new Two({ fitted: true, type: Two.Types.svg }).appendTo(twoElement!);
    if ((two!.renderer as any)?.domElement) {
      const svgEl = (two!.renderer as any).domElement as HTMLElement;
      svgEl.style.position = "absolute";
      svgEl.style.top = "0";
      svgEl.style.left = "0";
      svgEl.style.width = "100%";
      svgEl.style.height = "100%";
      svgEl.style.zIndex = "15";
    }

    updateRobotImageDisplay();

    // Trigger hook for plugins to initialize overlays
    hookRegistry.run("fieldOverlayInit", overlayContainer);

    // Start Follow Loop
    followLoop();

    interactionController = new FieldInteractionController({
      domElement: two!.renderer.domElement,
      getWrapperDiv: () => wrapperDiv,
      getTwo: () => two,
      getScales: () => ({ x, y, uiLength }),
      getSettings: () => settings,
      getFieldDimensions: () => ({ fieldW, fieldH }),
      getTimePrediction: () => effectiveTimePrediction,
      onRecordChange,
      onMouseStateChange: (state) => {
        isMouseOverField = state.isOver;
        currentMouseX = state.mouseX;
        currentMouseY = state.mouseY;
        isObstructingHUD = state.isObstructingHUD;
      },
      onTooltipChange: (t) => {
        tooltipVisible = t.visible;
        tooltipX = t.x;
        tooltipY = t.y;
        tooltipVelocity = t.velocity;
        tooltipTime = t.time;
        tooltipDistance = t.distance;
      },
      onSnapGuidesChange: (guides) => {
        snapGuides = guides;
      },
      onDrawingChange: (drawing) => {
        isDrawing = drawing.isDrawing;
        drawPoints = drawing.points;
      },
    });
  });

  // Public accessor for exportGif
  export function getTwoInstance() {
    return two;
  }

  // Public method to pan the view to center on specific field coordinates (inches)
  export function panToField(fx: number, fy: number) {
    const factor = get(fieldZoom);
    const pan = calculatePanToField({
      fx,
      fy,
      fieldW,
      fieldH,
      visualW,
      visualH,
      zoom: factor,
    });
    fieldPan.set(pan);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Hide if already open
    if (showContextMenu) {
      showContextMenu = false;
      return;
    }

    const menu = buildContextMenuForEvent({
      event: e,
      containerRect: twoElement!.getBoundingClientRect(),
      fieldRotation: settings.fieldRotation || 0,
      xInvert: x.invert,
      yInvert: y.invert,
      currentElem: interactionController?.getCurrentElem() || null,
      multiSelectedPointIds: $multiSelectedPointIds,
      startPoint,
      lines,
      shapes,
      settings,
      registryItems: get(fieldContextMenuRegistry),
      callbacks: createContextMenuStoreCallbacks({
        onRecordChange,
        linesStore,
        startPointStore,
        shapesStore,
        sequenceStore,
        selectedLineIdStore: selectedLineId,
        showTransformDialogStore: showTransformDialog,
        notificationStore: notification,
        onClose: () => {
          showContextMenu = false;
        },
      }),
    });

    if (menu) {
      contextMenuItems = menu.items;
      contextMenuX = menu.x;
      contextMenuY = menu.y;
      showContextMenu = true;
    }
  }

  onDestroy(() => {
    interactionController?.destroy();
    if (followLoopId) cancelAnimationFrame(followLoopId);
  });
  // D3 Scales
  let zoom = $derived($fieldZoom);
  let pan = $derived($fieldPan);
  let scaleFactor = $derived(zoom);

  let scales = $derived(
    createFieldScales({
      fieldW,
      fieldH,
      width,
      height,
      visualW,
      visualH,
      scaleFactor,
      pan,
    }),
  );
  let x = $derived(scales.x);
  let y = $derived(scales.y);
  $effect(() => {
    fieldViewStore.set({ xScale: x, yScale: y, width, height });
  });
  let lines = $derived($linesStore);
  let sequencedLines = $derived(
    $sequenceStore
      .filter((s) => actionRegistry.get(s.kind)?.isPath)
      .map((s) => lines.find((l) => l.id === (s as any).lineId))
      .filter((l): l is Line => !!l),
  );
  let effectiveTimePrediction = $derived(
    $isDraggingStore ? null : timePrediction,
  );

  // Derived Values from Stores
  let startPoint = $derived($startPointStore);
  let settings = $derived($settingsStore);
  let mecanumSpeeds = $derived(
    calculateDrivetrainSpeeds(
      $percentStore,
      effectiveTimePrediction,
      lines,
      startPoint,
      settings,
      $showRobot,
    ),
  );
  let robotXY = $derived($robotXYStore);
  // Follow Robot Logic (Reactive for scrubbing/stepping)
  $effect(() => {
    if ($followRobotStore && robotXY && !$playingStore) {
      panToField(robotXY.x, robotXY.y);
    }
  });
  // Resume Follow on Play Logic
  $effect(() => {
    if ($playingStore && settings.followRobot) {
      followRobotStore.set(true);
    }
  });
  // Visual Scale (Pixels per Inch at 1x Zoom)
  // Used for UI elements (points, markers) so they don't grow when zooming in
  let ppI = $derived(basePpI);
  let uiLength = $derived((inches: number) => inches * ppI);
  let shapes = $derived($shapesStore);
  let robotHeading = $derived($robotHeadingStore);
  let sequence = $derived($sequenceStore); // Needed for wait markers
  let markers = $derived(
    $settingsStore?.continuousValidation || $forceShowValidation
      ? $collisionMarkers
      : [],
  );
  // Keep `startPoint.startDeg` in sync with geometry when using linear start-heading.
  // This ensures generated code (and any UI showing `startDeg`) updates as the
  // start position or first path changes — fixing cases where heading looked
  // "locked" to an old value after moving the start point.
  $effect(() => {
    const updatedDeg = getUpdatedLinearStartHeading(startPoint, lines);
    if (updatedDeg !== null) {
      startPointStore.update((p) => ({ ...p, startDeg: updatedDeg }) as any);
    }
  });
  // Telemetry state:
  // - showTelemetry controls the live telemetry overlay from the Telemetry tab.
  // - showTelemetryGhost controls only the imported ghost robot from Telemetry Import.
  let isLiveTelemetryVisible = $derived($showTelemetry);
  let isImportedGhostVisible = $derived($showTelemetryGhost);
  // Compute imported ghost robot from imported telemetry data and time offset.
  $effect(() => {
    const totalTime =
      effectiveTimePrediction && effectiveTimePrediction.totalTime > 0
        ? effectiveTimePrediction.totalTime
        : 0;
    ghostRobotState = calculateTelemetryGhostState(
      $importedTelemetryData,
      isImportedGhostVisible,
      totalTime,
      $percentStore,
      $telemetryOffset || 0,
    );
  });
  // Diff Mode State
  let isDiffMode = $derived($diffMode);
  let diffData = $derived($diffResult);
  let oldData = $derived($committedData);
  let currentFile = $derived($currentFilePath);
  let gitStatus = $derived($gitStatusStore);
  // Show diff toggle if file is modified/staged in git OR has unsaved in-memory changes
  // Exclude untracked files since they have no committed version to compare against
  let isDirty = $derived(
    (currentFile &&
      gitStatus[currentFile] &&
      gitStatus[currentFile] !== "clean" &&
      gitStatus[currentFile] !== "untracked") ||
      (currentFile && $isUnsaved),
  );
  let dimmedIds = $derived($dimmedLinesStore);

  let ctx = $derived<RenderContext>({
    x,
    y,
    uiLength,
    settings,
    timePrediction: effectiveTimePrediction,
    percentStore: $percentStore,
    dimmedIds,
    multiSelectedPointIds: $multiSelectedPointIds,
    robotXY,
  });
  // --- Two.js Scene Elements Creation ---
  let sceneElements = $derived(
    generateAllSceneElements({
      lines,
      sequencedLines,
      startPoint,
      shapes,
      sequence,
      markers,
      isDiffMode,
      diffData,
      oldData,
      previewOptimizedLines,
      effectiveTimePrediction,
      selectedLineId: $selectedLineId,
      selectedPointId: $selectedPointId,
      hoveredMarkerId: $hoveredMarkerId,
      ppI,
      ctx,
    }),
  );

  // Render Loop
  $effect(() => {
    if (two) {
      $pluginRedrawTrigger; // Subscribe to plugin redraw requests
      syncFieldScene({
        two,
        width,
        height,
        shapeElements: sceneElements.shapeElements,
        path: sceneElements.path,
        diffPathElements: sceneElements.diffPathElements,
        previewPathElements: sceneElements.previewPathElements,
        points: sceneElements.points,
        eventMarkerElements: sceneElements.eventMarkerElements,
        collisionElements: sceneElements.collisionElements,
        diffEventMarkerElements: sceneElements.diffEventMarkerElements,
        snapGuides,
        isPresentationMode: $isPresentationMode,
        isDiffMode,
        fieldRenderers: $fieldRenderRegistry,
      });
    }
  });
</script>

<div
  class="relative"
  style={`width: ${width}px; height: ${height}px;`}
  bind:this={wrapperDiv}
  onwheel={(e) => handleWheel(e)}
>
  <div
    bind:this={twoElement}
    class="w-full h-full rounded-lg shadow-md bg-neutral-50 dark:bg-neutral-900 relative overflow-clip"
    role="application"
    style="
      user-select: none;
      -webkit-user-select: none;
      user-drag: none;
      -webkit-user-drag: none;
    "
    oncontextmenu={handleContextMenu}
    ondragstart={(e) => e.preventDefault()}
    style:transform={`rotate(${settings.fieldRotation || 0}deg)`}
    style:transition="transform 0.3s ease-in-out"
  >
    <!-- Plugin Overlay Container -->
    <div
      bind:this={overlayContainer}
      id="field-overlay-layer"
      class="absolute inset-0 pointer-events-none z-30"
    ></div>

    {#if isLiveTelemetryVisible}
      <LiveFieldLayer {x} {y} {width} {height} />
      <svg
        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 20;"
      >
        <LiveRobotLayer {x} {y} />
      </svg>
    {/if}
    <FieldSvgOverlay
      {width}
      {height}
      {x}
      {y}
      {uiLength}
      onionLayerElements={sceneElements.onionLayerElements}
      facingLineElements={sceneElements.facingLineElements}
      isDrawingMode={$isDrawingMode}
      {isDrawing}
      {drawPoints}
    />
    <FieldImageLayer {settings} {fieldW} {fieldH} {x} {y} />

    <MathTools {x} {y} {twoElement} {robotXY} />
    <RobotOverlay
      {x}
      {y}
      {ppI}
      {robotXY}
      {robotHeading}
      {hoverRobotXY}
      {hoverRobotHeading}
      {ghostRobotState}
      {committedRobotState}
      {isDiffMode}
      showRobot={$showRobot}
      {settings}
      {mecanumSpeeds}
      isPlaying={$playingStore}
    />
  </div>

  {#if showContextMenu}
    <ContextMenu
      x={contextMenuX}
      y={contextMenuY}
      items={contextMenuItems}
      onclose={() => (showContextMenu = false)}
    />
  {/if}

  {#if tooltipVisible && isMouseOverField}
    <VelocityTooltip
      visible={tooltipVisible}
      x={tooltipX}
      y={tooltipY}
      velocity={tooltipVelocity}
      time={tooltipTime}
      distance={tooltipDistance}
    />
  {/if}

  {#if !$isPresentationMode}
    <FieldCoordinates
      x={currentMouseX}
      y={currentMouseY}
      visible={isMouseOverField}
      isObstructed={isObstructingHUD}
    />

    <FieldZoomControls
      isPresentationMode={$isPresentationMode}
      isDirty={Boolean(isDirty)}
      {isDiffMode}
      isLoadingDiff={$isLoadingDiff}
      lockFieldView={settings.lockFieldView}
      onZoomIn={() => {
        followRobotStore.set(false);
        const newZoom = calculateNextZoom(zoom, 1);
        const focus = isMouseOverField
          ? { x: x(currentMouseX), y: y(currentMouseY) }
          : { x: width / 2, y: height / 2 };
        zoomTo(newZoom, focus);
      }}
      onZoomOut={() => {
        followRobotStore.set(false);
        const newZoom = calculateNextZoom(zoom, -1);
        const focus = isMouseOverField
          ? { x: x(currentMouseX), y: y(currentMouseY) }
          : { x: width / 2, y: height / 2 };
        zoomTo(newZoom, focus);
      }}
      onResetZoom={() => {
        followRobotStore.set(false);
        fieldZoom.set(1);
        fieldPan.set({ x: 0, y: 0 });
      }}
      onToggleDiff={toggleDiff}
      onExitPresentation={() => isPresentationMode.set(false)}
    />
  {/if}
</div>

<style>
  /* Ensure collision markers and shapes do not block pointer events so users can click through them */
  :global(#collision-group, #collision-group *, #shape-group, #shape-group *) {
    pointer-events: none !important;
  }
</style>
