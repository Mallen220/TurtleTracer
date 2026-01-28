<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
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
    selectedLineId,
    showRuler,
    showProtractor,
    protractorLockToRobot,
    collisionMarkers,
    fieldZoom,
    fieldPan,
    hoveredMarkerId,
    fieldViewStore,
    pluginRedrawTrigger,
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
  } from "../projectStore";
  import {
    diffMode,
    toggleDiff,
    committedData,
    diffResult,
    isLoadingDiff,
  } from "../diffStore";
  import {
    telemetryData,
    showTelemetry,
    showTelemetryGhost,
    telemetryOffset,
    type TelemetryPoint,
  } from "../telemetryStore";
  import { currentFilePath, gitStatusStore, isUnsaved } from "../../stores";
  import {
    POINT_RADIUS,
    LINE_WIDTH,
    FIELD_SIZE,
    DEFAULT_ROBOT_LENGTH,
    DEFAULT_ROBOT_WIDTH,
  } from "../../config";
  import {
    getCurvePoint,
    quadraticToCubic,
    generateOnionLayers,
    getRandomColor,
    loadRobotImage,
    updateRobotImageDisplay,
    easeInOutQuad,
    getAngularDifference,
  } from "../../utils";
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
  export let onRecordChange: () => void;

  // Local state
  let two: Two;
  let twoElement: HTMLDivElement;
  let wrapperDiv: HTMLDivElement;
  let overlayContainer: HTMLDivElement;

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

  function zoomTo(newZoom: number, focus?: { x: number; y: number }) {
    const fx = focus?.x ?? width / 2;
    const fy = focus?.y ?? height / 2;
    // Compute field coordinates at the focus point using current scales
    const fieldX = x.invert(fx);
    const fieldY = y.invert(fy);
    // Use baseSize (min dimension) for consistent zoom calculation logic if assumed square field mapping
    // But computePanForZoom expects width/height of viewport?
    // Let's stick to using the actual viewport dimensions for zoomTo focus point calculations.
    // However, the field scaling is driven by baseSize.
    // We need to check computePanForZoom implementation. Assuming it works with current x/y scales inversions.
    // Actually, computePanForZoom needs to know the "fieldDrawSize" effectively.
    // But if we use x.invert / y.invert correctly, we get field coords.
    // The pan calculation might need adjustment if it assumes width==height==fieldSize.
    // Let's rely on x/y inversion which accounts for baseSize.

    // Re-implement simplified pan calculation here since computePanForZoom might be rigid.
    // Target: at newZoom, (fieldX, fieldY) should be at (fx, fy).
    // x_new(fieldX) = width/2 + (fieldX_norm - 0.5) * baseSize * newZoom + newPanX = fx
    // where fieldX_norm = fieldX / FIELD_SIZE (approx, ignoring domain start).
    // Actually simpler:
    // current: x(fieldX) = width/2 + offset_x + pan.x = fx
    // target:  x_new(fieldX) = width/2 + offset_x_new + newPanX = fx
    // offset_x = (fieldX mapped to centered 0-based scaled coord)
    // Let's trust the existing helper if it is generic enough, or recalculate manually.

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

  // Telemetry State
  $: telemetry = $telemetryData;
  $: isTelemetryVisible = $showTelemetry;
  $: isTelemetryGhostVisible = $showTelemetryGhost;
  $: tOffset = $telemetryOffset;

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

  // --- Two.js Object Creation Logic (moved from App.svelte) ---

  // Points (Start, Control, End, Obstacle Vertices)
  $: points = (() => {
    let _points = [];
    let startPointElem = new Two.Circle(
      x(startPoint.x),
      y(startPoint.y),
      uiLength(POINT_RADIUS),
    );
    startPointElem.id = `point-0-0`;
    startPointElem.fill = lines[0]?.color || "#000000"; // Fallback color if lines empty
    startPointElem.noStroke();
    _points.push(startPointElem);

    lines.forEach((line, idx) => {
      if (!line || !line.endPoint) return;
      [line.endPoint, ...line.controlPoints].forEach((point, idx1) => {
        if (idx1 > 0) {
          let pointGroup = new Two.Group();
          pointGroup.id = `point-${idx + 1}-${idx1}`;
          let pointElem = new Two.Circle(
            x(point.x),
            y(point.y),
            uiLength(POINT_RADIUS),
          );
          pointElem.id = `point-${idx + 1}-${idx1}-background`;
          pointElem.fill = line.color;
          pointElem.noStroke();
          let pointText = new Two.Text(
            `${idx1}`,
            x(point.x),
            y(point.y) - uiLength(0.15),
          );
          pointText.id = `point-${idx + 1}-${idx1}-text`;
          pointText.size = uiLength(1.55);
          pointText.leading = 1;
          pointText.family = "ui-sans-serif, system-ui, sans-serif";
          pointText.alignment = "center";
          pointText.baseline = "middle";
          pointText.fill = "white";
          pointText.noStroke();
          pointGroup.add(pointElem, pointText);
          _points.push(pointGroup);
        } else {
          let pointElem = new Two.Circle(
            x(point.x),
            y(point.y),
            uiLength(POINT_RADIUS),
          );
          pointElem.id = `point-${idx + 1}-${idx1}`;
          pointElem.fill = line.color;
          pointElem.noStroke();
          _points.push(pointElem);
        }
      });
    });

    shapes.forEach((shape, shapeIdx) => {
      shape.vertices.forEach((vertex, vertexIdx) => {
        let pointGroup = new Two.Group();
        pointGroup.id = `obstacle-${shapeIdx}-${vertexIdx}`;
        let pointElem = new Two.Circle(
          x(vertex.x),
          y(vertex.y),
          uiLength(POINT_RADIUS),
        );
        pointElem.id = `obstacle-${shapeIdx}-${vertexIdx}-background`;
        pointElem.fill = "#991b1b";
        pointElem.noStroke();
        let pointText = new Two.Text(
          `${vertexIdx + 1}`,
          x(vertex.x),
          y(vertex.y) - uiLength(0.15),
        );
        pointText.id = `obstacle-${shapeIdx}-${vertexIdx}-text`;
        pointText.size = uiLength(1.55);
        pointText.leading = 1;
        pointText.family = "ui-sans-serif, system-ui, sans-serif";
        pointText.alignment = "center";
        pointText.baseline = "middle";
        pointText.fill = "white";
        pointText.noStroke();
        pointGroup.add(pointElem, pointText);
        _points.push(pointGroup);
      });
    });
    return _points;
  })();

  // Reusable path generation function
  function generatePathElements(
    targetLines: Line[],
    targetStartPoint: Point,
    getColor: (line: Line) => string,
    getWidth: (line: Line) => number,
    idPrefix: string,
    isHeatmapEnabled: boolean = false,
  ) {
    let _path: (Path | PathLine)[] = [];
    targetLines.forEach((line, idx) => {
      if (!line || !line.endPoint) return;
      let _startPoint =
        idx === 0 ? targetStartPoint : targetLines[idx - 1]?.endPoint || null;
      if (!_startPoint) return;

      // Check for Velocity Heatmap Mode (only for main path)
      const showHeatmap =
        isHeatmapEnabled && settings.showVelocityHeatmap && timePrediction;
      let heatmapSegments: PathLine[] = [];

      if (showHeatmap) {
        // Try to find corresponding timeline event for velocity data
        // lineIndex matches the index in 'lines' array
        const event = timePrediction.timeline.find(
          (e: any) => e.type === "travel" && e.lineIndex === idx,
        );

        if (
          event &&
          event.velocityProfile &&
          event.velocityProfile.length > 0
        ) {
          const vProfile = event.velocityProfile as number[];
          const maxVel = Math.max(1, settings.maxVelocity);

          // Re-sample geometry to match profile (100 samples)
          const samples = 100;
          let cps = [_startPoint, ...line.controlPoints, line.endPoint];
          let prevPt = getCurvePoint(0, cps);

          for (let i = 1; i <= samples; i++) {
            const t = i / samples;
            const currPt = getCurvePoint(t, cps);

            // Calculate the proportional index in the velocity profile
            const profileIndex = Math.floor(t * (vProfile.length - 1));
            // Ensure we don't go out of bounds (though Math.floor guarantees <= length-1)
            const safeIndex = Math.min(
              vProfile.length - 1,
              Math.max(0, profileIndex),
            );

            const vAvg = vProfile[safeIndex] || 0;
            const ratio = Math.min(1, Math.max(0, vAvg / maxVel));

            // Green (120) -> Red (0)
            const hue = 120 - ratio * 120;
            const color = `hsl(${hue}, 100%, 40%)`;

            let seg = new Two.Line(
              x(prevPt.x),
              y(prevPt.y),
              x(currPt.x),
              y(currPt.y),
            );
            seg.stroke = color;
            seg.linewidth = getWidth(line);
            seg.id = `${idPrefix}-line-${idx + 1}-seg-${i}`;
            if (line.locked) {
              seg.dashes = [uiLength(2), uiLength(2)];
              seg.opacity = 0.7;
            }
            heatmapSegments.push(seg);

            prevPt = currPt;
          }
        }
      }

      // If we generated heatmap segments, add them and skip standard line
      if (heatmapSegments.length > 0) {
        heatmapSegments.forEach((seg) => _path.push(seg));
        return;
      }

      // Fallback: Standard Line Rendering
      let lineElem: Path | PathLine;
      if (line.controlPoints.length > 2) {
        const samples = 100;
        const cps = [_startPoint, ...line.controlPoints, line.endPoint];
        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        ];
        for (let i = 1; i <= samples; ++i) {
          const point = getCurvePoint(i / samples, cps);
          points.push(
            new Two.Anchor(
              x(point.x),
              y(point.y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }
        points.forEach((point) => (point.relative = false));
        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else if (line.controlPoints.length > 0) {
        let cp1 = line.controlPoints[1]
          ? line.controlPoints[0]
          : quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
              .Q1;
        let cp2 =
          line.controlPoints[1] ??
          quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
            .Q2;
        let points = [
          new Two.Anchor(
            x(_startPoint.x),
            y(_startPoint.y),
            x(_startPoint.x),
            y(_startPoint.y),
            x(cp1.x),
            y(cp1.y),
            Two.Commands.move,
          ),
          new Two.Anchor(
            x(line.endPoint.x),
            y(line.endPoint.y),
            x(cp2.x),
            y(cp2.y),
            x(line.endPoint.x),
            y(line.endPoint.y),
            Two.Commands.curve,
          ),
        ];
        points.forEach((point) => (point.relative = false));
        lineElem = new Two.Path(points);
        lineElem.automatic = false;
      } else {
        lineElem = new Two.Line(
          x(_startPoint.x),
          y(_startPoint.y),
          x(line.endPoint.x),
          y(line.endPoint.y),
        );
      }
      lineElem.id = `${idPrefix}-line-${idx + 1}`;
      lineElem.stroke = getColor(line);
      lineElem.linewidth = getWidth(line);
      lineElem.noFill();
      if (line.locked) {
        lineElem.dashes = [uiLength(2), uiLength(2)];
        lineElem.opacity = 0.7;
      } else {
        lineElem.dashes = [];
        lineElem.opacity = 1;
      }
      _path.push(lineElem);
    });
    return _path;
  }

  // Paths (Lines) - Standard
  $: path = (() => {
    x;
    y; // Trigger reactivity on pan/zoom
    if (isDiffMode) return []; // Don't render standard path in diff mode
    const currentSelectedId = $selectedLineId;

    // Use timeline events to find all lines (including bridge & macros)
    // Extract unique lines from timeline events of type 'travel'
    let renderLines: Line[] = [];
    let lineStartPoints = new Map<string, Point>(); // lineId -> startPoint

    // Start with standard lines
    // This handles the basic "lines" array
    // But we want to include macro lines.
    // The issue with generatePathElements is it iterates an array and assumes continuity (prev.endPoint).
    // For timeline-based lines, we might have disjoint segments or bridge lines.
    // Let's manually construct the array for generatePathElements or call it multiple times?
    // generatePathElements expects a contiguous list.

    // Instead, let's iterate the timeline events directly if available.
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
        // We pass a single-item array to reuse generatePathElements logic
        const elems = generatePathElements(
          [line],
          start,
          (l) => l.color || "#60a5fa",
          (l) => width,
          `timeline-path-${idx}`, // unique prefix
          isMainLine, // only heatmap for main lines? or all? Let's say all for now if possible
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
      false,
    );

    return [...committedPaths, ...currentPaths];
  })();

  // Diff Event Markers
  $: diffEventMarkerElements = (() => {
    if (!isDiffMode || !diffData) return [];

    const elems: InstanceType<typeof Two.Group>[] = [];

    // Helper to extract marker positions from a dataset
    const getMarkerMap = (
      dataLines: Line[],
      dataStart: Point,
      dataSequence: SequenceItem[],
    ) => {
      const map = new Map<string, { x: number; y: number }>();

      // Lines
      dataLines.forEach((l, idx) => {
        const parentName = l.name || `Path ${idx + 1}`;
        const start = idx === 0 ? dataStart : dataLines[idx - 1].endPoint;
        if (!start) return;

        l.eventMarkers?.forEach((m) => {
          const id = m.id || `${parentName}-${m.name}-${m.position}`;
          const t = Math.max(0, Math.min(1, m.position ?? 0.5));
          let pos = { x: 0, y: 0 };
          if (l.controlPoints.length > 0) {
            const cps = [start, ...l.controlPoints, l.endPoint];
            const pt = getCurvePoint(t, cps);
            pos.x = pt.x;
            pos.y = pt.y;
          } else {
            pos.x = start.x + (l.endPoint.x - start.x) * t;
            pos.y = start.y + (l.endPoint.y - start.y) * t;
          }
          map.set(id, pos);
        });
      });

      // Sequence
      dataSequence.forEach((s) => {
        if (s.kind === "wait" || s.kind === "rotate") {
          const parentName = s.name || (s.kind === "wait" ? "Wait" : "Rotate");
          // Finding position for sequence events is harder without simulation (TimePrediction)
          // But usually they are attached to the end of a line.
          // For now, let's skip sequence events in diff view on field unless we have position data.
          // Or we can rely on `TimePrediction` but that matches `lines`.
          // For `oldData`, we don't have a `TimePrediction` computed.
          // We could compute it, but that's expensive.
          // Let's stick to Path Events for field visualization for now as they are spatial.
        }
      });

      return map;
    };

    const currentMap = getMarkerMap(lines, startPoint, sequence);
    const oldMap = oldData
      ? getMarkerMap(oldData.lines, oldData.startPoint, oldData.sequence)
      : new Map();

    diffData.eventDiff.forEach((change) => {
      // Helper to create marker
      const createMarker = (
        pos: { x: number; y: number },
        color: string,
        label: string,
        idSuffix: string,
      ) => {
        const grp = new Two.Group();
        // ID format for hover: diff-event-{id}-{suffix}
        // suffix: old or new
        grp.id = `diff-event-${change.id}-${idSuffix}`;

        const isHovered = $hoveredMarkerId === change.id; // Match base ID
        const radius = isHovered ? 2.5 : 1.5;

        const circle = new Two.Circle(x(pos.x), y(pos.y), uiLength(radius));
        circle.fill = color;
        circle.noStroke();
        grp.add(circle);

        if (isHovered) {
          const text = new Two.Text(label, x(pos.x), y(pos.y) - uiLength(3));
          text.fill = "white"; // Dark mode friendly? or switch based on theme

          // Background for text
          const textMetrics = { width: label.length * 8, height: 14 }; // Approx
          const bg = new Two.Rectangle(
            x(pos.x),
            y(pos.y) - uiLength(3),
            uiLength(textMetrics.width / ppI),
            uiLength(1),
          );
          // Two.Text is easier.
          text.weight = 700;
          text.size = uiLength(1.5);
          text.stroke = "black";
          text.linewidth = 2;
          grp.add(text);
        }

        return grp;
      };

      if (change.changeType === "added") {
        const pos = currentMap.get(change.id);
        if (pos) {
          elems.push(createMarker(pos, "#22c55e", change.name, "new")); // Green
        }
      } else if (change.changeType === "removed") {
        const pos = oldMap.get(change.id);
        if (pos) {
          elems.push(createMarker(pos, "#ef4444", change.name, "old")); // Red
        }
      } else if (change.changeType === "changed") {
        const oldPos = oldMap.get(change.id);
        const newPos = currentMap.get(change.id);
        if (oldPos)
          elems.push(
            createMarker(oldPos, "#ef4444", change.name + " (Old)", "old"),
          );
        if (newPos)
          elems.push(
            createMarker(newPos, "#22c55e", change.name + " (New)", "new"),
          );

        // Optional: Draw arrow connecting them
        if (oldPos && newPos) {
          const arrowGroup = new Two.Group();
          arrowGroup.id = `diff-event-arrow-${change.id}`;
          const arrow = new Two.Line(
            x(oldPos.x),
            y(oldPos.y),
            x(newPos.x),
            y(newPos.y),
          );
          arrow.stroke = "#fbbf24"; // Amber
          arrow.linewidth = uiLength(0.5);
          arrow.dashes = [uiLength(1), uiLength(1)];
          arrowGroup.add(arrow);
          elems.push(arrowGroup);
        }
      }
    });

    return elems;
  })();

  // Shapes (Obstacles)
  $: shapeElements = (() => {
    let _shapes: Path[] = [];
    shapes.forEach((shape, idx) => {
      if (shape.visible === false) return; // Skip hidden shapes

      if (shape.vertices.length >= 3) {
        let vertices = [];
        vertices.push(
          new Two.Anchor(
            x(shape.vertices[0].x),
            y(shape.vertices[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        );
        for (let i = 1; i < shape.vertices.length; i++) {
          vertices.push(
            new Two.Anchor(
              x(shape.vertices[i].x),
              y(shape.vertices[i].y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }
        vertices.push(
          new Two.Anchor(
            x(shape.vertices[0].x),
            y(shape.vertices[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.close,
          ),
        );
        vertices.forEach((point) => (point.relative = false));
        let shapeElement = new Two.Path(vertices);
        shapeElement.id = `shape-${idx}`;

        // Styling based on type
        if (shape.type === "keep-in") {
          shapeElement.stroke = shape.color;
          shapeElement.fill = shape.color;
          shapeElement.opacity = 0.1; // Low occupancy fill 10%
          shapeElement.linewidth = uiLength(1.0);
          shapeElement.dashes = [uiLength(4), uiLength(4)]; // Dashed lines
        } else {
          // Standard Obstacle
          shapeElement.stroke = shape.color;
          shapeElement.fill = shape.color;
          shapeElement.opacity = 0.4;
          shapeElement.linewidth = uiLength(0.8);
          shapeElement.dashes = [];
        }

        shapeElement.automatic = false;
        _shapes.push(shapeElement);
      }
    });
    return _shapes;
  })();

  // Onion Layers
  $: onionLayerElements = (() => {
    let onionLayers: Path[] = [];
    if (settings.showOnionLayers && lines.length > 0) {
      const spacing = settings.onionLayerSpacing || 6;

      let targetLines = lines;
      let targetStartPoint = startPoint;

      // If "Current Path Only" is enabled, filter the lines based on animation time
      if (settings.onionSkinCurrentPathOnly) {
        if (timePrediction && timePrediction.timeline) {
          const totalDuration =
            timePrediction.timeline[timePrediction.timeline.length - 1]
              ?.endTime || 0;
          const currentSeconds = ($percentStore / 100) * totalDuration;
          const activeEvent =
            timePrediction.timeline.find(
              (e: any) =>
                currentSeconds >= e.startTime && currentSeconds <= e.endTime,
            ) || timePrediction.timeline[timePrediction.timeline.length - 1];

          if (
            activeEvent &&
            activeEvent.type === "travel" &&
            typeof activeEvent.lineIndex === "number"
          ) {
            const idx = activeEvent.lineIndex;
            if (lines[idx]) {
              targetLines = [lines[idx]];
              targetStartPoint =
                idx === 0 ? startPoint : lines[idx - 1].endPoint;
            }
          } else {
            // Not traveling (e.g. waiting), show nothing
            targetLines = [];
          }
        }
      }

      const layers = generateOnionLayers(
        targetStartPoint,
        targetLines,
        settings.rLength,
        settings.rWidth,
        spacing,
      );
      layers.forEach((layer, idx) => {
        let vertices = [];
        vertices.push(
          new Two.Anchor(
            x(layer.corners[0].x),
            y(layer.corners[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        );
        for (let i = 1; i < layer.corners.length; i++) {
          vertices.push(
            new Two.Anchor(
              x(layer.corners[i].x),
              y(layer.corners[i].y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }
        vertices.push(
          new Two.Anchor(
            x(layer.corners[0].x),
            y(layer.corners[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.close,
          ),
        );
        vertices.forEach((point) => (point.relative = false));
        let onionRect = new Two.Path(vertices);
        onionRect.id = `onion-layer-${idx}`;
        onionRect.stroke = "#818cf8";
        onionRect.noFill();
        onionRect.opacity = 0.35;
        onionRect.linewidth = uiLength(0.5);
        onionRect.automatic = false;
        onionLayers.push(onionRect);
      });
    }
    return onionLayers;
  })();

  // Telemetry Path
  $: telemetryPathElements = (() => {
    x;
    y; // Trigger reactivity on pan/zoom
    if (!isTelemetryVisible || !telemetry || telemetry.length < 2) return [];

    const vertices = telemetry.map(
      (pt: TelemetryPoint) =>
        new Two.Anchor(x(pt.x), y(pt.y), 0, 0, 0, 0, Two.Commands.line),
    );
    vertices[0].command = Two.Commands.move;

    const path = new Two.Path(vertices, false, false);
    path.noFill();
    path.stroke = "#6b7280"; // Gray-500
    path.linewidth = uiLength(1.0);
    path.opacity = 0.6;
    path.dashes = [uiLength(4), uiLength(4)];

    return [path];
  })();

  // Ghost Robot State for Telemetry
  $: ghostRobotState = (() => {
    if (
      !isTelemetryVisible ||
      !isTelemetryGhostVisible ||
      !telemetry ||
      telemetry.length === 0
    )
      return null;

    // Calculate current simulation time from percentStore
    // If timePrediction is available, use it to map percent to seconds
    let currentSimTime = 0;

    if (timePrediction && timePrediction.totalTime > 0) {
      currentSimTime = ($percentStore / 100) * timePrediction.totalTime;
    } else {
      // If no path, we can't really sync.
      return null;
    }

    // Apply offset
    const targetTime = currentSimTime + tOffset;

    // Find point just before targetTime
    let idx = -1;
    for (let i = 0; i < telemetry.length; i++) {
      if (telemetry[i].time > targetTime) {
        break;
      }
      idx = i;
    }

    if (idx === -1) return null; // Before start
    if (idx === telemetry.length - 1) return telemetry[idx]; // After end

    // Interpolate
    const p1 = telemetry[idx];
    const p2 = telemetry[idx + 1];
    const t = (targetTime - p1.time) / (p2.time - p1.time);

    // Interpolate heading with wrapping
    const h1 = p1.heading;
    const h2 = p2.heading;
    const diff = getAngularDifference(h1, h2);

    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
      heading: h1 + diff * t,
    };
  })();

  // Preview Paths
  $: previewPathElements = (() => {
    let _previewPaths: Path[] = [];
    if (previewOptimizedLines && previewOptimizedLines.length > 0) {
      previewOptimizedLines.forEach((line, idx) => {
        if (!line || !line.endPoint) return;
        let _startPoint =
          idx === 0
            ? startPoint
            : previewOptimizedLines[idx - 1]?.endPoint || null;
        if (!_startPoint) return;

        let lineElem: Path | PathLine;
        if (line.controlPoints.length > 2) {
          const samples = 100;
          const cps = [_startPoint, ...line.controlPoints, line.endPoint];
          let points = [
            new Two.Anchor(
              x(_startPoint.x),
              y(_startPoint.y),
              0,
              0,
              0,
              0,
              Two.Commands.move,
            ),
          ];
          for (let i = 1; i <= samples; ++i) {
            const point = getCurvePoint(i / samples, cps);
            points.push(
              new Two.Anchor(
                x(point.x),
                y(point.y),
                0,
                0,
                0,
                0,
                Two.Commands.line,
              ),
            );
          }
          points.forEach((point) => (point.relative = false));
          lineElem = new Two.Path(points);
          lineElem.automatic = false;
        } else if (line.controlPoints.length > 0) {
          let cp1 = line.controlPoints[1]
            ? line.controlPoints[0]
            : quadraticToCubic(
                _startPoint,
                line.controlPoints[0],
                line.endPoint,
              ).Q1;
          let cp2 =
            line.controlPoints[1] ??
            quadraticToCubic(_startPoint, line.controlPoints[0], line.endPoint)
              .Q2;
          let points = [
            new Two.Anchor(
              x(_startPoint.x),
              y(_startPoint.y),
              x(_startPoint.x),
              y(_startPoint.y),
              x(cp1.x),
              y(cp1.y),
              Two.Commands.move,
            ),
            new Two.Anchor(
              x(line.endPoint.x),
              y(line.endPoint.y),
              x(cp2.x),
              y(cp2.y),
              x(line.endPoint.x),
              y(line.endPoint.y),
              Two.Commands.curve,
            ),
          ];
          points.forEach((point) => (point.relative = false));
          lineElem = new Two.Path(points);
          lineElem.automatic = false;
        } else {
          lineElem = new Two.Line(
            x(_startPoint.x),
            y(_startPoint.y),
            x(line.endPoint.x),
            y(line.endPoint.y),
          );
        }
        lineElem.id = `preview-line-${idx + 1}`;
        lineElem.stroke = "#60a5fa";
        lineElem.linewidth = uiLength(LINE_WIDTH);
        lineElem.noFill();
        lineElem.dashes = [uiLength(4), uiLength(4)];
        lineElem.opacity = 0.7;
        _previewPaths.push(lineElem);
      });
    }
    return _previewPaths;
  })();

  // Event Markers
  $: eventMarkerElements = (() => {
    let twoMarkers: InstanceType<typeof Two.Group>[] = [];

    // Build a map of lineId -> startPoint from timePrediction if available
    // This handles cases where lines are out of order in the array (e.g. mixed with macros)
    const startPointMap = new Map<string, Point>();
    if (timePrediction && timePrediction.timeline) {
      timePrediction.timeline.forEach((ev: any) => {
        if (ev.type === "travel" && ev.line && ev.prevPoint) {
          startPointMap.set(ev.line.id, ev.prevPoint);
        }
      });
    }

    lines.forEach((line, idx) => {
      if (
        !line ||
        !line.endPoint ||
        !line.eventMarkers ||
        line.eventMarkers.length === 0
      )
        return;

      let _startPoint = startPointMap.get(line.id!);
      if (!_startPoint) {
        // Fallback for lines not in timeline or if timeline missing
        _startPoint = idx === 0 ? startPoint : lines[idx - 1]?.endPoint || null;
      }

      if (!_startPoint) return;

      line.eventMarkers.forEach((ev, evIdx) => {
        const isHovered = $hoveredMarkerId === ev.id;
        const radius = isHovered ? 1.8 : 0.9;
        const color = isHovered ? "#a78bfa" : "#c4b5fd";

        const t = Math.max(0, Math.min(1, ev.position ?? 0.5));
        let pos = { x: 0, y: 0 };
        if (line.controlPoints.length > 0) {
          const cps = [_startPoint, ...line.controlPoints, line.endPoint];
          const pt = getCurvePoint(t, cps);
          pos.x = pt.x;
          pos.y = pt.y;
        } else {
          pos.x = _startPoint.x + (line.endPoint.x - _startPoint.x) * t;
          pos.y = _startPoint.y + (line.endPoint.y - _startPoint.y) * t;
        }
        const px = x(pos.x);
        const py = y(pos.y);
        let grp = new Two.Group();
        grp.id = `event-${idx}-${evIdx}`;
        let circle = new Two.Circle(px, py, uiLength(radius));
        circle.id = `event-circle-${idx}-${evIdx}`;
        circle.fill = color;
        circle.noStroke();
        grp.add(circle);
        twoMarkers.push(grp);
      });
    });

    if (
      timePrediction &&
      timePrediction.timeline &&
      sequence &&
      sequence.length > 0
    ) {
      // Use Registry for registered actions (e.g. Wait)
      sequence.forEach((item) => {
        const action = actionRegistry.get(item.kind);
        if (action && action.renderField) {
          const elems = action.renderField(item, {
            x,
            y,
            uiLength,
            settings,
            hoveredId: $hoveredMarkerId,
            selectedId: $selectedLineId,
            selectedPointId: $selectedPointId,
            timePrediction,
          });
          if (elems) {
            elems.forEach((el) => twoMarkers.push(el));
          }
        }
      });
    }
    return twoMarkers;
  })();

  // Collision Markers
  $: collisionElements = (() => {
    let elems: InstanceType<typeof Two.Group>[] = [];
    if (markers && markers.length > 0) {
      markers.forEach((marker, idx) => {
        const group = new Two.Group();
        const isBoundary = marker.type === "boundary";
        const isZeroLength = marker.type === "zero-length";
        const isKeepIn = marker.type === "keep-in";

        let fillColor = "rgba(239, 68, 68, 0.5)"; // Red-500
        let strokeColor = "#ef4444";
        let glowFill = "rgba(239, 68, 68, 0.3)";
        let glowStroke = "rgba(239, 68, 68, 0.5)";

        if (isBoundary) {
          fillColor = "rgba(249, 115, 22, 0.5)"; // Orange-500
          strokeColor = "#f97316";
          glowFill = "rgba(249, 115, 22, 0.3)";
          glowStroke = "rgba(249, 115, 22, 0.5)";
        } else if (isZeroLength) {
          fillColor = "rgba(217, 70, 239, 0.5)"; // Fuchsia-500
          strokeColor = "#d946ef";
          glowFill = "rgba(217, 70, 239, 0.3)";
          glowStroke = "rgba(217, 70, 239, 0.5)";
        } else if (isKeepIn) {
          fillColor = "rgba(59, 130, 246, 0.5)"; // Blue-500
          strokeColor = "#3b82f6";
          glowFill = "rgba(59, 130, 246, 0.3)";
          glowStroke = "rgba(59, 130, 246, 0.5)";
        }

        // Check for range
        if (
          marker.endTime !== undefined &&
          marker.endTime > marker.time &&
          timePrediction &&
          timePrediction.timeline
        ) {
          // Range Rendering
          const start = marker.time;
          const end = marker.endTime;

          const events = timePrediction.timeline.filter(
            (e: any) => e.endTime >= start && e.startTime <= end,
          );

          events.forEach((ev: any) => {
            const segStart = Math.max(start, ev.startTime);
            const segEnd = Math.min(end, ev.endTime);

            if (ev.type === "wait") {
              // Render point if wait is involved
              if (ev.atPoint) {
                const circle = new Two.Circle(
                  x(ev.atPoint.x),
                  y(ev.atPoint.y),
                  uiLength(2),
                );
                circle.fill = fillColor;
                circle.stroke = strokeColor;
                circle.linewidth = uiLength(0.5);
                group.add(circle);
              }
            } else if (ev.type === "travel") {
              const lineIdx = ev.lineIndex;
              const line = lines[lineIdx];
              if (line) {
                // Use the exact prevPoint captured in the timeline to anchor
                // segment start; this stays correct across macro expansions and
                // translated macros where array order may not match execution.
                const lineStartPoint =
                  ev.prevPoint ||
                  (lineIdx === 0 ? startPoint : lines[lineIdx - 1].endPoint);
                let t1 = 0;
                let t2 = 1;

                if (ev.duration > 0) {
                  t1 = Math.max(0, (segStart - ev.startTime) / ev.duration);
                  t2 = Math.min(1, (segEnd - ev.startTime) / ev.duration);
                }

                // Generate segment points
                const samples = 30;
                const points = [];
                const cps = [
                  lineStartPoint,
                  ...line.controlPoints,
                  line.endPoint,
                ];

                for (let i = 0; i <= samples; i++) {
                  const t = t1 + (t2 - t1) * (i / samples);
                  // Apply easing to match robot path movement
                  const spatialT = easeInOutQuad(t);
                  const pt = getCurvePoint(spatialT, cps);
                  points.push(new Two.Anchor(x(pt.x), y(pt.y)));
                }

                const path = new Two.Path(points, false, false);
                path.noFill();
                path.stroke = strokeColor;
                path.linewidth = uiLength(2.0);
                path.cap = "round";
                path.join = "round";
                group.add(path);

                // Add glow
                const glowPath = new Two.Path(points, false, false);
                glowPath.noFill();
                glowPath.stroke = glowStroke;
                glowPath.linewidth = uiLength(6.0);
                glowPath.opacity = 0.5;
                glowPath.cap = "round";
                glowPath.join = "round";
                group.add(glowPath);
              }
            }
          });
        } else {
          // Point Rendering
          const circle = new Two.Circle(x(marker.x), y(marker.y), uiLength(2));
          circle.fill = fillColor;
          circle.stroke = strokeColor;
          circle.linewidth = uiLength(0.5);

          const crossLength = uiLength(1.5);
          const l1 = new Two.Line(
            x(marker.x) - crossLength,
            y(marker.y) - crossLength,
            x(marker.x) + crossLength,
            y(marker.y) + crossLength,
          );
          l1.stroke = "#ffffff";
          l1.linewidth = uiLength(0.5);

          const l2 = new Two.Line(
            x(marker.x) + crossLength,
            y(marker.y) - crossLength,
            x(marker.x) - crossLength,
            y(marker.y) + crossLength,
          );
          l2.stroke = "#ffffff";
          l2.linewidth = uiLength(0.5);

          const glow = new Two.Circle(x(marker.x), y(marker.y), uiLength(6));
          glow.fill = glowFill;
          glow.stroke = glowStroke;
          glow.linewidth = uiLength(0.5);

          group.add(glow, circle, l1, l2);
        }
        elems.push(group);
      });
    }
    return elems;
  })();

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

    two.clear();

    if (Array.isArray(shapeElements))
      shapeElements.forEach((el) => shapeGroup.add(el));
    onionLayerElements.forEach((el) => shapeGroup.add(el));

    path.forEach((el) => lineGroup.add(el));
    diffPathElements.forEach((el) => lineGroup.add(el));
    previewPathElements.forEach((el) => lineGroup.add(el));
    telemetryPathElements.forEach((el) => lineGroup.add(el));

    if (!$isPresentationMode && !isDiffMode) {
      points.forEach((el) => pointGroup.add(el));
      eventMarkerElements.forEach((el) => eventGroup.add(el));
      // Ensure collisionElements is used in the reactive block to trigger updates
      collisionElements.forEach((el) => collisionGroup.add(el));
    }

    if (isDiffMode) {
      diffEventMarkerElements.forEach((el) => eventGroup.add(el));
    }

    two.add(shapeGroup);
    two.add(lineGroup);
    two.add(eventGroup);
    two.add(pointGroup);
    two.add(collisionGroup);

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
      // If we are dragging, we already know what we are dragging (currentElem).
      // If we are not dragging, we can use evt.target which is O(1).

      if (isDown && currentElem) {
        // Dragging Logic
        const line = Number(currentElem.split("-")[1]) - 1;
        if (line >= 0 && lines[line]?.locked) return;

        let rawInchX = x.invert(xPos) + dragOffset.x;
        let rawInchY = y.invert(yPos) + dragOffset.y;
        let inchX = rawInchX;
        let inchY = rawInchY;

        if ($snapToGrid && $showGrid && $gridSize > 0) {
          inchX = Math.round(rawInchX / $gridSize) * $gridSize;
          inchY = Math.round(rawInchY / $gridSize) * $gridSize;
        }

        // Determine clamping range
        let minX = -Infinity;
        let maxX = Infinity;
        let minY = -Infinity;
        let maxY = Infinity;

        // Apply field restrictions if enabled or if snapped (snap implies grid which is usually in field, but let's stick to explicit restriction)
        if (settings.restrictDraggingToField !== false) {
          minX = 0;
          maxX = FIELD_SIZE;
          minY = 0;
          maxY = FIELD_SIZE;

          if (currentElem.startsWith("point-")) {
            const parts = currentElem.split("-");
            const lineNum = Number(parts[1]);
            const pointIdx = Number(parts[2]);

            // Calculate base robot margin (half of smallest dimension)
            const robotMargin = Math.min(settings.rLength, settings.rWidth) / 2;
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

        if (currentElem.startsWith("obstacle-")) {
          const parts = currentElem.split("-");
          const shapeIdx = Number(parts[1]);
          if (shapes[shapeIdx]?.locked) return;
          const vertexIdx = Number(parts[2]);
          shapes[shapeIdx].vertices[vertexIdx].x = inchX;
          shapes[shapeIdx].vertices[vertexIdx].y = inchY;
          shapesStore.set(shapes);
        } else {
          const line = Number(currentElem.split("-")[1]) - 1;
          const point = Number(currentElem.split("-")[2]);

          if (line === -1) {
            if (!startPoint.locked) {
              startPoint.x = inchX;
              startPoint.y = inchY;
              startPointStore.set(startPoint);
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
            linesStore.set(lines);
          }
        }
      } else if (isPanning) {
        // Panning Logic
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
          target?.id.startsWith("obstacle")
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
        if (el.id.startsWith("point") || el.id.startsWith("obstacle-"))
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

      if (clickedElem) {
        isDown = true;
        currentElem = clickedElem;

        if (currentElem.startsWith("point-")) {
          const parts = currentElem.split("-");
          const lineNum = Number(parts[1]);
          const pointIdx = Number(parts[2]);
          if (!isNaN(lineNum) && lineNum > 0) {
            const lineIndex = lineNum - 1;
            const line = lines[lineIndex];
            if (line && line.id) {
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
        dragOffset = { x: objectX - mouseX, y: objectY - mouseY };
      } else {
        // Start Panning
        isPanning = true;
        startPan = { x: evt.clientX, y: evt.clientY };
        two.renderer.domElement.style.cursor = "grabbing";
      }
    });

    two.renderer.domElement.addEventListener("mouseup", () => {
      if (isDown) {
        onRecordChange(); // Notify parent of change
      }
      isDown = false;
      isPanning = false;
      dragOffset = { x: 0, y: 0 };
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

      const newLine: Line = {
        id: `line-${Math.random().toString(36).slice(2)}`,
        name: "",
        endPoint: { x: inchX, y: inchY, heading: "tangential", reverse: false },
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
      // We can't know the index easily without recounting, but we can assume it's last
      // lines is reactive, so we can just wait or calc index
      const newIdx = $linesStore.length - 1;
      selectedPointId.set(`point-${newIdx + 1}-0`);

      onRecordChange();
    });
  });

  // Public accessor for exportGif
  export function getTwoInstance() {
    return two;
  }

  // Public method to pan the view to center on specific field coordinates (inches)
  export function panToField(fx: number, fy: number) {
    const factor = get(fieldZoom);
    // Calculate required pan to center the point
    // x(v) = center - halfW + pan + (v/SIZE)*W
    // target x(v) = center => pan = halfW - (v/SIZE)*W = W * (0.5 - v/SIZE)
    const px = width * factor * (0.5 - fx / FIELD_SIZE);

    // y(v) = center + halfH + pan - (v/SIZE)*H
    // target y(v) = center => pan = (v/SIZE)*H - halfH = H * (v/SIZE - 0.5)
    const py = height * factor * (fy / FIELD_SIZE - 0.5);

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

    // Only allow if clicking empty space (currentElem is null)
    if (currentElem) return;

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

    // Get items from registry
    const registryItems = get(fieldContextMenuRegistry);
    if (!registryItems || registryItems.length === 0) return;

    const validItems = registryItems.filter((item) => {
      if (item.condition) {
        return item.condition({ x: fieldX, y: fieldY });
      }
      return true;
    });

    if (validItems.length === 0) return;

    // Map to ContextMenu format
    contextMenuItems = validItems.map((item) => ({
      label: item.label,
      icon: item.icon,
      onClick: () => {
        item.onClick({ x: fieldX, y: fieldY });
        showContextMenu = false;
      },
    }));

    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    showContextMenu = true;
  }

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", updateRects);
      window.removeEventListener("scroll", updateRects, true);
    }
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
    {#if !isDiffMode}
      <img
        src={settings.robotImage || "/robot.png"}
        alt="Robot"
        class="max-w-none"
        style={`position: absolute; top: ${y(robotXY.y)}px;
left: ${x(robotXY.x)}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none;`}
        draggable="false"
        on:error={(e) => {
          // @ts-ignore
          e.target.src = "/robot.png";
        }}
      />
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
      <img
        src={settings.robotImage || "/robot.png"}
        alt="Ghost Robot"
        class="max-w-none grayscale opacity-50"
        style={`position: absolute; top: ${y(ghostRobotState.y)}px;
left: ${x(ghostRobotState.x)}px; transform: translate(-50%, -50%) rotate(${ghostRobotState.heading}deg); z-index: 19; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none; border: 2px dashed #6b7280; border-radius: 4px;`}
        draggable="false"
        on:error={(e) => {
          // @ts-ignore
          e.target.src = "/robot.png";
        }}
      />
    {/if}
  </div>
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
