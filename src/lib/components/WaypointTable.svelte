<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    Point,
    Line,
    ControlPoint,
    SequenceItem,
    SequenceMacroItem,
  } from "../../types";
  import { loadMacro } from "../projectStore";
  import {
    reorderSequence,
    getClosestTarget,
    type DragPosition,
  } from "../../utils/dragDrop";
  import {
    snapToGrid,
    showGrid,
    gridSize,
    selectedLineId,
    selectedPointId,
  } from "../../stores";
  import { slide } from "svelte/transition";
  import OptimizationDialog from "./OptimizationDialog.svelte";
  import { tick } from "svelte";
  import { tooltipPortal } from "../actions/portal";
  import ObstaclesSection from "./ObstaclesSection.svelte";
  import TrashIcon from "./icons/TrashIcon.svelte";
  import ColorPicker from "./ColorPicker.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import {
    makeId,
    generateName,
    renumberDefaultPathNames,
  } from "../../utils/nameGenerator";
  import {
    updateLinkedWaypoints,
    handleWaypointRename,
    handleWaitRename,
    updateLinkedWaits,
    isLineLinked,
    isWaitLinked,
    handleRotateRename,
    updateLinkedRotations,
    isRotateLinked,
  } from "../../utils/pointLinking";
  import { getRandomColor } from "../../utils/draw";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let recordChange: () => void;
  // Handler passed from parent to toggle optimization dialog
  export let onToggleOptimization: () => void;
  export let onValidate: (() => void) | null = null;

  // Props for inline optimization panel
  export let optimizationOpen: boolean = false;
  export let handleOptimizationApply: (
    newLines: import("../../types").Line[],
  ) => void;
  export let onPreviewChange: (
    lines: import("../../types").Line[] | null,
  ) => void;
  export let settings: import("../../types").Settings | undefined = undefined;

  // Shapes and collapsedObstacles binding for ObstaclesSection
  export let shapes: import("../../types").Shape[];
  export let collapsedObstacles: boolean[];

  // Prevent Svelte unused-export warnings
  $: shapes;
  $: collapsedObstacles;
  $: _shapesCount = Array.isArray(shapes) ? shapes.length : 0;
  $: _settingsRef = settings; // Reference settings to suppress unused warning
  $: showDebug = (settings as any)?.showDebugSequence;
  $: _collapsedObstaclesCount = Array.isArray(collapsedObstacles)
    ? collapsedObstacles.length
    : 0;

  // Optimization dialog refs and programmatic control
  let optDialogRef: any = null;
  let optIsRunning: boolean = false;
  let optOptimizedLines: Line[] | null = null;
  let optFailed: boolean = false;

  export async function openAndStartOptimization() {
    optimizationOpen = true;
    await tick();
    if (optDialogRef && optDialogRef.startOptimization)
      optDialogRef.startOptimization();
  }

  export function stopOptimization() {
    if (optDialogRef && optDialogRef.stopOptimization)
      optDialogRef.stopOptimization();
  }

  export function applyOptimization() {
    if (optDialogRef && optDialogRef.handleApply) optDialogRef.handleApply();
  }

  export function discardOptimization() {
    if (optDialogRef && optDialogRef.handleClose) optDialogRef.handleClose();
  }

  export function retryOptimization() {
    if (optDialogRef && optDialogRef.startOptimization)
      optDialogRef.startOptimization();
  }

  export function getOptimizationStatus() {
    return {
      isOpen: optimizationOpen,
      isRunning: optIsRunning,
      optimizedLines: optOptimizedLines,
      optimizationFailed: optFailed,
    };
  }

  // Use snap stores to determine step size for inputs
  $: stepSize = $snapToGrid && $showGrid ? $gridSize : 0.1;

  function updatePoint(
    point: Point | ControlPoint,
    field: "x" | "y",
    value: number,
    lineId?: string,
  ) {
    point[field] = value;

    // Check for linked endpoint updates
    if (lineId) {
      const line = lines.find((l) => l.id === lineId);
      if (line && line.endPoint === point) {
        lines = updateLinkedWaypoints(lines, lineId);
      }
    }

    // Trigger reactivity for lines/startPoint
    lines = lines;
    startPoint = startPoint;
    recordChange();
  }

  function handleInput(
    e: Event,
    point: Point | ControlPoint,
    field: "x" | "y",
    lineId?: string,
  ) {
    const input = e.target as HTMLInputElement;
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
      updatePoint(point, field, val, lineId);
    }
  }

  function updateLineName(lineId: string, name: string) {
    lines = handleWaypointRename(lines, lineId, name);
    recordChange();
  }

  function updateWaitName(item: SequenceItem, name: string) {
    if (item.kind === "wait") {
      sequence = handleWaitRename(sequence, item.id, name);
      recordChange();
    }
  }

  function updateRotateName(item: SequenceItem, name: string) {
    if (item.kind === "rotate") {
      sequence = handleRotateRename(sequence, item.id, name);
      recordChange();
    }
  }

  function updateLineColor(lineId: string, color: string) {
    const line = lines.find((l) => l.id === lineId);
    if (line) {
      line.color = color;
      lines = lines; // Trigger reactivity
      recordChange();
    }
  }

  function updateRotateDegrees(item: SequenceItem, degrees: number) {
    if (item.kind === "rotate") {
      item.degrees = degrees;
      sequence = updateLinkedRotations(sequence, item.id);
      recordChange();
    }
  }

  function updateWaitDuration(item: SequenceItem, duration: number) {
    if (item.kind === "wait") {
      item.durationMs = duration;
      sequence = updateLinkedWaits(sequence, item.id);
      recordChange();
    }
  }

  function updateMacroName(item: SequenceItem, name: string) {
    if (item.kind === "macro") {
      item.name = name;
      sequence = [...sequence]; // trigger reactivity
      recordChange();
    }
  }

  // Debug helper to log mapping between line, index and control points when rows render
  function debugPointRow(
    line: Line,
    cp: ControlPoint | Point | undefined,
    j?: number,
  ) {
    return "";
  }

  // Helper to find the index in the real `sequence` array for a display item
  function findSequenceIndex(item: any) {
    if (!Array.isArray(sequence)) return -1;
    return sequence.findIndex((s) => {
      if ((s as any).kind !== (item as any).kind) return false;
      if ((s as any).kind === "path")
        return (s as any).lineId === (item as any).lineId;
      return (s as any).id === (item as any).id;
    });
  }

  // Ensure UI shows any lines that might be missing from the sequence (robustness)
  $: displaySequence = (() => {
    try {
      // Keep original sequence order and append any missing path items for lines
      const seqCopy = Array.isArray(sequence) ? [...sequence] : [];
      const pathIds = new Set(
        seqCopy
          .filter((s) => (s as any).kind === "path")
          .map((s) => (s as any).lineId),
      );
      lines.forEach((l) => {
        if (l.id && !pathIds.has(l.id) && !l.isMacroElement) {
          seqCopy.push({ kind: "path", lineId: l.id });
        }
      });
      return seqCopy;
    } catch (e) {
      return sequence || [];
    }
  })();

  // Computed debug values to keep template expressions simple
  $: debugLinesIds = Array.isArray(lines) ? lines.map((l) => l.id) : [];
  $: debugSequenceIds = Array.isArray(sequence)
    ? sequence.map((s) =>
        s.kind === "path" ? (s as any).lineId : (s as any).id,
      )
    : [];
  $: debugDisplayIds = Array.isArray(displaySequence)
    ? displaySequence.map((d) =>
        d.kind === "path" ? (d as any).lineId : (d as any).id,
      )
    : [];
  $: debugMissing = debugLinesIds.filter(
    (id) => !debugSequenceIds.includes(id),
  );
  $: debugInvalidRefs = debugSequenceIds.filter(
    (id) => id && !debugLinesIds.includes(id),
  );

  $: {
    // Optional console logs for development convenience
    try {
      console.info("[WaypointTable] debugLinesIds", debugLinesIds);
      console.info("[WaypointTable] debugSequenceIds", debugSequenceIds);
      console.info("[WaypointTable] debugDisplayIds", debugDisplayIds);
      console.info("[WaypointTable] missing", debugMissing);
      console.info("[WaypointTable] invalidRefs", debugInvalidRefs);
    } catch (err) {
      /* no-op */
    }
  }

  // Drag and drop state
  let draggingIndex: number | null = null;
  let dragOverIndex: number | null = null;
  let dragPosition: DragPosition | null = null;

  // One-time repair flag for missing sequence items
  let repairedOnce = false;

  function handleDragStart(e: DragEvent, index: number) {
    draggingIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  }

  function handleWindowDragOver(e: DragEvent) {
    if (draggingIndex === null) return;
    e.preventDefault();

    // Use a custom selector for rows that have sequence data
    const target = getClosestTarget(e, "tr[data-seq-index]", document.body);

    if (!target) return;

    const index = parseInt(target.element.getAttribute("data-seq-index") || "");
    if (isNaN(index)) return;

    // Start Point special case: cannot drop before it (index -1, top)
    if (index === -1 && target.position === "top") return;

    if (dragOverIndex !== index || dragPosition !== target.position) {
      dragOverIndex = index;
      dragPosition = target.position;
    }
  }

  function handleWindowDrop(e: DragEvent) {
    // Check for macro drop
    if (
      e.dataTransfer &&
      e.dataTransfer.types.includes("application/x-pedro-macro")
    ) {
      e.preventDefault();
      const filePath = e.dataTransfer.getData("application/x-pedro-macro");
      if (!filePath) return;

      const target = getClosestTarget(e, "tr[data-seq-index]", document.body);
      let dropIndex = sequence.length;
      if (target) {
        const idx = parseInt(
          target.element.getAttribute("data-seq-index") || "",
        );
        if (!isNaN(idx)) {
          dropIndex = target.position === "bottom" ? idx + 1 : idx;
        }
      }

      insertMacro(dropIndex, filePath);
      handleDragEnd();
      return;
    }

    if (draggingIndex === null) return;
    e.preventDefault();

    if (
      dragOverIndex === null ||
      dragPosition === null ||
      draggingIndex === dragOverIndex
    ) {
      handleDragEnd();
      return;
    }

    const newSequence = reorderSequence(
      sequence,
      draggingIndex,
      dragOverIndex,
      dragPosition,
    );
    sequence = newSequence;
    syncLinesToSequence(newSequence);
    recordChange();

    handleDragEnd();
  }

  function handleDragEnd() {
    draggingIndex = null;
    dragOverIndex = null;
    dragPosition = null;
  }

  function syncLinesToSequence(newSeq: SequenceItem[]) {
    const pathOrder = newSeq
      .filter((item) => item.kind === "path")
      .map((item) => item.lineId);

    const byId = new Map(lines.map((l) => [l.id, l]));
    const reordered: Line[] = [];

    pathOrder.forEach((id) => {
      const l = byId.get(id);
      if (l) {
        reordered.push(l);
        byId.delete(id);
      }
    });

    // Append any lines that are not currently in the sequence to preserve data
    reordered.push(...(byId.values() as Iterable<Line>));

    lines = reordered;

    // Renumber default path names
    lines = renumberDefaultPathNames(lines);
  }

  // Watch for missing sequence entries and repair once to keep UI in sync
  $: if (Array.isArray(lines) && Array.isArray(sequence) && !repairedOnce) {
    const missing = lines.filter(
      (l) =>
        !l.isMacroElement &&
        !sequence.some((s) => s.kind === "path" && (s as any).lineId === l.id),
    );
    if (missing.length) {
      console.warn(
        "[WaypointTable] repairing missing sequence items:",
        missing.map((m) => m.id),
      );
      sequence = [
        ...sequence,
        ...missing.map(
          (l) => ({ kind: "path", lineId: l.id || "" }) as SequenceItem,
        ),
      ];
      repairedOnce = true;
      if (recordChange) recordChange();
    }
  }

  // Delete helpers
  function deleteLine(lineId: string) {
    // Prevent deleting the last remaining path
    if (lines.length <= 1) return;

    const idx = lines.findIndex((l) => l.id === lineId);
    if (idx >= 0) {
      lines.splice(idx, 1);
      lines = [...lines];
    }

    // Remove sequence entries that reference this line
    const newSeq = sequence.filter(
      (item) => !(item.kind === "path" && item.lineId === lineId),
    );
    sequence = newSeq;
    syncLinesToSequence(newSeq);

    // Clear selection if it referenced the deleted line
    selectedLineId.set(null);
    selectedPointId.set(null);

    if (recordChange) recordChange();
  }

  function deleteControlPoint(line: Line, cpIndex: number) {
    if (line.locked) return;
    if (cpIndex >= 0 && cpIndex < line.controlPoints.length) {
      line.controlPoints.splice(cpIndex, 1);
      lines = [...lines];
      if (recordChange) recordChange();
      selectedPointId.set(null);
    }
  }

  function deleteWait(index: number) {
    const item = sequence[index];
    if (!item) return;
    if (item.kind === "wait" && item.locked) return;

    sequence.splice(index, 1);
    sequence = [...sequence];
    syncLinesToSequence(sequence);
    if (recordChange) recordChange();
    selectedPointId.set(null);
  }

  function deleteRotate(index: number) {
    const item = sequence[index];
    if (!item) return;
    if (item.kind === "rotate" && item.locked) return;

    sequence.splice(index, 1);
    sequence = [...sequence];
    syncLinesToSequence(sequence);
    if (recordChange) recordChange();
    selectedPointId.set(null);
  }

  function deleteMacro(index: number) {
    const item = sequence[index];
    if (!item) return;
    if (item.kind === "macro" && item.locked) return;

    sequence.splice(index, 1);
    sequence = [...sequence];
    syncLinesToSequence(sequence);
    if (recordChange) recordChange();
    selectedPointId.set(null);
  }

  function toggleWaitLock(index: number) {
    const item = sequence[index];
    if (
      item.kind === "wait" ||
      item.kind === "rotate" ||
      item.kind === "macro"
    ) {
      (item as any).locked = !(item.locked ?? false);
      sequence = [...sequence];
      if (recordChange) recordChange();
    }
  }

  let copyButtonText = "Copy Table";

  function copyTableToClipboard() {
    const rows = [];
    rows.push("| Name | X (in) / Dur (ms) | Y (in) / Deg |");
    rows.push("| :--- | :--- | :--- |");
    rows.push(
      `| Start Point | ${startPoint.x.toString()} | ${startPoint.y.toString()} |`,
    );

    for (const item of displaySequence) {
      if (item.kind === "path") {
        const line = lines.find((l) => l.id === item.lineId);
        if (line) {
          let xVal = line.endPoint.x.toString();
          if (line.waitBeforeName || line.waitBeforeMs) {
            xVal += ` (${line.waitBeforeName || line.waitBeforeMs})`;
          }
          const lineIdx = lines.findIndex((l) => l.id === line.id);
          rows.push(
            `| ${line.name || `Path ${lineIdx + 1}`} | ${xVal} | ${line.endPoint.y.toString()} |`,
          );
          line.controlPoints.forEach((cp, idx) => {
            rows.push(
              `| ↳ Control ${idx + 1} | ${cp.x.toString()} | ${cp.y.toString()} |`,
            );
          });
        }
      } else if (item.kind === "wait") {
        rows.push(
          `| ${item.name || "Wait"} | ${item.durationMs.toString()} | - |`,
        );
      } else if (item.kind === "rotate") {
        rows.push(
          `| ${item.name || "Rotate"} | - | ${item.degrees.toString()} |`,
        );
      }
    }

    const text = rows.join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => {
        copyButtonText = "Copied!";
        setTimeout(() => {
          copyButtonText = "Copy Table";
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy table: ", err);
      });
  }

  // --- Context Menu Logic ---

  let contextMenuOpen = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuItems: any[] = [];

  let hoveredLinkId: string | null = null;
  let hoveredWaitId: string | null = null;
  // Anchor elements used for portal positioning (moved to body)
  let hoveredLinkAnchor: HTMLElement | null = null;
  let hoveredWaitAnchor: HTMLElement | null = null;

  function handleLinkHoverEnter(e: MouseEvent, id: string | null) {
    hoveredLinkId = id;
    // currentTarget is the icon container
    hoveredLinkAnchor = e.currentTarget as HTMLElement;
  }
  function handleLinkHoverLeave() {
    hoveredLinkId = null;
    hoveredLinkAnchor = null;
  }

  function handleWaitHoverEnter(e: MouseEvent, id: string | null) {
    hoveredWaitId = id;
    hoveredWaitAnchor = e.currentTarget as HTMLElement;
  }
  function handleWaitHoverLeave() {
    hoveredWaitId = null;
    hoveredWaitAnchor = null;
  }

  async function handleContextMenu(event: MouseEvent, seqIndex: number) {
    event.preventDefault();

    // Close existing if open to force re-mount and position recalc
    if (contextMenuOpen) {
      contextMenuOpen = false;
      await tick();
    }

    // Start Point (index -1)
    if (seqIndex === -1) {
      contextMenuItems = [
        {
          label: startPoint.locked ? "Unlock Start Point" : "Lock Start Point",
          onClick: () => {
            startPoint.locked = !startPoint.locked;
            if (recordChange) recordChange();
          },
        },
        { separator: true },
        {
          label: "Insert Wait After",
          onClick: () => insertWait(0),
        },
        {
          label: "Insert Rotate After",
          onClick: () => insertRotate(0),
        },
        {
          label: "Insert Path After",
          onClick: () => insertPath(0),
        },
      ];
      contextMenuX = event.clientX;
      contextMenuY = event.clientY;
      contextMenuOpen = true;
      return;
    }

    const item = sequence[seqIndex];
    if (!item) return;

    const line =
      item.kind === "path" ? lines.find((l) => l.id === item.lineId) : null;
    const isLocked =
      item.kind === "path" ? (line?.locked ?? false) : (item.locked ?? false);

    const items = [];

    // Lock/Unlock
    items.push({
      label: isLocked ? "Unlock" : "Lock",
      onClick: () => toggleLock(seqIndex),
    });

    items.push({ separator: true });

    // Move Up/Down
    // Only show if not locked and valid index
    if (!isLocked) {
      items.push({
        label: "Move Up",
        onClick: () => moveSequenceItem(seqIndex, -1),
        disabled: seqIndex <= 0,
      });
      items.push({
        label: "Move Down",
        onClick: () => moveSequenceItem(seqIndex, 1),
        disabled: seqIndex >= sequence.length - 1,
      });
      items.push({ separator: true });
    }

    // Duplicate
    items.push({
      label: "Duplicate",
      onClick: () => duplicateItem(seqIndex),
      disabled: isLocked && item.kind === "path", // can duplicate wait if locked? usually duplicating a locked item is fine, but maybe not if we can't insert?
      // Actually duplication creates a new item, so it shouldn't be blocked by lock of the source,
      // unless we want to prevent copying locked stuff. Usually "Duplicate" is "Copy & Paste".
      // But the memory says: "Duplicating a 'Wait' command creates a deep copy..."
      // The code in ControlTab checks "isLocked" for moving, but duplicating creates new.
      // Let's allow duplication.
    });

    items.push({ separator: true });

    // Insert options
    items.push({
      label: "Insert Wait Before",
      onClick: () => insertWait(seqIndex),
    });
    items.push({
      label: "Insert Wait After",
      onClick: () => insertWait(seqIndex + 1),
    });
    items.push({
      label: "Insert Rotate Before",
      onClick: () => insertRotate(seqIndex),
    });
    items.push({
      label: "Insert Rotate After",
      onClick: () => insertRotate(seqIndex + 1),
    });
    items.push({
      label: "Insert Path Before",
      onClick: () => insertPath(seqIndex),
    });
    items.push({
      label: "Insert Path After",
      onClick: () => insertPath(seqIndex + 1),
    });

    items.push({ separator: true });

    // Delete
    items.push({
      label: "Delete",
      onClick: () =>
        item.kind === "path"
          ? deleteLine(item.lineId)
          : item.kind === "wait"
            ? deleteWait(seqIndex)
            : item.kind === "rotate"
              ? deleteRotate(seqIndex)
              : deleteMacro(seqIndex),
      danger: true,
      disabled: isLocked || (lines.length <= 1 && item.kind === "path"),
    });

    contextMenuItems = items;
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    contextMenuOpen = true;
  }

  function toggleLock(seqIndex: number) {
    const item = sequence[seqIndex];
    if (item.kind === "path") {
      const line = lines.find((l) => l.id === item.lineId);
      if (line) {
        line.locked = !line.locked;
        lines = [...lines]; // Trigger reactivity
      }
    } else {
      // wait, rotate, macro
      const newSeq = [...sequence];
      newSeq[seqIndex] = {
        ...item,
        locked: !item.locked,
      };
      sequence = newSeq;
    }
    if (recordChange) recordChange();
  }

  function duplicateItem(seqIndex: number) {
    const item = sequence[seqIndex];
    if (!item) return;

    if (item.kind === "wait") {
      const newItem = structuredClone(item);
      newItem.id = makeId();
      newItem.locked = false; // unlock duplicate?
      // Preserve empty name when duplicating unnamed waits
      if (item.name && item.name.trim() !== "") {
        newItem.name = generateName(
          item.name,
          sequence.map((s) => (s.kind === "wait" ? s.name : "") || ""),
        );
      } else {
        newItem.name = "";
      }

      const newSeq = [...sequence];
      newSeq.splice(seqIndex + 1, 0, newItem);
      sequence = newSeq;
      recordChange();
    } else if (item.kind === "path") {
      // Logic for duplicating path (similar to insertLineAfter but copying properties)
      const line = lines.find((l) => l.id === item.lineId);
      if (!line) return;

      const newLine = structuredClone(line);
      newLine.id = makeId();
      newLine.locked = false;
      // Preserve empty name when duplicating unnamed paths
      if (line.name && line.name.trim() !== "") {
        newLine.name = generateName(
          line.name,
          lines.map((l) => l.name || ""),
        );
      } else {
        newLine.name = "";
      }

      // Offset the new line slightly or keep it same?
      // Usually duplicate implies same properties.
      // But for path, maybe we want it to start where the previous one ended?
      // Wait, "Duplicate" usually means copy the configuration.
      // If we duplicate a path segment, we probably want a new segment that continues from the current end point,
      // with the same relative vector?
      // Memory says: "Duplicating a path segment creates a new line inserted after the original, calculating the new end point and control points by applying the original segment's vector delta (end - start) to the previous endpoint..."

      // "previous endpoint" is the end point of the line being duplicated (since we insert after it).
      // So: New.Start = Old.End.
      // New.End = New.Start + (Old.End - Old.Start).
      // Old.Start is ... well, the end point of the line *before* the old line.

      // Let's look at `ControlTab` logic if it exists. It doesn't seem to have "Duplicate Path" explicitly, only "Insert Line After" (random) and "Duplicate Wait".
      // Wait, memory says: "The 'Duplicate' feature is triggered by Shift+D... Duplicating a path segment creates a new line inserted after the original..."
      // So I should implement that logic.

      // Find previous point for the original line to calculate delta.
      // The start point of `line` is the end point of the line before it in sequence, or `startPoint` if it's first.

      let prevPoint = startPoint;
      if (seqIndex > 0) {
        // Find the previous PATH item to get its end point.
        // Actually we just need the point before `line` in the linked list of paths.
        // `sequence` order matters.
        // Find path item index in sequence
        // Go backwards to find a path item.
        for (let i = seqIndex - 1; i >= 0; i--) {
          if (sequence[i].kind === "path") {
            const pl = lines.find((l) => l.id === (sequence[i] as any).lineId);
            if (pl) {
              prevPoint = pl.endPoint;
              break;
            }
          }
        }
      }

      const dx = line.endPoint.x - prevPoint.x;
      const dy = line.endPoint.y - prevPoint.y;

      // New start point is line.endPoint.
      // New end point is line.endPoint + delta.
      newLine.endPoint.x = line.endPoint.x + dx;
      newLine.endPoint.y = line.endPoint.y + dy;

      // Clamp to field?
      newLine.endPoint.x = Math.max(0, Math.min(144, newLine.endPoint.x));
      newLine.endPoint.y = Math.max(0, Math.min(144, newLine.endPoint.y));

      // Adjust control points
      // CP_new = New.Start + (CP_old - Old.Start)
      // effectively CP_new = CP_old + (New.Start - Old.Start) = CP_old + (Old.End - Old.Start) = CP_old + delta
      // Wait, CP is absolute.
      newLine.controlPoints = line.controlPoints.map((cp) => ({
        ...cp,
        x: Math.max(0, Math.min(144, cp.x + dx)),
        y: Math.max(0, Math.min(144, cp.y + dy)),
      }));

      // Insert
      const lineIdx = lines.findIndex((l) => l.id === item.lineId);
      lines.splice(lineIdx + 1, 0, newLine);
      lines = [...lines]; // trigger reactivity

      const newSeq = [...sequence];
      newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
      sequence = newSeq;

      lines = renumberDefaultPathNames(lines);
      recordChange();
    }
  }

  function insertWait(index: number) {
    const newWait: SequenceItem = {
      kind: "wait",
      id: makeId(),
      name: "",
      durationMs: 1000,
      locked: false,
    };

    // Name intentionally left empty for new waypoints

    const newSeq = [...sequence];
    newSeq.splice(index, 0, newWait);
    sequence = newSeq;
    syncLinesToSequence(newSeq);
    recordChange();
  }

  function insertRotate(index: number) {
    const newRotate: SequenceItem = {
      kind: "rotate",
      id: makeId(),
      name: "",
      degrees: 0,
      locked: false,
    };

    // Name intentionally left empty for new waypoints

    const newSeq = [...sequence];
    newSeq.splice(index, 0, newRotate);
    sequence = newSeq;
    syncLinesToSequence(newSeq);
    recordChange();
  }

  function insertMacro(index: number, filePath: string) {
    // Extract name from path
    const parts = filePath.split(/[/\\]/);
    const fileName = parts.pop() || filePath;
    const baseName = fileName.replace(/\.pp$/, "");

    const newMacro: SequenceMacroItem = {
      kind: "macro",
      id: makeId(),
      filePath,
      name: baseName,
      locked: false,
    };

    const newSeq = [...sequence];
    newSeq.splice(index, 0, newMacro);
    sequence = newSeq;
    syncLinesToSequence(newSeq);
    recordChange();

    // Trigger load
    loadMacro(filePath);
  }

  function insertPath(index: number) {
    // Logic similar to insertLineAfter in ControlTab
    // We need to find where to insert in `lines` array.
    // If index > 0, find the item at index-1.
    // If it's a path, insert after that line.
    // If it's a wait, keep going back until we find a path or start point.

    let insertAfterLineId: string | null = null;
    let refPoint = startPoint;
    let heading = "tangential";

    // Find the last path element before insertion point
    for (let i = index - 1; i >= 0; i--) {
      if (sequence[i].kind === "path") {
        insertAfterLineId = (sequence[i] as any).lineId;
        const l = lines.find((x) => x.id === insertAfterLineId);
        if (l) {
          refPoint = l.endPoint;
          heading = l.endPoint.heading;
        }
        break;
      }
    }

    // Create new line
    const newLine: Line = {
      id: makeId(),
      name: "",
      endPoint: {
        x: Math.max(0, Math.min(144, refPoint.x + 10)), // simple offset
        y: Math.max(0, Math.min(144, refPoint.y + 10)),
        heading: "tangential", // default
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
      eventMarkers: [],
    };

    // If we found a reference line, we insert after it in `lines`.
    // If not (inserting at start), insert at 0.
    let lineInsertIdx = 0;
    if (insertAfterLineId) {
      const idx = lines.findIndex((l) => l.id === insertAfterLineId);
      if (idx !== -1) lineInsertIdx = idx + 1;
    }

    lines.splice(lineInsertIdx, 0, newLine);
    lines = renumberDefaultPathNames([...lines]);

    const newSeq = [...sequence];
    newSeq.splice(index, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;

    recordChange();
  }

  function moveSequenceItem(seqIndex: number, delta: number) {
    const targetIndex = seqIndex + delta;
    if (targetIndex < 0 || targetIndex >= sequence.length) return;

    // Prevent moving if either the source or target is a locked path or a locked wait
    const isLockedSequenceItem = (index: number) => {
      const it = sequence[index];
      if (!it) return false;
      if (it.kind === "path") {
        const ln = lines.find((l) => l.id === it.lineId);
        return ln?.locked ?? false;
      }
      // wait, rotate, macro
      return (it as any).locked ?? false;
    };

    if (isLockedSequenceItem(seqIndex) || isLockedSequenceItem(targetIndex))
      return;

    const newSeq = [...sequence];
    const [item] = newSeq.splice(seqIndex, 1);
    newSeq.splice(targetIndex, 0, item);
    sequence = newSeq;

    syncLinesToSequence(newSeq);
    recordChange();
  }
</script>

<svelte:window on:dragover={handleWindowDragOver} on:drop={handleWindowDrop} />

{#if contextMenuOpen}
  <ContextMenu
    x={contextMenuX}
    y={contextMenuY}
    items={contextMenuItems}
    on:close={() => (contextMenuOpen = false)}
  />
{/if}

<div class="w-full flex flex-col gap-4 text-sm p-1">
  <div class="flex justify-between items-center">
    <h3 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
      Sequence
    </h3>
    <div class="flex items-center gap-2">
      <button
        title={copyButtonText}
        on:click={copyTableToClipboard}
        class="flex flex-row items-center gap-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-neutral-600 dark:text-neutral-400 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
      >
        <span>{copyButtonText}</span>
        {#if copyButtonText === "Copied!"}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="size-6 text-green-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m4.5 12.75 6 6 9-13.5"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
            />
          </svg>
        {/if}
      </button>
      <button
        title="Validate Path"
        aria-label="Validate Path"
        on:click={() => onValidate && onValidate()}
        class="flex flex-row items-center gap-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
      >
        <span>Validate</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      </button>
      <button
        title="Optimize Path"
        aria-label="Optimize Path"
        on:click={() => onToggleOptimization && onToggleOptimization()}
        class="flex flex-row items-center gap-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-purple-500 focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none"
      >
        <span>Optimize</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
          />
        </svg>
      </button>
    </div>
  </div>

  {#if showDebug}
    <div class="p-2 text-xs text-neutral-500">
      <div>
        <strong>DEBUG</strong> — lines: {lines.length}, sequence: {(
          sequence || []
        ).length}, display: {(displaySequence || []).length}
      </div>
      <div>Missing: {JSON.stringify(debugMissing)}</div>
      <div>Invalid refs: {JSON.stringify(debugInvalidRefs)}</div>
    </div>
  {/if}

  {#if optimizationOpen}
    <div
      class="w-full border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-4"
      transition:slide
    >
      <OptimizationDialog
        bind:this={optDialogRef}
        bind:isRunning={optIsRunning}
        bind:optimizedLines={optOptimizedLines}
        bind:optimizationFailed={optFailed}
        isOpen={true}
        {startPoint}
        {lines}
        {settings}
        {sequence}
        {shapes}
        onApply={handleOptimizationApply}
        {onPreviewChange}
        onClose={() => onToggleOptimization && onToggleOptimization()}
      />
    </div>
  {/if}

  <div
    class="w-full overflow-auto border rounded-md border-neutral-200 dark:border-neutral-700 max-h-[70vh]"
  >
    <table
      class="w-full text-left bg-white dark:bg-neutral-900 border-collapse"
    >
      <thead
        class="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-semibold sticky top-0 z-10 shadow-sm"
      >
        <tr>
          <th
            class="w-8 px-2 py-2 border-b dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800"
          ></th>
          <th
            class="px-3 py-2 border-b dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800"
            >Name</th
          >
          <th
            class="px-3 py-2 border-b dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800"
            >X (in) / Dur (ms)</th
          >
          <th
            class="px-3 py-2 border-b dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800"
            >Y (in) / Deg (°)</th
          >
          <th
            class="px-3 py-2 border-b dark:border-neutral-700 w-10 bg-neutral-100 dark:bg-neutral-800"
          ></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800">
        <!-- Start Point -->
        <tr
          data-seq-index="-1"
          class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors duration-150"
          class:selected={$selectedPointId === "point-0-0"}
          on:click={() => {
            selectedLineId.set(null);
            selectedPointId.set("point-0-0");
          }}
          on:contextmenu={(e) => handleContextMenu(e, -1)}
          class:border-b-2={dragOverIndex === -1 && dragPosition === "bottom"}
          class:border-blue-500={dragOverIndex === -1}
          class:dark:border-blue-400={dragOverIndex === -1}
        >
          <td
            class="w-8 px-2 py-2 text-center text-neutral-300 dark:text-neutral-600"
          >
            <!-- No drag handle for Start Point -->
            ●
          </td>
          <td
            class="px-3 py-2 font-medium text-neutral-800 dark:text-neutral-200"
          >
            Start Point
          </td>
          <td class="px-3 py-2">
            <input
              type="number"
              class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              step={stepSize}
              value={startPoint.x}
              aria-label="Start Point X"
              on:input={(e) => handleInput(e, startPoint, "x")}
              disabled={startPoint.locked}
            />
          </td>
          <td class="px-3 py-2">
            <input
              type="number"
              class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              step={stepSize}
              value={startPoint.y}
              aria-label="Start Point Y"
              on:input={(e) => handleInput(e, startPoint, "y")}
              disabled={startPoint.locked}
            />
          </td>
          <td class="px-3 py-2 flex items-center justify-between gap-1">
            {#if startPoint.locked}
              <span
                title="Locked"
                class="inline-flex items-center justify-center h-6 w-6 text-neutral-400"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  class="h-4 w-4"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                    clip-rule="evenodd"
                  />
                </svg>
              </span>
            {:else}
              <span class="h-6 w-6" aria-hidden="true"></span>
            {/if}
            <span class="h-6 w-6" aria-hidden="true"></span>
          </td>
        </tr>

        <!-- Sequence Items (displaySequence ensures missing lines are shown) -->
        {#each displaySequence as item, seqIdx (item.kind === "path" ? item.lineId : item.id)}
          {@const seqIndex = findSequenceIndex(item)}
          {#if item.kind === "path"}
            {#each lines.filter((l) => l.id === item.lineId) as line (line.id)}
              {@const lineIdx = lines.findIndex((l) => l === line)}
              <!-- End Point -->
              {@html debugPointRow(line, undefined)}
              {@const endPointId = `point-${lineIdx + 1}-0`}
              <tr
                data-seq-index={seqIndex}
                draggable={!line.locked}
                on:dragstart={(e) => handleDragStart(e, seqIndex)}
                on:dragend={handleDragEnd}
                on:contextmenu={(e) => handleContextMenu(e, seqIndex)}
                class={`hover:bg-neutral-50 dark:hover:bg-neutral-800/50 font-medium ${$selectedLineId === line.id ? "bg-green-50 dark:bg-green-900/20" : ""} ${$selectedPointId === endPointId ? "bg-green-100 dark:bg-green-800/40" : ""} transition-colors duration-150`}
                class:border-t-2={dragOverIndex === seqIndex &&
                  dragPosition === "top"}
                class:border-b-2={dragOverIndex === seqIndex &&
                  dragPosition === "bottom"}
                class:border-blue-500={dragOverIndex === seqIndex}
                class:dark:border-blue-400={dragOverIndex === seqIndex}
                class:opacity-50={draggingIndex === seqIndex}
                on:click={() => {
                  if (line.id) selectedLineId.set(line.id);
                  selectedPointId.set(endPointId);
                }}
              >
                <td
                  class="w-8 px-2 py-2 text-center cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    class="w-4 h-4 mx-auto"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 3a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </td>
                <td class="px-3 py-2">
                  <div class="flex flex-row items-center gap-2">
                    <ColorPicker
                      bind:color={line.color}
                      on:input={(e) =>
                        // @ts-ignore
                        updateLineColor(line.id, e.target.value)}
                      disabled={line.locked}
                      title="Path Color"
                    />
                    <div class="relative flex-1 max-w-[140px]">
                      <input
                        class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs pr-6"
                        class:text-blue-500={hoveredLinkId === line.id}
                        value={line.name}
                        on:input={(e) =>
                          // @ts-ignore
                          updateLineName(item.lineId, e.target.value)}
                        disabled={line.locked}
                        placeholder="Path {lineIdx + 1}"
                        aria-label="Path Name"
                      />
                      {#if line.id && isLineLinked(lines, line.id)}
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div
                          class="absolute right-1 top-1/2 -translate-y-1/2 text-blue-500 cursor-help flex items-center justify-center"
                          on:mouseenter={(e) =>
                            handleLinkHoverEnter(e, line.id || null)}
                          on:mouseleave={handleLinkHoverLeave}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            class="w-3.5 h-3.5"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                              clip-rule="evenodd"
                            />
                          </svg>
                          {#if hoveredLinkId === line.id}
                            <div
                              use:tooltipPortal={hoveredLinkAnchor}
                              class="w-64 p-2 bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700 rounded shadow-lg text-xs text-blue-900 dark:text-blue-100 z-50 pointer-events-none"
                            >
                              <strong>Linked Path</strong><br />
                              Logic: Same Name = Shared Position.<br />
                              This path shares its X/Y coordinates with other paths
                              named '{line.name}'. Control points & events
                              remain independent.
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-2">
                    <input
                      type="number"
                      class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      step={stepSize}
                      value={line.endPoint.x}
                      aria-label="{line.name || `Path ${lineIdx + 1}`} X"
                      on:input={(e) =>
                        handleInput(e, line.endPoint, "x", line.id)}
                      disabled={line.locked}
                    />
                    <span class="text-xs text-neutral-500"
                      >{line.waitBeforeName || line.waitBeforeMs || ""}</span
                    >
                  </div>
                </td>
                <td class="px-3 py-2">
                  <input
                    type="number"
                    class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    step={stepSize}
                    value={line.endPoint.y}
                    aria-label="{line.name || `Path ${lineIdx + 1}`} Y"
                    on:input={(e) =>
                      handleInput(e, line.endPoint, "y", line.id)}
                    disabled={line.locked}
                  />
                </td>
                <td class="px-3 py-2 flex items-center justify-between gap-1">
                  <!-- Left slot: lock/unlock button always visible -->
                  <button
                    title={line.locked ? "Unlock Path" : "Lock Path"}
                    aria-label={line.locked ? "Unlock Path" : "Lock Path"}
                    on:click|stopPropagation={() => {
                      line.locked = !line.locked;
                      lines = [...lines];
                      if (recordChange) recordChange();
                    }}
                    class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    aria-pressed={line.locked}
                  >
                    {#if line.locked}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="2"
                        stroke="currentColor"
                        class="size-5 stroke-yellow-500"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                        />
                      </svg>
                    {:else}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="2"
                        stroke="currentColor"
                        class="size-5 stroke-gray-400"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                        />
                      </svg>
                    {/if}
                  </button>

                  <!-- Right slot: delete or placeholder -->
                  {#if lines.length > 1 && !line.locked}
                    <button
                      on:click|stopPropagation={() => {
                        if (line.id) deleteLine(line.id);
                      }}
                      title="Delete path"
                      aria-label="Delete path"
                      class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    >
                      <TrashIcon className="size-4" strokeWidth={2} />
                    </button>
                  {:else}
                    <span class="h-6 w-6" aria-hidden="true"></span>
                  {/if}
                </td>
              </tr>

              <!-- Control Points -->
              {#each line.controlPoints as cp, j}
                {@html debugPointRow(line, cp, j)}
                {@const cpIndex = [
                  line.endPoint,
                  ...line.controlPoints,
                ].findIndex((p) => p === cp)}
                {@const pointId = `point-${lineIdx + 1}-${cpIndex}`}
                <tr
                  class={`hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${$selectedLineId === line.id ? "bg-green-50 dark:bg-green-900/20" : ""} ${$selectedPointId === pointId ? "bg-green-100 dark:bg-green-800/40" : ""}`}
                  on:click={() => {
                    if (line.id) selectedLineId.set(line.id);
                    selectedPointId.set(pointId);
                  }}
                >
                  <td class="w-8 px-2 py-2">
                    <!-- No drag handle for control points, but they are drop targets for the parent seqIdx -->
                  </td>
                  <td
                    class="px-3 py-2 pl-8 text-neutral-500 dark:text-neutral-400 text-xs"
                  >
                    ↳ Control {j + 1}
                  </td>
                  <td class="px-3 py-2">
                    <input
                      type="number"
                      class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900/50 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs"
                      step={stepSize}
                      value={cp.x}
                      aria-label="Control Point {j + 1} X for {line.name ||
                        `Path ${lineIdx + 1}`}"
                      on:input={(e) => handleInput(e, cp, "x")}
                      disabled={line.locked}
                    />
                  </td>
                  <td class="px-3 py-2">
                    <input
                      type="number"
                      class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900/50 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs"
                      step={stepSize}
                      value={cp.y}
                      aria-label="Control Point {j + 1} Y for {line.name ||
                        `Path ${lineIdx + 1}`}"
                      on:input={(e) => handleInput(e, cp, "y")}
                      disabled={line.locked}
                    />
                  </td>
                  <td class="px-3 py-2 flex items-center justify-between gap-1">
                    {#if line.locked}
                      <span
                        title="Locked"
                        class="inline-flex items-center justify-center h-6 w-6 text-neutral-400"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          class="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </span>
                      <span class="h-6 w-6" aria-hidden="true"></span>
                    {:else}
                      <span class="h-6 w-6" aria-hidden="true"></span>
                      <button
                        on:click|stopPropagation={() =>
                          deleteControlPoint(line, j)}
                        title="Delete control point"
                        aria-label="Delete control point"
                        class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                      >
                        <TrashIcon className="size-4" strokeWidth={2} />
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/each}
          {:else if item.kind === "wait"}
            <!-- Wait Item -->
            {@const seqIndex = findSequenceIndex(item)}
            <tr
              data-seq-index={seqIndex}
              draggable={!item.locked}
              on:dragstart={(e) => handleDragStart(e, seqIndex)}
              on:dragend={handleDragEnd}
              on:contextmenu={(e) => handleContextMenu(e, seqIndex)}
              class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 bg-amber-50 dark:bg-amber-900/20 transition-colors duration-150"
              class:border-t-2={dragOverIndex === seqIndex &&
                dragPosition === "top"}
              class:border-b-2={dragOverIndex === seqIndex &&
                dragPosition === "bottom"}
              class:border-blue-500={dragOverIndex === seqIndex}
              class:dark:border-blue-400={dragOverIndex === seqIndex}
              class:opacity-50={draggingIndex === seqIndex}
            >
              <td
                class="w-8 px-2 py-2 text-center cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="w-4 h-4 mx-auto"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 3a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
                    clip-rule="evenodd"
                  />
                </svg>
              </td>
              <td class="px-3 py-2">
                <div class="relative w-full max-w-[160px]">
                  <input
                    class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-amber-500 focus:outline-none text-xs pr-6"
                    class:text-amber-500={hoveredWaitId === item.id}
                    value={item.name}
                    on:input={(e) =>
                      // @ts-ignore
                      updateWaitName(item, e.target.value)}
                    disabled={item.locked}
                    placeholder="Wait"
                    aria-label="Wait"
                  />
                  {#if isWaitLinked(sequence, item.id)}
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                      class="absolute right-1 top-1/2 -translate-y-1/2 text-amber-500 cursor-help flex items-center justify-center"
                      on:mouseenter={(e) => handleWaitHoverEnter(e, item.id)}
                      on:mouseleave={handleWaitHoverLeave}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        class="w-3.5 h-3.5"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      {#if hoveredWaitId === item.id}
                        <div
                          use:tooltipPortal={hoveredWaitAnchor}
                          class="w-64 p-2 bg-amber-100 dark:bg-amber-900 border border-amber-300 dark:border-amber-700 rounded shadow-lg text-xs text-amber-900 dark:text-amber-100 z-50 pointer-events-none"
                        >
                          <strong>Linked Wait</strong><br />
                          Logic: Same Name = Shared Duration.<br />
                          This wait event shares its duration with other waits named
                          '{item.name}'.
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </td>
              <td class="px-3 py-2">
                <input
                  type="number"
                  class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-amber-500 focus:outline-none text-xs"
                  min="0"
                  value={item.durationMs}
                  aria-label="{item.name || 'Wait'} Duration"
                  on:input={(e) =>
                    updateWaitDuration(
                      item,
                      // @ts-ignore
                      parseFloat(e.target.value),
                    )}
                  disabled={item.locked}
                />
              </td>
              <td class="px-3 py-2 text-neutral-400 text-xs italic"> - </td>
              <td
                class="px-3 py-2 text-left flex items-center justify-start gap-1"
              >
                <!-- Lock toggle for wait -->
                <button
                  on:click|stopPropagation={() => toggleWaitLock(seqIndex)}
                  title={item.locked ? "Unlock wait" : "Lock wait"}
                  aria-label={item.locked ? "Unlock wait" : "Lock wait"}
                  class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  aria-pressed={item.locked}
                >
                  {#if item.locked}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                      stroke="currentColor"
                      class="size-5 stroke-yellow-500"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                      />
                    </svg>
                  {:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                      stroke="currentColor"
                      class="size-5 stroke-gray-400"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                      />
                    </svg>
                  {/if}
                </button>

                <!-- Delete slot (hidden when locked) -->
                {#if !item.locked}
                  <button
                    on:click|stopPropagation={() => deleteWait(seqIndex)}
                    title="Delete wait"
                    aria-label="Delete wait"
                    class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    <TrashIcon className="size-4" strokeWidth={2} />
                  </button>
                {:else}
                  <span class="h-6 w-6" aria-hidden="true"></span>
                {/if}
              </td>
            </tr>
          {:else if item.kind === "rotate"}
            <!-- Rotate Item -->
            {@const seqIndex = findSequenceIndex(item)}
            <tr
              data-seq-index={seqIndex}
              draggable={!item.locked}
              on:dragstart={(e) => handleDragStart(e, seqIndex)}
              on:dragend={handleDragEnd}
              on:contextmenu={(e) => handleContextMenu(e, seqIndex)}
              class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 bg-pink-50 dark:bg-pink-900/20 transition-colors duration-150"
              class:border-t-2={dragOverIndex === seqIndex &&
                dragPosition === "top"}
              class:border-b-2={dragOverIndex === seqIndex &&
                dragPosition === "bottom"}
              class:border-blue-500={dragOverIndex === seqIndex}
              class:dark:border-blue-400={dragOverIndex === seqIndex}
              class:opacity-50={draggingIndex === seqIndex}
            >
              <td
                class="w-8 px-2 py-2 text-center cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="w-4 h-4 mx-auto"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 3a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
                    clip-rule="evenodd"
                  />
                </svg>
              </td>
              <td class="px-3 py-2">
                <div class="relative w-full max-w-[160px]">
                  <input
                    class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-pink-500 focus:outline-none text-xs pr-6"
                    value={item.name}
                    on:input={(e) =>
                      // @ts-ignore
                      updateRotateName(item, e.target.value)}
                    disabled={item.locked}
                    placeholder="Rotate"
                    aria-label="Rotate"
                  />
                  {#if isRotateLinked(sequence, item.id)}
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                      class="absolute right-1 top-1/2 -translate-y-1/2 text-pink-500 cursor-help flex items-center justify-center"
                      title="Linked Rotate: Same Name = Shared Degrees"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        class="w-3.5 h-3.5"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </div>
                  {/if}
                </div>
              </td>
              <td class="px-3 py-2 text-neutral-400 text-xs italic"> - </td>
              <td class="px-3 py-2">
                <input
                  type="number"
                  class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-pink-500 focus:outline-none text-xs"
                  value={item.degrees}
                  aria-label="{item.name || 'Rotate'} Degrees"
                  on:input={(e) =>
                    updateRotateDegrees(
                      item,
                      // @ts-ignore
                      parseFloat(e.target.value),
                    )}
                  disabled={item.locked}
                />
              </td>
              <td
                class="px-3 py-2 text-left flex items-center justify-start gap-1"
              >
                <!-- Lock toggle for rotate -->
                <button
                  on:click|stopPropagation={() => toggleWaitLock(seqIndex)}
                  title={item.locked ? "Unlock rotate" : "Lock rotate"}
                  aria-label={item.locked ? "Unlock rotate" : "Lock rotate"}
                  class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  aria-pressed={item.locked}
                >
                  {#if item.locked}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                      stroke="currentColor"
                      class="size-5 stroke-yellow-500"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                      />
                    </svg>
                  {:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                      stroke="currentColor"
                      class="size-5 stroke-gray-400"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                      />
                    </svg>
                  {/if}
                </button>

                <!-- Delete slot (hidden when locked) -->
                {#if !item.locked}
                  <button
                    on:click|stopPropagation={() => deleteRotate(seqIndex)}
                    title="Delete rotate"
                    aria-label="Delete rotate"
                    class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    <TrashIcon className="size-4" strokeWidth={2} />
                  </button>
                {:else}
                  <span class="h-6 w-6" aria-hidden="true"></span>
                {/if}
              </td>
            </tr>
          {:else if item.kind === "macro"}
            <!-- Macro Item -->
            {@const seqIndex = findSequenceIndex(item)}
            <tr
              data-seq-index={seqIndex}
              draggable={!item.locked}
              on:dragstart={(e) => handleDragStart(e, seqIndex)}
              on:dragend={handleDragEnd}
              on:contextmenu={(e) => handleContextMenu(e, seqIndex)}
              class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 bg-teal-50 dark:bg-teal-900/20 transition-colors duration-150"
              class:border-t-2={dragOverIndex === seqIndex &&
                dragPosition === "top"}
              class:border-b-2={dragOverIndex === seqIndex &&
                dragPosition === "bottom"}
              class:border-blue-500={dragOverIndex === seqIndex}
              class:dark:border-blue-400={dragOverIndex === seqIndex}
              class:opacity-50={draggingIndex === seqIndex}
            >
              <td
                class="w-8 px-2 py-2 text-center cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="w-4 h-4 mx-auto"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 3a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
                    clip-rule="evenodd"
                  />
                </svg>
              </td>
              <td class="px-3 py-2">
                <div class="relative w-full max-w-[160px]">
                  <input
                    class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-teal-500 focus:outline-none text-xs pr-6"
                    value={item.name}
                    on:input={(e) =>
                      // @ts-ignore
                      updateMacroName(item, e.target.value)}
                    disabled={item.locked}
                    placeholder="Macro"
                    aria-label="Macro Name"
                  />
                  <!-- Macro Icon -->
                  <div
                    class="absolute right-1 top-1/2 -translate-y-1/2 text-teal-500 flex items-center justify-center"
                    title={`Macro: ${item.filePath}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      class="w-3.5 h-3.5"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm6.39-2.9a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0 1.06-1.06l-2.22-2.22 2.22-2.22ZM11.61 7.1a.75.75 0 1 0-1.22.872l2.22 2.22-2.22 2.22a.75.75 0 1 0 1.06 1.06l3.236-4.53-3.076-1.842Z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </td>
              <td
                class="px-3 py-2 text-neutral-400 text-xs italic truncate max-w-[100px]"
                title={item.filePath}
              >
                {item.filePath.split(/[/\\]/).pop()}
              </td>
              <td class="px-3 py-2 text-neutral-400 text-xs italic"> - </td>
              <td
                class="px-3 py-2 text-left flex items-center justify-start gap-1"
              >
                <!-- Lock toggle for macro -->
                <button
                  on:click|stopPropagation={() => toggleWaitLock(seqIndex)}
                  title={item.locked ? "Unlock macro" : "Lock macro"}
                  aria-label={item.locked ? "Unlock macro" : "Lock macro"}
                  class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  aria-pressed={item.locked}
                >
                  {#if item.locked}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                      stroke="currentColor"
                      class="size-5 stroke-yellow-500"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                      />
                    </svg>
                  {:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                      stroke="currentColor"
                      class="size-5 stroke-gray-400"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                      />
                    </svg>
                  {/if}
                </button>

                <!-- Delete slot (hidden when locked) -->
                {#if !item.locked}
                  <button
                    on:click|stopPropagation={() => deleteMacro(seqIndex)}
                    title="Delete macro"
                    aria-label="Delete macro"
                    class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    <TrashIcon className="size-4" strokeWidth={2} />
                  </button>
                {:else}
                  <span class="h-6 w-6" aria-hidden="true"></span>
                {/if}
              </td>
            </tr>
          {/if}
        {/each}

        <!-- Empty State -->
        {#if displaySequence.length === 0}
          <tr>
            <td
              colspan="5"
              class="p-8 text-center text-neutral-500 dark:text-neutral-400 border-t border-dashed border-neutral-200 dark:border-neutral-700"
            >
              <div class="flex flex-col items-center gap-4">
                <div
                  class="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-full"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="size-6 text-neutral-400"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                </div>
                <div class="text-sm">
                  <p class="font-medium text-neutral-800 dark:text-neutral-200">
                    No path segments yet
                  </p>
                  <p class="text-neutral-500 mt-1">
                    Start your path by adding a segment or wait command.
                  </p>
                </div>
              </div>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
  <div class="flex items-center justify-between mt-2 px-1">
    <div
      class="text-xs text-neutral-500 dark:text-neutral-500 w-2/3 break-words"
    >
      <div>
        * Coordinates in inches. 0,0 is bottom-left. Drag handle to reorder.
      </div>
      <div>
        * Right-click a row to add or reorder points. Use keyboard shortcuts for
        the best experience (see Keyboard Shortcuts).
      </div>
    </div>

    <!-- Persistent Add Buttons -->
    <div class="flex gap-2 flex-shrink-0">
      <button
        on:click={() => insertPath(sequence.length)}
        class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-green-600 dark:bg-green-700 rounded-md shadow-sm hover:bg-green-700 dark:hover:bg-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-green-300 dark:focus:ring-green-700"
        aria-label="Add new path segment"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-3"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        Add Path
      </button>

      <button
        on:click={() => insertWait(sequence.length)}
        class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-amber-500 dark:bg-amber-600 rounded-md shadow-sm hover:bg-amber-600 dark:hover:bg-amber-500 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500"
        aria-label="Add wait command"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-3"
        >
          <circle cx="12" cy="12" r="9" />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 7v5l3 2"
          />
        </svg>
        Add Wait
      </button>

      <button
        on:click={() => insertRotate(sequence.length)}
        class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-pink-500 dark:bg-pink-600 rounded-md shadow-sm hover:bg-pink-600 dark:hover:bg-pink-500 transition-colors focus:outline-none focus:ring-2 focus:ring-pink-200 dark:focus:ring-pink-500"
        aria-label="Add rotate command"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-3"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
        Add Rotate
      </button>
    </div>
  </div>
</div>
