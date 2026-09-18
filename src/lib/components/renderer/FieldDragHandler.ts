// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type {
  Line,
  Point,
  Shape,
  SequenceItem,
  Settings,
  EventMarker,
  TimePrediction,
} from "../../../types/index";
import { closestPointOnPath } from "../../../utils/geometry";
import { updateLinkedWaypoints } from "../../../utils/pointLinking";
import {
  parseElementId,
  parseStepEventId,
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
  timePrediction?: TimePrediction;
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

type XY = { x: number; y: number };

const roundToHundredth = (v: number) => Math.round(v * 100) / 100;

/**
 * Facing-point targets live on the line itself, unless the line is part of
 * a chain whose first line sets a heading for the whole chain. Returns the
 * index of the line that owns the target and whether it's the chain's.
 */
function facingTargetOwner(
  lines: Line[],
  lineIdx: number,
): { ownerIdx: number; global: boolean } {
  let root = lineIdx;
  while (root > 0 && lines[root].isChain) root--;
  const heading = lines[root]?.globalHeading;
  return heading && heading !== "none"
    ? { ownerIdx: root, global: true }
    : { ownerIdx: lineIdx, global: false };
}

/** "targetpoint-{line+1}" or "targetpoint-{line+1}-piecewise-{segment}". */
function parseTargetPointId(id: string) {
  const parts = id.split("-");
  return {
    lineIdx: Number(parts[1]) - 1,
    segIdx: parts[2] === "piecewise" ? Number(parts[3]) : null,
  };
}

function getFacingTarget(
  lines: Line[],
  lineIdx: number,
  segIdx: number | null,
): XY | null {
  if (!lines[lineIdx]) return null;
  const { ownerIdx, global } = facingTargetOwner(lines, lineIdx);
  const owner = lines[ownerIdx];
  if (segIdx !== null) {
    const seg = (global ? owner.globalSegments : owner.endPoint.segments)?.[
      segIdx
    ];
    return seg ? { x: seg.targetX || 0, y: seg.targetY || 0 } : null;
  }
  return global
    ? { x: owner.globalTargetX || 0, y: owner.globalTargetY || 0 }
    : { x: owner.endPoint.targetX || 0, y: owner.endPoint.targetY || 0 };
}

/** Returns new lines with the target moved, or null if there's nothing to move. */
function setFacingTarget(
  lines: Line[],
  lineIdx: number,
  segIdx: number | null,
  { x, y }: XY,
): Line[] | null {
  if (!lines[lineIdx]?.endPoint) return null;
  const { ownerIdx, global } = facingTargetOwner(lines, lineIdx);
  const owner = lines[ownerIdx];
  let updated: Line;

  if (segIdx === null) {
    updated = global
      ? { ...owner, globalTargetX: x, globalTargetY: y }
      : {
          ...owner,
          endPoint: { ...owner.endPoint, targetX: x, targetY: y } as Point,
        };
  } else {
    const segments =
      (global ? owner.globalSegments : owner.endPoint.segments) ?? [];
    if (segments[segIdx]?.heading !== "facingPoint") return null;
    const newSegments = segments.map((seg, i) =>
      i === segIdx ? ({ ...seg, targetX: x, targetY: y } as typeof seg) : seg,
    );
    updated = global
      ? { ...owner, globalSegments: newSegments }
      : {
          ...owner,
          endPoint: { ...owner.endPoint, segments: newSegments } as Point,
        };
  }

  const newLines = [...lines];
  newLines[ownerIdx] = updated;
  return newLines;
}

/** An event marker on a wait or rotate step, from its element id. */
function findStepMarker(sequence: SequenceItem[], id: string) {
  const step = parseStepEventId(id);
  if (!step) return undefined;
  const item = sequence.find(
    (s) => s.kind === step.kind && (s as { id?: string }).id === step.itemId,
  ) as { eventMarkers?: EventMarker[] } | undefined;
  return item?.eventMarkers?.[step.eventIndex];
}

/**
 * Moves a path event marker to (x, y). The marker snaps to the nearest path
 * and may move to a different line, which changes its element id.
 */
function dragLineMarker(
  lines: Line[],
  startPoint: Point,
  timePrediction: TimePrediction | undefined,
  lineIdx: number,
  markerIdx: number,
  pt: XY,
): { lines: Line[]; newId?: string } | null {
  const marker = lines[lineIdx]?.eventMarkers?.[markerIdx];
  if (!marker) return null;

  const closest = closestPointOnPath(lines, startPoint, pt);
  const targetIdx = closest?.lineIdx ?? lineIdx;
  const moved: EventMarker = { ...marker };

  if (marker.type === "pose") {
    moved.poseX = roundToHundredth(pt.x);
    moved.poseY = roundToHundredth(pt.y);
  } else if (marker.type === "temporal" && timePrediction?.timeline) {
    // Temporal markers store the time the robot passes this point.
    const travel = timePrediction.timeline.find(
      (e) => e.type === "travel" && e.line?.id === lines[targetIdx].id,
    );
    if (travel && closest) {
      moved.time = moved.endTime =
        (travel.startTime + closest.t * travel.duration) * 1000;
    }
  } else if (closest) {
    moved.position = closest.t;
  }

  const newLines = [...lines];
  const without = lines[lineIdx].eventMarkers!.filter(
    (_, i) => i !== markerIdx,
  );
  if (targetIdx === lineIdx) {
    const markers = [...lines[lineIdx].eventMarkers!];
    markers[markerIdx] = moved;
    newLines[lineIdx] = { ...lines[lineIdx], eventMarkers: markers };
    return { lines: newLines };
  }

  newLines[lineIdx] = { ...lines[lineIdx], eventMarkers: without };
  const targetMarkers = [...(lines[targetIdx].eventMarkers ?? []), moved];
  newLines[targetIdx] = { ...lines[targetIdx], eventMarkers: targetMarkers };
  return {
    lines: newLines,
    newId: `event-${targetIdx}-${targetMarkers.length - 1}`,
  };
}

/**
 * Applies a drag coordinate update to the appropriate project element
 * (obstacle vertex, facing target, event marker, or path point).
 */
export function applyDragToElement(params: DragUpdateParams): DragUpdateResult {
  const { id, inchX, inchY, lines, shapes, startPoint, sequence } = params;
  const result: DragUpdateResult = {
    lines,
    shapes,
    startPoint,
    sequence,
    linesChanged: false,
    shapesChanged: false,
    startPointChanged: false,
    sequenceChanged: false,
    currentElem: params.currentElem,
  };
  const pt = { x: inchX, y: inchY };
  const parsed = parseElementId(id);

  if (id.startsWith("targetpoint-")) {
    const { lineIdx, segIdx } = parseTargetPointId(id);
    const moved = setFacingTarget(lines, lineIdx, segIdx, pt);
    if (moved) {
      result.lines = moved;
      result.linesChanged = true;
    }
  } else if (parsed?.type === "obstacle") {
    const shape = shapes[parsed.shapeIndex];
    if (shape && !shape.locked) {
      const vertices = [...shape.vertices];
      vertices[parsed.vertexIndex] = { ...vertices[parsed.vertexIndex], ...pt };
      result.shapes = [...shapes];
      result.shapes[parsed.shapeIndex] = { ...shape, vertices };
      result.shapesChanged = true;
    }
  } else if (parsed?.type === "event") {
    const moved = dragLineMarker(
      lines,
      startPoint,
      params.timePrediction,
      parsed.lineIndex,
      parsed.eventIndex,
      pt,
    );
    if (moved) {
      result.lines = moved.lines;
      result.linesChanged = true;
      if (moved.newId) {
        result.idReplacement = { oldId: id, newId: moved.newId };
        if (result.currentElem === id) result.currentElem = moved.newId;
      }
    }
  } else if (parsed?.type === "wait-event" || parsed?.type === "rotate-event") {
    // Only pose markers on waits/rotates have a position on the field.
    const marker = findStepMarker(sequence, id);
    if (marker?.type === "pose") {
      marker.poseX = roundToHundredth(pt.x);
      marker.poseY = roundToHundredth(pt.y);
      result.sequenceChanged = true;
    }
  } else if (parsed?.type === "point") {
    const { lineIndex, pointIndex } = parsed;
    const line = lines[lineIndex];
    if (lineIndex === -1) {
      if (!startPoint.locked) {
        result.startPoint = { ...startPoint, ...pt };
        result.startPointChanged = true;
      }
    } else if (line) {
      let newLines = [...lines];
      if (pointIndex === 0) {
        newLines[lineIndex] = {
          ...line,
          endPoint: { ...line.endPoint, ...pt },
        };
        // Points with the same name are linked and move together.
        if (line.id) newLines = updateLinkedWaypoints(newLines, line.id);
      } else if (!line.locked) {
        const controlPoints = [...line.controlPoints];
        controlPoints[pointIndex - 1] = {
          ...controlPoints[pointIndex - 1],
          ...pt,
        };
        newLines[lineIndex] = { ...line, controlPoints };
      }
      result.lines = newLines;
      result.linesChanged = true;
    }
  }

  return result;
}

export interface DragOffsetContext {
  lines: Line[];
  shapes: Shape[];
  startPoint: Point;
  sequence: SequenceItem[];
}

/** Where a draggable element currently is, or null if it has no position. */
function getElementPosition(id: string, ctx: DragOffsetContext): XY | null {
  const { lines, shapes, startPoint, sequence } = ctx;
  if (id.startsWith("targetpoint-")) {
    const { lineIdx, segIdx } = parseTargetPointId(id);
    return getFacingTarget(lines, lineIdx, segIdx);
  }

  const parsed = parseElementId(id);
  switch (parsed?.type) {
    case "obstacle":
      return shapes[parsed.shapeIndex]?.vertices?.[parsed.vertexIndex] ?? null;
    case "point": {
      if (parsed.lineIndex === -1) return startPoint;
      const line = lines[parsed.lineIndex];
      return parsed.pointIndex === 0
        ? (line?.endPoint ?? null)
        : (line?.controlPoints?.[parsed.pointIndex - 1] ?? null);
    }
    case "event":
    case "wait-event":
    case "rotate-event": {
      const marker =
        parsed.type === "event"
          ? lines[parsed.lineIndex]?.eventMarkers?.[parsed.eventIndex]
          : findStepMarker(sequence, id);
      // Other marker types follow the path rather than a fixed position.
      return marker?.type === "pose"
        ? { x: marker.poseX ?? 0, y: marker.poseY ?? 0 }
        : null;
    }
    default:
      return null;
  }
}

/**
 * Offsets from the mouse to each selected element when a drag starts, so
 * they keep their relative positions while moving.
 */
export function computeMultiDragOffsets(
  elementIds: string[],
  mouseX: number,
  mouseY: number,
  context: DragOffsetContext,
): Map<string, XY> {
  const offsets = new Map<string, XY>();
  for (const id of elementIds) {
    const pos = getElementPosition(id, context) ?? { x: mouseX, y: mouseY };
    offsets.set(id, { x: pos.x - mouseX, y: pos.y - mouseY });
  }
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
      timePrediction: timePrediction as TimePrediction | undefined,
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
