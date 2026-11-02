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
    fieldPointer,
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
    extraDataStore,
    mirrorPreviewStore,
  } from "../projectStore";
  import {
    otherAlliance,
    projectAlliance,
  } from "../exporters/allianceMirroring";
  import {
    mirrorLine,
    mirrorPoint,
    mirrorRobotHeading,
    mirrorTimePrediction,
    mirrorX,
    mirrorY,
    type FieldMirror,
  } from "../../utils/allianceMirror";
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
  import { calculateDrivetrainSpeeds } from "../../utils/drivetrain";
  import {
    calculateWheelZoom,
    calculateNextZoom,
  } from "./renderer/FieldWheelHandler";
  import { getUpdatedLinearStartHeading } from "./renderer/LinearHeadingSync";
  import { FieldScene } from "./renderer/FieldSceneRenderer";
  import { ElementCache } from "./renderer/ElementCache";
  import {
    buildStandardPathElements,
    buildDiffPathElements,
  } from "./renderer/FieldPathLayer";
  import type { PathElement } from "./renderer/PathGenerator";
  import {
    generatePointElements,
    type PointElement,
  } from "./renderer/PointGenerator";
  import { generateEventMarkerElements } from "./renderer/EventMarkerGenerator";
  import { generateDiffEventMarkerElements } from "./renderer/DiffEventMarkerGenerator";
  import { generateShapeElements } from "./renderer/ShapeGenerator";
  import { generatePreviewPathElements } from "./renderer/PreviewPathGenerator";
  import { generateCollisionElements } from "./renderer/CollisionMarkerGenerator";
  import {
    activeTravelLineIndex,
    generateOnionLayerElements,
  } from "./renderer/OnionLayerGenerator";
  import { generateFacingLineElements } from "./renderer/FacingLineGenerator";
  import {
    buildContextMenuForEvent,
    createContextMenuStoreCallbacks,
  } from "./renderer/FieldContextMenuBuilder";
  import {
    calculatePanToField,
    calculateZoomTo,
    createFieldScales,
  } from "./renderer/FieldViewport";
  import { FieldInteractionController } from "./renderer/FieldInteractionController";
  import { type RenderContext } from "./renderer/GeneratorUtils";
  import type { Line, MenuEntry, TimePrediction } from "../../types/index";
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
    timePrediction?: TimePrediction | null;
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
  let scene: FieldScene | undefined = $state();
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
  let contextMenuItems: MenuEntry[] = $state([]);

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
    const svgEl = two.renderer.domElement as HTMLElement | undefined;
    if (svgEl) {
      svgEl.style.position = "absolute";
      svgEl.style.top = "0";
      svgEl.style.left = "0";
      svgEl.style.width = "100%";
      svgEl.style.height = "100%";
      svgEl.style.zIndex = "15";
    }
    scene = new FieldScene(two);

    // Trigger hook for plugins to initialize overlays
    hookRegistry.run("fieldOverlayInit", overlayContainer);

    interactionController = new FieldInteractionController({
      domElement: two!.renderer.domElement,
      getWrapperDiv: () => wrapperDiv,
      getTwo: () => two,
      getScales: () => ({ x: editX, y: editY, uiLength }),
      getSettings: () => settings,
      getFieldDimensions: () => ({ fieldW, fieldH }),
      getTimePrediction: () => effectiveTimePrediction,
      onRecordChange,
      onMouseStateChange: (state) => {
        isMouseOverField = state.isOver;
        currentMouseX = state.mouseX;
        currentMouseY = state.mouseY;
        fieldPointer.set(
          state.isOver ? { x: state.mouseX, y: state.mouseY } : null,
        );
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
      xInvert: editX.invert,
      yInvert: editY.invert,
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
    fieldPointer.set(null);
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
      .flatMap((s) => (s.kind === "path" ? [s.lineId] : []))
      .map((id) => lines.find((l) => l.id === id))
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
  // Keep the robot centred while following it, whether it moves by
  // playback, scrubbing or stepping.
  $effect(() => {
    if ($followRobotStore && shownRobotXY) {
      panToField(shownRobotXY.x, shownRobotXY.y);
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

  // --- Mirror preview ---
  // The project's path and robot drawn on the other alliance's half of the
  // field, as TurtleTracerLib will run them there. The path can be edited
  // there just like on its own side: the mouse is read through mirrored
  // scales, so a drag lands on the matching spot of the project's own path.
  let projectSide = $derived(projectAlliance($extraDataStore));
  let previewMirror = $derived<FieldMirror | null>(
    $mirrorPreviewStore &&
      projectSide.mirror &&
      projectSide.drawnFor !== "NONE" &&
      !$diffMode
      ? {
          axes: settings.exportMirrorAxes ?? "BOTH",
          width: fieldW,
          height: fieldH,
        }
      : null,
  );
  // Only shown while previewing, which needs an alliance to mirror from.
  let previewAlliance = $derived(
    projectSide.drawnFor === "NONE"
      ? null
      : otherAlliance(projectSide.drawnFor),
  );
  let shownLines = $derived(
    previewMirror ? lines.map((l) => mirrorLine(l, previewMirror!)) : lines,
  );
  let shownStartPoint = $derived(
    previewMirror ? mirrorPoint(startPoint, previewMirror) : startPoint,
  );
  // Drawn from the timeline when there is one, so it is mirrored too.
  let shownTimePrediction = $derived(
    previewMirror
      ? mirrorTimePrediction(effectiveTimePrediction, previewMirror)
      : effectiveTimePrediction,
  );
  let shownSequencedLines = $derived(
    previewMirror
      ? sequencedLines.map((l) => mirrorLine(l, previewMirror!))
      : sequencedLines,
  );
  const mirrorXY = (
    p: { x: number; y: number } | null | undefined,
    m: FieldMirror | null,
  ) => (p && m ? { ...p, x: mirrorX(p.x, m), y: mirrorY(p.y, m) } : p);
  /** A scale whose field side is mirrored: x(mirrored inches) is where `scale` puts the original. */
  const mirroredScale = (
    scale: typeof x,
    flip: (v: number, m: FieldMirror) => number,
    m: FieldMirror | null,
  ) => (m ? scale.copy().domain(scale.domain().map((d) => flip(d, m))) : scale);
  /** The scales edits are read through: mirrored while previewing. */
  let editX = $derived(mirroredScale(x, mirrorX, previewMirror));
  let editY = $derived(mirroredScale(y, mirrorY, previewMirror));
  let shownRobotXY = $derived(mirrorXY(robotXY, previewMirror));
  let shownHoverRobotXY = $derived(mirrorXY(hoverRobotXY, previewMirror));
  let shownHoverRobotHeading = $derived(
    previewMirror && typeof hoverRobotHeading === "number"
      ? mirrorRobotHeading(hoverRobotHeading, previewMirror)
      : hoverRobotHeading,
  );
  let shownRobotHeading = $derived(
    previewMirror
      ? mirrorRobotHeading(robotHeading, previewMirror)
      : robotHeading,
  );
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
    const updatedDeg = getUpdatedLinearStartHeading(
      startPoint,
      lines,
      $sequenceStore,
    );
    if (updatedDeg !== null) {
      startPointStore.update((p) =>
        p.heading === "linear" ? { ...p, startDeg: updatedDeg } : p,
      );
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
    // Mirrored in the mirror preview, so everything drawn from it is too.
    timePrediction: shownTimePrediction,
    dimmedIds,
    multiSelectedPointIds: $multiSelectedPointIds,
  });

  // --- Field drawings ---
  // Each layer is derived on its own, so it is rebuilt only when what it
  // shows changes. None of them depend on the playhead, so playback doesn't
  // rebuild them; only the facing line and onion layers follow it.
  const pathCache = new ElementCache<PathElement[]>();
  const pointCache = new ElementCache<PointElement[]>();
  /** Editing aids are hidden while presenting or comparing with git. */
  let showEditingAids = $derived(!$isPresentationMode && !isDiffMode);

  let shapeElements = $derived(generateShapeElements(shapes, ctx));
  let lineElements = $derived([
    ...buildStandardPathElements({
      effectiveTimePrediction: shownTimePrediction,
      lines: shownLines,
      sequencedLines: shownSequencedLines,
      startPoint: shownStartPoint,
      isDiffMode,
      selectedLineId: $selectedLineId,
      ctx,
      cache: pathCache,
    }),
    ...buildDiffPathElements({
      isDiffMode,
      oldData,
      sequencedLines,
      startPoint,
      diffData,
      ctx,
    }),
    ...generatePreviewPathElements(previewOptimizedLines, startPoint, ctx),
  ]);
  let eventElements = $derived(
    showEditingAids
      ? generateEventMarkerElements(shownLines, shownStartPoint, sequence, {
          ...ctx,
          hoveredMarkerId: $hoveredMarkerId,
          selectedLineId: $selectedLineId,
          selectedPointId: $selectedPointId,
        })
      : generateDiffEventMarkerElements(
          isDiffMode,
          diffData,
          oldData,
          lines,
          startPoint,
          { ...ctx, hoveredMarkerId: $hoveredMarkerId, ppI },
        ),
  );
  let pointElements = $derived(
    showEditingAids
      ? generatePointElements(
          shownStartPoint,
          shownLines,
          // Obstacles stay where they are, so their handles aren't offered in the preview.
          previewMirror ? [] : shapes,
          sequence,
          ctx,
          pointCache,
        )
      : [],
  );
  let collisionElements = $derived(
    showEditingAids && !previewMirror
      ? generateCollisionElements(
          markers,
          lines,
          startPoint,
          effectiveTimePrediction,
          ctx,
        )
      : [],
  );

  /**
   * The line being driven, for onion layers on the current path only. The
   * playhead is read only in that mode, and the index rarely changes, so
   * playback doesn't rebuild the onion layers.
   */
  let onionLineIndex = $derived(
    settings.showOnionLayers && settings.onionSkinCurrentPathOnly
      ? activeTravelLineIndex(effectiveTimePrediction, $percentStore)
      : undefined,
  );
  let onionLayerElements = $derived(
    generateOnionLayerElements(
      shownLines,
      shownStartPoint,
      settings,
      onionLineIndex,
    ),
  );
  let facingLineElements = $derived(
    generateFacingLineElements(shownLines, {
      x,
      y,
      timePrediction: shownTimePrediction,
      percent: $percentStore,
      robotXY: shownRobotXY,
    }),
  );

  // Render Loop
  $effect(() => {
    if (!scene) return;
    const fieldRenderers = $fieldRenderRegistry;
    $pluginRedrawTrigger; // Subscribe to plugin redraw requests
    if (fieldRenderers.length > 0) {
      // Plugins have always been redrawn on every frame of playback, so
      // anything they draw at the robot keeps following it.
      $percentStore;
      robotXY;
    }
    scene.sync({
      width,
      height,
      layers: {
        "shape-group": shapeElements,
        "line-group": lineElements,
        "event-group": eventElements,
        "point-group": pointElements,
        "collision-group": collisionElements,
        "snap-group": showEditingAids ? snapGuides : [],
      },
      fieldRenderers,
    });
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
    class="w-full h-full rounded-md shadow-md bg-neutral-50 dark:bg-neutral-900 relative overflow-clip"
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
      {onionLayerElements}
      {facingLineElements}
      isDrawingMode={$isDrawingMode}
      {isDrawing}
      drawPoints={previewMirror
        ? drawPoints.map((p) => mirrorXY(p, previewMirror)!)
        : drawPoints}
    />
    <FieldImageLayer {settings} {fieldW} {fieldH} {x} {y} />

    <MathTools {x} {y} {twoElement} robotXY={shownRobotXY ?? undefined} />
    <RobotOverlay
      {x}
      {y}
      robotXY={shownRobotXY}
      robotHeading={shownRobotHeading}
      hoverRobotXY={shownHoverRobotXY}
      hoverRobotHeading={shownHoverRobotHeading}
      ghostRobotState={previewMirror ? null : ghostRobotState}
      {committedRobotState}
      {isDiffMode}
      showRobot={$showRobot}
      {settings}
      {mecanumSpeeds}
      isPlaying={$playingStore}
    />
  </div>

  {#if previewMirror}
    <div
      class="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-3 py-1.5 rounded-md shadow-md text-sm font-medium text-white {previewAlliance ===
      'BLUE'
        ? 'bg-blue-600'
        : 'bg-red-600'}"
      role="status"
    >
      <span
        >Previewing on {previewAlliance === "BLUE" ? "Blue" : "Red"} (mirrored)</span
      >
      <button
        type="button"
        class="rounded px-2 py-0.5 bg-white/20 hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        onclick={() => mirrorPreviewStore.set(false)}
      >
        Stop
      </button>
    </div>
  {/if}

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
      x={previewMirror ? mirrorX(currentMouseX, previewMirror) : currentMouseX}
      y={previewMirror ? mirrorY(currentMouseY, previewMirror) : currentMouseY}
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
          ? { x: editX(currentMouseX), y: editY(currentMouseY) }
          : { x: width / 2, y: height / 2 };
        zoomTo(newZoom, focus);
      }}
      onZoomOut={() => {
        followRobotStore.set(false);
        const newZoom = calculateNextZoom(zoom, -1);
        const focus = isMouseOverField
          ? { x: editX(currentMouseX), y: editY(currentMouseY) }
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
