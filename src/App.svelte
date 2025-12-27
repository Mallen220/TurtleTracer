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
  import { onMount, tick } from "svelte";
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

  // Calculate field size dynamically for all screens to ensure it fits and remains square
  $: isLargeScreen = innerWidth >= 1024; // lg breakpoint
  $: fieldSize = isLargeScreen
    ? Math.min(
        innerWidth - 448 - 48, // 28rem (sidebar) + gaps/padding roughly
        innerHeight - 80 - 48, // 5rem (navbar) + padding roughly
      )
    : Math.min(
        innerWidth - 32, // Full width minus padding
        (innerHeight - 80) * 0.6, // Max 60% of available height
      );

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
  // Coordinate converters
  let x: d3.ScaleLinear<number, number, number>;

  // Animation controller
  let loopAnimation = true;
  let animationController: ReturnType<typeof createAnimationController>;
  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);
  $: animationDuration = getAnimationDuration(timePrediction.totalTime / 1000);
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
      bind("addControlPoint", () => {
        addControlPoint();
      });
      bind("removeControlPoint", () => {
        removeControlPoint();
      });
      bind("undo", () => undoAction());
      bind("redo", () => redoAction());

      bind("resetAnimation", () => resetAnimation());
      bind("stepForward", () => stepForward());
      bind("stepBackward", () => stepBackward());

      bind("toggleOnion", () => {
        settings.showOnionLayers = !settings.showOnionLayers;
        settings = { ...settings };
      });

      bind("toggleGrid", () => showGrid.update((v) => !v));
      bind("toggleSnap", () => snapToGrid.update((v) => !v));
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
          markerCircle.fill = "#8b5cf6";
          markerCircle.stroke = "#ffffff";
          markerCircle.linewidth = x(0.3);

          const flagSize = x(1);
          const flagPoints = [
            new Two.Anchor(x(point.x), y(point.y) - flagSize / 2),
            new Two.Anchor(x(point.x) + flagSize / 2, y(point.y)),
            new Two.Anchor(x(point.x), y(point.y) + flagSize / 2),
          ];
          const flag = new Two.Path(flagPoints, true);
          flag.fill = "#ffffff";
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
    animationController.play();
    playing = true;
  }

  function pause() {
    animationController.pause();
    playing = false;
  }

  function resetAnimation() {
    animationController.reset();
    playing = false;
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
        } else {
          two.renderer.domElement.style.cursor = "auto";
          currentElem = null;
        }
      }
    });

    two.renderer.domElement.addEventListener("mousedown", (evt: MouseEvent) => {
      isDown = true;

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
        } else if (currentElem.startsWith("obstacle-")) {
          selectedLineId.set(null);
          selectedPointId.set(null);
        }
      } else {
        selectedLineId.set(null);
        selectedPointId.set(null);
      }

      // Calculate drag offset when clicking to prevent snapping center to mouse
      if (currentElem) {
        const rect = two.renderer.domElement.getBoundingClientRect();
        const transformed = getTransformedCoordinates(
          evt.clientX,
          evt.clientY,
          rect,
          settings.fieldRotation || 0,
        );
        const mouseX = x.invert(transformed.x);
        const mouseY = y.invert(transformed.y);

        let objectX = 0;
        let objectY = 0;

        if (currentElem.startsWith("obstacle-")) {
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

    two.renderer.domElement.addEventListener("mouseup", () => {
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
    lines = [
      ...lines,
      {
        id: `line-${Math.random().toString(36).slice(2)}`,
        endPoint: {
          x: _.random(36, 108),
          y: _.random(36, 108),
          heading: "tangential",
          reverse: true,
        } as Point,
        controlPoints: [],
        color: getRandomColor(),
        locked: false,
        waitBeforeMs: 0,
        waitAfterMs: 0,
        waitBeforeName: "",
        waitAfterName: "",
      },
    ];
    sequence = [
      ...sequence,
      { kind: "path", lineId: lines[lines.length - 1].id! },
    ];
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
    recordChange();
  }

  import { selectedLineId, toggleCollapseAllTrigger } from "./stores";

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
    recordChange();
  }

  function removeControlPoint() {
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      if (lastLine.controlPoints.length > 0) {
        lastLine.controlPoints.pop();
        recordChange();
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

  // Auto-export for CI/testing: if the app is loaded with URL hash #export-gif-test, automatically run GIF export once mounted
  onMount(() => {
    if (
      typeof window !== "undefined" &&
      window.location &&
      window.location.hash === "#export-gif-test"
    ) {
      // Delay slightly to allow initial rendering and Two.js to initialize
      setTimeout(async () => {
        try {
          await exportGif();
          console.log("Auto GIF export attempted");
        } catch (err) {
          console.error("Auto GIF export failed:", err);
        }
      }, 1500);
    }
  });
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<Navbar
  bind:lines
  bind:startPoint
  bind:shapes
  bind:sequence
  bind:settings
  bind:robotWidth
  bind:robotHeight
  {saveProject}
  {saveFileAs}
  {loadFile}
  {loadRobot}
  {exportGif}
  {undoAction}
  {redoAction}
  {recordChange}
  {canUndo}
  {canRedo}
  onPreviewOptimizedLines={(newLines) => {
    previewOptimizedLines = newLines;
  }}
/>
<!--   {saveFile} -->
<div
  class="w-full min-h-screen lg:h-screen pt-20 p-2 flex flex-col lg:flex-row justify-start lg:justify-center items-center gap-2 lg:overflow-hidden bg-neutral-200 dark:bg-neutral-950"
>
  <div
    class="w-full lg:flex-1 flex justify-center items-center lg:h-full relative shrink-0"
  >
    <div
      class="relative aspect-square"
      style={`width: ${Math.max(100, fieldSize)}px; height: ${Math.max(100, fieldSize)}px;`}
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
  <div class="w-full h-auto lg:w-[28rem] lg:h-full flex-shrink-0 min-h-0">
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
      {animationDuration}
      {handleSeek}
      bind:loopAnimation
      {resetAnimation}
      {recordChange}
      onPreviewChange={(newLines) => {
        previewOptimizedLines = newLines;
      }}
    />
  </div>
</div>
