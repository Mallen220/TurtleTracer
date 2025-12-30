<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Two from "two.js";
  import * as d3 from "d3";
  import {
    gridSize,
    snapToGrid,
    showGrid,
    selectedPointId,
    selectedLineId,
    showRuler,
    showProtractor,
    protractorLockToRobot,
  } from "../../stores";
  import {
    linesStore,
    startPointStore,
    shapesStore,
    settingsStore,
    robotXYStore,
    robotHeadingStore,
    sequenceStore, // Imported for potential use, though main logic uses lines
  } from "../projectStore";
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
    generateGhostPathPoints,
    generateOnionLayers,
    getRandomColor,
    loadRobotImage,
    updateRobotImageDisplay,
  } from "../../utils";
  import type {
    Line,
    Point,
    Shape,
    Settings,
    BasePoint,
    SequenceItem,
  } from "../../types";
  import MathTools from "../MathTools.svelte";
  import FieldCoordinates from "./FieldCoordinates.svelte";
  import type { Path } from "two.js/src/path";
  import type { Line as PathLine } from "two.js/src/shapes/line";

  // State from props
  export let width = 0;
  export let height = 0;
  export let timePrediction: any = null;
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
  let dragOffset = { x: 0, y: 0 };
  let currentElem: string | null = null;
  let isDown = false;

  // D3 Scales
  $: x = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([0, width || FIELD_SIZE]);
  $: y = d3
    .scaleLinear()
    .domain([0, FIELD_SIZE])
    .range([height || FIELD_SIZE, 0]);

  // Derived Values from Stores
  $: startPoint = $startPointStore;
  $: lines = $linesStore;
  $: shapes = $shapesStore;
  $: settings = $settingsStore;
  $: robotXY = $robotXYStore;
  $: robotHeading = $robotHeadingStore;
  $: sequence = $sequenceStore; // Needed for wait markers

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
      x(POINT_RADIUS),
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
        pointElem.fill = "#991b1b";
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

  // Paths (Lines)
  $: path = (() => {
    // Reference selectedLineId to trigger updates when selection changes
    const currentSelectedId = $selectedLineId;
    let _path: (Path | PathLine)[] = [];
    lines.forEach((line, idx) => {
      if (!line || !line.endPoint) return;
      let _startPoint =
        idx === 0 ? startPoint : lines[idx - 1]?.endPoint || null;
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
      const isSelected = line.id === currentSelectedId;
      lineElem.linewidth = isSelected ? x(LINE_WIDTH * 2.5) : x(LINE_WIDTH);
      lineElem.noFill();
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

  // Shapes (Obstacles)
  $: shapeElements = (() => {
    let _shapes: Path[] = [];
    shapes.forEach((shape, idx) => {
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

  // Ghost Path
  $: ghostPathElement = (() => {
    let ghostPath: Path | null = null;
    if (settings.showGhostPaths && lines.length > 0) {
      const ghostPoints = generateGhostPathPoints(
        startPoint,
        lines,
        settings.rLength,
        settings.rWidth,
        50,
      );
      if (ghostPoints.length >= 3) {
        let vertices = [];
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
        ghostPath.stroke = "#a78bfa";
        ghostPath.fill = "#a78bfa";
        ghostPath.opacity = 0.15;
        ghostPath.linewidth = x(0.5);
        ghostPath.automatic = false;
      }
    }
    return ghostPath;
  })();

  // Onion Layers
  $: onionLayerElements = (() => {
    let onionLayers: Path[] = [];
    if (settings.showOnionLayers && lines.length > 0) {
      const spacing = settings.onionLayerSpacing || 6;
      const layers = generateOnionLayers(
        startPoint,
        lines,
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
        onionRect.linewidth = x(0.5);
        onionRect.automatic = false;
        onionLayers.push(onionRect);
      });
    }
    return onionLayers;
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
        lineElem.linewidth = x(LINE_WIDTH);
        lineElem.noFill();
        lineElem.dashes = [x(4), x(4)];
        lineElem.opacity = 0.7;
        _previewPaths.push(lineElem);
      });
    }
    return _previewPaths;
  })();

  // Event Markers
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
        let circle = new Two.Circle(px, py, x(1.8));
        circle.fill = "#a78bfa";
        circle.noStroke();
        grp.add(circle);
        markers.push(grp);
      });
    });

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
      timePrediction.timeline.forEach((ev) => {
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
          const waitSelected = $selectedPointId === `wait-${ev.waitId}`;
          if (waitSelected) {
            markerCircle.fill = "#f97316";
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

  // Render Loop
  $: if (two) {
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

    two.clear();

    if (Array.isArray(shapeElements))
      shapeElements.forEach((el) => shapeGroup.add(el));
    if (ghostPathElement) shapeGroup.add(ghostPathElement);
    onionLayerElements.forEach((el) => shapeGroup.add(el));

    path.forEach((el) => lineGroup.add(el));
    previewPathElements.forEach((el) => lineGroup.add(el));

    points.forEach((el) => pointGroup.add(el));
    eventMarkerElements.forEach((el) => eventGroup.add(el));

    two.add(shapeGroup);
    two.add(lineGroup);
    two.add(pointGroup);
    two.add(eventGroup);

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

    // Event Listeners
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

      // Update props (need to be bound in parent or use event dispatch,
      // but Svelte props are 2-way by default if bound)
      currentMouseX = Math.max(0, Math.min(FIELD_SIZE, rawInchXForDisplay));
      currentMouseY = Math.max(0, Math.min(FIELD_SIZE, rawInchYForDisplay));
      isMouseOverField = true;

      // HUD obstruction check
      if (wrapperDiv) {
        const wrapperRect = wrapperDiv.getBoundingClientRect();
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
          inchX = Math.max(0, Math.min(FIELD_SIZE, inchX));
          inchY = Math.max(0, Math.min(FIELD_SIZE, inchY));
        }

        if (currentElem.startsWith("obstacle-")) {
          const parts = currentElem.split("-");
          const shapeIdx = Number(parts[1]);
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
            } else {
              if (!lines[line]?.locked) {
                lines[line].controlPoints[point - 1].x = inchX;
                lines[line].controlPoints[point - 1].y = inchY;
              }
            }
            linesStore.set(lines);
          }
        }
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
        } else if (
          target?.id &&
          (target.id.startsWith("event-") ||
            target.id.startsWith("event-circle-") ||
            target.id.startsWith("event-flag-") ||
            target.id.startsWith("wait-event-") ||
            target.id.startsWith("wait-event-circle-") ||
            target.id.startsWith("wait-event-flag-"))
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
          } else {
            if (idParts.length >= 3) {
              const lineIdx = idParts[idParts.length - 2];
              const evIdx = idParts[idParts.length - 1];
              currentElem = `event-${lineIdx}-${evIdx}`;
            } else {
              currentElem = target.id;
            }
          }
        } else {
          two.renderer.domElement.style.cursor = "auto";
          currentElem = null;
        }
      }
    });

    two.renderer.domElement.addEventListener("mousedown", (evt: MouseEvent) => {
      isDown = true;
      // Re-determine currentElem if needed
      if (!currentElem) {
        // Optimization: use evt.target
        const el = evt.target as Element;
        if (el?.id) {
          if (el.id.startsWith("point") || el.id.startsWith("obstacle-"))
            currentElem = el.id;
          else if (el.id.includes("event-")) {
            // Logic to normalize ID
            // Copy-pasted from above logic for simplicity or extract helper
            const idParts = el.id.split("-");
            if (el.id.startsWith("wait-event-")) {
              if (idParts.length >= 4) {
                const waitId = idParts[idParts.length - 2];
                const evIdx = idParts[idParts.length - 1];
                currentElem = `wait-event-${waitId}-${evIdx}`;
              } else currentElem = el.id;
            } else {
              if (idParts.length >= 3) {
                const lineIdx = idParts[idParts.length - 2];
                const evIdx = idParts[idParts.length - 1];
                currentElem = `event-${lineIdx}-${evIdx}`;
              } else currentElem = el.id;
            }
          }
        }
      }

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
          if (!isNaN(lineIdx) && lines[lineIdx]) {
            selectedLineId.set(lines[lineIdx].id);
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
      }
    });

    two.renderer.domElement.addEventListener("mouseup", () => {
      if (isDown) {
        onRecordChange(); // Notify parent of change
      }
      isDown = false;
      dragOffset = { x: 0, y: 0 };
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
      inchX = Math.max(0, Math.min(FIELD_SIZE, inchX));
      inchY = Math.max(0, Math.min(FIELD_SIZE, inchY));

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
</script>

<div
  class="relative aspect-square"
  style={`width: ${width}px; height: ${height}px;`}
  bind:this={wrapperDiv}
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
    on:contextmenu={(e) => e.preventDefault()}
    on:dragstart={(e) => e.preventDefault()}
    style:transform={`rotate(${settings.fieldRotation || 0}deg)`}
    style:transition="transform 0.3s ease-in-out"
  >
    <img
      src={settings.fieldMap
        ? `/fields/${settings.fieldMap}`
        : "/fields/decode.webp"}
      alt="Field"
      class="absolute top-0 left-0 w-full h-full rounded-lg z-10"
      draggable="false"
      on:error={(e) => {
        // @ts-ignore
        e.target.src = "/fields/decode.webp";
      }}
    />
    <MathTools {x} {y} {twoElement} {robotXY} />
    <img
      src={settings.robotImage || "/robot.png"}
      alt="Robot"
      style={`position: absolute; top: ${robotXY.y}px;
left: ${robotXY.x}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${x(settings.rLength || DEFAULT_ROBOT_LENGTH)}px; height: ${x(settings.rWidth || DEFAULT_ROBOT_WIDTH)}px; pointer-events: none;`}
      draggable="false"
      on:error={(e) => {
        // @ts-ignore
        e.target.src = "/robot.png";
      }}
    />
  </div>
  <FieldCoordinates
    x={currentMouseX}
    y={currentMouseY}
    visible={isMouseOverField}
    isObstructed={isObstructingHUD}
  />
</div>
