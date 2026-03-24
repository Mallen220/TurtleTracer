<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import Two from "two.js";
  import * as d3 from "d3";
  import { computeZoomStep, computePanForZoom } from "../zoomHelpers";
  import {
    gridSize,
    snapToGrid,
    showGrid,
    isPresentationMode,
    selectedPointId,
    multiSelectedPointIds,
    selectedLineId,
    multiSelectedLineIds,
    showRuler,
    showProtractor,
    protractorLockToRobot,
    collisionMarkers,
    fieldZoom,
    fieldPan,
    hoveredMarkerId,
    fieldViewStore,
    pluginRedrawTrigger,
    notification,
    showRobot,
  } from "../../stores";
  import {
    hookRegistry,
    fieldContextMenuRegistry,
    fieldRenderRegistry,
    type ContextMenuItem,
  } from "../registries";
  import { actionRegistry } from "../actionRegistry";
  import ContextMenu from "./tools/ContextMenu.svelte";
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
    telemetryData,
    telemetryOffset,
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
  import {
    POINT_RADIUS,
    LINE_WIDTH,
    FIELD_SIZE,
    DEFAULT_ROBOT_LENGTH,
    DEFAULT_ROBOT_WIDTH,
  } from "../../config";
  import { calculateRobotState } from "../../utils/animation";
  import {
    getCurvePoint,
    quadraticToCubic,
    generateOnionLayers,
    getRandomColor,
    loadRobotImage,
    updateRobotImageDisplay,
    easeInOutQuad,
    getAngularDifference,
    getLineStartHeading,
  } from "../../utils";
  import { toUser } from "../../utils/coordinates";
  import {
    type WheelSpeeds,
    calculateDrivetrainSpeeds,
  } from "../../utils/drivetrain";
  import { generatePathElements } from "./renderer/PathGenerator";
  import { generateEventMarkerElements } from "./renderer/EventMarkerGenerator";
  import { generateShapeElements } from "./renderer/ShapeGenerator";
  import { generatePreviewPathElements } from "./renderer/PreviewPathGenerator";
  import { generatePointElements } from "./renderer/PointGenerator";
  import { generateDiffEventMarkerElements } from "./renderer/DiffEventMarkerGenerator";
  import { generateCollisionElements } from "./renderer/CollisionMarkerGenerator";
  import { generateOnionLayerElements } from "./renderer/OnionLayerGenerator";
  import { generateFacingLineElements } from "./renderer/FacingLineGenerator";

  import { updateLinkedWaypoints } from "../../utils/pointLinking";
  import type {
    Line,
    Point,
    Shape,
    Settings,
    BasePoint,
    SequenceItem,
  } from "../../types/index";
  import MathTools from "../MathTools.svelte";
  import FieldCoordinates from "./FieldCoordinates.svelte";
  import type { Path } from "two.js/src/path";
  import type { Line as PathLine } from "two.js/src/shapes/line";

  // State from props
  export let width = 0;
  export let height = 0;
  export let timePrediction: any = null;
  export let committedRobotState: {
    x: number;
    y: number;
    heading: number;
  } | null = null;
  export let previewOptimizedLines: Line[] | null = null;
  export let isMouseOverField = false;
  export let currentMouseX = 0;
  export let currentMouseY = 0;
  export let isObstructingHUD = false;

  // Callback props for interactions
  export let onRecordChange: (action?: string) => void;

  // Local state
  let two: Two;
  let ghostRobotState: { x: number; y: number; heading: number } | null = null;

  let twoElement: HTMLDivElement;
  let wrapperDiv: HTMLDivElement;
  let overlayContainer: HTMLDivElement;

  // Smart Snapping State
  let snapGuides: InstanceType<typeof Two.Line>[] = [];

  // Context Menu State
  let showContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuItems: any[] = [];

  // Optimization: Cache bounding rects to avoid reflows during drag
  let cachedRect: DOMRect | null = null;
  let cachedWrapperRect: DOMRect | null = null;
  let dragOffset = { x: 0, y: 0 };
  let currentElem: string | null = null;
  let isDown = false;
  let isPanning = false;
  let multiDragOffsets = new Map<string, { x: number; y: number }>();
  let startPan = { x: 0, y: 0 };

  // D3 Scales
  $: zoom = $fieldZoom;
  $: pan = $fieldPan;
  $: scaleFactor = zoom;
  $: baseSize = Math.min(width, height);
  $: x = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([
      width / 2 - (baseSize * scaleFactor) / 2 + pan.x,
      width / 2 + (baseSize * scaleFactor) / 2 + pan.x,
    ]);
  $: y = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([
      height / 2 + (baseSize * scaleFactor) / 2 + pan.y,
      height / 2 - (baseSize * scaleFactor) / 2 + pan.y,
    ]);

  $: {
    fieldViewStore.set({ xScale: x, yScale: y, width, height });
  }

  // helper to safely index WheelSpeeds from a string value. We
  // occasionally iterate over a hardcoded list of wheel names in
  // markup; this keeps the TypeScript happy and avoids `any` casts
  // in the template.
  function speedForWheel(wheel: string, speeds: WheelSpeeds | null): number {
    if (!speeds) return 0;
    return speeds[wheel as keyof WheelSpeeds];
  }

  $: mecanumSpeeds = calculateDrivetrainSpeeds(
    $percentStore,
    timePrediction,
    lines,
    startPoint,
    settings,
    $showRobot,
  );

  // Follow Robot Logic (Reactive for scrubbing/stepping)
  $: if ($followRobotStore && robotXY && !$playingStore) {
    panToField(robotXY.x, robotXY.y);
  }

  // Follow Robot Logic (Loop for playback)
  let followLoopId: number;
  function followLoop() {
    if ($followRobotStore && $playingStore && robotXY) {
      panToField(robotXY.x, robotXY.y);
    }
    followLoopId = requestAnimationFrame(followLoop);
  }

  // Resume Follow on Play Logic
  $: if ($playingStore && settings.followRobot) {
    followRobotStore.set(true);
  }

  function zoomTo(newZoom: number, focus?: { x: number; y: number }) {
    const fx = focus?.x ?? width / 2;
    const fy = focus?.y ?? height / 2;
    // Compute field coordinates at the focus point using current scales.
    const fieldX = x.invert(fx);
    const fieldY = y.invert(fy);
    // Adjust pan so the focus point remains at (fx,fy) after zoom.

    // Re-implement simplified pan calculation here since computePanForZoom might be rigid.
    // Target: at newZoom, (fieldX, fieldY) should be at (fx, fy).
    // x_new(fieldX) = width/2 + (fieldX_norm - 0.5) * baseSize * newZoom + newPanX = fx
    // where fieldX_norm = fieldX / FIELD_SIZE (approx, ignoring domain start).
    // Actually simpler:
    // current: x(fieldX) = width/2 + offset_x + pan.x = fx
    // target:  x_new(fieldX) = width/2 + offset_x_new + newPanX = fx
    // offset_x = (fieldX mapped to centered 0-based scaled coord)
    // Trust existing helper if it is generic enough, or recalculate manually.

    // Manual calculation to be safe with non-square viewport:
    // fx = width/2 + (fieldX/FIELD_SIZE - 0.5) * baseSize * newZoom + newPanX
    // newPanX = fx - width/2 - (fieldX/FIELD_SIZE - 0.5) * baseSize * newZoom

    const newPanX =
      fx - width / 2 - (fieldX / FIELD_SIZE - 0.5) * baseSize * newZoom;
    const newPanY =
      fy - height / 2 - (0.5 - fieldY / FIELD_SIZE) * baseSize * newZoom;

    fieldZoom.set(Number(newZoom.toFixed(2)));
    fieldPan.set({ x: newPanX, y: newPanY });
  }

  function handleWheel(e: WheelEvent) {
    if (!wrapperDiv) return;
    if (e.ctrlKey || e.metaKey) {
      followRobotStore.set(false);
      e.preventDefault();
      const rect = wrapperDiv.getBoundingClientRect();
      const transformed = getTransformedCoordinates(
        e.clientX,
        e.clientY,
        rect,
        settings.fieldRotation || 0,
      );
      const lx = transformed.x;
      const ly = transformed.y;
      const deltaSign = e.deltaY < 0 ? 1 : -1; // wheel up -> zoom in
      const step = computeZoomStep(zoom, deltaSign);
      const newZoom = Math.min(
        5.0,
        Math.max(0.1, Number((zoom + deltaSign * step).toFixed(2))),
      );
      zoomTo(newZoom, { x: lx, y: ly });
    }
  }

  // Visual Scale (Pixels per Inch at 1x Zoom)
  // Used for UI elements (points, markers) so they don't grow when zooming in
  $: ppI = baseSize / FIELD_SIZE;
  $: uiLength = (inches: number) => inches * ppI;

  // Derived Values from Stores
  $: startPoint = $startPointStore;
  $: lines = $linesStore;
  $: shapes = $shapesStore;
  $: settings = $settingsStore;
  $: robotXY = $robotXYStore;
  $: robotHeading = $robotHeadingStore;
  $: sequence = $sequenceStore; // Needed for wait markers
  $: markers = $collisionMarkers;

  // Keep `startPoint.startDeg` in sync with geometry when using linear start-heading.
  // This ensures generated code (and any UI showing `startDeg`) updates as the
  // start position or first path changes — fixing cases where heading looked
  // "locked" to an old value after moving the start point.
  $: if (
    startPoint &&
    startPoint.heading === "linear" &&
    lines &&
    lines.length > 0
  ) {
    const derived = getLineStartHeading(lines[0], startPoint);
    if (
      typeof startPoint.startDeg !== "number" ||
      Math.abs(startPoint.startDeg - derived) > 1e-6
    ) {
      // Update store only when it differs to avoid extra churn
      startPointStore.update((p) => ({ ...p, startDeg: derived }) as any);
    }
  }

  // Telemetry State
  $: isTelemetryVisible = $showTelemetry;
  $: isTelemetryGhostVisible = $showTelemetryGhost;

  // compute ghost robot based on imported telemetry data and offset
  $: if (
    $telemetryData &&
    $telemetryData.length > 0 &&
    isTelemetryGhostVisible
  ) {
    const pts = $telemetryData;
    const baseTime = pts[0].time;
    const offset = $telemetryOffset || 0;
    const targetTime = baseTime + offset;
    // find first point at or after targetTime
    let target = pts[0];
    for (const pt of pts) {
      if (pt.time >= targetTime) {
        target = pt;
        break;
      }
    }
    ghostRobotState = { x: target.x, y: target.y, heading: target.heading };
  } else {
    ghostRobotState = null;
  }

  // Diff Mode State
  $: isDiffMode = $diffMode;
  $: diffData = $diffResult;
  $: oldData = $committedData;
  $: currentFile = $currentFilePath;
  $: gitStatus = $gitStatusStore;
  // Show diff toggle if file is modified/staged in git OR has unsaved in-memory changes
  // Exclude untracked files since they have no committed version to compare against
  $: isDirty =
    (currentFile &&
      gitStatus[currentFile] &&
      gitStatus[currentFile] !== "clean" &&
      gitStatus[currentFile] !== "untracked") ||
    (currentFile && $isUnsaved);

  $: dimmedIds = $dimmedLinesStore;

  function updateRects() {
    if (two?.renderer?.domElement) {
      cachedRect = two.renderer.domElement.getBoundingClientRect();
    }
    if (wrapperDiv) {
      cachedWrapperRect = wrapperDiv.getBoundingClientRect();
    }
  }

  // Helper to transform mouse coordinates based on rotation
  function getTransformedCoordinates(
    clientX: number,
    clientY: number,
    rect: DOMRect,
    rotation: number,
  ) {
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const cx = px - w / 2;
    const cy = py - h / 2;
    const rad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const nx = cx * cos - cy * sin;
    const ny = cx * sin + cy * cos;
    const newPx = nx + w / 2;
    const newPy = ny + h / 2;
    return { x: newPx, y: newPy };
  }

  // Helper to parse element IDs
  type ParsedPoint = { type: "point"; lineIndex: number; pointIndex: number };
  type ParsedObstacle = {
    type: "obstacle";
    shapeIndex: number;
    vertexIndex: number;
  };
  type ParsedEvent = { type: "event"; lineIndex: number; eventIndex: number };
  type ParsedWaitEvent = {
    type: "wait-event";
    waitId: string;
    eventIndex: number;
  };
  type ParsedRotateEvent = {
    type: "rotate-event";
    rotateId: string;
    eventIndex: number;
  };
  type ParsedUnknown = { type: "unknown"; originalId: string };
  type ParseResult =
    | ParsedPoint
    | ParsedObstacle
    | ParsedEvent
    | ParsedWaitEvent
    | ParsedRotateEvent
    | ParsedUnknown
    | null;

  function parseElementId(id: string | null): ParseResult {
    if (!id) return null;
    const parts = id.split("-");
    const type = parts[0];

    if (type === "point") {
      // point-{lineIndex+1}-{pointIndex}
      // point-0-0 is start point
      const lineNum = Number(parts[1]);
      const pointIdx = Number(parts[2]);
      if (isNaN(lineNum) || isNaN(pointIdx)) return null;
      return { type: "point", lineIndex: lineNum - 1, pointIndex: pointIdx };
    } else if (type === "obstacle") {
      // obstacle-{shapeIndex}-{vertexIndex}
      const shapeIdx = Number(parts[1]);
      const vertexIdx = Number(parts[2]);
      if (isNaN(shapeIdx) || isNaN(vertexIdx)) return null;
      return {
        type: "obstacle",
        shapeIndex: shapeIdx,
        vertexIndex: vertexIdx,
      };
    } else if (type === "event") {
      // event-{lineIndex}-{eventIndex}
      const lineIdx = Number(parts[1]);
      const evIdx = Number(parts[2]);
      if (isNaN(lineIdx) || isNaN(evIdx)) return null;
      return { type: "event", lineIndex: lineIdx, eventIndex: evIdx };
    } else if (type === "wait" && parts[1] === "event") {
      // wait-event-{waitId}-{eventIndex}
      const waitId = parts[2];
      const evIdx = Number(parts[3]);
      return { type: "wait-event", waitId, eventIndex: evIdx };
    } else if (type === "rotate" && parts[1] === "event") {
      // rotate-event-{rotateId}-{eventIndex}
      const rotateId = parts[2];
      const evIdx = Number(parts[3]);
      return { type: "rotate-event", rotateId, eventIndex: evIdx };
    }

    return { type: "unknown", originalId: id };
  }

  // --- Two.js Object Creation Logic (moved from App.svelte) ---

  // Points (Start, Control, End, Obstacle Vertices)
  $: points = generatePointElements(startPoint, lines, shapes, {
    x,
    y,
    uiLength,
    multiSelectedPointIds: $multiSelectedPointIds,
  });

  // Animated facing-point line: drawn from current robot position to the facing target.
  // Only shown when the robot is actively driving on that facingPoint segment.
  // Rendered as SVG overlay to avoid clearing Two.js scene.
  $: facingLineElements = generateFacingLineElements(lines, {
    x,
    y,
    robotXY,
    timePrediction,
    percentStore: $percentStore,
  });

  // Paths (Lines) - Standard
  $: path = (() => {
    x;
    y; // Trigger reactivity on pan/zoom
    dimmedIds; // Trigger reactivity on selection/dimmed changes
    if (isDiffMode) return []; // Don't render standard path in diff mode
    const currentSelectedId = $selectedLineId;

    // Use timeline events to find all lines (including bridge & macros)
    // Extract unique lines from timeline events of type 'travel'
    let renderLines: Line[] = [];
    let lineStartPoints = new Map<string, Point>(); // lineId -> startPoint

    // Start with standard lines for the basic "lines" array.
    // To include macro/bridge lines, iterate timeline travel events directly when available.
    if (timePrediction && timePrediction.timeline) {
      const paths: any[] = [];

      // Filter travel events
      const travelEvents = timePrediction.timeline.filter(
        (e: any) => e.type === "travel" && e.line,
      );

      travelEvents.forEach((ev: any, idx: number) => {
        const line = ev.line!;
        const start = ev.prevPoint!;

        // Check if this is a main line or macro/bridge line
        const isMainLine = lines.some((l) => l.id === line.id);
        const isSelected = line.id === currentSelectedId;
        const width = isSelected
          ? uiLength(LINE_WIDTH * 2.5)
          : uiLength(LINE_WIDTH);

        // Generate single path element
        const elems = generatePathElements(
          [line],
          start,
          (l) => l.color || "#60a5fa",
          (l) => width,
          `timeline-path-${idx}`,
          { x, y, uiLength, settings, timePrediction, dimmedIds },
          isMainLine,
        );
        paths.push(...elems);
      });

      return paths;
    }

    // Fallback if no simulation (e.g. initial load or error)
    return generatePathElements(
      lines,
      startPoint,
      (l) => l.color,
      (l) =>
        l.id === currentSelectedId
          ? uiLength(LINE_WIDTH * 2.5)
          : uiLength(LINE_WIDTH),
      "",
      { x, y, uiLength, settings, timePrediction, dimmedIds },
      true,
    );
  })();

  // Diff Paths
  $: diffPathElements = (() => {
    x;
    y; // Trigger reactivity on pan/zoom
    if (!isDiffMode) return [];

    // 1. Committed Path (Old) - Red
    const committedPaths = oldData
      ? generatePathElements(
          oldData.lines,
          oldData.startPoint,
          () => "#ef4444", // Red
          () => uiLength(LINE_WIDTH),
          "diff-old",
          { x, y, uiLength, settings, timePrediction, dimmedIds },
          false,
        )
      : [];

    // 2. Current Path (New/Same)
    const currentPaths = generatePathElements(
      lines,
      startPoint,
      (l) => {
        // Check if same
        const isSame = diffData?.sameLines.some((sl) => sl.id === l.id);
        if (isSame) return "#3b82f6"; // Blue
        return "#22c55e"; // Green
      },
      (l) => uiLength(LINE_WIDTH), // No selection highlight in diff mode? Or maybe yes.
      "diff-new",
      { x, y, uiLength, settings, timePrediction, dimmedIds },
      false,
    );

    return [...committedPaths, ...currentPaths];
  })();

  // Diff Event Markers
  $: diffEventMarkerElements = generateDiffEventMarkerElements(
    isDiffMode,
    diffData,
    oldData,
    lines,
    startPoint,
    sequence,
    {
      x,
      y,
      uiLength,
      hoveredMarkerId: $hoveredMarkerId,
      ppI,
    },
  );

  // Shapes (Obstacles)
  $: shapeElements = generateShapeElements(shapes, { x, y, uiLength });

  // Onion Layers
  // Rendered as SVG overlay to avoid clearing Two.js scene.
  $: onionLayerElements = generateOnionLayerElements(lines, startPoint, {
    settings,
    timePrediction,
    percentStore: $percentStore,
  });

  // Preview Paths
  $: previewPathElements = generatePreviewPathElements(
    previewOptimizedLines,
    startPoint,
    { x, y, uiLength },
  );

  // Event Markers
  $: eventMarkerElements = generateEventMarkerElements(
    lines,
    startPoint,
    sequence,
    {
      x,
      y,
      uiLength,
      hoveredMarkerId: $hoveredMarkerId,
      multiSelectedPointIds: $multiSelectedPointIds,
      settings,
      timePrediction,
      selectedLineId: $selectedLineId,
      selectedPointId: $selectedPointId,
      actionRegistry,
    },
  );

  // Collision Markers
  $: collisionElements = generateCollisionElements(
    markers,
    lines,
    startPoint,
    timePrediction,
    { x, y, uiLength },
  );

  // Render Loop
  $: if (two) {
    $pluginRedrawTrigger; // Subscribe to plugin redraw requests

    // Update dimensions if changed
    if (width && height && (two.width !== width || two.height !== height)) {
      if (two.renderer) two.renderer.setSize(width, height);
      two.width = width;
      two.height = height;
    }

    const shapeGroup = new Two.Group();
    shapeGroup.id = "shape-group";
    const lineGroup = new Two.Group();
    lineGroup.id = "line-group";
    const pointGroup = new Two.Group();
    pointGroup.id = "point-group";
    const eventGroup = new Two.Group();
    eventGroup.id = "event-group";
    const collisionGroup = new Two.Group();
    collisionGroup.id = "collision-group";
    const snapGroup = new Two.Group();
    snapGroup.id = "snap-group";

    two.clear();

    if (Array.isArray(shapeElements))
      shapeElements.forEach((el) => shapeGroup.add(el));

    path.forEach((el) => lineGroup.add(el));
    diffPathElements.forEach((el) => lineGroup.add(el));
    previewPathElements.forEach((el) => lineGroup.add(el));

    if (!$isPresentationMode && !isDiffMode) {
      points.forEach((el) => pointGroup.add(el));
      eventMarkerElements.forEach((el) => eventGroup.add(el));
      // Ensure collisionElements is used in the reactive block to trigger updates
      collisionElements.forEach((el) => collisionGroup.add(el));
      snapGuides.forEach((el) => snapGroup.add(el));
    }

    if (isDiffMode) {
      diffEventMarkerElements.forEach((el) => eventGroup.add(el));
    }

    two.add(shapeGroup);
    two.add(lineGroup);
    two.add(eventGroup);
    two.add(pointGroup);
    two.add(collisionGroup);
    two.add(snapGroup);

    // Apply custom renderers
    $fieldRenderRegistry.forEach((entry) => {
      try {
        entry.fn(two);
      } catch (e) {
        console.error(`Error in field renderer ${entry.id}:`, e);
      }
    });

    two.update();
  }

  // --- Interaction Logic ---

  onMount(() => {
    two = new Two({ fitted: true, type: Two.Types.svg }).appendTo(twoElement);
    if ((two.renderer as any)?.domElement) {
      const svgEl = (two.renderer as any).domElement as HTMLElement;
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

    // Event Listeners
    two.renderer.domElement.addEventListener("mouseenter", () => {
      // Optimization: Start caching rects when user interacts with field
      updateRects();
      window.addEventListener("resize", updateRects);
      window.addEventListener("scroll", updateRects, true);
    });

    two.renderer.domElement.addEventListener("mouseleave", () => {
      isMouseOverField = false;
      hoveredMarkerId.set(null);
      // Optimization: Stop listening when user leaves field to avoid global overhead
      window.removeEventListener("resize", updateRects);
      window.removeEventListener("scroll", updateRects, true);
    });

    two.renderer.domElement.addEventListener("mousemove", (evt: MouseEvent) => {
      // Optimization: Use cached rect to prevent layout thrashing
      const rect =
        cachedRect || two.renderer.domElement.getBoundingClientRect();
      const transformed = getTransformedCoordinates(
        evt.clientX,
        evt.clientY,
        rect,
        settings.fieldRotation || 0,
      );
      const xPos = transformed.x;
      const yPos = transformed.y;
      const rawInchXForDisplay = x.invert(xPos);
      const rawInchYForDisplay = y.invert(yPos);

      // Update props (need to be bound in parent or use event dispatch,
      // but Svelte props are 2-way by default if bound)
      currentMouseX = Math.max(0, Math.min(FIELD_SIZE, rawInchXForDisplay));
      currentMouseY = Math.max(0, Math.min(FIELD_SIZE, rawInchYForDisplay));
      isMouseOverField = true;

      // HUD obstruction check
      if (wrapperDiv) {
        const wrapperRect =
          cachedWrapperRect || wrapperDiv.getBoundingClientRect();
        const visualX = evt.clientX - wrapperRect.left;
        const visualY = evt.clientY - wrapperRect.top;
        const w = wrapperRect.width;
        const h = wrapperRect.height;
        isObstructingHUD = visualX < w * 0.35 && visualY > h * 0.8;
      }

      // Cursor and Dragging Logic
      // Optimization: Don't use elementFromPoint here. It forces a reflow.

      if (isDown && currentElem) {
        // Dragging Logic

        let linesChanged = false;
        let shapesChanged = false;
        let startPointChanged = false;

        $multiSelectedPointIds.forEach((id) => {
          // If the element is a line point, verify it is not locked
          if (id.startsWith("point-")) {
            const line = Number(id.split("-")[1]) - 1;
            if (line >= 0 && lines[line]?.locked) return; // skip locked points
          }

          const offset = multiDragOffsets.get(id) || { x: 0, y: 0 };
          let rawInchX = x.invert(xPos) + offset.x;
          let rawInchY = y.invert(yPos) + offset.y;
          let inchX = rawInchX;
          let inchY = rawInchY;

          if ($snapToGrid && $showGrid && $gridSize > 0) {
            inchX = Math.round(rawInchX / $gridSize) * $gridSize;
            inchY = Math.round(rawInchY / $gridSize) * $gridSize;
          }

          // Smart Object Snapping
          const SNAP_THRESHOLD = 1.0; // inches
          const isSnappingEnabled = settings.smartSnapping !== false; // Enabled by default
          const shouldSnap = evt.altKey
            ? !isSnappingEnabled
            : isSnappingEnabled;
          let newGuides: InstanceType<typeof Two.Line>[] = [];

          if (shouldSnap && id.startsWith("point-")) {
            // Include start point, line endpoints, field boundaries, and obstacle vertices
            const targets: Point[] = [startPoint];
            lines.forEach((l) => {
              if (l.endPoint) targets.push(l.endPoint);
            });

            // Add field boundaries (corners)
            targets.push({ x: 0, y: 0 } as Point);
            targets.push({ x: FIELD_SIZE, y: 0 } as Point);
            targets.push({ x: 0, y: FIELD_SIZE } as Point);
            targets.push({ x: FIELD_SIZE, y: FIELD_SIZE } as Point);

            // Add shape vertices
            shapes.forEach((shape) => {
              if (shape.visible !== false) {
                shape.vertices.forEach((v) => {
                  targets.push({ x: v.x, y: v.y } as Point);
                });
              }
            });

            const parts = id.split("-");
            const lineNum = Number(parts[1]);
            const pointIdx = Number(parts[2]);

            // Determine which target corresponds to the point being dragged (to exclude it)
            // Targets array structure: [StartPoint, Line1_End, Line2_End, ...]
            let excludeIndex = -999;
            if (lineNum === 0 && pointIdx === 0)
              excludeIndex = 0; // Start Point
            else if (lineNum > 0 && pointIdx === 0) excludeIndex = lineNum; // Line N endpoint

            let bestX = null;
            let bestY = null;
            let minDistX = SNAP_THRESHOLD;
            let minDistY = SNAP_THRESHOLD;

            targets.forEach((target, idx) => {
              // Only exclude waypoints based on index, bounds/shapes are added after waypoints
              if (idx === excludeIndex && idx <= lines.length) return;

              const dx = Math.abs(target.x - inchX);
              const dy = Math.abs(target.y - inchY);

              if (dx < minDistX) {
                minDistX = dx;
                bestX = target.x;
              }
              if (dy < minDistY) {
                minDistY = dy;
                bestY = target.y;
              }
            });

            if (bestX !== null) {
              inchX = bestX;
              const guide = new Two.Line(
                x(inchX),
                y(0),
                x(inchX),
                y(FIELD_SIZE),
              );
              guide.stroke = "#f59e0b"; // Amber
              guide.linewidth = uiLength(0.5);
              guide.dashes = [uiLength(4), uiLength(4)];
              newGuides.push(guide);
            }

            if (bestY !== null) {
              inchY = bestY;
              const guide = new Two.Line(
                x(0),
                y(inchY),
                x(FIELD_SIZE),
                y(inchY),
              );
              guide.stroke = "#f59e0b"; // Amber
              guide.linewidth = uiLength(0.5);
              guide.dashes = [uiLength(4), uiLength(4)];
              newGuides.push(guide);
            }
          }
          snapGuides = newGuides;

          // Determine clamping range
          let minX = -Infinity;
          let maxX = Infinity;
          let minY = -Infinity;
          let maxY = Infinity;

          // Apply field restrictions if enabled or if snapped (snap implies grid which is usually in field, but use explicit restriction)
          if (settings.restrictDraggingToField !== false) {
            minX = 0;
            maxX = FIELD_SIZE;
            minY = 0;
            maxY = FIELD_SIZE;

            if (id.startsWith("point-")) {
              const parts = id.split("-");
              const lineNum = Number(parts[1]);
              const pointIdx = Number(parts[2]);

              // Calculate base robot margin (half of smallest dimension)
              const robotMargin =
                Math.min(settings.rLength, settings.rWidth) / 2;
              const safety = settings.safetyMargin || 0;

              let margin = 0;

              // Start Point (point-0-0)
              if (lineNum === 0 && pointIdx === 0) {
                margin = robotMargin;
              }
              // Other Anchor Points (Endpoints of lines: point-N-0 where N > 0)
              else if (lineNum > 0 && pointIdx === 0) {
                margin = robotMargin + safety;
              }
              // Control Points (point-N-M where M > 0) -> No extra margin, just field bounds
              else {
                margin = 0;
              }

              minX = margin;
              maxX = FIELD_SIZE - margin;
              minY = margin;
              maxY = FIELD_SIZE - margin;
            }
          }

          // Apply clamping
          inchX = Math.max(minX, Math.min(maxX, inchX));
          inchY = Math.max(minY, Math.min(maxY, inchY));

          if (id.startsWith("obstacle-")) {
            const parts = id.split("-");
            const shapeIdx = Number(parts[1]);
            if (shapes[shapeIdx]?.locked) return;
            const vertexIdx = Number(parts[2]);
            shapes[shapeIdx].vertices[vertexIdx].x = inchX;
            shapes[shapeIdx].vertices[vertexIdx].y = inchY;
            shapesChanged = true;
          } else if (id.startsWith("targetpoint-")) {
            const line = Number(id.split("-")[1]) - 1;
            if (lines[line] && lines[line].endPoint) {
              lines[line].endPoint.targetX = inchX;
              lines[line].endPoint.targetY = inchY;
              linesChanged = true;
            }
          } else {
            const line = Number(id.split("-")[1]) - 1;
            const point = Number(id.split("-")[2]);

            if (line === -1) {
              if (!startPoint.locked) {
                startPoint.x = inchX;
                startPoint.y = inchY;
                startPointChanged = true;
              }
            } else if (lines[line]) {
              if (point === 0 && lines[line].endPoint) {
                lines[line].endPoint.x = inchX;
                lines[line].endPoint.y = inchY;
                if (lines[line].id) {
                  const updated = updateLinkedWaypoints(
                    lines,
                    lines[line].id as string,
                  );
                  // Only update if changes occurred to avoid unnecessary store updates
                  if (updated !== lines) {
                    lines = updated;
                  }
                }
              } else {
                if (!lines[line]?.locked) {
                  lines[line].controlPoints[point - 1].x = inchX;
                  lines[line].controlPoints[point - 1].y = inchY;
                }
              }
              linesChanged = true;
            }
          }
        }); // End of multiSelectedPointIds.forEach

        if (linesChanged) linesStore.set(lines);
        if (shapesChanged) shapesStore.set(shapes);
        if (startPointChanged) startPointStore.set(startPoint);
      } else if (isPanning) {
        // Panning Logic
        followRobotStore.set(false);
        // Calculate the delta in pixels
        const dx = evt.clientX - startPan.x;
        const dy = evt.clientY - startPan.y;

        // Rotate the drag vector to match the field rotation
        // If field is rotated 90deg (CW), visual Right (dx) should map to local Down (-dy or similar) depending on coord system
        // Visual vector (dx, dy) needs to be rotated by -rotation to align with local (unrotated) axes
        const rad = -((settings.fieldRotation || 0) * Math.PI) / 180;
        const rdx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const rdy = dx * Math.sin(rad) + dy * Math.cos(rad);

        // Update the pan store
        fieldPan.update((p) => ({
          x: p.x + rdx,
          y: p.y + rdy,
        }));

        // Reset start position for next frame
        startPan = { x: evt.clientX, y: evt.clientY };

        // Set cursor to grabbing
        two.renderer.domElement.style.cursor = "grabbing";
      } else {
        // Cursor Update
        // Use evt.target instead of elementFromPoint
        const target = evt.target as Element;

        if (
          target?.id.startsWith("point") ||
          target?.id.startsWith("obstacle") ||
          target?.id.startsWith("targetpoint")
        ) {
          two.renderer.domElement.style.cursor = "pointer";
          currentElem = target.id;
          hoveredMarkerId.set(null);
        } else if (
          target?.id &&
          (target.id.startsWith("event-") ||
            target.id.startsWith("diff-event-") ||
            target.id.startsWith("event-circle-") ||
            target.id.startsWith("event-flag-") ||
            target.id.startsWith("wait-event-") ||
            target.id.startsWith("wait-event-circle-") ||
            target.id.startsWith("wait-event-flag-") ||
            target.id.startsWith("rotate-event-") ||
            target.id.startsWith("rotate-event-circle-") ||
            target.id.startsWith("rotate-event-arrow-"))
        ) {
          two.renderer.domElement.style.cursor = "pointer";
          // Normalize ID logic
          const idParts = target.id.split("-");
          if (target.id.startsWith("wait-event-")) {
            if (idParts.length >= 4) {
              const waitId = idParts[idParts.length - 2];
              const evIdx = idParts[idParts.length - 1];
              currentElem = `wait-event-${waitId}-${evIdx}`;
            } else {
              currentElem = target.id;
            }
          } else if (target.id.startsWith("rotate-event-")) {
            if (idParts.length >= 4) {
              const rotateId = idParts[idParts.length - 2];
              const evIdx = idParts[idParts.length - 1];
              currentElem = `rotate-event-${rotateId}-${evIdx}`;
            } else {
              currentElem = target.id;
            }
          } else {
            if (idParts.length >= 3) {
              const lineIdx = idParts[idParts.length - 2];
              const evIdx = idParts[idParts.length - 1];
              currentElem = `event-${lineIdx}-${evIdx}`;
            } else {
              currentElem = target.id;
            }
          }
          // Lookup actual event ID for hover highlighting
          let actualHoverId = null;
          if (currentElem.startsWith("diff-event-")) {
            // diff-event-{id}-{suffix}

            const parts = currentElem.split("-");
            const suffix = parts.pop(); // remove suffix
            // Remove 'diff' and 'event'
            parts.shift(); // diff
            parts.shift(); // event
            actualHoverId = parts.join("-");
          } else if (currentElem.startsWith("event-")) {
            const parts = currentElem.split("-");
            // event-{lineIdx}-{evIdx}
            if (parts.length >= 3) {
              const lIdx = Number(parts[1]);
              const eIdx = Number(parts[2]);
              if (lines[lIdx]?.eventMarkers?.[eIdx]) {
                actualHoverId = lines[lIdx].eventMarkers[eIdx].id;
              }
            }
          } else if (currentElem.startsWith("wait-event-")) {
            const parts = currentElem.split("-");
            // wait-event-{waitId}-{evIdx}
            if (parts.length >= 4) {
              const waitId = parts[2];
              const eIdx = Number(parts[3]);
              const waitItem = sequence.find(
                (s) => s.kind === "wait" && (s as any).id === waitId,
              );
              if (waitItem && (waitItem as any).eventMarkers?.[eIdx]) {
                actualHoverId = (waitItem as any).eventMarkers[eIdx].id;
              }
            }
          } else if (currentElem.startsWith("rotate-event-")) {
            const parts = currentElem.split("-");
            // rotate-event-{rotateId}-{evIdx}
            if (parts.length >= 4) {
              const rotateId = parts[2];
              const eIdx = Number(parts[3]);
              const rotateItem = sequence.find(
                (s) => s.kind === "rotate" && (s as any).id === rotateId,
              );
              if (rotateItem && (rotateItem as any).eventMarkers?.[eIdx]) {
                actualHoverId = (rotateItem as any).eventMarkers[eIdx].id;
              }
            }
          }
          hoveredMarkerId.set(actualHoverId);
        } else {
          two.renderer.domElement.style.cursor = "grab";
          currentElem = null;
          hoveredMarkerId.set(null);
        }
      }
    });

    two.renderer.domElement.addEventListener("mousedown", (evt: MouseEvent) => {
      updateRects(); // Ensure fresh rects on start of interaction
      // Re-determine currentElem if needed
      let clickedElem = null;
      // Optimization: use evt.target
      const el = evt.target as Element;
      if (el?.id) {
        if (
          el.id.startsWith("point") ||
          el.id.startsWith("obstacle-") ||
          el.id.startsWith("targetpoint")
        )
          clickedElem = el.id;
        else if (el.id.includes("event-")) {
          // Logic to normalize ID
          // Copy-pasted from above logic for simplicity or extract helper
          const idParts = el.id.split("-");
          if (el.id.startsWith("wait-event-")) {
            if (idParts.length >= 4) {
              const waitId = idParts[idParts.length - 2];
              const evIdx = idParts[idParts.length - 1];
              clickedElem = `wait-event-${waitId}-${evIdx}`;
            } else clickedElem = el.id;
          } else {
            if (idParts.length >= 3) {
              const lineIdx = idParts[idParts.length - 2];
              const evIdx = idParts[idParts.length - 1];
              clickedElem = `event-${lineIdx}-${evIdx}`;
            } else clickedElem = el.id;
          }
        }
      }

      if (!clickedElem && !evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
        selectedPointId.set(null);
        selectedLineId.set(null);
        multiSelectedPointIds.set([]);
        multiSelectedLineIds.set([]);
      }

      if (clickedElem) {
        isDown = true;
        currentElem = clickedElem;

        // --- Multi-select Logic ---
        if (evt.shiftKey || evt.ctrlKey || evt.metaKey) {
          multiSelectedPointIds.update((ids) => {
            if (ids.includes(clickedElem!)) {
              return ids.filter((id) => id !== clickedElem);
            } else {
              return [...ids, clickedElem!];
            }
          });
        } else {
          // If clicked element is not in current multi-selection, clear and select only it
          const currentIds = $multiSelectedPointIds;
          if (!currentIds.includes(clickedElem)) {
            multiSelectedPointIds.set([clickedElem]);
          }
        }

        // Single selection fallback updates for UI properties
        if (currentElem.startsWith("point-")) {
          const parts = currentElem.split("-");
          const lineNum = Number(parts[1]);
          const pointIdx = Number(parts[2]);
          let lId = null;
          if (!isNaN(lineNum) && lineNum > 0) {
            const lineIndex = lineNum - 1;
            const line = lines[lineIndex];
            if (line && line.id) {
              lId = line.id;
              selectedLineId.set(line.id);
              selectedPointId.set(currentElem);
            }
          } else {
            if (currentElem === "point-0-0") {
              selectedLineId.set(null);
              selectedPointId.set(currentElem);
            } else {
              selectedLineId.set(null);
              selectedPointId.set(null);
            }
          }
          if (lId) {
            if (evt.shiftKey || evt.ctrlKey || evt.metaKey) {
              multiSelectedLineIds.update((ids) =>
                ids.includes(lId) ? ids : [...ids, lId],
              );
            } else {
              multiSelectedLineIds.set([lId]);
            }
          }
        } else if (currentElem.startsWith("targetpoint-")) {
          const parts = currentElem.split("-");
          const lineIdx = Number(parts[1]) - 1;
          if (!isNaN(lineIdx) && lines[lineIdx] && lines[lineIdx].id) {
            selectedLineId.set(lines[lineIdx].id as string);
            selectedPointId.set(currentElem);
          }
        } else if (currentElem.startsWith("event-")) {
          const parts = currentElem.split("-");
          const lineIdx = Number(parts[1]);
          if (!isNaN(lineIdx) && lines[lineIdx] && lines[lineIdx].id) {
            selectedLineId.set(lines[lineIdx].id as string);
            selectedPointId.set(currentElem);
          }
        } else if (currentElem.startsWith("wait-event-")) {
          const parts = currentElem.split("-");
          const waitId = parts[2];
          if (waitId) {
            selectedPointId.set(`wait-${waitId}`);
            selectedLineId.set(null);
          }
        }

        // Calculate drag offset
        let objectX = 0;
        let objectY = 0;
        const rectForMouse = two.renderer.domElement.getBoundingClientRect();
        const transformedForMouse = getTransformedCoordinates(
          evt.clientX,
          evt.clientY,
          rectForMouse,
          settings.fieldRotation || 0,
        );
        const mouseX = x.invert(transformedForMouse.x);
        const mouseY = y.invert(transformedForMouse.y);

        if (currentElem.startsWith("obstacle-")) {
          const parts = currentElem.split("-");
          const shapeIdx = Number(parts[1]);
          if (shapes[shapeIdx]?.locked) {
            // Prevent dragging locked obstacle vertices
            isDown = false;
            currentElem = null;
            return;
          }
          const vertexIdx = Number(parts[2]);
          if (shapes[shapeIdx]?.vertices[vertexIdx]) {
            objectX = shapes[shapeIdx].vertices[vertexIdx].x;
            objectY = shapes[shapeIdx].vertices[vertexIdx].y;
          }
        } else if (currentElem.startsWith("targetpoint-")) {
          const line = Number(currentElem.split("-")[1]) - 1;
          if (lines[line] && lines[line].endPoint) {
            objectX = lines[line].endPoint.targetX || 0;
            objectY = lines[line].endPoint.targetY || 0;
          }
        } else if (currentElem.startsWith("point-")) {
          const line = Number(currentElem.split("-")[1]) - 1;
          const point = Number(currentElem.split("-")[2]);
          if (line === -1) {
            objectX = startPoint.x;
            objectY = startPoint.y;
          } else if (lines[line]) {
            if (point === 0 && lines[line].endPoint) {
              objectX = lines[line].endPoint.x;
              objectY = lines[line].endPoint.y;
            } else if (lines[line].controlPoints[point - 1]) {
              objectX = lines[line].controlPoints[point - 1].x;
              objectY = lines[line].controlPoints[point - 1].y;
            }
          }
        }
        multiDragOffsets.clear();
        const currentIds = $multiSelectedPointIds;

        currentIds.forEach((id) => {
          let ox = 0,
            oy = 0;
          if (id.startsWith("obstacle-")) {
            const parts = id.split("-");
            const shapeIdx = Number(parts[1]);
            const vertexIdx = Number(parts[2]);
            if (shapes[shapeIdx]?.vertices[vertexIdx]) {
              ox = shapes[shapeIdx].vertices[vertexIdx].x;
              oy = shapes[shapeIdx].vertices[vertexIdx].y;
            }
          } else if (id.startsWith("targetpoint-")) {
            const line = Number(id.split("-")[1]) - 1;
            if (lines[line] && lines[line].endPoint) {
              ox = lines[line].endPoint.targetX || 0;
              oy = lines[line].endPoint.targetY || 0;
            }
          } else if (id.startsWith("point-")) {
            const line = Number(id.split("-")[1]) - 1;
            const point = Number(id.split("-")[2]);
            if (line === -1) {
              ox = startPoint.x;
              oy = startPoint.y;
            } else if (lines[line]) {
              if (point === 0 && lines[line].endPoint) {
                ox = lines[line].endPoint.x;
                oy = lines[line].endPoint.y;
              } else if (lines[line].controlPoints[point - 1]) {
                ox = lines[line].controlPoints[point - 1].x;
                oy = lines[line].controlPoints[point - 1].y;
              }
            }
          }
          multiDragOffsets.set(id, { x: ox - mouseX, y: oy - mouseY });
        });
      } else {
        // Start Panning
        isPanning = true;
        startPan = { x: evt.clientX, y: evt.clientY };
        two.renderer.domElement.style.cursor = "grabbing";
      }
    });

    two.renderer.domElement.addEventListener("mouseup", () => {
      snapGuides = [];
      if (isDown) {
        // Infer action description based on currentElem
        let action = "Move Object";
        if (currentElem?.startsWith("point-0-0")) {
          action = "Move Start Point";
        } else if (currentElem?.startsWith("point-")) {
          const parts = currentElem.split("-");
          const ptIdx = Number(parts[2]);
          if (ptIdx === 0) action = "Move Endpoint";
          else action = "Move Control Point";
        } else if (currentElem?.startsWith("targetpoint-")) {
          action = "Move Facing Target";
        } else if (currentElem?.startsWith("obstacle-")) {
          action = "Edit Obstacle";
        } else if (
          currentElem?.includes("event-") ||
          currentElem?.includes("wait-event") ||
          currentElem?.includes("rotate-event")
        ) {
          action = "Move Event Marker";
        }

        onRecordChange(action); // Notify parent of change
      }
      isDown = false;
      isPanning = false;
      multiDragOffsets.clear();
      two.renderer.domElement.style.cursor = "grab";
    });

    // Double Click to Add Line
    two.renderer.domElement.addEventListener("dblclick", (evt: MouseEvent) => {
      const target = evt.target as Element;
      if (
        target?.id &&
        (target.id.startsWith("point") ||
          target.id.startsWith("obstacle") ||
          target.id.startsWith("line"))
      )
        return;

      const rect = two.renderer.domElement.getBoundingClientRect();
      const transformed = getTransformedCoordinates(
        evt.clientX,
        evt.clientY,
        rect,
        settings.fieldRotation || 0,
      );
      let inchX = x.invert(transformed.x);
      let inchY = y.invert(transformed.y);

      if ($snapToGrid && $showGrid && $gridSize > 0) {
        inchX = Math.round(inchX / $gridSize) * $gridSize;
        inchY = Math.round(inchY / $gridSize) * $gridSize;
      }
      if (settings.restrictDraggingToField !== false) {
        inchX = Math.max(0, Math.min(FIELD_SIZE, inchX));
        inchY = Math.max(0, Math.min(FIELD_SIZE, inchY));
      }

      const existingLines = get(linesStore);
      const prevEndPoint =
        existingLines.length > 0
          ? existingLines[existingLines.length - 1].endPoint
          : null;

      let endPoint: Point;
      if (!prevEndPoint) {
        endPoint = {
          x: inchX,
          y: inchY,
          heading: "tangential",
          reverse: false,
        };
      } else if (prevEndPoint.heading === "linear") {
        const linPrev = prevEndPoint as Extract<Point, { heading: "linear" }>;
        const deg = linPrev.endDeg ?? linPrev.startDeg ?? 0;
        endPoint = {
          x: inchX,
          y: inchY,
          heading: "linear",
          startDeg: deg,
          endDeg: deg,
        };
      } else if (prevEndPoint.heading === "constant") {
        endPoint = {
          x: inchX,
          y: inchY,
          heading: "constant",
          degrees: prevEndPoint.degrees ?? 0,
        };
      } else {
        endPoint = {
          x: inchX,
          y: inchY,
          heading: "tangential",
          reverse: (prevEndPoint as any).reverse ?? false,
        };
      }

      const newLine: Line = {
        id: `line-${Math.random().toString(36).slice(2)}`,
        name: "",
        endPoint,
        controlPoints: [],
        color: getRandomColor(),
        locked: false,
      };

      linesStore.update((l) => [...l, newLine]);
      sequenceStore.update((s) => [
        ...s,
        { kind: "path", lineId: newLine.id! },
      ]);

      selectedLineId.set(newLine.id!);
      // assume new line is appended at end in lines store
      const newIdx = $linesStore.length - 1;
      selectedPointId.set(`point-${newIdx + 1}-0`);

      onRecordChange("Add Path");
    });
  });

  // Public accessor for exportGif
  export function getTwoInstance() {
    return two;
  }

  // Public method to pan the view to center on specific field coordinates (inches)
  export function panToField(fx: number, fy: number) {
    const factor = get(fieldZoom);
    const baseSize = Math.min(width, height);
    // Calculate required pan to center the point
    // x(v) = center + pan + (v/SIZE - 0.5)*baseSize*zoom
    // target x(v) = center => pan = - (v/SIZE - 0.5)*baseSize*zoom
    const px = baseSize * factor * (0.5 - fx / FIELD_SIZE);

    // y(v) = center + pan - (v/SIZE - 0.5)*baseSize*zoom
    // target y(v) = center => pan = (v/SIZE - 0.5)*baseSize*zoom
    const py = baseSize * factor * (fy / FIELD_SIZE - 0.5);

    fieldPan.set({ x: px, y: py });
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Hide if already open
    if (showContextMenu) {
      showContextMenu = false;
      return;
    }

    // Calculate field coordinates
    const rect = twoElement.getBoundingClientRect();
    const transformed = getTransformedCoordinates(
      e.clientX,
      e.clientY,
      rect,
      settings.fieldRotation || 0,
    );
    const fieldX = x.invert(transformed.x);
    const fieldY = y.invert(transformed.y);

    let menuItems: any[] = [];

    // Parse clicked element
    if (currentElem) {
      const parsed = parseElementId(currentElem);
      if (parsed) {
        if (parsed.type === "point") {
          const { lineIndex, pointIndex } = parsed as ParsedPoint;
          const isStartPoint = lineIndex === -1;
          const isControlPoint = pointIndex > 0;
          const isEndPoint = !isStartPoint && !isControlPoint;

          const pointName = isStartPoint
            ? "Start Point"
            : isControlPoint
              ? "Control Point"
              : `Path ${lineIndex + 1}`;

          menuItems.push({ label: pointName, disabled: true });
          menuItems.push({ separator: true });

          // Copy Coordinates
          menuItems.push({
            label: "Copy Coordinates",
            onClick: () => {
              let pt: Point | BasePoint | undefined;
              if (isStartPoint) pt = startPoint;
              else if (lines[lineIndex]) {
                if (isEndPoint) pt = lines[lineIndex].endPoint;
                else pt = lines[lineIndex].controlPoints[pointIndex - 1];
              }
              if (pt) {
                const system = settings.coordinateSystem || "Pedro";
                const userPt = toUser(pt, system);
                const text = `${userPt.x.toFixed(2)}, ${userPt.y.toFixed(2)}`;
                navigator.clipboard.writeText(text);
                notification.set({
                  message: `Copied "${text}"`,
                  type: "success",
                });
              }
            },
          });

          // EndPoint specific actions
          if (isEndPoint) {
            menuItems.push({
              label: "Add Wait Command",
              onClick: () => {
                const lineId = lines[lineIndex].id;
                if (!lineId) return;

                sequenceStore.update((seq) => {
                  const newSeq = [...seq];
                  // Find index of this path
                  const idx = newSeq.findIndex(
                    (s) => s.kind === "path" && (s as any).lineId === lineId,
                  );
                  if (idx !== -1) {
                    // Insert wait after
                    newSeq.splice(idx + 1, 0, {
                      kind: "wait",
                      id: `wait-${Math.random().toString(36).slice(2)}`,
                      name: "Wait",
                      durationMs: 1000, // default 1s
                    });
                  }
                  return newSeq;
                });
                onRecordChange("Add Wait Command");
              },
            });

            menuItems.push({
              label: "Delete Path",
              danger: true,
              onClick: () => {
                linesStore.update((l) => {
                  const newLines = [...l];
                  newLines.splice(lineIndex, 1);
                  return newLines;
                });
                onRecordChange("Delete Path");
                selectedLineId.set(null);
              },
            });

            const currentHeading = lines[lineIndex].endPoint.heading;
            menuItems.push({ separator: true });
            menuItems.push({ label: "Heading Mode", disabled: true });
            menuItems.push({
              label: "Tangential",
              disabled: currentHeading === "tangential",
              onClick: () => {
                linesStore.update((l) => {
                  const line = l[lineIndex];
                  if (!line) return l;
                  const ep = line.endPoint;
                  const base = {
                    x: ep.x,
                    y: ep.y,
                    locked: ep.locked,
                    isMacroElement: ep.isMacroElement,
                    macroId: ep.macroId,
                    originalId: ep.originalId,
                  };
                  line.endPoint = {
                    ...base,
                    heading: "tangential",
                    reverse: (ep as any).reverse ?? false,
                  };
                  return l;
                });
                onRecordChange("Set Heading Tangential");
              },
            });
            menuItems.push({
              label: "Constant",
              disabled: currentHeading === "constant",
              onClick: () => {
                linesStore.update((l) => {
                  const line = l[lineIndex];
                  if (!line) return l;
                  const ep = line.endPoint;
                  const base = {
                    x: ep.x,
                    y: ep.y,
                    locked: ep.locked,
                    isMacroElement: ep.isMacroElement,
                    macroId: ep.macroId,
                    originalId: ep.originalId,
                  };
                  line.endPoint = {
                    ...base,
                    heading: "constant",
                    degrees: (ep as any).degrees ?? 0,
                  };
                  return l;
                });
                onRecordChange("Set Heading Constant");
              },
            });
            menuItems.push({
              label: "Linear",
              disabled: currentHeading === "linear",
              onClick: () => {
                linesStore.update((l) => {
                  const line = l[lineIndex];
                  if (!line) return l;
                  const ep = line.endPoint;
                  const base = {
                    x: ep.x,
                    y: ep.y,
                    locked: ep.locked,
                    isMacroElement: ep.isMacroElement,
                    macroId: ep.macroId,
                    originalId: ep.originalId,
                  };
                  line.endPoint = {
                    ...base,
                    heading: "linear",
                    startDeg: (ep as any).startDeg ?? 0,
                    endDeg: (ep as any).endDeg ?? 0,
                  };
                  return l;
                });
                onRecordChange("Set Heading Linear");
              },
            });
          } else if (isStartPoint) {
            const currentHeading = startPoint.heading;
            menuItems.push({ separator: true });
            menuItems.push({ label: "Heading Mode", disabled: true });
            menuItems.push({
              label: "Tangential",
              disabled: currentHeading === "tangential",
              onClick: () => {
                startPointStore.update((p) => {
                  const base = {
                    x: p.x,
                    y: p.y,
                    locked: p.locked,
                    isMacroElement: p.isMacroElement,
                    macroId: p.macroId,
                    originalId: p.originalId,
                  };
                  return {
                    ...base,
                    heading: "tangential",
                    reverse: (p as any).reverse ?? false,
                  };
                });
                onRecordChange("Set Start Tangential");
              },
            });
            menuItems.push({
              label: "Constant",
              disabled: currentHeading === "constant",
              onClick: () => {
                startPointStore.update((p) => {
                  const base = {
                    x: p.x,
                    y: p.y,
                    locked: p.locked,
                    isMacroElement: p.isMacroElement,
                    macroId: p.macroId,
                    originalId: p.originalId,
                  };
                  return {
                    ...base,
                    heading: "constant",
                    degrees: (p as any).degrees ?? 0,
                  };
                });
                onRecordChange("Set Start Constant");
              },
            });
            menuItems.push({
              label: "Linear",
              disabled: currentHeading === "linear",
              onClick: () => {
                startPointStore.update((p) => {
                  const base = {
                    x: p.x,
                    y: p.y,
                    locked: p.locked,
                    isMacroElement: p.isMacroElement,
                    macroId: p.macroId,
                    originalId: p.originalId,
                  };
                  return {
                    ...base,
                    heading: "linear",
                    startDeg: (p as any).startDeg ?? 0,
                    endDeg: (p as any).endDeg ?? 0,
                  };
                });
                onRecordChange("Set Start Linear");
              },
            });
          }
        } else if (parsed.type === "obstacle") {
          const { shapeIndex } = parsed as ParsedObstacle;
          menuItems.push({ label: "Obstacle", disabled: true });
          menuItems.push({ separator: true });
          menuItems.push({
            label: shapes[shapeIndex].locked ? "Unlock" : "Lock",
            onClick: () => {
              shapesStore.update((s) => {
                s[shapeIndex].locked = !s[shapeIndex].locked;
                return s;
              });
              onRecordChange("Toggle Obstacle Lock");
            },
          });
          menuItems.push({
            label: "Delete Obstacle",
            danger: true,
            onClick: () => {
              shapesStore.update((s) => {
                const newShapes = [...s];
                newShapes.splice(shapeIndex, 1);
                return newShapes;
              });
              onRecordChange("Delete Obstacle");
            },
          });
        }
      }
    }

    // Get items from registry (Empty Space or Append)
    if (menuItems.length === 0) {
      const registryItems = get(fieldContextMenuRegistry);
      if (registryItems && registryItems.length > 0) {
        const validItems = registryItems.filter((item) => {
          if (item.condition) {
            return item.condition({ x: fieldX, y: fieldY });
          }
          return true;
        });

        if (validItems.length > 0) {
          menuItems = validItems.map((item) => ({
            label: item.label,
            icon: item.icon,
            onClick: () => {
              item.onClick({ x: fieldX, y: fieldY });
              showContextMenu = false;
            },
          }));
        }
      }

      // Add global actions
      if (menuItems.length > 0) {
        menuItems.push({ separator: true });
      }
      menuItems.push({
        label: "Transform Path",
        onClick: () => {
          showTransformDialog.set(true);
          showContextMenu = false;
        },
      });
    }

    if (menuItems.length === 0) return;

    contextMenuItems = menuItems;
    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    showContextMenu = true;
  }

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", updateRects);
      window.removeEventListener("scroll", updateRects, true);
    }
    if (followLoopId) cancelAnimationFrame(followLoopId);
  });
</script>

<div
  class="relative"
  style={`width: ${width}px; height: ${height}px;`}
  bind:this={wrapperDiv}
  on:wheel={(e) => handleWheel(e)}
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
    on:contextmenu={handleContextMenu}
    on:dragstart={(e) => e.preventDefault()}
    style:transform={`rotate(${settings.fieldRotation || 0}deg)`}
    style:transition="transform 0.3s ease-in-out"
  >
    <!-- Plugin Overlay Container -->
    <div
      bind:this={overlayContainer}
      id="field-overlay-layer"
      class="absolute inset-0 pointer-events-none z-30"
    ></div>

    {#if isTelemetryVisible}
      <LiveFieldLayer {x} {y} {width} {height} />
      <svg
        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 20;"
      >
        {#if isTelemetryGhostVisible}
          <LiveRobotLayer {x} {y} />
        {/if}
      </svg>
    {/if}
    <!-- SVG Overlay for animated paths/layers -->
    <svg
      class="absolute inset-0 pointer-events-none"
      style={`z-index: 14; width: ${width}px; height: ${height}px;`}
    >
      {#each onionLayerElements as layer}
        <polygon
          points={layer.corners.map((c) => `${x(c.x)},${y(c.y)}`).join(" ")}
          fill="none"
          stroke="#818cf8"
          stroke-width={uiLength(0.5)}
          opacity="0.35"
        />
      {/each}
      {#each facingLineElements as fl}
        <line
          x1={fl.x1}
          y1={fl.y1}
          x2={fl.x2}
          y2={fl.y2}
          stroke={fl.color}
          stroke-width={uiLength(0.4)}
          stroke-dasharray={`${uiLength(1.5)} ${uiLength(1.5)}`}
          opacity="0.7"
        />
      {/each}
    </svg>

    {#if settings.customMaps?.some((m) => m.id === settings.fieldMap)}
      {@const activeMap = settings.customMaps.find(
        (m) => m.id === settings.fieldMap,
      )}
      {#if activeMap}
        <img
          src={activeMap.imageData}
          alt="Custom Field"
          class="absolute z-10 max-w-none"
          style={`
              left: ${x(activeMap.x)}px;
              top: ${y(activeMap.y)}px;
              width: ${x(activeMap.x + activeMap.width) - x(activeMap.x)}px;
              height: ${y(activeMap.y - activeMap.height) - y(activeMap.y)}px;
          `}
          draggable="false"
        />
      {/if}
    {:else}
      <img
        src={settings.fieldMap && !settings.fieldMap.includes("custom") // Safe fallback check
          ? `/fields/${settings.fieldMap}`
          : "/fields/decode.webp"}
        alt="Field"
        class="absolute rounded-lg z-10 max-w-none"
        style={`top: ${y(FIELD_SIZE)}px; left: ${x(0)}px; width: ${x(FIELD_SIZE) - x(0)}px; height: ${y(0) - y(FIELD_SIZE)}px;`}
        draggable="false"
        on:error={(e) => {
          // @ts-ignore
          e.target.src = "/fields/decode.webp";
        }}
      />
    {/if}
    <MathTools {x} {y} {twoElement} {robotXY} />
    {#if !isDiffMode && $showRobot}
      {#if settings.robotImage === "none"}
        <!-- Current (Green Square) -->
        <div
          class="flex items-center justify-center relative shadow-sm"
          style={`position: absolute; top: ${y(robotXY.y)}px; left: ${x(robotXY.x)}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none; background-color: rgba(34, 197, 94, 0.10); border: 2px solid #16a34a; border-radius: 8px;`}
        >
          {#if settings.showRobotArrows}
            <!-- Mecanum / Swerve wheel arrows -->
            {#each ["frontLeft", "frontRight", "backLeft", "backRight"] as wheel}
              {@const val = speedForWheel(wheel, mecanumSpeeds)}
              {@const isSwerve = settings.robotDriveType === "swerve"}
              {@const arrowSize = isSwerve ? 15 : 10 + Math.abs(val) * 15}
              {@const rot = isSwerve ? val : val >= 0 ? 90 : 270}
              <!-- scale size dynamically for mecanum, fixed for swerve -->
              <div
                class="absolute flex justify-center items-center"
                style={`
                  width: 24px;
                  height: 24px;
                  ${wheel.includes("front") ? "top: 4px;" : "bottom: 4px;"}
                  ${wheel.includes("Left") ? "left: 4px;" : "right: 4px;"}
                  opacity: ${isSwerve ? 0.8 : Math.abs(val) > 0.05 ? 0.8 : 0.2};
                `}
              >
                <svg
                  width={arrowSize}
                  height={arrowSize}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#16a34a"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  style={`transform: rotate(${rot}deg); transition: transform 0.1s;`}
                >
                  <line x1="12" y1="19" x2="12" y2="5"></line>
                  <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
              </div>
            {/each}
          {/if}

          <!-- heading arrow indicator for no-image robot -->
          <div
            style="position:absolute; top:50%; left:50%; transform: translate(-50%, -50%); color: rgba(34, 197, 94, 1.0);"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="3"
              stroke="currentColor"
              class="w-6 h-6"
              style="filter: drop-shadow(0px 0px 2px rgba(255,255,255,0.8));"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          </div>
        </div>
      {:else}
        <div
          style={`position: absolute; top: ${y(robotXY.y)}px; left: ${x(robotXY.x)}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none;`}
        >
          <img
            src={settings.robotImage || "/robot.png"}
            alt="Robot"
            class="w-full h-full object-contain"
            draggable="false"
            on:error={(e) => {
              // @ts-ignore
              e.target.src = "/robot.png";
            }}
          />
          {#if settings.showFakeHeadingArrow && settings.robotImage !== "/robot.png"}
            <div
              style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: {settings.fakeHeadingArrowColor ||
                '#ffffff'};"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="3"
                stroke="currentColor"
                class="w-6 h-6"
                style="filter: drop-shadow(0px 0px 2px rgba(255,255,255,0.8));"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </div>
          {/if}
        </div>
      {/if}
    {:else}
      <!-- Current (Green) -->
      <div
        style={`position: absolute; top: ${y(robotXY.y)}px; left: ${x(robotXY.x)}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none; background-color: rgba(34, 197, 94, 0.5); border: 2px solid #16a34a;`}
      ></div>

      <!-- Committed (Red) -->
      {#if committedRobotState}
        <div
          style={`position: absolute; top: ${y(committedRobotState.y)}px; left: ${x(committedRobotState.x)}px; transform: translate(-50%, -50%) rotate(${committedRobotState.heading}deg); z-index: 20; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none; background-color: rgba(239, 68, 68, 0.5); border: 2px solid #dc2626;`}
        ></div>
      {/if}
    {/if}

    <!-- Telemetry Ghost Robot -->
    {#if ghostRobotState}
      <div
        style={`position: absolute; top: ${y(ghostRobotState.y)}px; left: ${x(ghostRobotState.x)}px; transform: translate(-50%, -50%) rotate(${ghostRobotState.heading}deg); z-index: 19; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none; border: 2px dashed #6b7280; border-radius: 4px;`}
      >
        {#if settings.robotImage === "none"}
          <div
            class="w-full h-full"
            style="background-color: rgba(107, 114, 128, 0.3);"
          ></div>
        {:else}
          <img
            src={settings.robotImage || "/robot.png"}
            alt="Ghost Robot"
            class="w-full h-full object-contain grayscale opacity-50"
            draggable="false"
            on:error={(e) => {
              // @ts-ignore
              e.target.src = "/robot.png";
            }}
          />
        {/if}
        {#if settings.showFakeHeadingArrow && settings.robotImage !== "/robot.png"}
          <div
            style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: {settings.fakeHeadingArrowColor ||
              '#ffffff'}; opacity: 0.5;"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="3"
              stroke="currentColor"
              class="w-6 h-6"
              style="filter: drop-shadow(0px 0px 2px rgba(255,255,255,0.4));"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if showContextMenu}
    <ContextMenu
      x={contextMenuX}
      y={contextMenuY}
      items={contextMenuItems}
      on:close={() => (showContextMenu = false)}
    />
  {/if}

  {#if !$isPresentationMode}
    <FieldCoordinates
      x={currentMouseX}
      y={currentMouseY}
      visible={isMouseOverField}
      isObstructed={isObstructingHUD}
    />

    <!-- Zoom Controls -->
    <div
      class="absolute bottom-2 right-2 flex flex-col gap-1 z-30 bg-white/80 dark:bg-neutral-800/80 p-1 rounded-md shadow-sm border border-neutral-200 dark:border-neutral-700 backdrop-blur-sm"
    >
      {#if isDirty}
        <button
          class="w-7 h-7 flex items-center justify-center rounded transition-colors {isDiffMode
            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50'
            : 'hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200'}"
          on:click={toggleDiff}
          aria-label={isDiffMode ? "Exit Visual Diff" : "Toggle Visual Diff"}
          title={isDiffMode ? "Exit Diff Mode" : "Compare with Saved"}
        >
          {#if $isLoadingDiff}
            <svg
              class="animate-spin w-4 h-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          {:else}
            <!-- Diff Icon -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-4 h-4"
            >
              <path
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          {/if}
        </button>
        <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-0.5"></div>
      {/if}
      <button
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
        on:click={() => {
          followRobotStore.set(false);
          const step = computeZoomStep(zoom, 1);
          const newZoom = Math.min(5.0, Number((zoom + step).toFixed(2)));
          const focus = isMouseOverField
            ? { x: x(currentMouseX), y: y(currentMouseY) }
            : { x: width / 2, y: height / 2 };
          zoomTo(newZoom, focus);
        }}
        aria-label="Zoom in"
        title="Zoom In (Cmd/Ctrl + +)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="w-4 h-4"
        >
          <path
            d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
          />
        </svg>
      </button>
      <button
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
        on:click={() => {
          followRobotStore.set(false);
          const step = computeZoomStep(zoom, -1);
          const newZoom = Math.max(0.1, Number((zoom - step).toFixed(2)));
          const focus = isMouseOverField
            ? { x: x(currentMouseX), y: y(currentMouseY) }
            : { x: width / 2, y: height / 2 };
          zoomTo(newZoom, focus);
        }}
        aria-label="Zoom out"
        title="Zoom Out (Cmd/Ctrl + -)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="w-4 h-4"
        >
          <path
            fill-rule="evenodd"
            d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
      <button
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
        on:click={() => {
          followRobotStore.set(false);
          fieldZoom.set(1.0);
          fieldPan.set({ x: 0, y: 0 });
        }}
        aria-label="Reset zoom"
        title="Reset Zoom (Cmd/Ctrl + 0)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-4 h-4"
        >
          <polyline points="4 9 4 4 9 4" />
          <polyline points="15 4 20 4 20 9" />
          <polyline points="20 15 20 20 15 20" />
          <polyline points="9 20 4 20 4 15" />
        </svg>
      </button>
    </div>
  {/if}

  {#if $isPresentationMode}
    <!-- Presentation Mode Controls (Hover to show) -->
    <div
      class="absolute bottom-4 right-4 flex flex-col items-end gap-2 z-50 opacity-0 hover:opacity-100 transition-opacity duration-300"
    >
      <div
        class="flex flex-col gap-1 bg-white/90 dark:bg-neutral-800/90 p-1.5 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 backdrop-blur-sm"
      >
        <button
          class="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
          on:click={() => {
            followRobotStore.set(false);
            const step = computeZoomStep(zoom, 1);
            const newZoom = Math.min(5.0, Number((zoom + step).toFixed(2)));
            const focus = isMouseOverField
              ? { x: x(currentMouseX), y: y(currentMouseY) }
              : { x: width / 2, y: height / 2 };
            zoomTo(newZoom, focus);
          }}
          aria-label="Zoom in"
          title="Zoom In"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="w-5 h-5"
          >
            <path
              d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
            />
          </svg>
        </button>
        <button
          class="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
          on:click={() => {
            followRobotStore.set(false);
            const step = computeZoomStep(zoom, -1);
            const newZoom = Math.max(0.1, Number((zoom - step).toFixed(2)));
            const focus = isMouseOverField
              ? { x: x(currentMouseX), y: y(currentMouseY) }
              : { x: width / 2, y: height / 2 };
            zoomTo(newZoom, focus);
          }}
          aria-label="Zoom out"
          title="Zoom Out"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="w-5 h-5"
          >
            <path
              fill-rule="evenodd"
              d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <button
          class="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
          on:click={() => {
            followRobotStore.set(false);
            fieldZoom.set(1.0);
            fieldPan.set({ x: 0, y: 0 });
          }}
          aria-label="Reset zoom"
          title="Reset Zoom"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="w-5 h-5"
          >
            <polyline points="4 9 4 4 9 4" />
            <polyline points="15 4 20 4 20 9" />
            <polyline points="20 15 20 20 15 20" />
            <polyline points="9 20 4 20 4 15" />
          </svg>
        </button>
        <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-0.5"></div>
        <button
          class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
          on:click={() => isPresentationMode.set(false)}
          aria-label="Exit Presentation Mode"
          title="Exit Presentation Mode (Alt+P)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="w-5 h-5"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Ensure collision markers and shapes do not block pointer events so users can click through them */
  :global(#collision-group, #collision-group *, #shape-group, #shape-group *) {
    pointer-events: none !important;
  }
</style>
