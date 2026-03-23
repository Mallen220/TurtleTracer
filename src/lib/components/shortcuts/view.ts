import { get } from "svelte/store";
import { startPointStore, linesStore } from "../../projectStore";
import {
  gridSize,
  fieldZoom,
  fieldPan,
  selectedPointId,
  selectedLineId,
} from "../../../stores";
import { computeZoomStep } from "../../zoomHelpers";
import { getDefaultStartPoint } from "../../../config";
import { isUIElementFocused } from "./utils";

export function cycleGridSize() {
  const options = [1, 3, 6, 12, 24];
  const current = (get(gridSize) as number) || options[0];
  const idx = options.indexOf(current);
  const next = options[(idx + 1) % options.length];
  gridSize.set(next);
}

export function cycleGridSizeReverse() {
  const options = [1, 3, 6, 12, 24];
  const current = (get(gridSize) as number) || options[0];
  const idx = options.indexOf(current);
  const prev = options[(idx - 1 + options.length) % options.length];
  gridSize.set(prev);
}

export function modifyZoom(delta: number) {
  if (isUIElementFocused()) return;
  fieldZoom.update((z) => {
    // Use adaptive step: when zooming in past 1x, speed up
    const step = computeZoomStep(z, Math.sign(delta));
    const change = Math.sign(delta) * step;
    return Math.max(0.1, Math.min(5.0, Number((z + change).toFixed(2))));
  });
}

export function resetZoom() {
  if (isUIElementFocused()) return;
  fieldZoom.set(1.0);
  fieldPan.set({ x: 0, y: 0 });
}

export function snapSelection(recordChange: (action?: string) => void) {
  const sel = get(selectedPointId);
  const gridStep = (get(gridSize) as number) || 1;
  const startPoint = get(startPointStore);
  const lines = get(linesStore);

  if (!sel || !sel.startsWith("point-")) return;

  const snap = (v: number) => Math.round(v / gridStep) * gridStep;

  const parts = sel.split("-");
  const lineNum = Number(parts[1]);
  const ptIdx = Number(parts[2]);

  if (lineNum === 0 && ptIdx === 0) {
    if (startPoint.locked) return;
    startPointStore.update((p) => ({
      ...p,
      x: snap(p.x),
      y: snap(p.y),
    }));
    recordChange("Snap Selection");
    return;
  }

  const lineIdx = lineNum - 1;
  const line = lines[lineIdx];
  if (!line || line.locked) return;

  if (ptIdx === 0) {
    linesStore.update((l) => {
      const newLines = [...l];
      newLines[lineIdx].endPoint.x = snap(newLines[lineIdx].endPoint.x);
      newLines[lineIdx].endPoint.y = snap(newLines[lineIdx].endPoint.y);
      return newLines;
    });
    recordChange("Snap Selection");
  } else {
    const cpIdx = ptIdx - 1;
    if (line.controlPoints[cpIdx]) {
      linesStore.update((l) => {
        const newLines = [...l];
        newLines[lineIdx].controlPoints[cpIdx].x = snap(
          newLines[lineIdx].controlPoints[cpIdx].x,
        );
        newLines[lineIdx].controlPoints[cpIdx].y = snap(
          newLines[lineIdx].controlPoints[cpIdx].y,
        );
        return newLines;
      });
      recordChange("Snap Selection");
    }
  }
}

export function resetStartPoint(recordChange: (action?: string) => void) {
  const startPoint = get(startPointStore);
  if (startPoint.locked) return;
  const def = getDefaultStartPoint();
  startPointStore.set(def);
  recordChange("Reset Start Point");
}

export function panToStart(fieldRenderer: any) {
  const startPoint = get(startPointStore);
  if (fieldRenderer && fieldRenderer.panToField) {
    fieldRenderer.panToField(startPoint.x, startPoint.y);
  } else {
    // Fallback
    resetZoom();
  }
}

export function panToEnd(fieldRenderer: any) {
  const lines = get(linesStore);
  if (lines.length > 0) {
    const lastLineIdx = lines.length - 1;
    const endPoint = lines[lastLineIdx].endPoint;
    if (fieldRenderer && fieldRenderer.panToField) {
      fieldRenderer.panToField(endPoint.x, endPoint.y);
    } else {
      // Fallback
      selectedPointId.set(`point-${lastLineIdx + 1}-0`);
      selectedLineId.set(lines[lastLineIdx].id!);
    }
  }
}

export function panView(dx: number, dy: number) {
  if (isUIElementFocused()) return;
  fieldPan.update((p) => ({ x: p.x + dx, y: p.y + dy }));
}
