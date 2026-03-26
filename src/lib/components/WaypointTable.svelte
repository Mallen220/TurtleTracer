<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    Point,
    Line,
    ControlPoint,
    SequenceItem,
    SequenceMacroItem,
  } from "../../types/index";
  import { loadMacro } from "../projectStore";
  import {
    reorderSequence,
    getClosestTarget,
    type DragPosition,
  } from "../../utils/dragDrop";
  import {
    formatDisplayCoordinate,
    formatDisplayDistance,
    cmToInch,
  } from "../../utils/coordinates";
  import {
    snapToGrid,
    showGrid,
    gridSize,
    selectedLineId,
    multiSelectedLineIds,
    selectedPointId,
    multiSelectedPointIds,
    focusRequest,
    notification,
  } from "../../stores";
  import { slide } from "svelte/transition";
  import { tick } from "svelte";
  import { tooltipPortal } from "../actions/portal";
  import ObstaclesSection from "./sections/ObstaclesSection.svelte";
  import TrashIcon from "./icons/TrashIcon.svelte";
  import ColorPicker from "./tools/ColorPicker.svelte";
  import ContextMenu from "./tools/ContextMenu.svelte";
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
  import { actionRegistry } from "../actionRegistry";
  import {
    getButtonFilledClass,
    getSmallButtonClass,
  } from "../../utils/buttonStyles";
  import { getShortcutFromSettings } from "../../utils";
  import { toUser, toField } from "../../utils/coordinates";
  import { calculatePathTime, formatTime } from "../../utils/timeCalculator";
  import DebugPanel from "./common/DebugPanel.svelte";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let recordChange: () => void;

  // Props for inline optimization panel
  export let handleOptimizationApply: (
    newLines: import("../../types/index").Line[],
  ) => void;
  export let onPreviewChange: (
    lines: import("../../types/index").Line[] | null,
  ) => void;
  export let settings: import("../../types/index").Settings | undefined =
    undefined;

  // Shapes and collapsedObstacles binding for ObstaclesSection
  export let shapes: import("../../types/index").Shape[];
  export let collapsedObstacles: boolean[];
  export let isActive: boolean = true;

  // Prevent Svelte unused-export warnings
  $: shapes;
  $: collapsedObstacles;
  $: _shapesCount = Array.isArray(shapes) ? shapes.length : 0;
  $: _settingsRef = settings; // Reference settings to suppress unused warning
  $: showDebug = (settings as any)?.showDebugSequence;
  $: _collapsedObstaclesCount = Array.isArray(collapsedObstacles)
    ? collapsedObstacles.length
    : 0;

  // Compute segment statistics for contextual display
  $: timePrediction = calculatePathTime(
    startPoint,
    lines,
    settings || ({} as any),
    sequence,
  );

  let pathStatsMap = new Map();
  $: {
    pathStatsMap.clear();
    if (timePrediction && timePrediction.timeline) {
      timePrediction.timeline.forEach((event) => {
        if (event.type === "travel" && event.lineIndex !== undefined) {
          const lineId = lines[event.lineIndex]?.id;
          if (lineId) pathStatsMap.set(lineId, event);
        }
      });
    }
    pathStatsMap = pathStatsMap; // trigger reactivity
  }

  function handleRowClick(
    e: MouseEvent,
    pointId: string,
    lineId: string | null,
  ) {
    if (lineId) selectedLineId.set(lineId);
    else selectedLineId.set(null);

    selectedPointId.set(pointId);

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      multiSelectedPointIds.update((ids) => {
        if (ids.includes(pointId)) {
          return ids.filter((id) => id !== pointId);
        } else {
          return [...ids, pointId];
        }
      });
      if (lineId) {
        multiSelectedLineIds.update((ids) => {
          if (!ids.includes(lineId)) return [...ids, lineId];
          return ids;
        });
      }
    } else {
      multiSelectedPointIds.set([pointId]);
      if (lineId) multiSelectedLineIds.set([lineId]);
      else multiSelectedLineIds.set([]);
    }
  }
  // Focus Handling Action
  function focusOnRequest(
    node: HTMLElement,
    params: { id: string; field: string },
  ) {
    const unsubscribe = focusRequest.subscribe((req) => {
      if (
        isActive &&
        req &&
        req.id === params.id &&
        req.field === params.field
      ) {
        node.focus();
        if (node instanceof HTMLInputElement) node.select();
      }
    });
    return {
      update(newParams: { id: string; field: string }) {
        params = newParams;
      },
      destroy() {
        unsubscribe();
      },
    };
  }

  // Optimization dialog refs and programmatic control
  let optDialogRef: any = null;
  let optIsRunning: boolean = false;
  let optOptimizedLines: Line[] | null = null;
  let optFailed: boolean = false;

  export async function openAndStartOptimization() {
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
      isOpen: true,
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
    let val = parseFloat(input.value);
    if (!isNaN(val)) {
      if (
        settings?.visualizerUnits === "metric" &&
        (field === "x" || field === "y")
      ) {
        val = cmToInch(val);
      }
      const system = settings?.coordinateSystem || "Pedro";
      const userPt = toUser(point, system);
      const newUserPt = { ...userPt, [field]: val };
      const fieldPt = toField(newUserPt, system);

      // Update both since change in user X might affect field Y and vice versa
      point.x = fieldPt.x;
      point.y = fieldPt.y;

      // Trigger reactivity
      if (lineId) {
        const line = lines.find((l) => l.id === lineId);
        if (line && line.endPoint === point) {
          lines = updateLinkedWaypoints(lines, lineId);
        }
      }
      lines = lines;
      startPoint = startPoint;
      recordChange();
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
      if (s.kind !== item.kind) return false;
      const def = actionRegistry.get(s.kind);
      if (def?.isPath) return (s as any).lineId === (item as any).lineId;
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
          .filter((s) => actionRegistry.get((s as any).kind)?.isPath)
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
  $: debugLinesIds = Array.isArray(lines)
    ? lines.map((l) => l.id).filter((id): id is string => id != null)
    : [];
  $: debugSequenceIds = Array.isArray(sequence)
    ? sequence.map((s) =>
        actionRegistry.get(s.kind)?.isPath ? (s as any).lineId : (s as any).id,
      )
    : [];
  $: debugDisplayIds = Array.isArray(displaySequence)
    ? displaySequence.map((d) =>
        actionRegistry.get(d.kind)?.isPath ? (d as any).lineId : (d as any).id,
      )
    : [];
  $: debugMissing = debugLinesIds.filter(
    (id) => id && !debugSequenceIds.includes(id),
  ) as string[];
  $: debugInvalidRefs = debugSequenceIds.filter(
    (id) => id && !debugLinesIds.includes(id),
  ) as string[];

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
    if (!isActive) return;
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
    if (!isActive) return;

    // Check for macro drop
    if (
      e.dataTransfer &&
      ["application/x-turtle-tracer-macro", "application/x-pedro-macro"].some(
        (t) => e.dataTransfer?.types?.includes(t),
      )
    ) {
      e.preventDefault();
      const filePath =
        e.dataTransfer.getData("application/x-turtle-tracer-macro") ||
        e.dataTransfer.getData("application/x-pedro-macro");
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
        !sequence.some(
          (s) =>
            actionRegistry.get(s.kind)?.isPath && (s as any).lineId === l.id,
        ),
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
      (item) => !(item.kind === "path" && (item as any).lineId === lineId),
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

  function unlinkMacro(macroItem: SequenceMacroItem, seqIndex: number) {
    if (macroItem.locked) return;

    // 1. Remove macro tracking from lines
    lines = lines.map((line) => {
      if (line.macroId === macroItem.id) {
        return {
          ...line,
          isMacroElement: false,
          macroId: undefined,
          locked: false,
          endPoint: {
            ...line.endPoint,
            isMacroElement: false,
            macroId: undefined,
            locked: false,
          },
          controlPoints: line.controlPoints.map((cp) => ({
            ...cp,
            isMacroElement: false,
            macroId: undefined,
            locked: false,
          })),
        };
      }
      return line;
    });

    // 2. Extract nested sequence and unlock it
    const nestedSequence = (macroItem.sequence || []).map((item) => ({
      ...item,
      locked: false,
    }));

    // 3. Update main sequence
    const newSeq = [...sequence];
    newSeq.splice(seqIndex, 1, ...nestedSequence);
    sequence = newSeq;

    if (recordChange) recordChange();
  }

  function deleteSequenceItem(index: number) {
    const item = sequence[index];
    if (!item) return;

    if (item.kind === "path") {
      deleteLine((item as any).lineId);
      return;
    }

    if ((item as any).locked) return;

    sequence.splice(index, 1);
    sequence = [...sequence];
    syncLinesToSequence(sequence);
    if (recordChange) recordChange();
    selectedPointId.set(null);
  }

  // Deprecated specific delete functions mapped to generic one for backward compat if needed
  function deleteWait(index: number) {
    deleteSequenceItem(index);
  }
  function deleteRotate(index: number) {
    deleteSequenceItem(index);
  }
  function deleteMacro(index: number) {
    deleteSequenceItem(index);
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

  export function copyTableToClipboard() {
    const system = settings?.coordinateSystem || "Pedro";
    const rows = [];
    rows.push("| Name | X (in) / Dur (ms) | Y (in) / Deg |");
    rows.push("| :--- | :--- | :--- |");
    const sPt = toUser(startPoint, system);
    rows.push(`| Start Point | ${sPt.x.toString()} | ${sPt.y.toString()} |`);

    for (const item of displaySequence) {
      if (item.kind === "path") {
        const line = lines.find((l) => l.id === item.lineId);
        if (line) {
          const ePt = toUser(line.endPoint, system);
          let xVal = ePt.x.toString();
          if (line.waitBeforeName || line.waitBeforeMs) {
            xVal += ` (${line.waitBeforeName || line.waitBeforeMs})`;
          }
          const lineIdx = lines.findIndex((l) => l.id === line.id);
          rows.push(
            `| ${line.name || `Path ${lineIdx + 1}`} | ${xVal} | ${ePt.y.toString()} |`,
          );
          line.controlPoints.forEach((cp, idx) => {
            const cPt = toUser(cp, system);
            rows.push(
              `| ↳ Control ${idx + 1} | ${cPt.x.toString()} | ${cPt.y.toString()} |`,
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
        notification.set({
          message: "Table copied to clipboard!",
          type: "success",
        });
        setTimeout(() => {
          copyButtonText = "Copy Table";
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy table: ", err);
        notification.set({
          message: "Failed to copy table.",
          type: "error",
        });
      });
  }

  // --- Context Menu Logic ---

  let contextMenuOpen = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuItems: any[] = [];

  let hoveredLinkId: string | null = null;
  let hoveredWaitId: string | null = null;
  let hoveredStatsLineId: string | null = null;
  // Anchor elements used for portal positioning (moved to body)
  let hoveredLinkAnchor: HTMLElement | null = null;
  let hoveredWaitAnchor: HTMLElement | null = null;
  let hoveredStatsAnchor: HTMLElement | null = null;

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

  function handleStatsHoverEnter(e: MouseEvent, id: string | null) {
    hoveredStatsLineId = id;
    hoveredStatsAnchor = e.currentTarget as HTMLElement;
  }
  function handleStatsHoverLeave() {
    hoveredStatsLineId = null;
    hoveredStatsAnchor = null;
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
      disabled: isLocked && item.kind === "path",
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
      onClick: () => deleteSequenceItem(seqIndex),
      danger: true,
      disabled:
        isLocked ||
        (lines.length <= 1 && !!actionRegistry.get(item.kind)?.isPath),
    });

    contextMenuItems = items;
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    contextMenuOpen = true;
  }

  function toggleLock(seqIndex: number) {
    const item = sequence[seqIndex];
    if (item.kind === "path") {
      const line = lines.find((l) => l.id === (item as any).lineId);
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

  // Bound handlers to avoid inline typed parameters in markup
  function onDragStartFor(idx: number, e: DragEvent) {
    handleDragStart(e, idx);
  }

  function handleContextMenuFor(idx: number, e: MouseEvent) {
    handleContextMenu(e, idx);
  }

  // Utility to safely get locked flag for sequence items without using inline `as` casts inside templates
  function getIsLocked(i: SequenceItem) {
    return (i as any).locked ?? false;
  }

  // Helper to accept updates coming from child row components (binds avoid inline typed params)
  function handleUpdateFromComponent(idx: number, updatedItem: any) {
    // Create a new array reference to ensure Svelte reactivity triggers,
    // especially for ControlTab which binds to sequence.
    const newSeq = [...sequence];
    newSeq[idx] = updatedItem;

    const def = actionRegistry.get(newSeq[idx].kind);
    if (def?.isWait) {
      sequence = updateLinkedWaits(newSeq, (newSeq[idx] as any).id);
    } else if (def?.isRotate) {
      sequence = updateLinkedRotations(newSeq, (newSeq[idx] as any).id);
    } else {
      sequence = newSeq;
    }
    recordChange();
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
      const line = lines.find((l) => l.id === (item as any).lineId);
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

      let prevPoint = startPoint;
      if (seqIndex > 0) {
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

  function insertAction(kind: string, index: number) {
    const def = actionRegistry.get(kind);
    if (def && def.onInsert) {
      def.onInsert({
        index,
        sequence,
        lines,
        startPoint,
        triggerReactivity: () => {
          sequence = [...sequence];
          lines = renumberDefaultPathNames([...lines]);
          recordChange();
        },
      });
    }
  }

  // Generic wrappers for inserting common actions. These delegate to the action registry
  // so each action's onInsert handler performs the correct mutation and reactivity.
  function insertWait(index: number) {
    insertAction("wait", index);
  }

  function insertRotate(index: number) {
    insertAction("rotate", index);
  }

  function insertPath(index: number) {
    const def = actionRegistry.get("path");
    if (def && def.onInsert) {
      insertAction("path", index);
      return;
    }

    // Fallback if the action isn't registered yet — replicate PathAction insertion logic locally
    let insertAfterLineId: string | null = null;
    let refPoint: Point = startPoint;

    for (let i = index - 1; i >= 0; i--) {
      if (sequence[i].kind === "path") {
        insertAfterLineId = (sequence[i] as any).lineId;
        const l = lines.find((x) => x.id === insertAfterLineId);
        if (l) refPoint = l.endPoint;
        break;
      }
    }

    let endPoint: Point;
    if (refPoint.heading === "linear") {
      const linRef = refPoint as Extract<Point, { heading: "linear" }>;
      const deg = linRef.endDeg ?? linRef.startDeg ?? 0;
      endPoint = {
        x: Math.max(0, Math.min(144, (refPoint.x || 0) + 10)),
        y: Math.max(0, Math.min(144, (refPoint.y || 0) + 10)),
        heading: "linear",
        startDeg: deg,
        endDeg: deg,
      };
    } else if (refPoint.heading === "constant") {
      endPoint = {
        x: Math.max(0, Math.min(144, (refPoint.x || 0) + 10)),
        y: Math.max(0, Math.min(144, (refPoint.y || 0) + 10)),
        heading: "constant",
        degrees:
          (refPoint as Extract<Point, { heading: "constant" }>).degrees ?? 0,
      };
    } else {
      endPoint = {
        x: Math.max(0, Math.min(144, (refPoint.x || 0) + 10)),
        y: Math.max(0, Math.min(144, (refPoint.y || 0) + 10)),
        heading: "tangential",
        reverse: (refPoint as any).reverse ?? false,
      };
    }

    const newLine: Line = {
      id: makeId(),
      name: "",
      endPoint,
      controlPoints: [],
      color: getRandomColor(),
      eventMarkers: [],
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Compute insertion index in lines
    let lineInsertIdx = 0;
    if (insertAfterLineId) {
      const idx = lines.findIndex((l) => l.id === insertAfterLineId);
      if (idx !== -1) lineInsertIdx = idx + 1;
    }

    lines.splice(lineInsertIdx, 0, newLine);
    lines = renumberDefaultPathNames(lines);

    const newSeq = [...sequence];
    newSeq.splice(index, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;

    if (recordChange) recordChange();
  }

  function handleAddAction(def: any) {
    if (def.createDefault) {
      const newItem = def.createDefault();
      const newSeq = [...sequence];
      newSeq.push(newItem);
      sequence = newSeq;
      syncLinesToSequence(newSeq);
      if (def.isWait) sequence = updateLinkedWaits(sequence, newItem.id);
      if (def.isRotate) sequence = updateLinkedRotations(sequence, newItem.id);
      recordChange();
    }
  }

  function getButtonColorClass(color: string) {
    return getButtonFilledClass(color);
  }

  function insertMacro(index: number, filePath: string) {
    // Extract name from path
    const parts = filePath.split(/[/\\]/);
    const fileName = parts.pop() || filePath;
    const baseName = fileName.replace(/\.(pp|turt)$/i, "");

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
        aria-label={copyButtonText}
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
    </div>
  </div>

  {#if showDebug}
    <DebugPanel
      componentName="WaypointTable"
      {debugMissing}
      {debugInvalidRefs}
      linesLength={lines.length}
      sequenceLength={(sequence || []).length}
      displaySequenceLength={(displaySequence || []).length}
    />
  {/if}
</div>

<div
  class="w-full overflow-auto border rounded-md border-neutral-200 dark:border-neutral-700 max-h-[70vh]"
>
  <table class="w-full text-left bg-white dark:bg-neutral-900 border-collapse">
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
        class:selected={$selectedPointId === "point-0-0" ||
          $multiSelectedPointIds.includes("point-0-0")}
        on:click={(e) => handleRowClick(e, "point-0-0", null)}
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
            value={formatDisplayCoordinate(
              toUser(startPoint, settings?.coordinateSystem || "Pedro").x,
              settings || {},
            )}
            aria-label="Start Point X"
            on:change={(e) => handleInput(e, startPoint, "x")}
            use:focusOnRequest={{ id: "point-0-0", field: "x" }}
            disabled={startPoint.locked}
          />
        </td>
        <td class="px-3 py-2">
          <input
            type="number"
            class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            step={stepSize}
            value={formatDisplayCoordinate(
              toUser(startPoint, settings?.coordinateSystem || "Pedro").y,
              settings || {},
            )}
            aria-label="Start Point Y"
            on:change={(e) => handleInput(e, startPoint, "y")}
            use:focusOnRequest={{ id: "point-0-0", field: "y" }}
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
        {@const actionDef = actionRegistry.get(item.kind)}
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
              class={`hover:bg-neutral-50 dark:hover:bg-neutral-800/50 font-medium ${$selectedLineId === line.id ? "bg-green-50 dark:bg-green-900/20" : ""} ${$multiSelectedPointIds.length > 1 && $multiSelectedPointIds.includes(endPointId) ? "bg-green-100 dark:bg-green-800/40" : ""} transition-colors duration-150 ${line.hidden ? "opacity-50 grayscale-[50%]" : ""}`}
              class:border-t-2={dragOverIndex === seqIndex &&
                dragPosition === "top"}
              class:border-b-2={dragOverIndex === seqIndex &&
                dragPosition === "bottom"}
              class:border-blue-500={dragOverIndex === seqIndex}
              class:dark:border-blue-400={dragOverIndex === seqIndex}
              class:opacity-50={draggingIndex === seqIndex}
              on:click={(e) => handleRowClick(e, endPointId, line.id || null)}
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
                    on:input={function (e) {
                      const target = e.currentTarget || e.target;
                      if (target instanceof HTMLInputElement && line.id) {
                        updateLineColor(line.id, target.value);
                      }
                    }}
                    disabled={line.locked}
                    title="Path Color"
                  />
                  <div class="relative flex-1 max-w-[140px]">
                    <input
                      class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs pr-6"
                      class:text-blue-500={hoveredLinkId === line.id}
                      value={line.name}
                      on:input={function (e) {
                        const target = e.currentTarget || e.target;
                        if (target instanceof HTMLInputElement) {
                          updateLineName(item.lineId, target.value);
                        }
                      }}
                      use:focusOnRequest={{
                        id: line.id || "",
                        field: "name",
                      }}
                      disabled={line.locked}
                      placeholder="Path {lineIdx + 1}"
                      aria-label="Path Name"
                    />
                    {#if line.id && pathStatsMap.has(line.id)}
                      <div
                        role="presentation"
                        class="absolute right-[22px] top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-help flex items-center justify-center"
                        on:mouseenter={(e) =>
                          handleStatsHoverEnter(e, line.id || null)}
                        on:mouseleave={handleStatsHoverLeave}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke-width="2"
                          stroke="currentColor"
                          class="w-3.5 h-3.5"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                          />
                        </svg>
                        {#if hoveredStatsLineId === line.id}
                          <div
                            use:tooltipPortal={hoveredStatsAnchor}
                            class="w-48 p-2 bg-neutral-800 border border-neutral-700 rounded shadow-lg text-xs text-neutral-100 z-50 pointer-events-none"
                          >
                            <strong>Segment Stats</strong><br />
                            Start: {formatTime(
                              pathStatsMap.get(line.id).startTime,
                            )}<br />
                            End: {formatTime(
                              pathStatsMap.get(line.id).endTime,
                            )}<br />
                            Duration: {formatTime(
                              pathStatsMap.get(line.id).duration,
                            )}<br />
                            {#if pathStatsMap.get(line.id).distance !== undefined}
                              Distance: {formatDisplayDistance(
                                pathStatsMap.get(line.id).distance,
                                settings || {},
                                2,
                              )}
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/if}
                    {#if line.id && isLineLinked(lines, line.id)}
                      <div
                        role="presentation"
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
                            named '{line.name}'. Control points & events remain
                            independent.
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
                    value={formatDisplayCoordinate(
                      toUser(
                        line.endPoint,
                        settings?.coordinateSystem || "Pedro",
                      ).x,
                      settings || {},
                    )}
                    aria-label="{line.name || `Path ${lineIdx + 1}`} X"
                    on:change={(e) =>
                      handleInput(e, line.endPoint, "x", line.id)}
                    use:focusOnRequest={{ id: endPointId, field: "x" }}
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
                  value={formatDisplayCoordinate(
                    toUser(line.endPoint, settings?.coordinateSystem || "Pedro")
                      .y,
                    settings || {},
                  )}
                  aria-label="{line.name || `Path ${lineIdx + 1}`} Y"
                  on:change={(e) => handleInput(e, line.endPoint, "y", line.id)}
                  use:focusOnRequest={{ id: endPointId, field: "y" }}
                  disabled={line.locked}
                />
              </td>
              <td class="px-3 py-2 flex items-center justify-between gap-1">
                <!-- Eye/Hide icon -->
                <button
                  title={line.hidden ? "Show Path" : "Hide Path"}
                  aria-label={line.hidden ? "Show Path" : "Hide Path"}
                  on:click|stopPropagation={() => {
                    line.hidden = !line.hidden;
                    lines = [...lines];
                    if (recordChange) recordChange();
                  }}
                  class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  {#if line.hidden}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                      stroke="currentColor"
                      class="size-5 text-neutral-400"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  {:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                      stroke="currentColor"
                      class="size-5 text-gray-400"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                      />
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      />
                    </svg>
                  {/if}
                </button>

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
                class={`hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${$selectedLineId === line.id ? "bg-green-50 dark:bg-green-900/20" : ""} ${$multiSelectedPointIds.length > 1 && $multiSelectedPointIds.includes(pointId) ? "bg-green-100 dark:bg-green-800/40" : ""}`}
                on:click={(e) => handleRowClick(e, pointId, line.id || null)}
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
                    value={formatDisplayCoordinate(
                      toUser(cp, settings?.coordinateSystem || "Pedro").x,
                      settings || {},
                    )}
                    aria-label="Control Point {j + 1} X for {line.name ||
                      `Path ${lineIdx + 1}`}"
                    on:change={(e) => handleInput(e, cp, "x")}
                    use:focusOnRequest={{ id: pointId, field: "x" }}
                    disabled={line.locked}
                  />
                </td>
                <td class="px-3 py-2">
                  <input
                    type="number"
                    class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900/50 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs"
                    step={stepSize}
                    value={formatDisplayCoordinate(
                      toUser(cp, settings?.coordinateSystem || "Pedro").y,
                      settings || {},
                    )}
                    aria-label="Control Point {j + 1} Y for {line.name ||
                      `Path ${lineIdx + 1}`}"
                    on:change={(e) => handleInput(e, cp, "y")}
                    use:focusOnRequest={{ id: pointId, field: "y" }}
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
        {:else if actionDef}
          <svelte:component
            this={actionDef.component}
            {item}
            index={seqIndex}
            isLocked={getIsLocked(item)}
            {dragOverIndex}
            {dragPosition}
            {draggingIndex}
            onUpdate={handleUpdateFromComponent.bind(null, seqIndex)}
            onLock={() => toggleWaitLock(seqIndex)}
            onDelete={() => deleteSequenceItem(seqIndex)}
            onUnlink={() => {
              if (item.kind === "macro") {
                unlinkMacro(item, seqIndex);
              }
            }}
            onDragStart={onDragStartFor.bind(null, seqIndex)}
            onDragEnd={handleDragEnd}
            onContextMenu={handleContextMenuFor.bind(null, seqIndex)}
            {sequence}
          />
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
              <div class="p-3 bg-neutral-100 dark:bg-neutral-800 rounded-full">
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
  <div class="text-xs text-neutral-500 dark:text-neutral-500 w-2/3 break-words">
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
      title={`Add new path segment${getShortcutFromSettings(settings, "add-path")}`}
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

    {#each Object.values($actionRegistry) as def (def.kind)}
      {#if def.createDefault && !def.isPath}
        <button
          on:click={() => handleAddAction(def)}
          class={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 ${getButtonColorClass(def.buttonColor || "gray")}`}
          aria-label={`Add ${def.label} command`}
          title={`Add ${def.label} command${getShortcutFromSettings(settings, def.kind === "wait" ? "add-wait" : def.kind === "rotate" ? "add-rotate" : "")}`}
        >
          <!-- Render Icon based on kind for now as SVG string is not easily injectable here without raw HTML -->
          {#if def.kind === "wait"}
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
          {:else if def.kind === "rotate"}
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
          {:else}
            <!-- Fallback icon -->
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
          {/if}
          Add {def.label}
        </button>
      {/if}
    {/each}
  </div>
</div>
