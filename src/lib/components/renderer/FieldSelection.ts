// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, Shape } from "../../../types";
import { normalizeEventElementId } from "./ElementIdParser";

export interface SelectionState {
  selectedPointId: string | null;
  selectedLineId: string | null;
  multiSelectedPointIds: string[];
  multiSelectedLineIds: string[];
}

/**
 * Identifies the clicked element ID from an event target element.
 */
export function detectClickedElement(
  target: EventTarget | { id?: string } | null,
): string | null {
  if (!target || typeof target !== "object" || !("id" in target)) {
    return null;
  }
  const id = (target as { id: unknown }).id;
  if (typeof id !== "string" || !id) {
    return null;
  }
  if (
    id.startsWith("point") ||
    id.startsWith("obstacle-") ||
    id.startsWith("targetpoint")
  ) {
    return id;
  }
  if (id.includes("event-")) {
    return normalizeEventElementId(id);
  }
  return null;
}

/**
 * Resolves new point/line selection states when an element is clicked.
 */
export function resolveSelectionOnDown(params: {
  clickedElem: string;
  lines: Line[];
  currentPointIds: string[];
  currentLineIds: string[];
  currentSelectedPointId: string | null;
  currentSelectedLineId: string | null;
  isModifierKey: boolean;
}): SelectionState {
  const {
    clickedElem,
    lines,
    currentPointIds,
    currentLineIds,
    currentSelectedPointId,
    currentSelectedLineId,
    isModifierKey,
  } = params;

  // 1. Multi-selected point IDs
  let nextMultiPointIds: string[];
  if (isModifierKey) {
    if (currentPointIds.includes(clickedElem)) {
      nextMultiPointIds = currentPointIds.filter((id) => id !== clickedElem);
    } else {
      nextMultiPointIds = [...currentPointIds, clickedElem];
    }
  } else if (currentPointIds.includes(clickedElem)) {
    nextMultiPointIds = [...currentPointIds];
  } else {
    nextMultiPointIds = [clickedElem];
  }

  // 2. Single selection fallback updates and line selection
  let nextSelectedPointId = currentSelectedPointId;
  let nextSelectedLineId = currentSelectedLineId;
  let nextMultiLineIds = [...currentLineIds];

  if (clickedElem.startsWith("point-")) {
    const parts = clickedElem.split("-");
    const lineNum = Number(parts[1]);
    let lId: string | null = null;

    if (!Number.isNaN(lineNum) && lineNum > 0) {
      const lineIndex = lineNum - 1;
      const line = lines[lineIndex];
      if (line?.id) {
        lId = line.id;
        nextSelectedLineId = line.id;
        nextSelectedPointId = clickedElem;
      }
    } else if (clickedElem === "point-0-0") {
      nextSelectedLineId = null;
      nextSelectedPointId = clickedElem;
    } else {
      nextSelectedLineId = null;
      nextSelectedPointId = null;
    }

    if (lId) {
      if (isModifierKey) {
        nextMultiLineIds = currentLineIds.includes(lId)
          ? currentLineIds
          : [...currentLineIds, lId];
      } else {
        nextMultiLineIds = [lId];
      }
    }
  } else if (clickedElem.startsWith("targetpoint-")) {
    const parts = clickedElem.split("-");
    const lineIdx = Number(parts[1]) - 1;
    if (!Number.isNaN(lineIdx) && lines[lineIdx]?.id) {
      nextSelectedLineId = lines[lineIdx].id as string;
      nextSelectedPointId = clickedElem;
    }
  } else if (clickedElem.startsWith("event-")) {
    const parts = clickedElem.split("-");
    const lineIdx = Number(parts[1]);
    if (!Number.isNaN(lineIdx) && lines[lineIdx]?.id) {
      nextSelectedLineId = lines[lineIdx].id as string;
      nextSelectedPointId = clickedElem;
    }
  } else if (clickedElem.startsWith("wait-event-")) {
    const parts = clickedElem.split("-");
    const waitId = parts[2];
    if (waitId) {
      nextSelectedPointId = `wait-${waitId}`;
      nextSelectedLineId = null;
    }
  }

  return {
    selectedPointId: nextSelectedPointId,
    selectedLineId: nextSelectedLineId,
    multiSelectedPointIds: nextMultiPointIds,
    multiSelectedLineIds: nextMultiLineIds,
  };
}

/**
 * Infers human-readable action description for undo/history based on dragged element ID.
 */
export function inferDragAction(currentElem: string | null): string {
  if (!currentElem) return "Move Object";
  if (currentElem.startsWith("point-0-0")) {
    return "Move Start Point";
  }
  if (currentElem.startsWith("point-")) {
    const parts = currentElem.split("-");
    const ptIdx = Number(parts[2]);
    return ptIdx === 0 ? "Move Endpoint" : "Move Control Point";
  }
  if (currentElem.startsWith("targetpoint-")) {
    return "Move Facing Target";
  }
  if (currentElem.startsWith("obstacle-")) {
    return "Edit Obstacle";
  }
  if (
    currentElem.includes("event-") ||
    currentElem.includes("wait-event") ||
    currentElem.includes("rotate-event")
  ) {
    return "Move Event Marker";
  }
  return "Move Object";
}

/**
 * Checks if an element corresponds to a vertex of a locked obstacle.
 */
export function isObstacleLocked(
  elemId: string | null,
  shapes: Shape[],
): boolean {
  if (!elemId?.startsWith("obstacle-")) return false;
  const parts = elemId.split("-");
  const shapeIdx = Number(parts[1]);
  return Boolean(shapes[shapeIdx]?.locked);
}

export interface SelectionStoreTargets {
  selectedPointId: { set: (id: string | null) => void };
  selectedLineId: { set: (id: string | null) => void };
  multiSelectedPointIds: { set: (ids: string[]) => void };
  multiSelectedLineIds: { set: (ids: string[]) => void };
}

/**
 * Clears all point and line selections across stores.
 */
export function clearFieldSelections(stores: SelectionStoreTargets): void {
  stores.selectedPointId.set(null);
  stores.selectedLineId.set(null);
  stores.multiSelectedPointIds.set([]);
  stores.multiSelectedLineIds.set([]);
}

/**
 * Applies a resolved SelectionState to the corresponding stores.
 */
export function applySelectionState(
  selection: SelectionState,
  stores: SelectionStoreTargets,
): void {
  stores.multiSelectedPointIds.set(selection.multiSelectedPointIds);
  stores.multiSelectedLineIds.set(selection.multiSelectedLineIds);
  stores.selectedPointId.set(selection.selectedPointId);
  stores.selectedLineId.set(selection.selectedLineId);
}
