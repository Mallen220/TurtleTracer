import { get } from "svelte/store";
import {
  linesStore,
  shapesStore,
  sequenceStore,
  startPointStore
} from "../../projectStore";
import {
  snapToGrid,
  showGrid,
  gridSize
} from "../../../stores";
import {
  selectedLineId,
  selectedPointId,
  multiSelectedPointIds,
  multiSelectedLineIds
} from "../../../stores";
import { actionRegistry } from "../../actionRegistry";
import { updateLinkedWaypoints } from "../../../utils/pointLinking";
import { FIELD_SIZE } from "../../../config";
import { isUIElementFocused, getSelectedSequenceIndex } from "./utils";

export function removeSelected(recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;

  const mSelPoints = get(multiSelectedPointIds);
  const selPointId = get(selectedPointId);
  const lines = get(linesStore);
  const sequence = get(sequenceStore);

  const sels = mSelPoints.length > 0 ? mSelPoints : (selPointId ? [selPointId] : []);
  if (sels.length === 0) return;

  // Group deletions to process them correctly
  const waitsToDelete: string[] = [];
  const rotatesToDelete: string[] = [];
  const pointsToDelete: { lineIndex: number, ptIdx: number }[] = [];
  const eventMarkersToDelete: { itemType: string, itemId: string, evIdx: number }[] = [];

  sels.forEach(sel => {
    if (sel.startsWith("wait-")) {
      waitsToDelete.push(sel.substring(5));
    } else if (sel.startsWith("rotate-")) {
      rotatesToDelete.push(sel.substring(7));
    } else if (sel.startsWith("point-")) {
      const parts = sel.split("-");
      const lineNum = Number(parts[1]);
      const ptIdx = Number(parts[2]);
      if (lineNum !== 0 || ptIdx !== 0) { // skip start point
        pointsToDelete.push({ lineIndex: lineNum - 1, ptIdx });
      }
    } else if (sel.startsWith("event-wait-")) {
      const parts = sel.split("-");
      eventMarkersToDelete.push({ itemType: "wait", evIdx: Number(parts.pop()), itemId: parts.slice(2).join("-") });
    } else if (sel.startsWith("event-rotate-")) {
      const parts = sel.split("-");
      eventMarkersToDelete.push({ itemType: "rotate", evIdx: Number(parts.pop()), itemId: parts.slice(2).join("-") });
    } else if (sel.startsWith("event-")) {
      const parts = sel.split("-");
      eventMarkersToDelete.push({ itemType: "line", evIdx: Number(parts[2]), itemId: parts[1] });
    }
  });

  let linesChanged = false;
  let sequenceChanged = false;

  // Sort control points by ptIdx descending to safely remove multiple points from the same line
  pointsToDelete.sort((a, b) => b.ptIdx - a.ptIdx);

  // Delete points
  const linesToRemove = new Set<number>();
  pointsToDelete.forEach(({ lineIndex, ptIdx }) => {
    const line = lines[lineIndex];
    if (!line || line.locked) return;

    if (ptIdx === 0) {
      linesToRemove.add(lineIndex);
    } else {
      const cpIndex = ptIdx - 1;
      if (line.controlPoints && line.controlPoints[cpIndex] !== undefined) {
        line.controlPoints.splice(cpIndex, 1);
        linesChanged = true;
      }
    }
  });

  // Delete lines (sort descending)
  if (linesToRemove.size > 0) {
    const sortedLineIndexes = Array.from(linesToRemove).sort((a, b) => b - a);
    linesStore.update((l) => {
      let newLines = [...l];
      sortedLineIndexes.forEach(lineIndex => {
        const line = newLines[lineIndex];
        const removedId = line.id;
        newLines.splice(lineIndex, 1);
        if (removedId) {
          sequenceStore.update((s) => s.filter(item => !(actionRegistry.get(item.kind)?.isPath && (item as any).lineId === removedId)));
          sequenceChanged = true;
        }
      });
      return newLines;
    });
    linesChanged = true; // updated inside the store but mark to update UI
  }

  // Delete waits
  if (waitsToDelete.length > 0) {
    sequenceStore.update((s) => s.filter(item => {
      if (item.kind === "wait" && waitsToDelete.includes((item as any).id)) {
         return (item as any).locked; // keep if locked
      }
      return true;
    }));
    sequenceChanged = true;
  }

  // Delete rotates
  if (rotatesToDelete.length > 0) {
    sequenceStore.update((s) => s.filter(item => {
      if (item.kind === "rotate" && rotatesToDelete.includes((item as any).id)) {
         return (item as any).locked; // keep if locked
      }
      return true;
    }));
    sequenceChanged = true;
  }

  // Delete event markers (sort descending by evIdx)
  eventMarkersToDelete.sort((a, b) => b.evIdx - a.evIdx);
  eventMarkersToDelete.forEach(({ itemType, itemId, evIdx }) => {
    if (itemType === "wait" || itemType === "rotate") {
      const item = sequence.find(s => actionRegistry.get(s.kind)?.[itemType === "wait" ? "isWait" : "isRotate"] && (s as any).id === itemId) as any;
      if (item && item.eventMarkers && item.eventMarkers[evIdx] && !item.locked) {
        item.eventMarkers.splice(evIdx, 1);
        sequenceChanged = true;
      }
    } else if (itemType === "line") {
      const lineIdx = Number(itemId);
      const line = lines[lineIdx];
      if (line && line.eventMarkers && line.eventMarkers[evIdx] && !line.locked) {
        line.eventMarkers.splice(evIdx, 1);
        linesChanged = true;
      }
    }
  });

  if (linesChanged && linesToRemove.size === 0) linesStore.set(lines);
  if (sequenceChanged && waitsToDelete.length === 0 && rotatesToDelete.length === 0 && linesToRemove.size === 0) sequenceStore.set(sequence);

  selectedPointId.set(null);
  multiSelectedPointIds.set([]);
  selectedLineId.set(null);
  multiSelectedLineIds.set([]);
  recordChange("Delete Selection");
}

export function movePoint(dx: number, dy: number, recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;

  const mSelPoints = get(multiSelectedPointIds);
  const selPointId = get(selectedPointId);
  const snapMode = get(snapToGrid) && get(showGrid);
  const gridStep = (get(gridSize) as number) || 1;
  const startPoint = get(startPointStore);
  const lines = get(linesStore);
  const shapes = get(shapesStore);
  const sequence = get(sequenceStore);

  // Convert to array of selections
  const sels = mSelPoints.length > 0 ? mSelPoints : (selPointId ? [selPointId] : []);
  if (sels.length === 0) return;

  const defaultStep = 1;
  const eps = 1e-8;

  const nextGridCoord = (current: number, direction: number) => {
    if (direction > 0)
      return Math.min(FIELD_SIZE, Math.ceil((current + eps) / gridStep) * gridStep);
    else if (direction < 0)
      return Math.max(0, Math.floor((current - eps) / gridStep) * gridStep);
    return current;
  };
  const moveX = dx * defaultStep;
  const moveY = dy * defaultStep;

  let linesChanged = false;
  let shapesChanged = false;
  let sequenceChanged = false;
  let startPointChanged = false;

  sels.forEach(currentSel => {
    if (currentSel.startsWith("point-")) {
      const parts = currentSel.split("-");
      const lineNum = Number(parts[1]);
      const ptIdx = Number(parts[2]);
      if (lineNum === 0 && ptIdx === 0) {
        if (!startPoint.locked) {
          if (snapMode) {
            if (dx !== 0) startPoint.x = nextGridCoord(startPoint.x, dx);
            if (dy !== 0) startPoint.y = nextGridCoord(startPoint.y, dy);
          } else {
            startPoint.x = Math.max(0, Math.min(FIELD_SIZE, startPoint.x + moveX));
            startPoint.y = Math.max(0, Math.min(FIELD_SIZE, startPoint.y + moveY));
          }
          startPoint.x = Number(startPoint.x.toFixed(3));
          startPoint.y = Number(startPoint.y.toFixed(3));
          startPointChanged = true;
        }
        return;
      }
      const lineIndex = lineNum - 1;
      const line = lines[lineIndex];
      if (line && !line.locked) {
        if (ptIdx === 0) {
          if (line.endPoint) {
            if (snapMode) {
              if (dx !== 0) line.endPoint.x = nextGridCoord(line.endPoint.x, dx);
              if (dy !== 0) line.endPoint.y = nextGridCoord(line.endPoint.y, dy);
            } else {
              line.endPoint.x = Math.max(0, Math.min(FIELD_SIZE, line.endPoint.x + moveX));
              line.endPoint.y = Math.max(0, Math.min(FIELD_SIZE, line.endPoint.y + moveY));
            }
            line.endPoint.x = Number(line.endPoint.x.toFixed(3));
            line.endPoint.y = Number(line.endPoint.y.toFixed(3));
            linesChanged = true;
          }
        } else {
          const cpIndex = ptIdx - 1;
          if (line.controlPoints[cpIndex]) {
            if (snapMode) {
              if (dx !== 0) line.controlPoints[cpIndex].x = nextGridCoord(line.controlPoints[cpIndex].x, dx);
              if (dy !== 0) line.controlPoints[cpIndex].y = nextGridCoord(line.controlPoints[cpIndex].y, dy);
            } else {
              line.controlPoints[cpIndex].x = Math.max(0, Math.min(FIELD_SIZE, line.controlPoints[cpIndex].x + moveX));
              line.controlPoints[cpIndex].y = Math.max(0, Math.min(FIELD_SIZE, line.controlPoints[cpIndex].y + moveY));
            }
            line.controlPoints[cpIndex].x = Number(line.controlPoints[cpIndex].x.toFixed(3));
            line.controlPoints[cpIndex].y = Number(line.controlPoints[cpIndex].y.toFixed(3));
            linesChanged = true;
          }
        }
      }
    } else if (currentSel.startsWith("obstacle-")) {
      const parts = currentSel.split("-");
      const shapeIdx = Number(parts[1]);
      const vertexIdx = Number(parts[2]);
      if (shapes[shapeIdx]?.vertices[vertexIdx]) {
        const v = shapes[shapeIdx].vertices[vertexIdx];
        if (snapMode) {
          if (dx !== 0) v.x = nextGridCoord(v.x, dx);
          if (dy !== 0) v.y = nextGridCoord(v.y, dy);
        } else {
          v.x = Math.max(0, Math.min(FIELD_SIZE, v.x + moveX));
          v.y = Math.max(0, Math.min(FIELD_SIZE, v.y + moveY));
        }
        v.x = Number(v.x.toFixed(3));
        v.y = Number(v.y.toFixed(3));
        shapesChanged = true;
      }
    } else if (currentSel.startsWith("event-wait-")) {
      const parts = currentSel.split("-");
      const evIdx = Number(parts.pop() as string);
      const waitId = parts.slice(2).join("-");

      const item = sequence.find((s) => actionRegistry.get(s.kind)?.isWait && (s as any).id === waitId) as any;
      if (item && item.eventMarkers && item.eventMarkers[evIdx]) {
        const delta = (dx + dy) * 0.01;
        let newPos = item.eventMarkers[evIdx].position + delta;
        newPos = Math.max(0, Math.min(1, newPos));
        item.eventMarkers[evIdx].position = newPos;
        sequenceChanged = true;
      }
    } else if (currentSel.startsWith("event-rotate-")) {
      const parts = currentSel.split("-");
      const evIdx = Number(parts.pop() as string);
      const rotateId = parts.slice(2).join("-");

      const item = sequence.find((s) => actionRegistry.get(s.kind)?.isRotate && (s as any).id === rotateId) as any;
      if (item && item.eventMarkers && item.eventMarkers[evIdx]) {
        const delta = (dx + dy) * 0.01;
        let newPos = item.eventMarkers[evIdx].position + delta;
        newPos = Math.max(0, Math.min(1, newPos));
        item.eventMarkers[evIdx].position = newPos;
        sequenceChanged = true;
      }
    } else if (currentSel.startsWith("event-")) {
      const parts = currentSel.split("-");
      const lineIdx = Number(parts[1]);
      const evIdx = Number(parts[2]);
      const line = lines[lineIdx];
      if (line && line.eventMarkers && line.eventMarkers[evIdx]) {
        const delta = (dx + dy) * 0.01;
        let newPos = line.eventMarkers[evIdx].position + delta;
        newPos = Math.max(0, Math.min(1, newPos));
        line.eventMarkers[evIdx].position = newPos;
        linesChanged = true;
      }
    }
  });

  if (startPointChanged) startPointStore.set(startPoint);
  if (linesChanged) linesStore.set(lines);
  if (shapesChanged) shapesStore.set(shapes);
  if (sequenceChanged) sequenceStore.set(sequence);

  recordChange("Move Point");
}

export function LEGACY_movePoint(dx: number, dy: number, recordChange: (action?: string) => void) {
  if (isUIElementFocused()) return;
  const currentSel = get(selectedPointId);
  const snapMode = get(snapToGrid) && get(showGrid);
  const gridStep = (get(gridSize) as number) || 1;
  const startPoint = get(startPointStore);
  const lines = get(linesStore);
  const shapes = get(shapesStore);
  const sequence = get(sequenceStore);

  if (!currentSel) return;

  const defaultStep = 1;
  const eps = 1e-8;

  const nextGridCoord = (current: number, direction: number) => {
    if (direction > 0)
      return Math.min(
        FIELD_SIZE,
        Math.ceil((current + eps) / gridStep) * gridStep,
      );
    else if (direction < 0)
      return Math.max(0, Math.floor((current - eps) / gridStep) * gridStep);
    return current;
  };
  const moveX = dx * defaultStep;
  const moveY = dy * defaultStep;

  if (currentSel.startsWith("point-")) {
    const parts = currentSel.split("-");
    const lineNum = Number(parts[1]);
    const ptIdx = Number(parts[2]);
    if (lineNum === 0 && ptIdx === 0) {
      if (!startPoint.locked) {
        if (snapMode) {
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
        startPoint.x = Number(startPoint.x.toFixed(3));
        startPoint.y = Number(startPoint.y.toFixed(3));
        startPointStore.set(startPoint);
        recordChange("Move Point");
      }
      return;
    }
    const lineIndex = lineNum - 1;
    const line = lines[lineIndex];
    if (line && !line.locked) {
      if (ptIdx === 0) {
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
          line.endPoint.x = Number(line.endPoint.x.toFixed(3));
          line.endPoint.y = Number(line.endPoint.y.toFixed(3));
          // Ensure linked lines (same-named waypoints) are updated when a point is moved via keybinds
          linesStore.set(updateLinkedWaypoints(lines, line.id!));
          recordChange("Move Point");
        }
      } else {
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
            line.controlPoints[cpIndex].x.toFixed(3),
          );
          line.controlPoints[cpIndex].y = Number(
            line.controlPoints[cpIndex].y.toFixed(3),
          );
          linesStore.set(lines);
          recordChange("Move Point");
        }
      }
    }
  } else if (currentSel.startsWith("obstacle-")) {
    const parts = currentSel.split("-");
    const shapeIdx = Number(parts[1]);
    const vertexIdx = Number(parts[2]);
    if (shapes[shapeIdx]?.vertices[vertexIdx]) {
      const v = shapes[shapeIdx].vertices[vertexIdx];
      if (snapMode) {
        if (dx !== 0) v.x = nextGridCoord(v.x, dx);
        if (dy !== 0) v.y = nextGridCoord(v.y, dy);
      } else {
        v.x = Math.max(0, Math.min(FIELD_SIZE, v.x + moveX));
        v.y = Math.max(0, Math.min(FIELD_SIZE, v.y + moveY));
      }
      v.x = Number(v.x.toFixed(3));
      v.y = Number(v.y.toFixed(3));
      shapesStore.set(shapes);
      recordChange("Move Obstacle Vertex");
    }
  } else if (currentSel.startsWith("event-wait-")) {
    const parts = currentSel.split("-");
    // Format: event-wait-waitId-evIdx
    const evIdx = Number(parts.pop() as string);
    const waitId = parts.slice(2).join("-");

    const item = sequence.find(
      (s) => actionRegistry.get(s.kind)?.isWait && (s as any).id === waitId,
    ) as any;
    if (item && item.eventMarkers && item.eventMarkers[evIdx]) {
      const delta = (dx + dy) * 0.01;
      let newPos = item.eventMarkers[evIdx].position + delta;
      newPos = Math.max(0, Math.min(1, newPos));
      item.eventMarkers[evIdx].position = newPos;
      sequenceStore.set(sequence);
      recordChange("Move Event Marker");
    }
  } else if (currentSel.startsWith("event-rotate-")) {
    const parts = currentSel.split("-");
    const evIdx = Number(parts.pop() as string);
    const rotateId = parts.slice(2).join("-");

    const item = sequence.find(
      (s) =>
        actionRegistry.get(s.kind)?.isRotate && (s as any).id === rotateId,
    ) as any;
    if (item && item.eventMarkers && item.eventMarkers[evIdx]) {
      const delta = (dx + dy) * 0.01;
      let newPos = item.eventMarkers[evIdx].position + delta;
      newPos = Math.max(0, Math.min(1, newPos));
      item.eventMarkers[evIdx].position = newPos;
      sequenceStore.set(sequence);
      recordChange("Move Event Marker");
    }
  } else if (currentSel.startsWith("event-")) {
    const parts = currentSel.split("-");
    const lineIdx = Number(parts[1]);
    const evIdx = Number(parts[2]);
    const line = lines[lineIdx];
    if (line && line.eventMarkers && line.eventMarkers[evIdx]) {
      const delta = (dx + dy) * 0.01;
      let newPos = line.eventMarkers[evIdx].position + delta;
      newPos = Math.max(0, Math.min(1, newPos));
      line.eventMarkers[evIdx].position = newPos;
      linesStore.set(lines);
      recordChange("Move Event Marker");
    }
  }
}

export function getSelectableItems() {
  const sequence = get(sequenceStore);
  const lines = get(linesStore);
  const shapes = get(shapesStore);

  const items: string[] = ["point-0-0"];
  sequence.forEach((item) => {
    const def = actionRegistry.get(item.kind);
    if (def?.isPath) {
      const lineIdx = lines.findIndex((l) => l.id === (item as any).lineId);
      if (lineIdx !== -1) {
        const line = lines[lineIdx];
        line.controlPoints.forEach((_, cpIdx) =>
          items.push(`point-${lineIdx + 1}-${cpIdx + 1}`),
        );
        items.push(`point-${lineIdx + 1}-0`);
      }
    } else if (def?.isWait) {
      items.push(`wait-${(item as any).id}`);
      if ((item as any).eventMarkers) {
        (item as any).eventMarkers.forEach((_: any, evIdx: number) =>
          items.push(`event-wait-${(item as any).id}-${evIdx}`),
        );
      }
    } else if (def?.isRotate) {
      items.push(`rotate-${(item as any).id}`);
      if ((item as any).eventMarkers) {
        (item as any).eventMarkers.forEach((_: any, evIdx: number) =>
          items.push(`event-rotate-${(item as any).id}-${evIdx}`),
        );
      }
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

export function syncSelectionToUI(controlTabRef: any) {
  const sel = get(selectedPointId);
  const sequence = get(sequenceStore);
  const lines = get(linesStore);

  if (!sel || !controlTabRef || !controlTabRef.scrollToItem) return;

  if (sel.startsWith("wait-")) {
    controlTabRef.scrollToItem("wait", sel.substring(5));
  } else if (sel.startsWith("rotate-")) {
    controlTabRef.scrollToItem("rotate", sel.substring(7));
  } else if (sel.startsWith("point-")) {
    // Points map to paths
    // point-LINENUM-PTIDX
    const parts = sel.split("-");
    const lineNum = Number(parts[1]);
    if (lineNum > 0) {
      const line = lines[lineNum - 1];
      if (line && line.id) {
        // Control tab can handle generic path scroll requests
        controlTabRef.scrollToItem("path", line.id);
      }
    }
  } else if (sel.startsWith("event-wait-")) {
    const parts = sel.split("-");
    const evIdx = Number(parts.pop() as string);
    const waitId = parts.slice(2).join("-");

    const item = sequence.find(
      (s) => actionRegistry.get(s.kind)?.isWait && (s as any).id === waitId,
    ) as any;
    if (item && item.eventMarkers && item.eventMarkers[evIdx]) {
      controlTabRef.scrollToItem("event", item.eventMarkers[evIdx].id);
    }
  } else if (sel.startsWith("event-rotate-")) {
    const parts = sel.split("-");
    const evIdx = Number(parts.pop() as string);
    const rotateId = parts.slice(2).join("-");

    const item = sequence.find(
      (s) =>
        actionRegistry.get(s.kind)?.isRotate && (s as any).id === rotateId,
    ) as any;
    if (item && item.eventMarkers && item.eventMarkers[evIdx]) {
      controlTabRef.scrollToItem("event", item.eventMarkers[evIdx].id);
    }
  } else if (sel.startsWith("event-")) {
    const parts = sel.split("-");
    const lineIdx = Number(parts[1]);
    const evIdx = Number(parts[2]);
    const line = lines[lineIdx];
    if (line && line.eventMarkers && line.eventMarkers[evIdx]) {
      controlTabRef.scrollToItem("event", line.eventMarkers[evIdx].id);
    }
  }
}

export function cycleSelection(dir: number, controlTabRef: any) {
  if (isUIElementFocused()) return;
  const items = getSelectableItems();
  if (items.length === 0) return;

  const lines = get(linesStore);
  let current = get(selectedPointId);
  let idx = items.indexOf(current || "");
  if (idx === -1) idx = 0;
  else idx = (idx + dir + items.length) % items.length;
  const newId = items[idx];

  selectedPointId.set(newId);
  multiSelectedPointIds.set([newId]);

  if (newId.startsWith("point-")) {
    const parts = newId.split("-");
    const lineNum = Number(parts[1]);
    if (lineNum > 0) selectedLineId.set(lines[lineNum - 1].id || null);
    else selectedLineId.set(null);
  } else selectedLineId.set(null);

  syncSelectionToUI(controlTabRef);
}

export function cycleSequenceSelection(dir: number, controlTabRef: any) {
  if (isUIElementFocused()) return;
  const sequence = get(sequenceStore);
  const lines = get(linesStore);

  if (sequence.length === 0) return;

  let currentIdx = getSelectedSequenceIndex();

  if (currentIdx === null) {
    currentIdx = 0;
  } else {
    currentIdx = (currentIdx + dir + sequence.length) % sequence.length;
  }

  const item = sequence[currentIdx];
  if (!item) return;

  const def = actionRegistry.get(item.kind);

  let newId: string | null = null;
  if (def?.isPath) {
    selectedLineId.set((item as any).lineId);
    const lineIdx = lines.findIndex((l) => l.id === (item as any).lineId);
    if (lineIdx !== -1) {
      newId = `point-${lineIdx + 1}-0`;
      selectedPointId.set(newId);
    }
  } else if (def?.isWait) {
    newId = `wait-${(item as any).id}`;
    selectedPointId.set(newId);
    selectedLineId.set(null);
  } else if (def?.isRotate) {
    newId = `rotate-${(item as any).id}`;
    selectedPointId.set(newId);
    selectedLineId.set(null);
  }

  if (newId) multiSelectedPointIds.set([newId]);

  syncSelectionToUI(controlTabRef);
}
