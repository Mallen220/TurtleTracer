// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type {
  Line,
  Point,
  Shape,
  SequenceItem,
  Settings,
} from "../../../types/index";
import { findClosestT, getCurvePoint, getDistance } from "../../../utils/math";
import { updateLinkedWaypoints } from "../../../utils/pointLinking";
import {
  normalizeEventElementId,
  resolveHoveredMarkerId,
} from "./ElementIdParser";

export interface SnapAndBoundsParams {
  id: string;
  rawInchX: number;
  rawInchY: number;
  snapToGrid: boolean;
  showGrid: boolean;
  gridSize: number;
  smartSnappingEnabled: boolean;
  isAltKey: boolean;
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
  fieldW: number;
  fieldH: number;
  settings: Settings;
}

export interface SnapGuide {
  type: "vertical" | "horizontal";
  coord: number;
}

export interface SnapAndBoundsResult {
  inchX: number;
  inchY: number;
  guides: SnapGuide[];
}

/**
 * Calculates snapped and bounded field coordinates for an element being dragged.
 */
export function calculateSmartSnapAndBounds(
  params: SnapAndBoundsParams,
): SnapAndBoundsResult {
  const {
    id,
    rawInchX,
    rawInchY,
    snapToGrid,
    showGrid,
    gridSize,
    smartSnappingEnabled,
    isAltKey,
    startPoint,
    lines,
    shapes,
    fieldW,
    fieldH,
    settings,
  } = params;

  let inchX = rawInchX;
  let inchY = rawInchY;

  if (snapToGrid && showGrid && gridSize > 0) {
    inchX = Math.round(rawInchX / gridSize) * gridSize;
    inchY = Math.round(rawInchY / gridSize) * gridSize;
  }

  // Smart Object Snapping
  const SNAP_THRESHOLD = 1; // inches
  const shouldSnap = isAltKey ? !smartSnappingEnabled : smartSnappingEnabled;
  const guides: SnapGuide[] = [];

  if (shouldSnap && id.startsWith("point-")) {
    const targets: Point[] = [startPoint];
    lines.forEach((l) => {
      if (l?.endPoint) targets.push(l.endPoint);
    });

    // Add field corners
    targets.push({ x: 0, y: 0 } as Point);
    targets.push({ x: fieldW, y: 0 } as Point);
    targets.push({ x: 0, y: fieldH } as Point);
    targets.push({ x: fieldW, y: fieldH } as Point);

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

    let excludeIndex = -999;
    if (lineNum === 0 && pointIdx === 0) excludeIndex = 0;
    else if (lineNum > 0 && pointIdx === 0) excludeIndex = lineNum;

    let bestX: number | null = null;
    let bestY: number | null = null;
    let minDistX = SNAP_THRESHOLD;
    let minDistY = SNAP_THRESHOLD;

    targets.forEach((target, idx) => {
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
      guides.push({ type: "vertical", coord: inchX });
    }
    if (bestY !== null) {
      inchY = bestY;
      guides.push({ type: "horizontal", coord: inchY });
    }
  }

  // Clamping range
  let minX = -Infinity;
  let maxX = Infinity;
  let minY = -Infinity;
  let maxY = Infinity;

  if (settings.restrictDraggingToField !== false) {
    minX = 0;
    maxX = fieldW;
    minY = 0;
    maxY = fieldH;

    if (id.startsWith("point-")) {
      const parts = id.split("-");
      const lineNum = Number(parts[1]);
      const pointIdx = Number(parts[2]);

      const robotMargin =
        Math.min(settings.rLength || 18, settings.rWidth || 18) / 2;
      const safety = settings.safetyMargin || 0;

      let margin = 0;
      if (lineNum === 0 && pointIdx === 0) {
        margin = robotMargin;
      } else if (lineNum > 0 && pointIdx === 0) {
        margin = robotMargin + safety;
      } else {
        margin = 0;
      }

      minX = margin;
      maxX = fieldW - margin;
      minY = margin;
      maxY = fieldH - margin;
    }
  }

  inchX = Math.max(minX, Math.min(maxX, inchX));
  inchY = Math.max(minY, Math.min(maxY, inchY));

  return { inchX, inchY, guides };
}

/**
 * Calculates pan delta rotated according to field rotation.
 */
export function calculateRotatedPan(
  clientX: number,
  clientY: number,
  startPan: { x: number; y: number },
  fieldRotation: number,
): { rdx: number; rdy: number } {
  const dx = clientX - startPan.x;
  const dy = clientY - startPan.y;
  const rad = -((fieldRotation || 0) * Math.PI) / 180;
  const rdx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const rdy = dx * Math.sin(rad) + dy * Math.cos(rad);
  return { rdx, rdy };
}

export interface DragUpdateParams {
  id: string;
  inchX: number;
  inchY: number;
  lines: Line[];
  shapes: Shape[];
  startPoint: Point;
  sequence: SequenceItem[];
  timePrediction?: any;
  currentElem: string | null;
}

export interface DragUpdateResult {
  lines: Line[];
  shapes: Shape[];
  startPoint: Point;
  sequence: SequenceItem[];
  linesChanged: boolean;
  shapesChanged: boolean;
  startPointChanged: boolean;
  sequenceChanged: boolean;
  currentElem: string | null;
  idReplacement?: { oldId: string; newId: string };
}

/**
 * Applies a drag coordinate update to the appropriate project element (obstacle, target point, event, waypoint).
 */
export function applyDragToElement(params: DragUpdateParams): DragUpdateResult {
  const {
    id,
    inchX,
    inchY,
    lines,
    shapes,
    startPoint,
    sequence,
    timePrediction,
    currentElem,
  } = params;

  let newLines = lines;
  let newShapes = shapes;
  let newStartPoint = startPoint;
  const newSequence = sequence;
  let linesChanged = false;
  let shapesChanged = false;
  let startPointChanged = false;
  let sequenceChanged = false;
  let nextCurrentElem = currentElem;
  let idReplacement: { oldId: string; newId: string } | undefined;

  if (id.startsWith("obstacle-")) {
    const parts = id.split("-");
    const shapeIdx = Number(parts[1]);
    if (!shapes[shapeIdx]?.locked) {
      const vertexIdx = Number(parts[2]);
      const newVertices = [...shapes[shapeIdx].vertices];
      newVertices[vertexIdx] = {
        ...newVertices[vertexIdx],
        x: inchX,
        y: inchY,
      };
      newShapes = [...shapes];
      newShapes[shapeIdx] = { ...shapes[shapeIdx], vertices: newVertices };
      shapesChanged = true;
    }
  } else if (id.startsWith("targetpoint-")) {
    const parts = id.split("-");
    const lineIdx = Number(parts[1]) - 1;
    const line = lines[lineIdx];
    if (line?.endPoint) {
      const isPiecewise = parts.length > 2 && parts[2] === "piecewise";
      const segIdx = isPiecewise ? Number(parts[3]) : -1;

      let rootIdx = lineIdx;
      if (lines[lineIdx].isChain) {
        for (let i = lineIdx; i >= 0; i--) {
          if (!lines[i].isChain) {
            rootIdx = i;
            break;
          }
        }
      }
      const targetLine = lines[rootIdx];

      newLines = [...lines];
      if (targetLine.globalHeading === undefined) {
        if (isPiecewise) {
          const segments = line.endPoint.segments || [];
          const seg = segments[segIdx];
          if (seg?.heading === "facingPoint") {
            const newSegs = [...segments] as any[];
            newSegs[segIdx] = { ...seg, targetX: inchX, targetY: inchY };
            newLines[lineIdx] = {
              ...line,
              endPoint: { ...line.endPoint, segments: newSegs } as Point,
            };
            linesChanged = true;
          }
        } else {
          newLines[lineIdx] = {
            ...line,
            endPoint: {
              ...line.endPoint,
              targetX: inchX,
              targetY: inchY,
            } as Point,
          };
          linesChanged = true;
        }
      } else if (isPiecewise) {
        const segments = targetLine.globalSegments || [];
        const seg = segments[segIdx];
        if (seg?.heading === "facingPoint") {
          const newSegs = [...segments] as any[];
          newSegs[segIdx] = { ...seg, targetX: inchX, targetY: inchY };
          newLines[rootIdx] = { ...targetLine, globalSegments: newSegs };
          linesChanged = true;
        }
      } else {
        newLines[rootIdx] = {
          ...targetLine,
          globalTargetX: inchX,
          globalTargetY: inchY,
        };
        linesChanged = true;
      }
    }
  } else if (id.startsWith("event-")) {
    const parts = id.split("-");
    const lIdx = Number(parts[1]);
    const eIdx = Number(parts[2]);
    const evMarkers = lines[lIdx]?.eventMarkers;
    if (evMarkers?.[eIdx]) {
      const ev = evMarkers[eIdx];
      newLines = [...lines];
      if (ev.type === "pose") {
        ev.poseX = Math.round(inchX * 100) / 100;
        ev.poseY = Math.round(inchY * 100) / 100;

        let bestDist = Infinity;
        let bestLineIdx = lIdx;
        lines.forEach((line, idx) => {
          if (line.hidden) return;
          const prevP = idx === 0 ? startPoint : lines[idx - 1].endPoint;
          const cps = [prevP, ...line.controlPoints, line.endPoint];
          const t = findClosestT({ x: inchX, y: inchY }, cps);
          const pt = getCurvePoint(t, cps);
          const dist = getDistance({ x: inchX, y: inchY }, pt);
          if (dist < bestDist) {
            bestDist = dist;
            bestLineIdx = idx;
          }
        });

        if (bestLineIdx === lIdx) {
          newLines[lIdx].eventMarkers = [...evMarkers];
        } else {
          const marker = evMarkers.splice(eIdx, 1)[0];
          newLines[lIdx].eventMarkers = [...evMarkers];
          if (!newLines[bestLineIdx].eventMarkers) {
            newLines[bestLineIdx].eventMarkers = [];
          }
          newLines[bestLineIdx].eventMarkers!.push(marker);
          const newEIdx = newLines[bestLineIdx].eventMarkers!.length - 1;
          const newId = `event-${bestLineIdx}-${newEIdx}`;
          idReplacement = { oldId: id, newId };
          if (nextCurrentElem === id) nextCurrentElem = newId;
        }
        linesChanged = true;
      } else {
        let bestDist = Infinity;
        let bestLineIdx = lIdx;
        let bestT = 0;

        lines.forEach((line, idx) => {
          if (line.hidden) return;
          const prevP = idx === 0 ? startPoint : lines[idx - 1].endPoint;
          const cps = [prevP, ...line.controlPoints, line.endPoint];
          const t = findClosestT({ x: inchX, y: inchY }, cps);
          const pt = getCurvePoint(t, cps);
          const dist = getDistance({ x: inchX, y: inchY }, pt);
          if (dist < bestDist) {
            bestDist = dist;
            bestLineIdx = idx;
            bestT = t;
          }
        });

        if (ev.type === "temporal" && timePrediction?.timeline) {
          const travelEvents = timePrediction.timeline.filter(
            (e: any) => e.type === "travel",
          );
          const matchingEvent = travelEvents.find(
            (e: any) => e?.line?.id === lines[bestLineIdx].id,
          );
          if (matchingEvent) {
            const newTime =
              (matchingEvent.startTime + bestT * matchingEvent.duration) * 1000;
            ev.time = newTime;
            ev.endTime = newTime;
          }
        } else {
          ev.position = bestT;
        }

        if (bestLineIdx === lIdx) {
          newLines[lIdx].eventMarkers = [...evMarkers];
        } else {
          const marker = evMarkers.splice(eIdx, 1)[0];
          newLines[lIdx].eventMarkers = [...evMarkers];
          if (!newLines[bestLineIdx].eventMarkers) {
            newLines[bestLineIdx].eventMarkers = [];
          }
          newLines[bestLineIdx].eventMarkers!.push(marker);
          const newEIdx = newLines[bestLineIdx].eventMarkers!.length - 1;
          const newId = `event-${bestLineIdx}-${newEIdx}`;
          idReplacement = { oldId: id, newId };
          if (nextCurrentElem === id) nextCurrentElem = newId;
        }
        linesChanged = true;
      }
    }
  } else if (id.startsWith("wait-event-")) {
    const parts = id.split("-");
    const waitId = parts[2];
    const eIdx = Number(parts[3]);
    const waitItem = sequence.find(
      (s) => s.kind === "wait" && (s as any).id === waitId,
    );
    if ((waitItem as any)?.eventMarkers?.[eIdx]) {
      const ev = (waitItem as any).eventMarkers[eIdx];
      if (ev.type === "pose") {
        ev.poseX = Math.round(inchX * 100) / 100;
        ev.poseY = Math.round(inchY * 100) / 100;
        sequenceChanged = true;
      }
    }
  } else if (id.startsWith("rotate-event-")) {
    const parts = id.split("-");
    const rotateId = parts[2];
    const eIdx = Number(parts[3]);
    const rotateItem = sequence.find(
      (s) => s.kind === "rotate" && (s as any).id === rotateId,
    );
    if ((rotateItem as any)?.eventMarkers?.[eIdx]) {
      const ev = (rotateItem as any).eventMarkers[eIdx];
      if (ev.type === "pose") {
        ev.poseX = Math.round(inchX * 100) / 100;
        ev.poseY = Math.round(inchY * 100) / 100;
        sequenceChanged = true;
      }
    }
  } else {
    const line = Number(id.split("-")[1]) - 1;
    const point = Number(id.split("-")[2]);

    if (line === -1) {
      if (!startPoint.locked) {
        newStartPoint = { ...startPoint, x: inchX, y: inchY };
        startPointChanged = true;
      }
    } else if (lines[line]) {
      newLines = [...lines];
      if (point === 0 && lines[line]?.endPoint) {
        newLines[line] = {
          ...lines[line],
          endPoint: { ...lines[line].endPoint, x: inchX, y: inchY },
        };
        if (lines[line].id) {
          const updated = updateLinkedWaypoints(
            newLines,
            lines[line].id as string,
          );
          if (updated !== newLines) {
            newLines = updated;
          }
        }
      } else if (!lines[line]?.locked) {
        const newControlPoints = [...lines[line].controlPoints];
        newControlPoints[point - 1] = {
          ...newControlPoints[point - 1],
          x: inchX,
          y: inchY,
        };
        newLines[line] = {
          ...lines[line],
          controlPoints: newControlPoints,
        };
      }
      linesChanged = true;
    }
  }

  return {
    lines: newLines,
    shapes: newShapes,
    startPoint: newStartPoint,
    sequence: newSequence,
    linesChanged,
    shapesChanged,
    startPointChanged,
    sequenceChanged,
    currentElem: nextCurrentElem,
    idReplacement,
  };
}

export interface DragOffsetContext {
  lines: Line[];
  shapes: Shape[];
  startPoint: Point;
  sequence: SequenceItem[];
}

/**
 * Computes mouse drag offsets for all selected elements at the moment dragging starts.
 */
export function computeMultiDragOffsets(
  elementIds: string[],
  mouseX: number,
  mouseY: number,
  context: DragOffsetContext,
): Map<string, { x: number; y: number }> {
  const { lines, shapes, startPoint, sequence } = context;
  const offsets = new Map<string, { x: number; y: number }>();

  elementIds.forEach((id) => {
    let ox = mouseX;
    let oy = mouseY;

    if (id.startsWith("obstacle-")) {
      const parts = id.split("-");
      const shapeIdx = Number(parts[1]);
      const vertexIdx = Number(parts[2]);
      if (shapes[shapeIdx]?.vertices?.[vertexIdx]) {
        ox = shapes[shapeIdx].vertices[vertexIdx].x;
        oy = shapes[shapeIdx].vertices[vertexIdx].y;
      }
    } else if (id.startsWith("targetpoint-")) {
      const parts = id.split("-");
      const lineIdx = Number(parts[1]) - 1;
      if (lines[lineIdx]?.endPoint) {
        const targetLine = lines[lineIdx];
        const isGlobal =
          targetLine.globalHeading !== undefined &&
          targetLine.globalHeading !== "none";

        if (parts.length > 2 && parts[2] === "piecewise") {
          const segIdx = Number(parts[3]);
          const segments = isGlobal
            ? targetLine.globalSegments || []
            : targetLine.endPoint.segments || [];
          if (segments[segIdx]) {
            ox = segments[segIdx].targetX || 0;
            oy = segments[segIdx].targetY || 0;
          }
        } else {
          ox =
            (isGlobal
              ? targetLine.globalTargetX
              : targetLine.endPoint.targetX) || 0;
          oy =
            (isGlobal
              ? targetLine.globalTargetY
              : targetLine.endPoint.targetY) || 0;
        }
      }
    } else if (id.startsWith("point-")) {
      const line = Number(id.split("-")[1]) - 1;
      const point = Number(id.split("-")[2]);
      if (line === -1) {
        ox = startPoint.x;
        oy = startPoint.y;
      } else if (lines[line]) {
        if (point === 0 && lines[line]?.endPoint) {
          ox = lines[line].endPoint.x;
          oy = lines[line].endPoint.y;
        } else if (lines[line]?.controlPoints?.[point - 1]) {
          ox = lines[line].controlPoints[point - 1].x;
          oy = lines[line].controlPoints[point - 1].y;
        }
      }
    } else if (id.startsWith("event-")) {
      const parts = id.split("-");
      const lIdx = Number(parts[1]);
      const eIdx = Number(parts[2]);
      const ev = lines[lIdx]?.eventMarkers?.[eIdx];
      if (ev?.type === "pose") {
        ox = ev.poseX ?? 0;
        oy = ev.poseY ?? 0;
      }
    } else if (id.startsWith("wait-event-")) {
      const parts = id.split("-");
      const waitId = parts[2];
      const eIdx = Number(parts[3]);
      const waitItem = sequence.find(
        (s) => s.kind === "wait" && (s as any).id === waitId,
      );
      const ev = (waitItem as any)?.eventMarkers?.[eIdx];
      if (ev?.type === "pose") {
        ox = ev.poseX ?? 0;
        oy = ev.poseY ?? 0;
      }
    } else if (id.startsWith("rotate-event-")) {
      const parts = id.split("-");
      const rotateId = parts[2];
      const eIdx = Number(parts[3]);
      const rotateItem = sequence.find(
        (s) => s.kind === "rotate" && (s as any).id === rotateId,
      );
      const ev = (rotateItem as any)?.eventMarkers?.[eIdx];
      if (ev?.type === "pose") {
        ox = ev.poseX ?? 0;
        oy = ev.poseY ?? 0;
      }
    }

    offsets.set(id, { x: ox - mouseX, y: oy - mouseY });
  });

  return offsets;
}

export interface DragIterationParams {
  multiSelectedPointIds: string[];
  multiDragOffsets: Map<string, { x: number; y: number }>;
  xPos: number;
  yPos: number;
  xInvert: (v: number) => number;
  yInvert: (v: number) => number;
  snapToGrid: boolean;
  showGrid: boolean;
  gridSize: number;
  smartSnappingEnabled: boolean;
  isAltKey: boolean;
  lines: Line[];
  shapes: Shape[];
  startPoint: Point;
  sequence: SequenceItem[];
  timePrediction: unknown;
  currentElem: string | null;
  fieldW: number;
  fieldH: number;
  settings: unknown;
}

export interface DragIterationResult {
  lines: Line[];
  shapes: Shape[];
  startPoint: Point;
  sequence: SequenceItem[];
  linesChanged: boolean;
  shapesChanged: boolean;
  startPointChanged: boolean;
  sequenceChanged: boolean;
  currentElem: string | null;
  idReplacements: Array<{ oldId: string; newId: string }>;
  guides: Array<{ type: "vertical" | "horizontal"; coord: number }>;
}

/**
 * Runs a single dragging iteration across all multi-selected elements.
 */
export function executeMultiDragIteration(
  params: DragIterationParams,
): DragIterationResult {
  const {
    multiSelectedPointIds,
    multiDragOffsets,
    xPos,
    yPos,
    xInvert,
    yInvert,
    snapToGrid,
    showGrid,
    gridSize,
    smartSnappingEnabled,
    isAltKey,
    fieldW,
    fieldH,
    settings,
    timePrediction,
  } = params;

  let lines = params.lines;
  let shapes = params.shapes;
  let startPoint = params.startPoint;
  let sequence = params.sequence;
  let currentElem = params.currentElem;

  let linesChanged = false;
  let shapesChanged = false;
  let startPointChanged = false;
  let sequenceChanged = false;

  const guides: Array<{ type: "vertical" | "horizontal"; coord: number }> = [];
  const idReplacements: Array<{ oldId: string; newId: string }> = [];

  multiSelectedPointIds.forEach((id) => {
    if (id.startsWith("point-")) {
      const line = Number(id.split("-")[1]) - 1;
      if (line >= 0 && lines[line]?.locked) return;
    }

    const offset = multiDragOffsets.get(id) || { x: 0, y: 0 };
    const rawInchX = xInvert(xPos) + offset.x;
    const rawInchY = yInvert(yPos) + offset.y;

    const snapRes = calculateSmartSnapAndBounds({
      id,
      rawInchX,
      rawInchY,
      snapToGrid,
      showGrid,
      gridSize,
      smartSnappingEnabled,
      isAltKey,
      startPoint,
      lines,
      shapes,
      fieldW,
      fieldH,
      settings: settings as Settings,
    });

    guides.push(...snapRes.guides);

    const dragRes = applyDragToElement({
      id,
      inchX: snapRes.inchX,
      inchY: snapRes.inchY,
      lines,
      shapes,
      startPoint,
      sequence,
      timePrediction: timePrediction as any,
      currentElem,
    });

    if (dragRes.linesChanged) {
      lines = dragRes.lines;
      linesChanged = true;
    }
    if (dragRes.shapesChanged) {
      shapes = dragRes.shapes;
      shapesChanged = true;
    }
    if (dragRes.startPointChanged) {
      startPoint = dragRes.startPoint;
      startPointChanged = true;
    }
    if (dragRes.sequenceChanged) {
      sequence = dragRes.sequence;
      sequenceChanged = true;
    }
    if (dragRes.currentElem !== currentElem) {
      currentElem = dragRes.currentElem;
    }
    if (dragRes.idReplacement) {
      idReplacements.push(dragRes.idReplacement);
    }
  });

  return {
    lines,
    shapes,
    startPoint,
    sequence,
    linesChanged,
    shapesChanged,
    startPointChanged,
    sequenceChanged,
    currentElem,
    idReplacements,
    guides,
  };
}

/**
 * Resolves cursor style, selected element key, and hovered marker ID during mouse hover.
 */
export function resolveHoverCursor(
  targetId: string | null | undefined,
  lines: Array<{ eventMarkers?: Array<{ id: string }> }>,
  sequence: Array<{
    kind?: string;
    id?: string;
    eventMarkers?: Array<{ id: string }>;
  }>,
): {
  cursor: "pointer" | "grab";
  currentElem: string | null;
  hoveredMarkerId: string | null;
} {
  if (
    targetId &&
    (targetId.startsWith("point") ||
      targetId.startsWith("obstacle") ||
      targetId.startsWith("targetpoint"))
  ) {
    return {
      cursor: "pointer",
      currentElem: targetId,
      hoveredMarkerId: null,
    };
  }

  if (
    targetId &&
    (targetId.startsWith("event-") ||
      targetId.startsWith("diff-event-") ||
      targetId.startsWith("event-circle-") ||
      targetId.startsWith("event-flag-") ||
      targetId.startsWith("wait-event-") ||
      targetId.startsWith("wait-event-circle-") ||
      targetId.startsWith("wait-event-flag-") ||
      targetId.startsWith("rotate-event-") ||
      targetId.startsWith("rotate-event-circle-") ||
      targetId.startsWith("rotate-event-arrow-"))
  ) {
    const normId = normalizeEventElementId(targetId);
    const actualHoverId = resolveHoveredMarkerId(normId, lines, sequence);
    return {
      cursor: "pointer",
      currentElem: normId,
      hoveredMarkerId: actualHoverId,
    };
  }

  return {
    cursor: "grab",
    currentElem: null,
    hoveredMarkerId: null,
  };
}

/**
 * Creates Two.js Line objects for visual smart snapping guide lines.
 */
export function createSnapGuides(
  guides: SnapGuide[],
  xScale: (inch: number) => number,
  yScale: (inch: number) => number,
  fieldW: number,
  fieldH: number,
  uiLength: (len: number) => number,
): InstanceType<typeof Two.Line>[] {
  return guides.map((g) => {
    const lineGuide =
      g.type === "vertical"
        ? new Two.Line(
            xScale(g.coord),
            yScale(0),
            xScale(g.coord),
            yScale(fieldH),
          )
        : new Two.Line(
            xScale(0),
            yScale(g.coord),
            xScale(fieldW),
            yScale(g.coord),
          );
    lineGuide.stroke = "#f59e0b";
    lineGuide.linewidth = uiLength(0.5);
    lineGuide.dashes = [uiLength(4), uiLength(4)];
    return lineGuide;
  });
}

export interface ApplyDragIterationStores {
  lines: { set: (l: Line[]) => void };
  shapes: { set: (s: Shape[]) => void };
  startPoint: { set: (p: Point) => void };
  sequence: { set: (s: SequenceItem[]) => void };
  multiSelectedPointIds: { update: (fn: (ids: string[]) => string[]) => void };
}

/**
 * Applies multi-drag iteration changes to Svelte stores and updates id mappings.
 */
export function applyDragIterationUpdates(params: {
  dragIter: DragIterationResult;
  currentElem: string | null;
  multiDragOffsets: Map<string, { x: number; y: number }>;
  stores: ApplyDragIterationStores;
}): {
  currentElem: string | null;
} {
  const { dragIter, multiDragOffsets, stores } = params;
  if (dragIter.linesChanged) {
    stores.lines.set([...dragIter.lines]);
  }
  if (dragIter.shapesChanged) {
    stores.shapes.set([...dragIter.shapes]);
  }
  if (dragIter.startPointChanged) {
    stores.startPoint.set({ ...dragIter.startPoint });
  }
  if (dragIter.sequenceChanged) {
    stores.sequence.set([...dragIter.sequence]);
  }
  if (dragIter.idReplacements.length > 0) {
    dragIter.idReplacements.forEach(
      ({ oldId, newId }: { oldId: string; newId: string }) => {
        stores.multiSelectedPointIds.update((ids) =>
          ids.map((sid) => (sid === oldId ? newId : sid)),
        );
        const off = multiDragOffsets.get(oldId);
        if (off) {
          multiDragOffsets.set(newId, off);
          multiDragOffsets.delete(oldId);
        }
      },
    );
  }
  return {
    currentElem: dragIter.currentElem,
  };
}
