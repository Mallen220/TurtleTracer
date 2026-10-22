// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  linesStore,
  shapesStore,
  sequenceStore,
  startPointStore,
} from "../../projectStore";
import { snapToGrid, gridSize } from "../../../stores";
import {
  selectedLineId,
  selectedPointId,
  multiSelectedPointIds,
  multiSelectedLineIds,
} from "../../../stores";
import { FIELD_SIZE } from "../../../config";
import type {
  EventMarker,
  Line,
  Point,
  SequenceItem,
  Shape,
} from "../../../types";
import { isUIElementFocused, getSelectedSequenceIndex } from "./utils";
import {
  parseSelectionId,
  eventStepKind,
  findSequenceItem,
  findSequenceItemIndex,
  updateEventMarkerPosition,
} from "./itemUtils";

/** The selected points as ids: the multiple selection if there is one, else the single one. */
function selectedIds(): string[] {
  const many = get(multiSelectedPointIds);
  const one = get(selectedPointId);
  return many.length > 0 ? many : one ? [one] : [];
}

/** Everything the selection asks to delete, sorted into what it applies to. */
interface Deletions {
  waits: string[];
  rotates: string[];
  points: { lineIndex: number; ptIdx: number }[];
  markers: {
    itemType: "wait" | "rotate" | "line";
    itemId: string;
    evIdx: number;
  }[];
}

function collectDeletions(selections: string[]): Deletions {
  const deletions: Deletions = {
    waits: [],
    rotates: [],
    points: [],
    markers: [],
  };
  for (const selection of selections) {
    const info = parseSelectionId(selection);
    if (info.type === "wait") {
      deletions.waits.push(info.id);
    } else if (info.type === "rotate") {
      deletions.rotates.push(info.id);
    } else if (info.type === "point") {
      // The start point can't be deleted.
      if (info.lineNum !== 0 || info.ptIdx !== 0) {
        deletions.points.push({
          lineIndex: info.lineNum - 1,
          ptIdx: info.ptIdx,
        });
      }
    } else if (info.type === "event-wait" || info.type === "event-rotate") {
      deletions.markers.push({
        itemType: eventStepKind(info),
        evIdx: info.evIdx,
        itemId: info.id,
      });
    } else if (info.type === "event-line") {
      deletions.markers.push({
        itemType: "line",
        evIdx: info.evIdx,
        itemId: String(info.lineIdx),
      });
    }
  }
  return deletions;
}

interface Route {
  lines: Line[];
  sequence: SequenceItem[];
}

/** Takes out the event markers asked for, from locked-or-not steps and paths that allow it. */
function deleteMarkers(route: Route, markers: Deletions["markers"]) {
  // Highest first, so removing one doesn't shift the next.
  for (const { itemType, itemId, evIdx } of markers.toSorted(
    (a, b) => b.evIdx - a.evIdx,
  )) {
    if (itemType === "line") {
      const lineIdx = Number(itemId);
      const line = route.lines[lineIdx];
      if (line?.eventMarkers?.[evIdx] && !line.locked) {
        route.lines[lineIdx] = {
          ...line,
          eventMarkers: line.eventMarkers.filter((_, i) => i !== evIdx),
        };
      }
      continue;
    }
    const itemIdx = findSequenceItemIndex(route.sequence, itemId, itemType);
    const item = route.sequence[itemIdx];
    if (
      item &&
      (item.kind === "wait" || item.kind === "rotate") &&
      item.eventMarkers?.[evIdx] &&
      !item.locked
    ) {
      route.sequence[itemIdx] = {
        ...item,
        eventMarkers: item.eventMarkers.filter((_, i) => i !== evIdx),
      };
    }
  }
}

/** Takes out control points, and whole paths (with their steps) when their end point is selected. */
function deletePoints(route: Route, points: Deletions["points"]) {
  const pathsToRemove = new Set<number>();
  // Highest first, so removing one doesn't shift the next.
  for (const { lineIndex, ptIdx } of points.toSorted(
    (a, b) => b.ptIdx - a.ptIdx,
  )) {
    const line = route.lines[lineIndex];
    if (!line || line.locked) continue;
    if (ptIdx === 0) {
      pathsToRemove.add(lineIndex);
    } else if (line.controlPoints?.[ptIdx - 1] !== undefined) {
      route.lines[lineIndex] = {
        ...line,
        controlPoints: line.controlPoints.filter((_, i) => i !== ptIdx - 1),
      };
    }
  }

  for (const lineIndex of [...pathsToRemove].sort((a, b) => b - a)) {
    const [removed] = route.lines.splice(lineIndex, 1);
    if (removed.id) {
      route.sequence = route.sequence.filter(
        (item) => !(item.kind === "path" && item.lineId === removed.id),
      );
    }
  }
}

/** Takes out the waits or turns with these ids, other than locked ones. */
function deleteSteps(route: Route, kind: "wait" | "rotate", ids: string[]) {
  if (ids.length === 0) return;
  route.sequence = route.sequence.filter(
    (item) => !(item.kind === kind && ids.includes(item.id) && !item.locked),
  );
}

/** The route after deleting what `selections` ask to, without changing the original. */
function deleteSelection(route: Route, selections: string[]): Route {
  const deletions = collectDeletions(selections);
  const result: Route = {
    lines: [...route.lines],
    sequence: [...route.sequence],
  };
  // Markers first: they refer to paths by position, which deleting a path changes.
  deleteMarkers(result, deletions.markers);
  deletePoints(result, deletions.points);
  deleteSteps(result, "wait", deletions.waits);
  deleteSteps(result, "rotate", deletions.rotates);
  return result;
}

export function removeSelected(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;

  const selections = selectedIds();
  if (selections.length === 0) return;

  const before = { lines: get(linesStore), sequence: get(sequenceStore) };
  const after = deleteSelection(before, selections);
  linesStore.set(after.lines);
  sequenceStore.set(after.sequence);

  selectedPointId.set(null);
  multiSelectedPointIds.set([]);
  selectedLineId.set(null);
  multiSelectedLineIds.set([]);
  recordChange("Delete Selection");
}

/** How a single arrow-key press moves a point. */
interface Nudge {
  /** The new x or y, for a point at `current`, one step in `direction` (-1, 0 or 1). */
  next: (current: number, direction: number) => number;
  dx: number;
  dy: number;
}

const roundCoordinate = (value: number) => Number(value.toFixed(3));

/** `point` moved one step, kept on the field. */
function nudged<P extends { x: number; y: number }>(point: P, nudge: Nudge): P {
  return {
    ...point,
    x: roundCoordinate(nudge.next(point.x, nudge.dx)),
    y: roundCoordinate(nudge.next(point.y, nudge.dy)),
  };
}

/** Moves an event marker along its path or step. */
function nudgedMarkers(markers: EventMarker[], evIdx: number, nudge: Nudge) {
  const newMarkers = [...markers];
  newMarkers[evIdx] = {
    ...newMarkers[evIdx],
    position: updateEventMarkerPosition(
      newMarkers[evIdx],
      0.01 * (nudge.dx + nudge.dy),
    ),
  };
  return newMarkers;
}

/** The project as it is being nudged, and which parts of it have changed. */
interface Nudged {
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
  sequence: SequenceItem[];
  changed: Set<"startPoint" | "lines" | "shapes" | "sequence">;
}

/** Nudges the start point, a path's end or one of its control points. */
function nudgePoint(
  project: Nudged,
  info: { lineNum: number; ptIdx: number },
  nudge: Nudge,
) {
  if (info.lineNum === 0 && info.ptIdx === 0) {
    if (!project.startPoint.locked) {
      project.startPoint = nudged(project.startPoint, nudge);
      project.changed.add("startPoint");
    }
    return;
  }
  const lineIndex = info.lineNum - 1;
  const line = project.lines[lineIndex];
  if (!line || line.locked) return;

  if (info.ptIdx === 0) {
    if (!line.endPoint) return;
    project.lines[lineIndex] = {
      ...line,
      endPoint: nudged(line.endPoint, nudge),
    };
  } else {
    const cpIndex = info.ptIdx - 1;
    if (!line.controlPoints[cpIndex]) return;
    const controlPoints = [...line.controlPoints];
    controlPoints[cpIndex] = nudged(controlPoints[cpIndex], nudge);
    project.lines[lineIndex] = { ...line, controlPoints };
  }
  project.changed.add("lines");
}

function nudgeObstacleCorner(
  project: Nudged,
  info: { shapeIdx: number; vertexIdx: number },
  nudge: Nudge,
) {
  const shape = project.shapes[info.shapeIdx];
  if (!shape?.vertices[info.vertexIdx]) return;
  const vertices = [...shape.vertices];
  vertices[info.vertexIdx] = nudged(vertices[info.vertexIdx], nudge);
  project.shapes[info.shapeIdx] = { ...shape, vertices };
  project.changed.add("shapes");
}

/** Slides an event marker along its wait, turn or path. */
function nudgeMarker(
  project: Nudged,
  info:
    | { type: "event-wait" | "event-rotate"; id: string; evIdx: number }
    | { type: "event-line"; lineIdx: number; evIdx: number },
  nudge: Nudge,
) {
  if (info.type === "event-line") {
    const line = project.lines[info.lineIdx];
    if (!line?.eventMarkers?.[info.evIdx]) return;
    project.lines[info.lineIdx] = {
      ...line,
      eventMarkers: nudgedMarkers(line.eventMarkers, info.evIdx, nudge),
    };
    project.changed.add("lines");
    return;
  }

  const itemIdx = findSequenceItemIndex(
    project.sequence,
    info.id,
    eventStepKind(info),
  );
  const item = project.sequence[itemIdx];
  if (
    item &&
    (item.kind === "wait" || item.kind === "rotate") &&
    item.eventMarkers?.[info.evIdx]
  ) {
    project.sequence[itemIdx] = {
      ...item,
      eventMarkers: nudgedMarkers(item.eventMarkers, info.evIdx, nudge),
    };
    project.changed.add("sequence");
  }
}

function nudgeSelection(project: Nudged, selection: string, nudge: Nudge) {
  const info = parseSelectionId(selection);
  switch (info.type) {
    case "point":
      return nudgePoint(project, info, nudge);
    case "obstacle":
      return nudgeObstacleCorner(project, info, nudge);
    case "event-wait":
    case "event-rotate":
    case "event-line":
      return nudgeMarker(project, info, nudge);
  }
}

export function movePoint(
  dx: number,
  dy: number,
  recordChange: (action?: string) => void,
) {
  if (isUIElementFocused()) return;

  const selections = selectedIds();
  if (selections.length === 0) return;

  const snapMode = get(snapToGrid);
  const gridStep = (get(gridSize) as number) || 1;
  const eps = 1e-8;

  /** The grid line after (or before) `current`, in the direction of travel. */
  const nextGridCoord = (current: number, direction: number) => {
    if (direction > 0) {
      return Math.min(
        FIELD_SIZE,
        Math.ceil((current + eps) / gridStep) * gridStep,
      );
    }
    if (direction < 0) {
      return Math.max(0, Math.floor((current - eps) / gridStep) * gridStep);
    }
    return current;
  };
  const nudge: Nudge = {
    dx,
    dy,
    next: (current, direction) =>
      snapMode
        ? nextGridCoord(current, direction)
        : Math.max(0, Math.min(FIELD_SIZE, current + direction)),
  };

  const project: Nudged = {
    startPoint: get(startPointStore),
    lines: [...get(linesStore)],
    shapes: [...get(shapesStore)],
    sequence: [...get(sequenceStore)],
    changed: new Set(),
  };
  for (const selection of selections) nudgeSelection(project, selection, nudge);

  if (project.changed.has("startPoint"))
    startPointStore.set(project.startPoint);
  if (project.changed.has("lines")) linesStore.set(project.lines);
  if (project.changed.has("shapes")) shapesStore.set(project.shapes);
  if (project.changed.has("sequence")) sequenceStore.set(project.sequence);

  recordChange("Move Point");
}

export function getSelectableItems() {
  const sequence = get(sequenceStore);
  const lines = get(linesStore);
  const shapes = get(shapesStore);

  const items: string[] = ["point-0-0"];
  sequence.forEach((item) => {
    if (item.kind === "path") {
      const lineIdx = lines.findIndex((l) => l.id === item.lineId);
      if (lineIdx !== -1) {
        const line = lines[lineIdx];
        line.controlPoints.forEach((_, cpIdx) =>
          items.push(`point-${lineIdx + 1}-${cpIdx + 1}`),
        );
        items.push(`point-${lineIdx + 1}-0`);
      }
    } else if (item.kind === "wait" || item.kind === "rotate") {
      items.push(`${item.kind}-${item.id}`);
      item.eventMarkers?.forEach((_, evIdx) =>
        items.push(`event-${item.kind}-${item.id}-${evIdx}`),
      );
    }
  });
  lines.forEach((line, lineIdx) => {
    if (line.eventMarkers)
      line.eventMarkers.forEach((_, evIdx) =>
        items.push(`event-${lineIdx}-${evIdx}`),
      );
  });
  shapes.forEach((s, sIdx) => {
    s.vertices.forEach((_, vIdx) => items.push(`obstacle-${sIdx}-${vIdx}`));
  });
  return items;
}

/** Something that can scroll the sidebar to show a sequence item. */
type ScrollTarget = { scrollToItem?: (kind: string, id: string) => void };

/** What to scroll the sidebar to for a selection: the kind of item and its id. */
function scrollTargetFor(
  sel: string,
  sequence: SequenceItem[],
  lines: Line[],
): [kind: string, id: string] | null {
  const info = parseSelectionId(sel);

  if (info.type === "wait" || info.type === "rotate") {
    return [info.type, info.id];
  }
  if (info.type === "point") {
    const lineId = lines[info.lineNum - 1]?.id;
    return info.lineNum > 0 && lineId ? ["path", lineId] : null;
  }
  if (info.type === "event-wait" || info.type === "event-rotate") {
    const item = findSequenceItem(sequence, info.id, eventStepKind(info));
    const marker = item?.eventMarkers?.[info.evIdx];
    return marker ? ["event", marker.id] : null;
  }
  if (info.type === "event-line") {
    const marker = lines[info.lineIdx]?.eventMarkers?.[info.evIdx];
    return marker ? ["event", marker.id] : null;
  }
  return null;
}

function syncSelectionToUI(controlTabRef: ScrollTarget | null | undefined) {
  const sel = get(selectedPointId);
  if (!sel || !controlTabRef?.scrollToItem) return;

  const target = scrollTargetFor(sel, get(sequenceStore), get(linesStore));
  if (target) controlTabRef.scrollToItem(...target);
}

/** Selects a step of the route, returning the id it selected (or null if it couldn't). */
function selectStep(item: SequenceItem, lines: Line[]): string | null {
  if (item.kind === "path") {
    selectedLineId.set(item.lineId);
    const lineIdx = lines.findIndex((l) => l.id === item.lineId);
    if (lineIdx === -1) return null;
    const id = `point-${lineIdx + 1}-0`;
    selectedPointId.set(id);
    return id;
  }
  if (item.kind === "wait" || item.kind === "rotate") {
    const id = `${item.kind}-${item.id}`;
    selectedPointId.set(id);
    selectedLineId.set(null);
    return id;
  }
  return null;
}

export function cycleSequenceSelection(
  dir: number,
  controlTabRef: ScrollTarget | null | undefined,
) {
  if (isUIElementFocused()) return;
  const sequence = get(sequenceStore);
  if (sequence.length === 0) return;

  const selectedIdx = getSelectedSequenceIndex();
  const nextIdx =
    selectedIdx === null
      ? 0
      : (selectedIdx + dir + sequence.length) % sequence.length;

  const item = sequence[nextIdx];
  if (!item) return;

  const newId = selectStep(item, get(linesStore));
  if (newId) multiSelectedPointIds.set([newId]);

  syncSelectionToUI(controlTabRef);
}

export function selectAll(): void {
  if (
    document.activeElement &&
    ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    return;
  }

  const lines = get(linesStore);
  if (lines.length === 0) return;

  const allLineIds = lines.map((l) => l.id as string).filter(Boolean);
  const allPointIds: string[] = [];

  lines.forEach((l, i) => {
    const lineNum = i + 1;
    if (i === 0) {
      allPointIds.push("point-0-0");
    }
    const numPoints = 1 + (l.controlPoints ? l.controlPoints.length : 0);
    for (let pIdx = 0; pIdx < numPoints; pIdx++) {
      allPointIds.push(`point-${lineNum}-${pIdx}`);
    }
  });

  multiSelectedLineIds.set(allLineIds);
  multiSelectedPointIds.set(allPointIds);

  const lastLine = lines.at(-1);
  if (lastLine) {
    const numPoints =
      1 + (lastLine.controlPoints ? lastLine.controlPoints.length : 0);
    selectedLineId.set(lastLine.id || null);
    selectedPointId.set(`point-${lines.length}-${numPoints - 1}`);
  }
}
