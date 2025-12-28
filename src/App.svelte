<script lang="ts">
  import type {
    Line,
    BasePoint,
    Settings,
    Point,
    SequenceItem,
    Shape,
  } from "./types";
  import * as d3 from "d3";
  import {
    snapToGrid,
    gridSize,
    currentFilePath,
    isUnsaved,
    showGrid,
    showProtractor,
    showShortcuts,
    showSettings,
    exportDialogState,
  } from "./stores";
  import Two from "two.js";
  import type { Path } from "two.js/src/path";
  import type { Line as PathLine } from "two.js/src/shapes/line";
  import ControlTab from "./lib/ControlTab.svelte";
  import Navbar from "./lib/Navbar.svelte";
  import MathTools from "./lib/MathTools.svelte";
  import FieldCoordinates from "./lib/components/FieldCoordinates.svelte";
  import _ from "lodash";
  import hotkeys from "hotkeys-js";
  import { createAnimationController } from "./utils/animation";
  import { calculatePathTime, getAnimationDuration } from "./utils";

  import {
    calculateRobotState,
    generateGhostPathPoints,
    generateOnionLayers,
  } from "./utils";
  import {
    easeInOutQuad,
    getCurvePoint,
    getRandomColor,
    quadraticToCubic,
    radiansToDegrees,
    shortestRotation,
    downloadTrajectory,
    loadTrajectoryFromFile,
    loadRobotImage,
    updateRobotImageDisplay,
  } from "./utils";
  import {
    POINT_RADIUS,
    LINE_WIDTH,
    DEFAULT_ROBOT_WIDTH,
    DEFAULT_ROBOT_HEIGHT,
    DEFAULT_SETTINGS,
    FIELD_SIZE,
    getDefaultStartPoint,
    getDefaultLines,
    getDefaultShapes,
    DEFAULT_KEY_BINDINGS,
  } from "./config";
  import { loadSettings, saveSettings } from "./utils/settingsPersistence";
  import { exportPathToGif } from "./utils/exportGif";
  import { onMount, tick, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { debounce } from "lodash";
  import { createHistory, type AppState } from "./utils/history";
  // Electron API type (defined in preload.js, attached to window)
  interface ElectronAPI {
    writeFile: (filePath: string, content: string) => Promise<boolean>;
    writeFileBase64?: (
      filePath: string,
      base64Content: string,
    ) => Promise<boolean>;
    showSaveDialog?: (options: any) => Promise<string | null>;
    getDirectory?: () => Promise<string>;
    fileExists?: (filePath: string) => Promise<boolean>;
    readFile?: (filePath: string) => Promise<string>;
    onMenuAction?: (callback: (action: string) => void) => void;
  }

  // Access electron API from window (attached by preload script)
  const electronAPI = (window as any).electronAPI as ElectronAPI | undefined;

  function normalizeLines(input: Line[]): Line[] {
    return (input || []).map((line) => ({
      ...line,
      id: line.id || `line-${Math.random().toString(36).slice(2)}`,
      controlPoints: line.controlPoints || [],
      eventMarkers: line.eventMarkers || [],
      color: line.color || getRandomColor(),
      name: line.name || "",
      waitBeforeMs: Math.max(
        0,
        Number(line.waitBeforeMs ?? line.waitBefore?.durationMs ?? 0),
      ),
      waitAfterMs: Math.max(
        0,
        Number(line.waitAfterMs ?? line.waitAfter?.durationMs ?? 0),
      ),
      waitBeforeName: line.waitBeforeName ?? line.waitBefore?.name ?? "",
      waitAfterName: line.waitAfterName ?? line.waitAfter?.name ?? "",
    }));
  }

  // Canvas state
  let two: Two;
  let twoElement: HTMLDivElement;
  let wrapperDiv: HTMLDivElement;
  let width = 0;
  let height = 0;
  let innerWidth = 0;
  let innerHeight = 0;

  // Layout State
  let showSidebar = true;
  let mainContentHeight = 0;
  let mainContentWidth = 0;
  let mainContentDiv: HTMLDivElement;

  // Initial field width constraint (pixel value)
  let userFieldLimit: number | null = null;
  // Initial field height constraint (pixel value) for mobile
  let userFieldHeightLimit: number | null = null;

  // Drag State
  let resizeMode: "horizontal" | "vertical" | null = null;

  $: isLargeScreen = innerWidth >= 1024; // lg breakpoint

  // Initialize defaults once content is loaded
  $: if (userFieldLimit === null && mainContentWidth > 0 && isLargeScreen) {
    userFieldLimit = mainContentWidth * 0.49; // Default to ~50% width so control tab is larger
  }

  $: if (
    userFieldHeightLimit === null &&
    mainContentHeight > 0 &&
    !isLargeScreen
  ) {
    // Default to roughly 60% of available height
    userFieldHeightLimit = mainContentHeight * 0.6;
  }

  // Minimum sidebar width in pixels
  const MIN_SIDEBAR_WIDTH = 320;
  const MIN_FIELD_PANE_WIDTH = 300;

  // --- Split Pane Logic ---

  // 1. Calculate the width of the Left Pane (Field Container)
  $: leftPaneWidth = (() => {
    if (!isLargeScreen) return mainContentWidth; // Full width on mobile
    if (!showSidebar) return mainContentWidth; // Full width if sidebar hidden

    let targetWidth = userFieldLimit ?? mainContentWidth * 0.55;

    // Clamp values
    const maxWidth = mainContentWidth - MIN_SIDEBAR_WIDTH;
    const minWidth = MIN_FIELD_PANE_WIDTH;

    if (maxWidth < minWidth) return mainContentWidth * 0.5;

    return Math.max(minWidth, Math.min(targetWidth, maxWidth));
  })();

  // 2. Calculate the size of the actual Field Square
  $: fieldDrawSize = (() => {
    if (!isLargeScreen) {
      // Mobile
      const heightLimit = userFieldHeightLimit ?? mainContentHeight * 0.6;
      return Math.min(innerWidth - 32, heightLimit - 16);
    }

    // Desktop
    const availableW = leftPaneWidth - 16;
    const availableH = mainContentHeight - 16;

    return Math.max(100, Math.min(availableW, availableH));
  })();

  function startHorizontalResize(e: MouseEvent | TouchEvent) {
    if (!isLargeScreen || !showSidebar) return;
    resizeMode = "horizontal";
  }

  function startVerticalResize(e: MouseEvent | TouchEvent) {
    if (isLargeScreen || !showSidebar) return;
    resizeMode = "vertical";
  }

  function handleResize(clientX: number, clientY: number) {
    if (!resizeMode) return;

    if (resizeMode === "horizontal") {
      userFieldLimit = clientX;
    } else if (resizeMode === "vertical" && mainContentDiv) {
      const rect = mainContentDiv.getBoundingClientRect();
      // Calculate height relative to the top of the main content area
      const newHeight = clientY - rect.top;
      // Clamp values
      const minHeight = 200;
      const maxHeight = rect.height - 100; // Keep at least 100px for control tab
      userFieldHeightLimit = Math.max(
        minHeight,
        Math.min(newHeight, maxHeight),
      );
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!resizeMode) return;
    e.preventDefault();
    handleResize(e.clientX, e.clientY);
  }

  function onTouchMove(e: TouchEvent) {
    if (!resizeMode) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    handleResize(touch.clientX, touch.clientY);
  }

  function stopResize() {
    resizeMode = null;
  }

  // Robot state
  $: robotWidth = settings?.rWidth || DEFAULT_ROBOT_WIDTH;
  $: robotHeight = settings?.rHeight || DEFAULT_ROBOT_HEIGHT;
  let robotXY: BasePoint = { x: 0, y: 0 };
  let robotHeading: number = 0;
  // Animation state
  let percent: number = 0;
  let playing = false;
  let animationFrame: number;
  let startTime: number | null = null;
  let previousTime: number | null = null;
  // Path data
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let startPoint: Point = getDefaultStartPoint();
  let lines: Line[] = normalizeLines(getDefaultLines());
  let sequence: SequenceItem[] = lines.map((ln) => ({
    kind: "path",
    lineId: ln.id!,
  }));
  let shapes: Shape[] = getDefaultShapes();
  let previewOptimizedLines: Line[] | null = null;

  let currentMouseX = 0;
  let currentMouseY = 0;
  let isMouseOverField = false;
  let isObstructingHUD = false;

  const history = createHistory();
  const { canUndoStore, canRedoStore } = history;

  function getAppState(): AppState {
    return {
      startPoint,
      lines,
      shapes,
      sequence,
      settings,
    };
  }

  // Clicking anywhere outside a wait row/marker should clear wait selection highlight
  function handleDocClick(e: MouseEvent) {
    const sel = get(selectedPointId);
    if (!sel || !sel.startsWith("wait-")) return;

    let el = e.target as Element | null;
    while (el) {
      // Keep selection if clicking inside a sidebar WaitRow
      if (el.classList && el.classList.contains("wait-row")) return;
      // Keep selection if clicking a wait marker on the canvas
      if (
        el.id &&
        (el.id.startsWith("wait-") || el.id.startsWith("wait-event-"))
      )
        return;
      el = el.parentElement;
    }

    // Click was outside wait UI -> clear wait selection
    selectedPointId.set(null);
  }

  // Ensure we remove document handlers when component is destroyed
  onDestroy(() => {
    document.removeEventListener("click", handleDocClick);
  });

  // Use the stores for reactivity
  $: canUndo = $canUndoStore;
  $: canRedo = $canRedoStore;

  // Helper to transform mouse coordinates based on rotation
  function getTransformedCoordinates(
    clientX: number,
    clientY: number,
    rect: DOMRect,
    rotation: number,
  ) {
    // 1. Get coordinates relative to the bounding box (Top-Left of visual box)
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    // 2. Center them
    const w = rect.width;
    const h = rect.height;
    const cx = px - w / 2;
    const cy = py - h / 2;

    // 3. Rotate BACKWARDS (undo the container rotation)
    // If container is rotated by R, we rotate by -R to find original coords
    const rad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const nx = cx * cos - cy * sin;
    const ny = cx * sin + cy * cos;

    // 4. Un-center (relative to original Top-Left)
    const newPx = nx + w / 2;
    const newPy = ny + h / 2;

    return { x: newPx, y: newPy };
  }

  function recordChange() {
    // Hide optimization preview when a manual change is made
    previewOptimizedLines = null;

    history.record(getAppState());
    // Mark as unsaved when a change is recorded
    if (isLoaded) {
      isUnsaved.set(true);
    }
  }

  function undoAction() {
    const prev = history.undo();
    if (prev) {
      startPoint = prev.startPoint;
      lines = prev.lines;
      shapes = prev.shapes;
      sequence = prev.sequence;
      settings = prev.settings;
      // Check if we're back to the saved state
      const currentState = getCurrentState();
      if (currentState === lastSavedState) {
        isUnsaved.set(false);
      } else {
        isUnsaved.set(true);
      }
      two && two.update();
    }
  }

  function redoAction() {
    const next = history.redo();
    if (next) {
      startPoint = next.startPoint;
      lines = next.lines;
      shapes = next.shapes;
      sequence = next.sequence;
      settings = next.settings;
      // Check if we're back to the saved state
      const currentState = getCurrentState();
      if (currentState === lastSavedState) {
        isUnsaved.set(false);
      } else {
        isUnsaved.set(true);
      }
      two && two.update();
    }
  }

  $: {
    // Ensure arrays are reactive when items are added/removed
    lines = lines;
    shapes = shapes;
  }

  // Two.js groups
  let lineGroup = new Two.Group();
  lineGroup.id = "line-group";
  let pointGroup = new Two.Group();
  pointGroup.id = "point-group";
  let shapeGroup = new Two.Group();
  shapeGroup.id = "shape-group";
  // Event markers group (rendered above points)
  let eventGroup = new Two.Group();
  eventGroup.id = "event-group";
  // Coordinate converters
  let x: d3.ScaleLinear<number, number, number>;

  // Animation controller
  let loopAnimation = true;
  let animationController: ReturnType<typeof createAnimationController>;
  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);
  let playbackSpeed = 1.0; // 1x by default
  $: animationDuration = getAnimationDuration(
    timePrediction.totalTime / 1000,
    playbackSpeed,
  );
  /**
   * Converter for X axis from inches to pixels.
   */
  $: x = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([0, width || FIELD_SIZE]);
  /**
   * Converter for Y axis from inches to pixels.
   */
  $: y = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([height || FIELD_SIZE, 0]);
  $: {
    // Calculate robot state using the Timeline
    if (timePrediction && timePrediction.timeline && lines.length > 0) {
      const state = calculateRobotState(
        percent,
        timePrediction.timeline,
        lines,
        startPoint,
        x,
        y,
      );
      robotXY = { x: state.x, y: state.y };
      robotHeading = state.heading;
    } else {
      // Fallback for initialization
      robotXY = { x: x(startPoint.x), y: y(startPoint.y) };
      robotHeading = 0;
    }
  }

  $: points = (() => {
    let _points = [];
    let startPointElem = new Two.Circle(
      x(startPoint.x),
      y(startPoint.y),
      x(POINT_RADIUS),
    );
    startPointElem.id = `point-0-0`;
    startPointElem.fill = lines[0].color;
    startPointElem.noStroke();

    _points.push(startPointElem);

    lines.forEach((line, idx) => {
      if (!line || !line.endPoint) return; // Skip invalid lines or lines without endPoint
      [line.endPoint, ...line.controlPoints].forEach((point, idx1) => {
        if (idx1 > 0) {
          let pointGroup = new Two.Group();
          pointGroup.id = `point-${idx + 1}-${idx1}`;

          let pointElem = new Two.Circle(
            x(point.x),
            y(point.y),
            x(POINT_RADIUS),
          );
          pointElem.id = `point-${idx + 1}-${idx1}-background`;
          pointElem.fill = line.color;
          pointElem.noStroke();

          let pointText = new Two.Text(
            `${idx1}`,
            x(point.x),
            y(point.y - 0.15),
            x(POINT_RADIUS),
          );
          pointText.id = `point-${idx + 1}-${idx1}-text`;
          pointText.size = x(1.55);
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
            x(POINT_RADIUS),
          );
          pointElem.id = `point-${idx + 1}-${idx1}`;
          pointElem.fill = line.color;
          pointElem.noStroke();
          _points.push(pointElem);
        }
      });
    });
    // Add obstacle vertices as draggable points
    shapes.forEach((shape, shapeIdx) => {
      shape.vertices.forEach((vertex, vertexIdx) => {
        let pointGroup = new Two.Group();
        pointGroup.id = `obstacle-${shapeIdx}-${vertexIdx}`;

        let pointElem = new Two.Circle(
          x(vertex.x),
          y(vertex.y),
          x(POINT_RADIUS),
        );
        pointElem.id = `obstacle-${shapeIdx}-${vertexIdx}-background`;
        pointElem.fill = "#991b1b"; // Match obstacle color
        pointElem.noStroke();

        let pointText = new Two.Text(
          `${vertexIdx + 1}`,
          x(vertex.x),
          y(vertex.y - 0.15),
          x(POINT_RADIUS),
        );
        pointText.id = `obstacle-${shapeIdx}-${vertexIdx}-text`;
        pointText.size = x(1.55);
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

  $: path = (() => {
    let _path: (Path | PathLine)[] = [];

    lines.forEach((line, idx) => {
      if (!line || !line.endPoint) return; // Skip invalid lines or lines without endPoint
      let _startPoint =
        idx === 0 ? startPoint : lines[idx - 1]?.endPoint || null;
      if (!_startPoint) return; // Skip if previous line's endPoint is missing

      let lineElem: Path | PathLine;
      if (line.controlPoints.length > 2) {
        // Approximate an n-degree bezier curve by sampling it at 100 points
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

      lineElem.id = `line-${idx + 1}`;
      lineElem.stroke = line.color;
      lineElem.linewidth = x(LINE_WIDTH);
      lineElem.noFill();
      // Add a dashed line for locked paths
      if (line.locked) {
        lineElem.dashes = [x(2), x(2)];
        lineElem.opacity = 0.7;
      } else {
        lineElem.dashes = [];
        lineElem.opacity = 1;
      }

      _path.push(lineElem);
    });

    return _path;
  })();
  $: shapeElements = (() => {
    let _shapes: Path[] = [];

    shapes.forEach((shape, idx) => {
      if (shape.vertices.length >= 3) {
        // Create polygon from vertices - properly format for Two.js
        let vertices = [];

        // Start with move command for first vertex
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

        // Add line commands for remaining vertices
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

        // Close the shape
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
        shapeElement.stroke = shape.color;
        shapeElement.fill = shape.color;
        shapeElement.opacity = 0.4;
        shapeElement.linewidth = x(0.8);
        shapeElement.automatic = false;

        _shapes.push(shapeElement);
      }
    });

    return _shapes;
  })();

  $: ghostPathElement = (() => {
    let ghostPath: Path | null = null;

    if (settings.showGhostPaths && lines.length > 0) {
      const ghostPoints = generateGhostPathPoints(
        startPoint,
        lines,
        settings.rWidth,
        settings.rHeight,
        50,
      );

      if (ghostPoints.length >= 3) {
        // Create polygon from ghost path points
        let vertices = [];

        // Start with move command for first point
        vertices.push(
          new Two.Anchor(
            x(ghostPoints[0].x),
            y(ghostPoints[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.move,
          ),
        );

        // Add line commands for remaining points
        for (let i = 1; i < ghostPoints.length; i++) {
          vertices.push(
            new Two.Anchor(
              x(ghostPoints[i].x),
              y(ghostPoints[i].y),
              0,
              0,
              0,
              0,
              Two.Commands.line,
            ),
          );
        }

        // Close the shape
        vertices.push(
          new Two.Anchor(
            x(ghostPoints[0].x),
            y(ghostPoints[0].y),
            0,
            0,
            0,
            0,
            Two.Commands.close,
          ),
        );

        vertices.forEach((point) => (point.relative = false));

        ghostPath = new Two.Path(vertices);
        ghostPath.id = "ghost-path";
        ghostPath.stroke = "#a78bfa"; // Light purple/lavender
        ghostPath.fill = "#a78bfa";
        ghostPath.opacity = 0.15;
        ghostPath.linewidth = x(0.5);
        ghostPath.automatic = false;
      }
    }

    return ghostPath;
  })();

  $: onionLayerElements = (() => {
    let onionLayers: Path[] = [];

    if (settings.showOnionLayers && lines.length > 0) {
      const spacing = settings.onionLayerSpacing || 6;
      const layers = generateOnionLayers(
        startPoint,
        lines,
        settings.rWidth,
        settings.rHeight,
        spacing,
      );

      layers.forEach((layer, idx) => {
        // Create a rectangle from the robot corners
        let vertices = [];

        // Create path from corners: front-left -> front-right -> back-right -> back-left
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

        // Close the shape
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
        onionRect.stroke = "#818cf8"; // Indigo color
        onionRect.noFill();
        onionRect.opacity = 0.35;
        onionRect.linewidth = x(0.5);
        onionRect.automatic = false;

        onionLayers.push(onionRect);
      });
    }

    return onionLayers;
  })();

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
        lineElem.stroke = "#60a5fa"; // Blue for preview
        lineElem.linewidth = x(LINE_WIDTH);
        lineElem.noFill();
        lineElem.dashes = [x(4), x(4)]; // Dashed to show it's a preview
        lineElem.opacity = 0.7;

        _previewPaths.push(lineElem);
      });
    }

    return _previewPaths;
  })();

  // Event markers
  $: eventMarkerElements = (() => {
    let markers: Two.Group[] = [];

    lines.forEach((line, idx) => {
      if (
        !line ||
        !line.endPoint ||
        !line.eventMarkers ||
        line.eventMarkers.length === 0
      )
        return;
      const _startPoint =
        idx === 0 ? startPoint : lines[idx - 1]?.endPoint || null;
      if (!_startPoint) return;

      line.eventMarkers.forEach((ev, evIdx) => {
        const t = Math.max(0, Math.min(1, ev.position ?? 0.5));
        let pos = { x: 0, y: 0 } as { x: number; y: number };

        if (line.controlPoints.length > 0) {
          const cps = [_startPoint, ...line.controlPoints, line.endPoint];
          const pt = getCurvePoint(t, cps);
          pos.x = pt.x;
          pos.y = pt.y;
        } else {
          // Linear interpolation for straight lines
          pos.x = _startPoint.x + (line.endPoint.x - _startPoint.x) * t;
          pos.y = _startPoint.y + (line.endPoint.y - _startPoint.y) * t;
        }

        const px = x(pos.x);
        const py = y(pos.y);

        let grp = new Two.Group();
        grp.id = `event-${idx}-${evIdx}`;

        let circle = new Two.Circle(px, py, x(1.8));
        // Make events purple by default
        circle.fill = "#a78bfa"; // purple
        circle.noStroke();

        // let label = new Two.Text(prettyName, px + x(2), py - x(1.5));
        // label.size = x(1.8);
        // label.family = "ui-sans-serif, system-ui, sans-serif";
        // label.fill = "#8b5cf6"; // darker purple
        // label.noStroke();

        grp.add(circle);
        markers.push(grp);
      });
    });

    return markers;
  })();

  // Attach Two.js elements to the scene so they are visible
  $: if (two) {
    // Clear previous children from groups
    while (shapeGroup.children.length)
      shapeGroup.remove(shapeGroup.children[0]);
    while (lineGroup.children.length) lineGroup.remove(lineGroup.children[0]);
    while (pointGroup.children.length)
      pointGroup.remove(pointGroup.children[0]);

    // Add shapes and overlays (back-to-front)
    if (Array.isArray(shapeElements)) {
      shapeElements.forEach((el) => shapeGroup.add(el));
    }
    if (ghostPathElement) shapeGroup.add(ghostPathElement);
    onionLayerElements.forEach((el) => shapeGroup.add(el));

    // Add main lines and preview lines
    path.forEach((el) => lineGroup.add(el));
    previewPathElements.forEach((el) => lineGroup.add(el));

    // Add points (start point, end points, control points, obstacles)
    points.forEach((el) => pointGroup.add(el));

    // Add event markers above points
    while (eventGroup.children.length)
      eventGroup.remove(eventGroup.children[0]);
    eventMarkerElements.forEach((el) => eventGroup.add(el));

    // Re-add groups to the renderer in desired z-order (shapes -> lines -> points -> events)
    try {
      two.remove(shapeGroup);
    } catch (e) {}
    two.add(shapeGroup);
    try {
      two.remove(lineGroup);
    } catch (e) {}
    two.add(lineGroup);
    try {
      two.remove(pointGroup);
    } catch (e) {}
    two.add(pointGroup);
    try {
      two.remove(eventGroup);
    } catch (e) {}
    two.add(eventGroup);

    two.update();
  }

  let isLoaded = false;
  let lastSavedState: string = "";

  // Function to get current state as JSON
  function getCurrentState(): string {
    return JSON.stringify({
      startPoint,
      lines,
      shapes,
      sequence,
      settings,
    });
  }

  // Allow the app to stabilize before tracking changes
  onMount(() => {
    setTimeout(() => {
      isLoaded = true;
      recordChange();
    }, 500);
  });
  onMount(async () => {
    // Load saved settings
    const savedSettings = await loadSettings();
    settings = { ...savedSettings };

    // Robot dimensions come from reactive declarations; no explicit assignment required
    // (avoids cyclical reactive dependency)
  });
  // Debounced save function
  const debouncedSaveSettings = debounce(async (settingsToSave: Settings) => {
    await saveSettings(settingsToSave);
  }, 1000);
  // Save after 1 second of inactivity

  // Watch for settings changes and save
  $: {
    if (settings) {
      debouncedSaveSettings(settings);
    }
  }

  // Initialize animation controller
  onMount(() => {
    animationController = createAnimationController(
      animationDuration,
      (newPercent) => {
        percent = newPercent;
      },
      () => {
        // Animation completed callback
        console.log("Animation completed");
        playing = false;
      },
    );
  });
  $: if (animationController) {
    animationController.setDuration(animationDuration);
  }

  $: if (animationController) {
    animationController.setLoop(loopAnimation);
    // Sync UI state with controller
    playing = animationController.isPlaying();
  }

  // Helper to manage recent files
  function addToRecentFiles(path: string) {
    if (!settings.recentFiles) {
      settings.recentFiles = [];
    }

    // Remove if already exists (to move to top)
    const existingIndex = settings.recentFiles.indexOf(path);
    if (existingIndex !== -1) {
      settings.recentFiles.splice(existingIndex, 1);
    }

    // Add to top
    settings.recentFiles.unshift(path);

    // Cap at 10
    if (settings.recentFiles.length > 10) {
      settings.recentFiles = settings.recentFiles.slice(0, 10);
    }

    // Trigger reactivity
    settings = { ...settings };
  }

  async function loadRecentFile(path: string) {
    if (!electronAPI || !electronAPI.readFile) {
      alert("Cannot load files in this environment");
      return;
    }

    try {
      // Check if file exists
      if (electronAPI.fileExists && !(await electronAPI.fileExists(path))) {
        if (
          confirm(
            `File not found: ${path}\nDo you want to remove it from recent files?`,
          )
        ) {
          settings.recentFiles = settings.recentFiles?.filter(
            (p) => p !== path,
          );
          settings = { ...settings };
        }
        return;
      }

      const content = await electronAPI.readFile(path);
      const data = JSON.parse(content);
      loadData(data);
      currentFilePath.set(path);
      addToRecentFiles(path);
    } catch (err) {
      console.error("Error loading recent file:", err);
      alert("Failed to load file: " + (err as Error).message);
    }
  }

  // Save Function
  async function saveProject() {
    if ($currentFilePath && electronAPI) {
      try {
        const jsonString = JSON.stringify({
          startPoint,
          lines,
          sequence,
          shapes,
          settings,
        });
        await electronAPI.writeFile($currentFilePath, jsonString);
        lastSavedState = getCurrentState();
        isUnsaved.set(false);
        addToRecentFiles($currentFilePath);
        console.log("Saved to", $currentFilePath);
      } catch (e) {
        console.error("Failed to save", e);
        alert("Failed to save file.");
      }
    } else {
      saveFile();
    }
  }

  // Helper: return true if user is typing in an input-like element
  function isUIElementFocused(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return (
      ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag) ||
      el.getAttribute("role") === "button" ||
      (el as any).isContentEditable
    );
  }

  function stepForward() {
    if (isUIElementFocused()) return;
    percent = Math.min(100, percent + 1);
    handleSeek(percent);
  }

  function stepBackward() {
    if (isUIElementFocused()) return;
    percent = Math.max(0, percent - 1);
    handleSeek(percent);
  }

  function cycleGridSize() {
    const options = [1, 3, 6, 12, 24];
    const current = $gridSize || options[0];
    const idx = options.indexOf(current);
    const next = options[(idx + 1) % options.length];
    gridSize.set(next);
  }

  function cycleGridSizeReverse() {
    const options = [1, 3, 6, 12, 24];
    const current = $gridSize || options[0];
    const idx = options.indexOf(current);
    const prev = options[(idx - 1 + options.length) % options.length];
    gridSize.set(prev);
  }

  // Hotkey management
  function getKey(action: string): string {
    const bindings = settings?.keyBindings || DEFAULT_KEY_BINDINGS;
    const binding = bindings.find((b) => b.action === action);
    return binding ? binding.key : "";
  }

  // Register hotkeys dynamically
  $: {
    if (settings && settings.keyBindings) {
      // Unbind all previous keys (simplification: we just unbind all we know)
      // Since hotkeys-js doesn't have a "unbind all", we rely on rebinding overriding
      // or explicit unbind if we track them. For now, we'll just register.
      // A better approach in Svelte is to use a reactive block that manages binding/unbinding.

      // Unbind everything first to avoid duplicates if keys change
      hotkeys.unbind();

      // Helper to safely bind
      const bind = (action: string, handler: (e: KeyboardEvent) => void) => {
        const key = getKey(action);
        if (key) {
          hotkeys(key, (e) => {
            // Avoid acting when a UI element (input/select/textarea/button) is focused
            if (isUIElementFocused()) return;
            e.preventDefault();
            handler(e);
          });
        }
      };

      bind("saveProject", () => saveProject());
      bind("saveFileAs", () => saveFileAs());
      bind("exportGif", () => exportGif());
      bind("addNewLine", () => addNewLine());
      bind("addWait", () => addWait());
      bind("addEventMarker", () => addEventMarker());
      bind("addControlPoint", () => {
        addControlPoint();
      });
      bind("removeControlPoint", () => {
        removeControlPoint();
      });

      bind("removeSelected", () => {
        removeSelected();
      });
      bind("undo", () => undoAction());
      bind("redo", () => redoAction());

      bind("resetAnimation", () => resetAnimation());
      bind("stepForward", () => stepForward());
      bind("stepBackward", () => stepBackward());

      bind("movePointUp", () => movePoint(0, 1));
      bind("movePointDown", () => movePoint(0, -1));
      bind("movePointLeft", () => movePoint(-1, 0));
      bind("movePointRight", () => movePoint(1, 0));

      bind("selectNext", () => cycleSelection(1));
      bind("selectPrev", () => cycleSelection(-1));

      bind("increaseValue", () => modifyValue(1));
      bind("decreaseValue", () => modifyValue(-1));

      bind("toggleOnion", () => {
        settings.showOnionLayers = !settings.showOnionLayers;
        settings = { ...settings };
      });

      bind("toggleGrid", () => showGrid.update((v) => !v));
      bind("cycleGridSize", () => cycleGridSize());
      bind("cycleGridSizeReverse", () => cycleGridSizeReverse());
      bind("toggleSnap", () => snapToGrid.update((v) => !v));
      bind("increasePlaybackSpeed", () => changePlaybackSpeedBy(0.25));
      bind("decreasePlaybackSpeed", () => changePlaybackSpeedBy(-0.25));
      bind("resetPlaybackSpeed", () => resetPlaybackSpeed());
      bind("toggleProtractor", () => showProtractor.update((v) => !v));
      bind("toggleCollapseAll", () =>
        toggleCollapseAllTrigger.update((v) => v + 1),
      );
      bind("showHelp", () => showShortcuts.update((v) => !v));

      // Toggle play needs special handling to avoid conflict with spacebar scrolling?
      // hotkeys-js usually handles space well.
      // But we had a document listener for Space before. Let's move it here.
      const playKey = getKey("togglePlay");
      if (playKey) {
        hotkeys(playKey, (e) => {
          // Avoid toggling play when the user is interacting with UI elements
          if (
            document.activeElement &&
            (document.activeElement.tagName === "INPUT" ||
              document.activeElement.tagName === "TEXTAREA" ||
              document.activeElement.tagName === "SELECT" ||
              document.activeElement.tagName === "BUTTON" ||
              document.activeElement.getAttribute("role") === "button")
          ) {
            return;
          }
          e.preventDefault();
          if (playing) pause();
          else play();
        });
      }
    }
  }
  $: {
    // This handles both 'travel' (movement) and 'wait' (stationary rotation) events.
    if (timePrediction && timePrediction.timeline && lines.length > 0) {
      const state = calculateRobotState(
        percent,
        timePrediction.timeline,
        lines,
        startPoint,
        x,
        y,
      );
      robotXY = { x: state.x, y: state.y };
      robotHeading = state.heading;
    } else {
      // Fallback for initialization or empty state
      robotXY = { x: x(startPoint.x), y: y(startPoint.y) };
      // Calculate initial heading based on start point settings
      if (startPoint.heading === "linear") robotHeading = -startPoint.startDeg;
      else if (startPoint.heading === "constant")
        robotHeading = -startPoint.degrees;
      else robotHeading = 0;
    }
  }

  $: eventMarkers = (() => {
    const markers: any[] = [];

    // Path-based markers
    lines.forEach((line, lineIdx) => {
      if (!line || !line.endPoint) return; // Skip invalid lines or lines without endPoint
      if (line.eventMarkers && line.eventMarkers.length > 0) {
        line.eventMarkers.forEach((event, eventIdx) => {
          // Get the correct start point for this line
          const lineStart =
            lineIdx === 0 ? startPoint : lines[lineIdx - 1]?.endPoint || null;
          if (!lineStart) return; // Skip if previous line's endPoint is missing
          const curvePoints = [lineStart, ...line.controlPoints, line.endPoint];
          const eventPosition = getCurvePoint(event.position, curvePoints);

          // Create marker visualization
          const markerGroup = new Two.Group();
          markerGroup.id = `event-${lineIdx}-${eventIdx}`;

          // Create a circle for the marker
          const markerCircle = new Two.Circle(
            x(eventPosition.x),
            y(eventPosition.y),
            x(POINT_RADIUS * 1.3), // Slightly larger than normal points
          );
          markerCircle.id = `event-circle-${lineIdx}-${eventIdx}`;
          markerCircle.fill = "#8b5cf6"; // Purple color
          markerCircle.stroke = "#ffffff";
          markerCircle.linewidth = x(0.3);
          // Create a flag/icon inside
          const flagSize = x(1);
          const flagPoints = [
            new Two.Anchor(
              x(eventPosition.x),
              y(eventPosition.y) - flagSize / 2,
            ),
            new Two.Anchor(
              x(eventPosition.x) + flagSize / 2,
              y(eventPosition.y),
            ),
            new Two.Anchor(
              x(eventPosition.x),
              y(eventPosition.y) + flagSize / 2,
            ),
          ];
          const flag = new Two.Path(flagPoints, true);
          flag.fill = "#ffffff";
          flag.stroke = "none";
          flag.id = `event-flag-${lineIdx}-${eventIdx}`;

          markerGroup.add(markerCircle, flag);
          markers.push(markerGroup);
        });
      }
    });

    // Wait-based markers: draw at the wait's point
    if (
      timePrediction &&
      timePrediction.timeline &&
      sequence &&
      sequence.length > 0
    ) {
      const waitById = new Map<string, any>();
      sequence.forEach((it) => {
        if (it.kind === "wait") waitById.set(it.id, it);
      });

      timePrediction.timeline.forEach((ev, tIdx) => {
        if (ev.type !== "wait" || !ev.waitId || !ev.atPoint) return;
        const seqWait = waitById.get(ev.waitId);
        if (
          !seqWait ||
          !seqWait.eventMarkers ||
          seqWait.eventMarkers.length === 0
        )
          return;

        const point = ev.atPoint;
        seqWait.eventMarkers.forEach((event: any, eventIdx: number) => {
          const markerGroup = new Two.Group();
          markerGroup.id = `wait-event-${ev.waitId}-${eventIdx}`;

          const markerCircle = new Two.Circle(
            x(point.x),
            y(point.y),
            x(POINT_RADIUS * 1.3),
          );
          markerCircle.id = `wait-event-circle-${ev.waitId}-${eventIdx}`;

          // If this wait is selected, apply a visual highlight
          const waitSelected = $selectedPointId === `wait-${ev.waitId}`;
          if (waitSelected) {
            markerCircle.fill = "#f97316"; // orange
            markerCircle.stroke = "#fffbeb";
            markerCircle.linewidth = x(0.6);
          } else {
            markerCircle.fill = "#8b5cf6";
            markerCircle.stroke = "#ffffff";
            markerCircle.linewidth = x(0.3);
          }

          const flagSize = x(1);
          const flagPoints = [
            new Two.Anchor(x(point.x), y(point.y) - flagSize / 2),
            new Two.Anchor(x(point.x) + flagSize / 2, y(point.y)),
            new Two.Anchor(x(point.x), y(point.y) + flagSize / 2),
          ];
          const flag = new Two.Path(flagPoints, true);
          flag.fill = waitSelected ? "#fffbeb" : "#ffffff";
          flag.stroke = "none";
          flag.id = `wait-event-flag-${ev.waitId}-${eventIdx}`;

          markerGroup.add(markerCircle, flag);
          markers.push(markerGroup);
        });
      });
    }

    return markers;
  })();

  $: (() => {
    if (!two) {
      return;
    }

    two.renderer.domElement.style["z-index"] = "30";
    two.renderer.domElement.style["position"] = "absolute";
    two.renderer.domElement.style["top"] = "0px";
    two.renderer.domElement.style["left"] = "0px";
    two.renderer.domElement.style["width"] = "100%";
    two.renderer.domElement.style["height"] = "100%";

    two.clear();

    two.add(...shapeElements);
    if (ghostPathElement) {
      two.add(ghostPathElement);
    }
    if (onionLayerElements.length > 0) {
      two.add(...onionLayerElements);
    }
    if (previewPathElements.length > 0) {
      two.add(...previewPathElements);
    }
    two.add(...path);
    two.add(...points);
    two.add(...eventMarkers);

    two.update();
  })();
  function saveFileAs() {
    downloadTrajectory(startPoint, lines, shapes, sequence);
  }

  // Export GIF
  async function exportGif() {
    try {
      const durationSec = animationController.getDuration();
      const fps = 15; // reasonable default

      // Simple UI feedback
      const notif = document.createElement("div");
      notif.textContent = "Exporting GIF...";
      notif.style.position = "fixed";
      notif.style.right = "16px";
      notif.style.top = "16px";
      notif.style.background = "rgba(0,0,0,0.8)";
      notif.style.color = "white";
      notif.style.padding = "8px 12px";
      notif.style.borderRadius = "6px";
      document.body.appendChild(notif);

      const fieldImageSrc = settings.fieldMap
        ? `/fields/${settings.fieldMap}`
        : "/fields/decode.webp";

      const blob = await exportPathToGif({
        two,
        animationController,
        durationSec,
        fps,
        backgroundImageSrc: fieldImageSrc,
        // Robot overlay options
        robotImageSrc: settings.robotImage || "/robot.png",
        robotWidthPx: x(robotWidth),
        robotHeightPx: x(robotHeight),
        getRobotState: (p: number) =>
          calculateRobotState(
            p,
            timePrediction.timeline,
            lines,
            startPoint,
            x,
            y,
          ),
        onProgress: (p: number) => {
          notif.textContent = `Exporting GIF... ${Math.round(p * 100)}%`;
        },
      });

      if (
        electronAPI &&
        (electronAPI as any).showSaveDialog &&
        (electronAPI as any).writeFileBase64
      ) {
        // Ask user where to save
        try {
          const destPath = await (electronAPI as any).showSaveDialog({
            defaultPath: "path.gif",
            filters: [{ name: "GIF", extensions: ["gif"] }],
          });

          if (destPath) {
            // Convert blob to base64
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                const comma = dataUrl.indexOf(",");
                resolve(dataUrl.slice(comma + 1));
              };
              reader.onerror = () =>
                reject(new Error("Failed to read blob as data URL"));
              reader.readAsDataURL(blob);
            });

            await (electronAPI as any).writeFileBase64(destPath, base64);
            notif.textContent = `GIF saved to ${destPath}`;
            setTimeout(() => notif.remove(), 2000);
            return;
          } else {
            notif.textContent = "Save canceled";
            setTimeout(() => notif.remove(), 1500);
            return;
          }
        } catch (err) {
          console.error("Error saving GIF via Electron:", err);
          alert("Failed to save GIF: " + (err as Error).message);
          notif.remove();
          return;
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "path.gif";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        notif.textContent = "GIF export complete";
        setTimeout(() => notif.remove(), 2000);
      }
    } catch (err) {
      alert("Failed to export GIF: " + (err as Error).message);
      console.error(err);
    }
  }

  function animate(timestamp: number) {
    if (!startTime) {
      startTime = timestamp;
    }

    if (previousTime !== null) {
      const deltaTime = timestamp - previousTime;
      if (percent >= 100) {
        percent = 0;
      } else {
        percent += (0.65 / lines.length) * (deltaTime * 0.1);
      }
    }

    previousTime = timestamp;

    if (playing) {
      requestAnimationFrame(animate);
    }
  }

  function play() {
    if (animationController) animationController.play();
    playing = true;
  }

  function pause() {
    if (animationController) animationController.pause();
    playing = false;
  }

  function resetAnimation() {
    if (animationController) animationController.reset();
    playing = false;
  }

  function setPlaybackSpeed(factor: number, autoPlay: boolean = true) {
    // Clamp and round to 2 decimals
    const clamped = Math.max(
      0.25,
      Math.min(3.0, Math.round(factor * 100) / 100),
    );
    playbackSpeed = clamped;
    // Recalculate animationDuration and apply to controller if ready
    const newDuration = getAnimationDuration(
      timePrediction.totalTime / 1000,
      playbackSpeed,
    );
    if (animationController) {
      animationController.setDuration(newDuration);
    }
    if (autoPlay) play();
  }

  function changePlaybackSpeedBy(delta: number) {
    setPlaybackSpeed((playbackSpeed || 1.0) + delta, true);
  }

  function resetPlaybackSpeed() {
    setPlaybackSpeed(1.0, false);
  }

  // Handle slider changes
  function handleSeek(newPercent: number) {
    if (animationController) {
      animationController.seekToPercent(newPercent);
    }
  }

  onMount(() => {
    two = new Two({
      fitted: true,
      type: Two.Types.svg,
    }).appendTo(twoElement);

    // Ensure the Two.js SVG renderer sits above the field image but below the robot
    if ((two.renderer as any)?.domElement) {
      const svgEl = (two.renderer as any).domElement as HTMLElement;
      svgEl.style.position = "absolute";
      svgEl.style.top = "0";
      svgEl.style.left = "0";
      svgEl.style.width = "100%";
      svgEl.style.height = "100%";
      // Field image uses z-index 10, robot uses 20 -> place SVG at 15
      svgEl.style.zIndex = "15";
    }

    updateRobotImageDisplay();

    let currentElem: string | null = null;
    let isDown = false;
    let dragOffset = { x: 0, y: 0 }; // Store offset to prevent snapping to center

    two.renderer.domElement.addEventListener("mouseleave", () => {
      isMouseOverField = false;
    });

    two.renderer.domElement.addEventListener("mousemove", (evt: MouseEvent) => {
      const rect = two.renderer.domElement.getBoundingClientRect();
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

      // Update coordinates display
      currentMouseX = Math.max(0, Math.min(FIELD_SIZE, rawInchXForDisplay));
      currentMouseY = Math.max(0, Math.min(FIELD_SIZE, rawInchYForDisplay));
      isMouseOverField = true;

      // Determine if mouse is visually obstructing the HUD (bottom-left corner)
      if (wrapperDiv) {
        const wrapperRect = wrapperDiv.getBoundingClientRect();
        const visualX = evt.clientX - wrapperRect.left;
        const visualY = evt.clientY - wrapperRect.top;
        const w = wrapperRect.width;
        const h = wrapperRect.height;

        // Check if mouse is in the bottom-left region
        // Define a safe zone: Left 35% and Bottom 20%
        isObstructingHUD = visualX < w * 0.35 && visualY > h * 0.8;
      }

      const elem = document.elementFromPoint(evt.clientX, evt.clientY);

      if (isDown && currentElem) {
        const line = Number(currentElem.split("-")[1]) - 1;

        // Skip dragging if the line is locked
        if (line >= 0 && lines[line]?.locked) {
          return;
        }

        // Get current store values for reactivity
        const currentGridSize = $gridSize;
        const currentSnapToGrid = $snapToGrid;
        const currentShowGrid = $showGrid;

        // Apply drag offset (in inches) to the raw mouse position
        let rawInchX = x.invert(xPos) + dragOffset.x;
        let rawInchY = y.invert(yPos) + dragOffset.y;

        let inchX = rawInchX;
        let inchY = rawInchY;

        // Always apply grid snapping when enabled
        if (currentSnapToGrid && currentShowGrid && currentGridSize > 0) {
          // Force snap to nearest grid point
          inchX = Math.round(rawInchX / currentGridSize) * currentGridSize;
          inchY = Math.round(rawInchY / currentGridSize) * currentGridSize;

          // Clamp to field boundaries
          inchX = Math.max(0, Math.min(FIELD_SIZE, inchX));
          inchY = Math.max(0, Math.min(FIELD_SIZE, inchY));
        }

        if (currentElem.startsWith("obstacle-")) {
          // Handle obstacle vertex dragging
          const parts = currentElem.split("-");
          const shapeIdx = Number(parts[1]);
          const vertexIdx = Number(parts[2]);

          shapes[shapeIdx].vertices[vertexIdx].x = inchX;
          shapes[shapeIdx].vertices[vertexIdx].y = inchY;
        } else {
          // Handle path point dragging
          const line = Number(currentElem.split("-")[1]) - 1;
          const point = Number(currentElem.split("-")[2]);

          if (line === -1) {
            // This is the starting point
            if (startPoint.locked) return;
            startPoint.x = inchX;
            startPoint.y = inchY;
          } else if (lines[line]) {
            if (point === 0 && lines[line].endPoint) {
              lines[line].endPoint.x = inchX;
              lines[line].endPoint.y = inchY;
            } else {
              if (lines[line]?.locked) return;
              lines[line].controlPoints[point - 1].x = inchX;
              lines[line].controlPoints[point - 1].y = inchY;
            }
          }
        }
      } else {
        if (elem?.id.startsWith("point") || elem?.id.startsWith("obstacle")) {
          two.renderer.domElement.style.cursor = "pointer";
          currentElem = elem.id;
        } else if (
          elem?.id &&
          (elem.id.startsWith("event-") ||
            elem.id.startsWith("event-circle-") ||
            elem.id.startsWith("event-flag-"))
        ) {
          // Normalize event element ids to a common selection id: event-<lineIdx>-<eventIdx>
          two.renderer.domElement.style.cursor = "pointer";
          const idParts = elem.id.split("-");
          // id can be 'event-2-1' (group) or 'event-circle-2-1' or 'event-flag-2-1'
          if (idParts.length >= 3) {
            const lineIdx = idParts[idParts.length - 2];
            const evIdx = idParts[idParts.length - 1];
            currentElem = `event-${lineIdx}-${evIdx}`;
          } else {
            currentElem = elem.id;
          }
        } else if (
          elem?.id &&
          (elem.id.startsWith("wait-event-") ||
            elem.id.startsWith("wait-event-circle-") ||
            elem.id.startsWith("wait-event-flag-"))
        ) {
          // Normalize wait event element ids to a common selection id: wait-event-<waitId>-<eventIdx>
          two.renderer.domElement.style.cursor = "pointer";
          const idParts = elem.id.split("-");
          // id can be 'wait-event-<waitId>-<eventIdx>' or 'wait-event-circle-<waitId>-<eventIdx>'
          if (idParts.length >= 4) {
            const waitId = idParts[idParts.length - 2];
            const evIdx = idParts[idParts.length - 1];
            currentElem = `wait-event-${waitId}-${evIdx}`;
          } else {
            currentElem = elem.id;
          }
        } else {
          two.renderer.domElement.style.cursor = "auto";
          currentElem = null;
        }
      }
    });

    document.addEventListener("click", handleDocClick);

    two.renderer.domElement.addEventListener("mousedown", (evt: MouseEvent) => {
      isDown = true;

      // If we don't have a currentElem (no prior mousemove), determine element under cursor now
      if (!currentElem) {
        const el = document.elementFromPoint(evt.clientX, evt.clientY);
        if (el?.id) {
          if (el.id.startsWith("point")) currentElem = el.id;
          else if (
            el.id.startsWith("event-") ||
            el.id.startsWith("event-circle-") ||
            el.id.startsWith("event-flag-")
          ) {
            const idParts = el.id.split("-");
            if (idParts.length >= 3) {
              const lineIdx = idParts[idParts.length - 2];
              const evIdx = idParts[idParts.length - 1];
              currentElem = `event-${lineIdx}-${evIdx}`;
            } else {
              currentElem = el.id;
            }
          } else if (
            el.id.startsWith("wait-event-") ||
            el.id.startsWith("wait-event-circle-") ||
            el.id.startsWith("wait-event-flag-")
          ) {
            const idParts = el.id.split("-");
            if (idParts.length >= 4) {
              const waitId = idParts[idParts.length - 2];
              const evIdx = idParts[idParts.length - 1];
              currentElem = `wait-event-${waitId}-${evIdx}`;
            } else {
              currentElem = el.id;
            }
          } else if (el.id.startsWith("obstacle-")) {
            currentElem = el.id;
          }
        }
      }

      // Select a line when clicking a point on the field
      if (currentElem) {
        if (currentElem.startsWith("point-")) {
          const parts = currentElem.split("-");
          const lineNum = Number(parts[1]);
          const pointIdx = Number(parts[2]);
          if (!isNaN(lineNum) && lineNum > 0) {
            const lineIndex = lineNum - 1;
            const line = lines[lineIndex];
            if (line) {
              selectedLineId.set(line.id);
              selectedPointId.set(currentElem);
            }
          } else {
            // starting point or invalid -> clear selection or select start
            if (currentElem === "point-0-0") {
              selectedLineId.set(null);
              selectedPointId.set(currentElem);
            } else {
              selectedLineId.set(null);
              selectedPointId.set(null);
            }
          }
        } else if (currentElem.startsWith("event-")) {
          // Select event marker and set line selection
          const parts = currentElem.split("-");
          const lineIdx = Number(parts[1]);
          const evIdx = Number(parts[2]);
          if (!isNaN(lineIdx) && !isNaN(evIdx) && lines[lineIdx]) {
            selectedLineId.set(lines[lineIdx].id);
            selectedPointId.set(currentElem);
          }
        } else if (currentElem.startsWith("wait-event-")) {
          // Select wait event marker: map to wait selection using waitId
          const parts = currentElem.split("-");
          const waitId = parts[2];
          const evIdx = Number(parts[3]);
          if (waitId) {
            selectedPointId.set(`wait-${waitId}`);
            selectedLineId.set(null);
          }
        }

        let objectX = 0;
        let objectY = 0;

        // Compute mouse coordinates in inches for drag offset (handles clicks without prior mousemove)
        const rectForMouse = two.renderer.domElement.getBoundingClientRect();
        const transformedForMouse = getTransformedCoordinates(
          evt.clientX,
          evt.clientY,
          rectForMouse,
          settings.fieldRotation || 0,
        );
        const mouseX = x.invert(transformedForMouse.x);
        const mouseY = y.invert(transformedForMouse.y);

        if (currentElem && currentElem.startsWith("obstacle-")) {
          const parts = currentElem.split("-");
          const shapeIdx = Number(parts[1]);
          const vertexIdx = Number(parts[2]);
          if (shapes[shapeIdx]?.vertices[vertexIdx]) {
            objectX = shapes[shapeIdx].vertices[vertexIdx].x;
            objectY = shapes[shapeIdx].vertices[vertexIdx].y;
          }
        } else {
          const line = Number(currentElem.split("-")[1]) - 1;
          const point = Number(currentElem.split("-")[2]);

          if (line === -1) {
            objectX = startPoint.x;
            objectY = startPoint.y;
          } else if (lines[line]) {
            if (point === 0 && lines[line].endPoint) {
              objectX = lines[line].endPoint.x;
              objectY = lines[line].endPoint.y;
            } else {
              if (lines[line].controlPoints[point - 1]) {
                objectX = lines[line].controlPoints[point - 1].x;
                objectY = lines[line].controlPoints[point - 1].y;
              }
            }
          }
        }

        dragOffset = {
          x: objectX - mouseX,
          y: objectY - mouseY,
        };
      }
    });

    two.renderer.domElement.addEventListener("mouseup", (evt?: MouseEvent) => {
      isDown = false;
      dragOffset = { x: 0, y: 0 };
      recordChange();
    });

    // Double-click on the field to create a new path at that position
    two.renderer.domElement.addEventListener("dblclick", (evt: MouseEvent) => {
      // Ignore dblclicks on existing points/obstacles/lines
      const elem = document.elementFromPoint(evt.clientX, evt.clientY);
      if (
        elem?.id &&
        (elem.id.startsWith("point") ||
          elem.id.startsWith("obstacle") ||
          elem.id.startsWith("line"))
      ) {
        return;
      }

      const rect = two.renderer.domElement.getBoundingClientRect();
      const transformed = getTransformedCoordinates(
        evt.clientX,
        evt.clientY,
        rect,
        settings.fieldRotation || 0,
      );
      const rawInchX = x.invert(transformed.x);
      const rawInchY = y.invert(transformed.y);

      // Apply grid snapping if enabled
      const currentGridSize = $gridSize;
      const currentSnapToGrid = $snapToGrid;
      const currentShowGrid = $showGrid;

      let inchX = rawInchX;
      let inchY = rawInchY;

      if (currentSnapToGrid && currentShowGrid && currentGridSize > 0) {
        inchX = Math.round(rawInchX / currentGridSize) * currentGridSize;
        inchY = Math.round(rawInchY / currentGridSize) * currentGridSize;
      }

      // Clamp to field boundaries
      inchX = Math.max(0, Math.min(FIELD_SIZE, inchX));
      inchY = Math.max(0, Math.min(FIELD_SIZE, inchY));

      // Create a new line with endPoint at the clicked position
      const newLine: Line = {
        id: `line-${Math.random().toString(36).slice(2)}`,
        endPoint: {
          x: inchX,
          y: inchY,
          heading: "tangential",
          reverse: false,
        },
        controlPoints: [],
        color: getRandomColor(),
        locked: false,
        waitBeforeMs: 0,
        waitAfterMs: 0,
        waitBeforeName: "",
        waitAfterName: "",
      };

      lines = [...lines, newLine];
      sequence = [...sequence, { kind: "path", lineId: newLine.id! }];

      // Select the newly created line and its end point
      selectedLineId.set(newLine.id!);
      const newIdx = lines.findIndex((l) => l.id === newLine.id!);
      selectedPointId.set(`point-${newIdx + 1}-0`);

      recordChange();
      two.update();
    });
  });
  function saveFile() {
    downloadTrajectory(startPoint, lines, shapes, sequence);
  }

  async function loadFile(evt: Event) {
    const elem = evt.target as HTMLInputElement;
    const file = elem.files?.[0];

    if (!file) return;

    // Check if file is a .pp file
    if (!file.name.endsWith(".pp")) {
      alert("Please select a .pp file");
      // Reset the file input
      elem.value = "";
      return;
    }

    // If we're in Electron environment and have a current directory, copy the file
    if (electronAPI && $currentFilePath) {
      await loadFileWithCopy(file);
    } else {
      // Use the original load function for web or when no directory is set
      loadTrajectoryFromFile(evt, (data) => {
        // Add to recent files if path is available (Electron)
        if ((file as any).path) {
          addToRecentFiles((file as any).path);
          currentFilePath.set((file as any).path);
        }

        // Ensure startPoint has all required fields
        startPoint = data.startPoint || {
          x: 72,
          y: 72,
          heading: "tangential",
          reverse: false,
        };

        // Normalize lines with all required fields
        const normalizedLines = normalizeLines(data.lines || []);
        lines = normalizedLines;

        // Derive sequence from data or create default
        sequence = (
          data.sequence && data.sequence.length
            ? data.sequence
            : normalizedLines.map((ln) => ({
                kind: "path",
                lineId: ln.id!,
              }))
        ) as SequenceItem[];

        // Load shapes with defaults
        shapes = data.shapes || [];

        isUnsaved.set(false);
        recordChange();
      });
    }

    // Reset the file input
    elem.value = "";
  }

  // New function to handle file copying in Electron
  async function loadFileWithCopy(file: File) {
    try {
      // Read the file content
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);

          // Get the current directory from the current file path
          const currentDir = $currentFilePath
            ? $currentFilePath.substring(0, $currentFilePath.lastIndexOf("/"))
            : await electronAPI.getDirectory();
          // Create the destination path
          const destPath = currentDir + "/" + file.name;
          // Check if file already exists in the directory
          const exists = await electronAPI.fileExists(destPath);
          if (exists) {
            // Ask for confirmation to overwrite
            const overwrite = confirm(
              `File "${file.name}" already exists in the current directory. Overwrite?`,
            );
            if (!overwrite) {
              // User cancelled - just load without copying
              loadData(data);
              return;
            }
          }

          // Copy the file to the current directory
          await electronAPI.writeFile(destPath, content);
          // Load the data into the app
          loadData(data);
          // Update the current file path to the newly loaded file
          currentFilePath.set(destPath);
          addToRecentFiles(destPath);
          console.log(`File copied to: ${destPath}`);
        } catch (error) {
          console.error("Error processing file:", error);
          alert("Error loading file: " + error.message);
        }
      };
      reader.onerror = () => {
        alert("Error reading file");
      };

      reader.readAsText(file);
    } catch (error) {
      console.error("Error in loadFileWithCopy:", error);
      alert("Error loading file: " + error.message);
    }
  }

  // Helper function to load data into app state
  function loadData(data: any) {
    // Ensure startPoint has all required fields
    startPoint = data.startPoint || {
      x: 72,
      y: 72,
      heading: "tangential",
      reverse: false,
    };

    // Normalize lines with all required fields
    const normalizedLines = normalizeLines(data.lines || []);
    lines = normalizedLines;

    // Derive sequence from data or create default
    sequence = (
      data.sequence && data.sequence.length
        ? data.sequence
        : normalizedLines.map((ln) => ({
            kind: "path",
            lineId: ln.id!,
          }))
    ) as SequenceItem[];

    // Load shapes with defaults
    shapes = data.shapes || [];

    lastSavedState = getCurrentState();
    isUnsaved.set(false);
    recordChange();
  }

  function loadRobot(evt: Event) {
    loadRobotImage(evt, () => updateRobotImageDisplay());
  }

  function addNewLine() {
    const newLine: Line = {
      id: `line-${Math.random().toString(36).slice(2)}`,
      endPoint: {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "tangential",
        reverse: false,
      } as Point,
      controlPoints: [],
      color: getRandomColor(),
      locked: false,
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    lines = [...lines, newLine];
    sequence = [...sequence, { kind: "path", lineId: newLine.id! }];

    // Select newly created line and its endpoint
    selectedLineId.set(newLine.id!);
    const newIndex = lines.findIndex((l) => l.id === newLine.id!);
    selectedPointId.set(`point-${newIndex + 1}-0`);

    recordChange();
  }

  function addWait() {
    const wait = {
      kind: "wait",
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: "Wait",
      durationMs: 1000,
      locked: false,
    } as SequenceItem;
    sequence = [...sequence, wait];

    // Select newly created wait
    selectedPointId.set(`wait-${wait.id}`);
    selectedLineId.set(null);

    recordChange();
  }

  import {
    selectedLineId,
    selectedPointId,
    toggleCollapseAllTrigger,
  } from "./stores";

  function addControlPoint() {
    if (lines.length === 0) return;

    // Prefer the selected line if available, otherwise fallback to the last line
    const targetId = $selectedLineId || lines[lines.length - 1].id;
    const targetLine =
      lines.find((l) => l.id === targetId) || lines[lines.length - 1];
    if (!targetLine) return;

    targetLine.controlPoints.push({
      x: _.random(36, 108),
      y: _.random(36, 108),
    });

    // Force reactivity
    lines = [...lines];

    // Select the newly created control point
    const lineIndex = lines.findIndex((l) => l.id === targetLine.id);
    const cpIndex = targetLine.controlPoints.length; // 1-based in point ID scheme
    selectedLineId.set(targetLine.id);
    selectedPointId.set(`point-${lineIndex + 1}-${cpIndex}`);

    recordChange();
  }

  function removeControlPoint() {
    if (lines.length > 0) {
      // Prefer selected line
      const targetId = $selectedLineId || lines[lines.length - 1].id;
      const targetLine =
        lines.find((l) => l.id === targetId) || lines[lines.length - 1];

      if (targetLine && targetLine.controlPoints.length > 0) {
        targetLine.controlPoints.pop();
        // Force reactivity and record change
        lines = [...lines];
        recordChange();
      }
    }
  }

  // Remove the currently selected point, or remove a selected wait. If the selected point is an end-point,
  // remove the entire line (and any attached wait after it).
  function removeSelected() {
    if (isUIElementFocused()) return;
    const sel = $selectedPointId;
    if (!sel) return;

    // Remove wait selection: remove the wait from sequence
    if (sel.startsWith("wait-")) {
      const waitId = sel.substring(5);
      const idx = sequence.findIndex(
        (s) => s.kind === "wait" && s.id === waitId,
      );
      if (idx !== -1) {
        const newSeq = [...sequence];
        newSeq.splice(idx, 1);
        sequence = newSeq;
        selectedPointId.set(null);
        recordChange();
      }
      return;
    }

    // Remove point selection
    if (sel.startsWith("point-")) {
      const parts = sel.split("-");
      const lineNum = Number(parts[1]);
      const ptIdx = Number(parts[2]);

      // Start point cannot be removed
      if (lineNum === 0 && ptIdx === 0) {
        return;
      }

      const lineIndex = lineNum - 1;
      const line = lines[lineIndex];
      if (!line) return;

      // If end point selected (ptIdx === 0) -> remove line and attached wait (like removeLine)
      if (ptIdx === 0) {
        // Protect against removing the last remaining path
        if (lines.length <= 1) return;

        const removedId = line.id;
        if (!removedId) return;

        // Remove line
        const newLines = [...lines];
        newLines.splice(lineIndex, 1);
        lines = newLines;

        // Remove path from the sequence but preserve any waits that follow it
        if (removedId) {
          sequence = sequence.filter(
            (item) => !(item.kind === "path" && item.lineId === removedId),
          );
        }

        selectedPointId.set(null);
        selectedLineId.set(null);
        recordChange();
        return;
      }

      // Control point removal (ptIdx >= 1)
      const cpIndex = ptIdx - 1;
      if (line.controlPoints && line.controlPoints[cpIndex] !== undefined) {
        if (line.locked) return; // protect locked lines
        line.controlPoints.splice(cpIndex, 1);
        lines = [...lines];
        selectedPointId.set(null);
        recordChange();
      }
      return;
    }
  }

  function addEventMarker() {
    // Determine target line: selected line or last line
    const targetId =
      $selectedLineId || (lines.length > 0 ? lines[lines.length - 1].id : null);
    const targetLine = targetId ? lines.find((l) => l.id === targetId) : null;

    if (targetLine) {
      if (!targetLine.eventMarkers) targetLine.eventMarkers = [];
      targetLine.eventMarkers = [
        ...targetLine.eventMarkers,
        {
          id: `event-${Date.now()}`,
          name: "Event",
          position: 0.5, // Default to middle
        },
      ];
      lines = [...lines];
      recordChange();
    }
  }

  function movePoint(dx: number, dy: number) {
    if (isUIElementFocused()) return;
    const currentSel = $selectedPointId;
    if (!currentSel) return;

    // Default move amount when not snapping
    const defaultStep = 1;
    const snapMode = $snapToGrid && $showGrid;
    const gridStep = $gridSize || 1;

    // Helper to compute next grid-aligned coordinate in a direction
    const eps = 1e-8;
    const nextGridCoord = (current: number, direction: number) => {
      if (direction > 0) {
        // move right/up -> next gridline above current
        return Math.min(
          FIELD_SIZE,
          Math.ceil((current + eps) / gridStep) * gridStep,
        );
      } else if (direction < 0) {
        // move left/down -> previous gridline below current
        return Math.max(0, Math.floor((current - eps) / gridStep) * gridStep);
      }
      return current;
    };

    // dx/dy are directions (-1, 0, 1).
    const moveX = dx * defaultStep;
    const moveY = dy * defaultStep;

    if (currentSel.startsWith("point-")) {
      const parts = currentSel.split("-");
      const lineNum = Number(parts[1]); // 0 for start, 1+ for lines
      const ptIdx = Number(parts[2]);

      // Handle Start Point
      if (lineNum === 0 && ptIdx === 0) {
        if (!startPoint.locked) {
          if (snapMode) {
            // Snap on grid in the requested direction
            if (dx !== 0) startPoint.x = nextGridCoord(startPoint.x, dx);
            if (dy !== 0) startPoint.y = nextGridCoord(startPoint.y, dy);
          } else {
            startPoint.x = Math.max(
              0,
              Math.min(FIELD_SIZE, startPoint.x + moveX),
            );
            startPoint.y = Math.max(
              0,
              Math.min(FIELD_SIZE, startPoint.y + moveY),
            );
          }

          // Ensure values are within bounds and rounded sensibly
          startPoint.x = Number(
            Math.max(0, Math.min(FIELD_SIZE, startPoint.x)).toFixed(3),
          );
          startPoint.y = Number(
            Math.max(0, Math.min(FIELD_SIZE, startPoint.y)).toFixed(3),
          );

          startPoint = startPoint; // Trigger reactivity
          recordChange();
        }
        return;
      }

      // Handle Line Points
      const lineIndex = lineNum - 1;
      const line = lines[lineIndex];
      if (line && !line.locked) {
        if (ptIdx === 0) {
          // End Point
          if (line.endPoint) {
            if (snapMode) {
              if (dx !== 0)
                line.endPoint.x = nextGridCoord(line.endPoint.x, dx);
              if (dy !== 0)
                line.endPoint.y = nextGridCoord(line.endPoint.y, dy);
            } else {
              line.endPoint.x = Math.max(
                0,
                Math.min(FIELD_SIZE, line.endPoint.x + moveX),
              );
              line.endPoint.y = Math.max(
                0,
                Math.min(FIELD_SIZE, line.endPoint.y + moveY),
              );
            }

            line.endPoint.x = Number(
              Math.max(0, Math.min(FIELD_SIZE, line.endPoint.x)).toFixed(3),
            );
            line.endPoint.y = Number(
              Math.max(0, Math.min(FIELD_SIZE, line.endPoint.y)).toFixed(3),
            );

            lines = lines; // Trigger reactivity
            recordChange();
          }
        } else {
          // Control Point (ptIdx 1..N)
          const cpIndex = ptIdx - 1;
          if (line.controlPoints[cpIndex]) {
            if (snapMode) {
              if (dx !== 0)
                line.controlPoints[cpIndex].x = nextGridCoord(
                  line.controlPoints[cpIndex].x,
                  dx,
                );
              if (dy !== 0)
                line.controlPoints[cpIndex].y = nextGridCoord(
                  line.controlPoints[cpIndex].y,
                  dy,
                );
            } else {
              line.controlPoints[cpIndex].x = Math.max(
                0,
                Math.min(FIELD_SIZE, line.controlPoints[cpIndex].x + moveX),
              );
              line.controlPoints[cpIndex].y = Math.max(
                0,
                Math.min(FIELD_SIZE, line.controlPoints[cpIndex].y + moveY),
              );
            }

            line.controlPoints[cpIndex].x = Number(
              Math.max(
                0,
                Math.min(FIELD_SIZE, line.controlPoints[cpIndex].x),
              ).toFixed(3),
            );
            line.controlPoints[cpIndex].y = Number(
              Math.max(
                0,
                Math.min(FIELD_SIZE, line.controlPoints[cpIndex].y),
              ).toFixed(3),
            );

            lines = lines; // Trigger reactivity
            recordChange();
          }
        }
      }
    } else if (currentSel.startsWith("obstacle-")) {
      const parts = currentSel.split("-");
      const shapeIdx = Number(parts[1]);
      const vertexIdx = Number(parts[2]);
      if (shapes[shapeIdx] && shapes[shapeIdx].vertices[vertexIdx]) {
        const v = shapes[shapeIdx].vertices[vertexIdx];
        if (snapMode) {
          if (dx !== 0) v.x = nextGridCoord(v.x, dx);
          if (dy !== 0) v.y = nextGridCoord(v.y, dy);
        } else {
          v.x = Math.max(0, Math.min(FIELD_SIZE, v.x + moveX));
          v.y = Math.max(0, Math.min(FIELD_SIZE, v.y + moveY));
        }
        v.x = Number(Math.max(0, Math.min(FIELD_SIZE, v.x)).toFixed(3));
        v.y = Number(Math.max(0, Math.min(FIELD_SIZE, v.y)).toFixed(3));
        shapes = shapes; // Trigger reactivity
        recordChange();
      }
    } else if (currentSel.startsWith("event-")) {
      // event-<lineIdx>-<evIdx>
      const parts = currentSel.split("-");
      const lineIdx = Number(parts[1]);
      const evIdx = Number(parts[2]);
      const line = lines[lineIdx];

      if (line && line.eventMarkers && line.eventMarkers[evIdx]) {
        // Move event along path position (0-1)
        // Map dx to a small increment.
        // e.g. dx=1 (right) -> +0.01
        // dy (up/down) -> also adjust or maybe bigger steps?
        const delta = (dx + dy) * 0.01;
        let newPos = line.eventMarkers[evIdx].position + delta;
        newPos = Math.max(0, Math.min(1, newPos));
        line.eventMarkers[evIdx].position = newPos;
        lines = lines; // Trigger reactivity
        recordChange();
      }
    }
  }

  function getSelectableItems() {
    const items: string[] = [];

    // Start Point
    items.push("point-0-0");

    // Sequence Items
    // We traverse sequence to be logical with the order of execution
    // But for visual selection, we usually select points.
    // If a sequence item is a Path, we add its points.
    // If a sequence item is a Wait, we add a "wait-<id>" item.

    // NOTE: The lines array is the source of truth for geometry indices.
    // The sequence array points to line IDs.
    // To match visual order (Line 1, Line 2...), we might just iterate lines?
    // But if we want to select Waits, we need the sequence.
    // Let's use sequence order.

    sequence.forEach((item, seqIdx) => {
      if (item.kind === "path") {
        const lineIdx = lines.findIndex((l) => l.id === item.lineId);
        if (lineIdx !== -1) {
          const line = lines[lineIdx];
          // Add Control Points first? Or Start?
          // Visual path: Start -> CP1 -> CP2 -> End.
          // Start is usually the end of previous.
          // We only select the points belonging to THIS line object: ControlPoints and EndPoint.
          // Control Points come before EndPoint in the curve definition, but user might view EndPoint as the main target.
          // Let's follow drawing order: CPs then EndPoint.
          line.controlPoints.forEach((_, cpIdx) => {
            items.push(`point-${lineIdx + 1}-${cpIdx + 1}`);
          });
          items.push(`point-${lineIdx + 1}-0`); // EndPoint is index 0 in our ID scheme from field rendering
        }
      } else if (item.kind === "wait") {
        items.push(`wait-${item.id}`);
      }
    });

    // Event Markers
    lines.forEach((line, lineIdx) => {
      if (line.eventMarkers) {
        line.eventMarkers.forEach((_, evIdx) => {
          items.push(`event-${lineIdx}-${evIdx}`);
        });
      }
    });

    // Obstacles? Maybe after everything?
    shapes.forEach((_, sIdx) => {
      shapes[sIdx].vertices.forEach((_, vIdx) => {
        items.push(`obstacle-${sIdx}-${vIdx}`);
      });
    });

    return items;
  }

  function cycleSelection(dir: number) {
    if (isUIElementFocused()) return;
    const items = getSelectableItems();
    if (items.length === 0) return;

    let current = $selectedPointId;

    // If selection is a wait but stored differently, handle that?
    // We will use selectedPointId to store "wait-ID" as well for now,
    // assuming other components handle it gracefully or ignore it.

    let idx = items.indexOf(current || "");
    if (idx === -1) {
      idx = 0;
    } else {
      idx = (idx + dir + items.length) % items.length;
    }

    const newId = items[idx];
    selectedPointId.set(newId);

    // Update selectedLineId if applicable
    if (newId.startsWith("point-")) {
      const parts = newId.split("-");
      const lineNum = Number(parts[1]);
      if (lineNum > 0) {
        const lineId = lines[lineNum - 1].id;
        selectedLineId.set(lineId || null);
      } else {
        selectedLineId.set(null);
      }
    } else if (newId.startsWith("wait-")) {
      // Clear line selection so Wait is focused in sidebar?
      selectedLineId.set(null);
      // We might want a way to indicate selection in sidebar.
      // selectedPointId is used by WaypointTable to highlight rows?
      // We'll need to check WaypointTable later.
    } else {
      selectedLineId.set(null);
    }
  }

  function modifyValue(delta: number) {
    if (isUIElementFocused()) return;
    const current = $selectedPointId;
    if (!current) return;

    // Check if it is a wait
    if (current.startsWith("wait-")) {
      const waitId = current.substring(5);
      const item = sequence.find((s) => s.kind === "wait" && s.id === waitId);
      if (item && item.kind === "wait") {
        // Modify duration
        const change = delta * 100; // 100ms steps
        item.durationMs = Math.max(0, item.durationMs + change);
        sequence = [...sequence]; // Trigger reactivity
        recordChange();
      }
      return;
    }

    // If selection is an event marker (event-<lineIdx>-<evIdx>), modify its position (0..1)
    if (current.startsWith("event-")) {
      const parts = current.split("-");
      if (parts.length >= 3) {
        const lineIdx = Number(parts[1]);
        const evIdx = Number(parts[2]);
        const line = lines[lineIdx];
        if (line && line.eventMarkers && line.eventMarkers[evIdx]) {
          // Move closer to 1 for positive delta ('=') or closer to 0 for negative delta ('-')
          // Step size: 0.01 per press
          const step = 0.01 * Math.sign(delta || 1);
          let newPos = line.eventMarkers[evIdx].position + step;

          // Clamp between 0 and 1
          newPos = Math.max(0, Math.min(1, newPos));

          line.eventMarkers[evIdx].position = newPos;
          lines = lines; // Trigger reactivity
          recordChange();
        }
      }
      return;
    }

    // If a line is selected but no specific event is selected, modify the last event on that line
    if ($selectedLineId) {
      const selLineId = $selectedLineId;
      const lineIdx = lines.findIndex((l) => l.id === selLineId);
      if (lineIdx !== -1) {
        const line = lines[lineIdx];
        if (line && line.eventMarkers && line.eventMarkers.length > 0) {
          const lastIdx = line.eventMarkers.length - 1;
          const step = 0.01 * Math.sign(delta || 1);
          let newPos = line.eventMarkers[lastIdx].position + step;
          newPos = Math.max(0, Math.min(1, newPos));
          line.eventMarkers[lastIdx].position = newPos;
          lines = lines; // Trigger reactivity
          recordChange();
          return;
        }
      }
    }
  }

  function applyTheme(theme: "light" | "dark" | "auto") {
    let actualTheme = theme;
    if (theme === "auto") {
      // Check system preference
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        actualTheme = "dark";
      } else {
        actualTheme = "light";
      }
    }

    if (actualTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  // Watch for theme changes in settings
  $: if (settings) {
    applyTheme(settings.theme);
  }

  // Watch for system theme changes if auto mode is enabled
  let mediaQuery: MediaQueryList;
  onMount(() => {
    if (settings?.theme === "auto") {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleSystemThemeChange = () => {
        if (settings.theme === "auto") {
          applyTheme("auto");
        }
      };
      mediaQuery.addEventListener("change", handleSystemThemeChange);

      return () => {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      };
    }
  });

  // Listen for menu actions from Electron
  onMount(() => {
    if (electronAPI && electronAPI.onMenuAction) {
      electronAPI.onMenuAction((action) => {
        switch (action) {
          case "new-path":
            // Prompt to save if needed? For now, just new line
            // Or maybe clear everything?
            // "New Path" usually means create a new file or clear current state.
            // Since we have `addNewLine` which adds to current, maybe "New Project" is better?
            // But let's assume it clears or creates new.
            // Actually, based on existing functionality, maybe just reset to default.
            if (confirm("Create new project? Unsaved changes will be lost.")) {
              startPoint = getDefaultStartPoint();
              lines = normalizeLines(getDefaultLines());
              sequence = lines.map((ln) => ({
                kind: "path",
                lineId: ln.id!,
              }));
              shapes = getDefaultShapes();
              currentFilePath.set(null);
              recordChange();
            }
            break;
          case "open-file":
            // We need to trigger the file input.
            // Since we don't have direct access to the hidden input, we can check if we can invoke `loadFile` differently.
            // `loadFile` takes an event.
            // But `ipcMain` has `file:set-directory`...
            // Actually, we can just trigger a click on the file input if we had a ref to it.
            // Or use electronAPI to showOpenDialog if we wanted to be purely native.
            // The existing `loadFile` uses an `<input type="file">`.
            // Let's use `electronAPI` to open a file if possible, or trigger the input.
            // The Navbar has the input.
            // But we can also implement `openProject` here using `electronAPI`.
            // Let's implement a native open dialog call.
            openProjectNative();
            break;
          case "save-project":
            saveProject();
            break;
          case "save-as":
            saveFileAs();
            break;
          case "export-gif":
            exportGif();
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
          case "open-settings":
            showSettings.set(true);
            break;
          case "open-shortcuts":
            showShortcuts.set(true);
            break;
          case "undo":
            if (canUndo) undoAction();
            break;
          case "redo":
            if (canRedo) redoAction();
            break;
        }
      });
    }
  });

  async function openProjectNative() {
    // We try to find the input element in DOM.
    const input = document.getElementById("file-upload");
    if (input) {
      input.click();
    } else {
      console.warn("File input not found.");
    }
  }
</script>

<svelte:window
  bind:innerWidth
  bind:innerHeight
  on:mouseup={stopResize}
  on:mousemove={onMouseMove}
  on:touchend={stopResize}
  on:touchmove={onTouchMove}
/>

<div
  class="h-screen w-full flex flex-col overflow-hidden bg-neutral-200 dark:bg-neutral-950"
>
  <!-- Navbar (flex-none) -->
  <div class="flex-none z-50">
    <Navbar
      bind:lines
      bind:startPoint
      bind:shapes
      bind:sequence
      bind:settings
      bind:robotWidth
      bind:robotHeight
      bind:showSidebar
      bind:isLargeScreen
      {saveProject}
      {saveFileAs}
      {loadFile}
      {exportGif}
      {undoAction}
      {redoAction}
      {recordChange}
      {canUndo}
      {canRedo}
      on:previewOptimizedLines={(e) => {
        previewOptimizedLines = e.detail;
      }}
    />
  </div>

  <!-- Main Content (flex-1) -->
  <div
    class="flex-1 min-h-0 flex flex-col lg:flex-row items-stretch lg:overflow-hidden relative p-2 gap-2"
    bind:clientHeight={mainContentHeight}
    bind:clientWidth={mainContentWidth}
    bind:this={mainContentDiv}
  >
    <!-- Field Container (Left Pane) -->
    <div
      class="flex-none flex justify-center items-center relative transition-all duration-75 ease-linear"
      style={`
        width: ${isLargeScreen && showSidebar ? leftPaneWidth + "px" : "100%"};
        height: ${isLargeScreen ? "100%" : userFieldHeightLimit ? userFieldHeightLimit + "px" : "auto"};
        min-height: ${!isLargeScreen ? (userFieldHeightLimit ? "0" : "60vh") : "0"};
      `}
    >
      <div
        class="relative aspect-square"
        style={`width: ${fieldDrawSize}px; height: ${fieldDrawSize}px;`}
        bind:this={wrapperDiv}
      >
        <div
          bind:this={twoElement}
          bind:clientWidth={width}
          bind:clientHeight={height}
          class="w-full h-full rounded-lg shadow-md bg-neutral-50 dark:bg-neutral-900 relative overflow-clip"
          role="application"
          style="
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    user-drag: none;
    -webkit-user-drag: none;
    -khtml-user-drag: none;
    -moz-user-drag: none;
    -ms-user-drag: none;
    -o-user-drag: none;
  "
          on:contextmenu={(e) => e.preventDefault()}
          on:dragstart={(e) => e.preventDefault()}
          on:selectstart={(e) => e.preventDefault()}
          tabindex="-1"
          style:transform={`rotate(${settings.fieldRotation || 0}deg)`}
          style:transition="transform 0.3s ease-in-out"
        >
          <img
            src={settings.fieldMap
              ? `/fields/${settings.fieldMap}`
              : "/fields/decode.webp"}
            alt="Field"
            class="absolute top-0 left-0 w-full h-full rounded-lg z-10"
            style="
    background: transparent; 
    pointer-events: none; 
    user-select: none; 
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    user-drag: none;
    -webkit-user-drag: none;
    -moz-user-drag: none;
    -ms-user-drag: none;
    -o-user-drag: none;
  "
            draggable="false"
            on:error={(e) => {
              console.error("Failed to load field map:", settings.fieldMap);
              e.target.src = "/fields/decode.webp"; // Fallback
            }}
            on:dragstart={(e) => e.preventDefault()}
            on:selectstart={(e) => e.preventDefault()}
          />
          <MathTools {x} {y} {twoElement} {robotXY} {robotHeading} />
          <img
            src={settings.robotImage || "/robot.png"}
            alt="Robot"
            style={`position: absolute; top: ${robotXY.y}px;
left: ${robotXY.x}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${x(robotWidth)}px; height: ${x(robotHeight)}px;user-select: none; -webkit-user-select: none; -moz-user-select: none;-ms-user-select: none;
pointer-events: none;`}
            draggable="false"
            on:error={(e) => {
              console.error("Failed to load robot image:", settings.robotImage);
              e.target.src = "/robot.png"; // Fallback to default
            }}
            on:dragstart={(e) => e.preventDefault()}
            on:selectstart={(e) => e.preventDefault()}
          />
        </div>
        <FieldCoordinates
          x={currentMouseX}
          y={currentMouseY}
          visible={isMouseOverField}
          isObstructed={isObstructingHUD}
        />
      </div>
    </div>

    <!-- Resizer Handle (Desktop only) -->
    {#if isLargeScreen && showSidebar}
      <button
        class="w-2 cursor-col-resize flex justify-center items-center hover:bg-purple-500/50 active:bg-purple-600 transition-colors rounded-sm select-none z-40 border-none bg-transparent p-0 m-0"
        on:mousedown={startHorizontalResize}
        aria-label="Resize Sidebar"
        tabindex="0"
      >
        <div
          class="w-[2px] h-8 bg-neutral-400 dark:bg-neutral-600 rounded-full"
        ></div>
      </button>
    {/if}

    <!-- Resizer Handle (Mobile/Tablet only) -->
    {#if !isLargeScreen && showSidebar}
      <button
        class="h-2 w-full cursor-row-resize flex justify-center items-center hover:bg-purple-500/50 active:bg-purple-600 transition-colors rounded-sm select-none z-40 border-none bg-transparent p-0 m-0"
        on:mousedown={startVerticalResize}
        on:touchstart={startVerticalResize}
        aria-label="Resize Tab"
        tabindex="0"
      >
        <div
          class="h-[2px] w-8 bg-neutral-400 dark:bg-neutral-600 rounded-full"
        ></div>
      </button>
    {/if}

    <!-- Control Tab (Right Pane / Bottom Tab) with directional hide animation -->
    <div
      class="flex-1 h-auto lg:h-full min-h-0 min-w-0 transition-transform duration-300 ease-in-out transform"
      class:translate-x-full={!showSidebar && isLargeScreen}
      class:translate-y-full={!showSidebar && !isLargeScreen}
      class:overflow-hidden={!showSidebar}
    >
      <ControlTab
        bind:playing
        {play}
        {pause}
        bind:startPoint
        bind:lines
        bind:sequence
        bind:robotWidth
        bind:robotHeight
        bind:settings
        bind:percent
        bind:robotXY
        bind:robotHeading
        bind:shapes
        {x}
        {y}
        {handleSeek}
        bind:loopAnimation
        {resetAnimation}
        {recordChange}
        {playbackSpeed}
        {changePlaybackSpeedBy}
        {resetPlaybackSpeed}
        {setPlaybackSpeed}
        onPreviewChange={(newLines) => {
          previewOptimizedLines = newLines;
        }}
      />
    </div>
  </div>
</div>
