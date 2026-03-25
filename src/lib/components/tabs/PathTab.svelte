<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    Point,
    Line,
    SequenceItem,
    SequenceWaitItem,
    SequenceRotateItem,
    SequenceMacroItem,
    Settings,
  } from "../../../types/index";
  import { tick } from "svelte";
  import _ from "lodash";
  import {
    calculateDragPosition,
    reorderSequence,
    getClosestTarget,
    type DragPosition,
  } from "../../../utils/dragDrop";
  import { getRandomColor } from "../../../utils";
  import {
    makeId,
    renumberDefaultPathNames,
    generateName,
  } from "../../../utils/nameGenerator";
  import ContextMenu from "../tools/ContextMenu.svelte";
  import StartingPointSection from "../sections/StartingPointSection.svelte";
  import EmptyState from "../common/EmptyState.svelte";
  import PathLineSection from "../sections/PathLineSection.svelte";
  import WaitSection from "../sections/WaitSection.svelte";
  import RotateSection from "../sections/RotateSection.svelte";
  import MacroSection from "../sections/MacroSection.svelte";
  import {
    selectedLineId,
    selectedPointId,
    toggleCollapseAllTrigger,
  } from "../../../stores";
  import { loadMacro } from "../../../lib/projectStore";
  import { getShortcutFromSettings } from "../../../utils";
  import { actionRegistry } from "../../actionRegistry";
  import { getButtonFilledClass } from "../../../utils/buttonStyles";
  import {
    updateLinkedWaits,
    updateLinkedRotations,
  } from "../../../utils/pointLinking";
  import PathActionButtons from "./PathActionButtons.svelte";
  import DebugPanel from "../common/DebugPanel.svelte";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let settings: Settings;
  export let recordChange: (action?: string) => void;
  export let isActive: boolean = false; // instead of checking activeTab === 'path'

  $: showDebug = (settings as any)?.showDebugSequence;

  // --- Logic from ControlTab ---
  let collapsedEventMarkers: boolean[] = lines.map(() => false);

  // State for collapsed sections
  let collapsedSections = {
    lines: lines.map(() => false),
    controlPoints: lines.map(() => true), // Start with control points collapsed
    // Generic map for all sequence items by ID (waits, rotates, macros, etc.)
    items: {} as Record<string, boolean>,
  };

  // Debug helpers
  $: debugLinesIds = Array.isArray(lines)
    ? lines.map((l) => l.id).filter((id): id is string => id != null)
    : [];
  $: debugSequenceIds = Array.isArray(sequence)
    ? sequence.filter((s) => s.kind === "path").map((s: any) => s.lineId)
    : ([] as string[]);
  $: debugMissing = debugLinesIds.filter(
    (id) => id && !debugSequenceIds.includes(id),
  ) as string[];
  $: debugInvalidRefs = debugSequenceIds.filter(
    (id) => !debugLinesIds.includes(id),
  ) as string[];

  let repairedSequenceOnce = false;

  $: if (
    Array.isArray(lines) &&
    Array.isArray(sequence) &&
    !repairedSequenceOnce
  ) {
    const lineIds = new Set(lines.map((l) => l.id));
    const pruned = sequence.filter(
      (s) => s.kind !== "path" || lineIds.has((s as any).lineId),
    );
    const presentIds = new Set(
      pruned.filter((s) => s.kind === "path").map((s) => (s as any).lineId),
    );
    const missing = lines.filter(
      (l) => !presentIds.has(l.id) && !l.isMacroElement,
    );

    if (missing.length || pruned.length !== sequence.length) {
      sequence = [
        ...pruned,
        ...missing.map(
          (l) =>
            ({
              kind: "path",
              lineId: l.id as string,
            }) as unknown as SequenceItem,
        ),
      ];
      repairedSequenceOnce = true;
      recordChange?.("Repair Sequence");
    }
  }

  // Reactive statements to update UI state when lines change
  $: if (lines.length !== collapsedSections.lines.length) {
    collapsedEventMarkers = lines.map(() => false);
    const wasAllCollapsed =
      collapsedSections &&
      collapsedSections.lines &&
      collapsedSections.lines.length > 0 &&
      collapsedSections.lines.every((v) => v === true);
    collapsedSections = {
      ...collapsedSections,
      lines: lines.map(() => (wasAllCollapsed ? true : false)),
      controlPoints: lines.map(() => true),
    };
  }

  let _lastToggleCollapse = $toggleCollapseAllTrigger;
  $: if ($toggleCollapseAllTrigger !== _lastToggleCollapse) {
    _lastToggleCollapse = $toggleCollapseAllTrigger;
    toggleCollapseAll();
  }

  // Drag and drop state
  let draggingIndex: number | null = null;
  let dragOverIndex: number | null = null;
  let dragPosition: DragPosition | null = null;

  // Context Menu state
  let contextMenuOpen = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuItems: any[] = [];

  async function handleContextMenu(event: MouseEvent, seqIndex: number) {
    event.preventDefault();

    if (contextMenuOpen) {
      contextMenuOpen = false;
      await tick();
    }

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
          onClick: () => insertWaitAfter(-1),
        },
        {
          label: "Insert Rotate After",
          onClick: () => insertRotateAfter(-1),
        },
        {
          label: "Insert Path After",
          onClick: () => insertPathAfter(-1),
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

    items.push({
      label: isLocked ? "Unlock" : "Lock",
      onClick: () => toggleLock(seqIndex),
    });

    items.push({ separator: true });

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

    items.push({
      label: "Duplicate",
      onClick: () => duplicateItem(seqIndex),
      disabled: isLocked && item.kind === "path",
    });

    items.push({ separator: true });

    items.push({
      label: "Insert Wait Before",
      onClick: () => insertWaitBefore(seqIndex),
    });
    items.push({
      label: "Insert Wait After",
      onClick: () => insertWaitAfter(seqIndex),
    });
    items.push({
      label: "Insert Rotate Before",
      onClick: () => insertRotateBefore(seqIndex),
    });
    items.push({
      label: "Insert Rotate After",
      onClick: () => insertRotateAfter(seqIndex),
    });
    items.push({
      label: "Insert Path Before",
      onClick: () => insertPathBefore(seqIndex),
    });
    items.push({
      label: "Insert Path After",
      onClick: () => insertPathAfter(seqIndex),
    });

    items.push({ separator: true });

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

  function handleDragStart(e: DragEvent, index: number) {
    const originElem = document.elementFromPoint(
      e.clientX,
      e.clientY,
    ) as HTMLElement | null;
    if (originElem?.closest("[data-event-marker-slider]")) {
      e.preventDefault();
      return;
    }

    const item = sequence[index];
    let isLocked = false;
    if (item.kind === "path") {
      const line = lines.find((l) => l.id === item.lineId);
      isLocked = line?.locked ?? false;
    } else {
      isLocked = item.locked ?? false;
    }

    if (
      originElem?.tagName === "INPUT" ||
      originElem?.tagName === "TEXTAREA" ||
      originElem?.tagName === "SELECT"
    ) {
      e.preventDefault();
      return;
    }

    if (isLocked) {
      e.preventDefault();
      return;
    }

    draggingIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  }

  function handleWindowDragOver(e: DragEvent) {
    if (!isActive) return;
    const isInternalReorder = draggingIndex !== null;
    const isMacroDrop = e.dataTransfer?.types
      ? ["application/x-turtle-tracer-macro", "application/x-pedro-macro"].some(
          (t) => e.dataTransfer?.types.includes(t),
        )
      : false;

    if (!isInternalReorder && !isMacroDrop) return;
    e.preventDefault();

    const target = getClosestTarget(e, '[role="listitem"]', document.body);

    if (!target) return;

    const index = parseInt(target.element.getAttribute("data-index") || "-1");
    if (index === -1) return;

    if (dragOverIndex !== index || dragPosition !== target.position) {
      dragOverIndex = index;
      dragPosition = target.position;
    }
  }

  async function handleWindowDrop(e: DragEvent) {
    if (!isActive) return;

    const isInternalReorder = draggingIndex !== null;
    const isMacroDrop = e.dataTransfer?.types
      ? ["application/x-turtle-tracer-macro", "application/x-pedro-macro"].some(
          (t) => e.dataTransfer?.types.includes(t),
        )
      : false;

    if (!isInternalReorder && !isMacroDrop) return;

    e.preventDefault();

    if (
      dragOverIndex === null ||
      dragPosition === null ||
      (draggingIndex !== null && draggingIndex === dragOverIndex)
    ) {
      handleDragEnd();
      return;
    }

    if (isInternalReorder && draggingIndex !== null) {
      const newSequence = reorderSequence(
        sequence,
        draggingIndex,
        dragOverIndex,
        dragPosition,
      );
      sequence = newSequence;
      syncLinesToSequence(newSequence);
      recordChange?.("Reorder Sequence");
    } else if (isMacroDrop) {
      const filePath =
        e.dataTransfer?.getData("application/x-turtle-tracer-macro") ||
        e.dataTransfer?.getData("application/x-pedro-macro");
      if (filePath) {
        // Calculate insertion index
        let insertIndex = dragOverIndex;
        if (dragPosition === "bottom") insertIndex++;

        await addMacroToSequence(filePath, insertIndex);
      }
    }

    handleDragEnd();
  }

  async function addMacroToSequence(filePath: string, index: number) {
    const macroId = makeId();
    // Default name from filename
    let name = filePath.split(/[\\/]/).pop() || "Macro";
    name = name.replace(/\.(pp|turt)$/i, "");

    const newItem: SequenceMacroItem = {
      kind: "macro",
      id: macroId,
      filePath: filePath,
      name: name,
      locked: false,
    };

    // Load the macro data into the store so it can be expanded
    await loadMacro(filePath);

    const newSeq = [...sequence];
    if (index >= 0 && index <= newSeq.length) {
      newSeq.splice(index, 0, newItem);
    } else {
      newSeq.push(newItem);
    }
    sequence = newSeq;

    collapsedSections.items[macroId] = false;
    collapsedSections = { ...collapsedSections };
    recordChange?.("Add Macro");
  }

  function handleDragEnd() {
    draggingIndex = null;
    dragOverIndex = null;
    dragPosition = null;
  }

  function getWait(i: any) {
    return i as SequenceWaitItem;
  }

  function getRotate(i: any) {
    return i as SequenceRotateItem;
  }

  function getMacro(i: any) {
    return i as SequenceMacroItem;
  }

  // Generic getter for ID
  function getItemId(item: SequenceItem) {
    if (item.kind === "path") return (item as any).lineId;
    return (item as any).id;
  }

  function getPathLineId(item: SequenceItem) {
    return item.kind === "path" ? (item as any).lineId : undefined;
  }

  /**
   * Given the endPoint of the PREVIOUS line (or startPoint), build a new
   * endPoint that:
   *   - inherits the heading type
   *   - for "linear":   startDeg = prev.endDeg  (direction continues), endDeg = prev.endDeg
   *   - for "constant": degrees  = prev.degrees
   *   - for "tangential" / "facingPoint": copies reverse / targetX,Y
   */
  function makeNewEndPointFrom(prev: Point): Point {
    const x = _.random(36, 108);
    const y = _.random(36, 108);
    if (prev.heading === "linear") {
      const linPrev = prev as Extract<Point, { heading: "linear" }>;
      const deg = linPrev.endDeg ?? linPrev.startDeg ?? 0;
      return { x, y, heading: "linear", startDeg: deg, endDeg: deg };
    }
    if (prev.heading === "constant") {
      return { x, y, heading: "constant", degrees: prev.degrees ?? 0 };
    }
    if (prev.heading === "facingPoint") {
      return { x, y, heading: "tangential" };
    }
    // tangential (default)
    return { x, y, heading: "tangential", reverse: prev.reverse ?? false };
  }

  function insertLineAfter(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    const currentLine = lines[lineIndex];

    const newLine = {
      id: makeId(),
      endPoint: makeNewEndPointFrom(currentLine.endPoint),
      controlPoints: [],
      color: getRandomColor(),
      name: "",
      eventMarkers: [],
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    const newLines = [...lines];
    newLines.splice(lineIndex + 1, 0, newLine);
    lines = newLines;

    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;

    collapsedSections.lines.splice(
      lineIndex + 1,
      0,
      allCollapsed ? true : false,
    );
    collapsedSections.controlPoints.splice(lineIndex + 1, 0, true);
    collapsedEventMarkers.splice(lineIndex + 1, 0, false);

    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
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

    recordChange?.("Unlink Macro");
  }

  function removeLine(idx: number) {
    if (lines[idx]?.locked) return;

    const removedId = lines[idx]?.id;
    const newLines = [...lines];
    newLines.splice(idx, 1);
    lines = newLines;

    if (removedId) {
      sequence = sequence.filter(
        (item) => !(item.kind === "path" && item.lineId === removedId),
      );
      if ($selectedLineId === removedId) selectedLineId.set(null);
    }

    collapsedSections.lines.splice(idx, 1);
    collapsedSections.controlPoints.splice(idx, 1);
    collapsedEventMarkers.splice(idx, 1);
    recordChange("Remove Path");
  }

  function addLine() {
    // Inherit heading from the last line, or fall back to tangential
    const lastLine = lines.length > 0 ? lines[lines.length - 1] : null;
    const endPoint: Point = lastLine
      ? makeNewEndPointFrom(lastLine.endPoint)
      : {
          x: _.random(0, 144),
          y: _.random(0, 144),
          heading: "tangential",
          reverse: false,
        };

    const newLine: Line = {
      id: makeId(),
      name: "",
      endPoint,
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };
    lines = [...lines, newLine];
    sequence = [...sequence, { kind: "path", lineId: newLine.id! }];
    collapsedSections.lines.push(allCollapsed ? true : false);
    collapsedSections.controlPoints.push(true);
    selectedLineId.set(newLine.id!);
    const newIndex = lines.findIndex((l) => l.id === newLine.id!);
    selectedPointId.set(`point-${newIndex + 1}-0`);
    recordChange("Add Path");
  }

  // Deprecated specific add functions - replaced by handleAddAction
  // kept if needed by exported bindings
  function addWait() {
    handleAddAction($actionRegistry["wait"]);
  }

  function addRotate() {
    handleAddAction($actionRegistry["rotate"]);
  }

  function collapseAll() {
    collapsedSections.lines = lines.map(() => true);
    collapsedSections.controlPoints = lines.map(() => true);
    collapsedEventMarkers = lines.map(() => true);

    const newItems = { ...collapsedSections.items };
    sequence.forEach((s) => {
      if (s.kind !== "path") {
        newItems[(s as any).id] = true;
      }
    });
    collapsedSections.items = newItems;

    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
  }

  function expandAll() {
    collapsedSections.lines = lines.map(() => false);
    collapsedSections.controlPoints = lines.map(() => false);
    collapsedEventMarkers = lines.map(() => false);

    const newItems = { ...collapsedSections.items };
    sequence.forEach((s) => {
      if (s.kind !== "path") {
        newItems[(s as any).id] = false;
      }
    });
    collapsedSections.items = newItems;

    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
  }

  $: allCollapsed =
    collapsedSections.lines.length > 0 &&
    collapsedSections.lines.every((v) => v) &&
    collapsedSections.controlPoints.every((v) => v) &&
    collapsedEventMarkers.every((v) => v) &&
    sequence
      .filter((s) => s.kind !== "path")
      .every((s) => collapsedSections.items[(s as any).id]);

  function toggleCollapseAll() {
    if (allCollapsed) expandAll();
    else collapseAll();
  }

  export function addWaitAtStart() {
    const wait = {
      kind: "wait",
      id: makeId(),
      name: "",
      durationMs: 1000,
      locked: false,
    } as SequenceItem;
    sequence = [wait, ...sequence];
    selectedPointId.set(`wait-${(wait as any).id}`);
    selectedLineId.set(null);
    recordChange("Add Wait");
  }

  export function addRotateAtStart() {
    const rotate = {
      kind: "rotate",
      id: makeId(),
      name: "",
      degrees: 0,
      locked: false,
    } as SequenceItem;
    sequence = [rotate, ...sequence];
    selectedPointId.set(`rotate-${(rotate as any).id}`);
    selectedLineId.set(null);
    recordChange("Add Rotate");
  }

  export function addPathAtStart() {
    // Inherit heading from the first existing line, or fall back to tangential
    const firstLine = lines.length > 0 ? lines[0] : null;
    const endPoint: Point = firstLine
      ? makeNewEndPointFrom(firstLine.endPoint)
      : {
          x: _.random(0, 144),
          y: _.random(0, 144),
          heading: "tangential",
          reverse: false,
        };

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
    lines = [newLine, ...lines];
    lines = renumberDefaultPathNames(lines);
    sequence = [{ kind: "path", lineId: newLine.id! }, ...sequence];
    collapsedSections.lines = [
      allCollapsed ? true : false,
      ...collapsedSections.lines,
    ];
    collapsedSections.controlPoints = [
      true,
      ...collapsedSections.controlPoints,
    ];
    collapsedEventMarkers = [
      allCollapsed ? true : false,
      ...collapsedEventMarkers,
    ];
    selectedLineId.set(newLine.id!);
    recordChange("Add Path");
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
      const newSeq = [...sequence];
      newSeq[seqIndex] = {
        ...item,
        locked: !item.locked,
      };
      sequence = newSeq;
    }
    if (recordChange) recordChange();
  }

  function deleteSequenceItem(seqIndex: number) {
    const item = sequence[seqIndex];
    if (item.kind === "path") {
      const lineIdx = lines.findIndex((l) => l.id === (item as any).lineId);
      if (lineIdx !== -1) {
        removeLine(lineIdx);
        return;
      }
    }
    const newSeq = [...sequence];
    newSeq.splice(seqIndex, 1);
    sequence = newSeq;
    recordChange?.("Delete Item");
  }

  function duplicateItem(seqIndex: number) {
    const item = sequence[seqIndex];
    if (!item) return;

    if (item.kind === "wait") {
      const newItem = structuredClone(item);
      newItem.id = makeId();
      newItem.locked = false;
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
    } else if (item.kind === "rotate") {
      const newItem = structuredClone(item);
      newItem.id = makeId();
      newItem.locked = false;
      if (item.name && item.name.trim() !== "") {
        newItem.name = generateName(
          item.name,
          sequence.map((s) => (s.kind === "rotate" ? s.name : "") || ""),
        );
      } else {
        newItem.name = "";
      }

      const newSeq = [...sequence];
      newSeq.splice(seqIndex + 1, 0, newItem);
      sequence = newSeq;
      recordChange();
    } else if (item.kind === "macro") {
      const newItem = structuredClone(item);
      newItem.id = makeId();
      newItem.locked = false;
      if (item.name && item.name.trim() !== "") {
        newItem.name = generateName(
          item.name,
          sequence.map((s) => (s.kind === "macro" ? s.name : "") || ""),
        );
      } else {
        newItem.name = "";
      }

      const newSeq = [...sequence];
      newSeq.splice(seqIndex + 1, 0, newItem);
      sequence = newSeq;
      recordChange();
    } else if (item.kind === "path") {
      const line = lines.find((l) => l.id === (item as any).lineId);
      if (!line) return;

      const newLine = structuredClone(line);
      newLine.id = makeId();
      newLine.locked = false;
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

      newLine.endPoint.x = line.endPoint.x + dx;
      newLine.endPoint.y = line.endPoint.y + dy;

      newLine.endPoint.x = Math.max(0, Math.min(144, newLine.endPoint.x));
      newLine.endPoint.y = Math.max(0, Math.min(144, newLine.endPoint.y));

      newLine.controlPoints = line.controlPoints.map((cp) => ({
        ...cp,
        x: Math.max(0, Math.min(144, cp.x + dx)),
        y: Math.max(0, Math.min(144, cp.y + dy)),
      }));

      const lineIdx = lines.findIndex((l) => l.id === item.lineId);
      lines.splice(lineIdx + 1, 0, newLine);
      lines = [...lines]; // trigger reactivity

      const newSeq = [...sequence];
      newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
      sequence = newSeq;

      lines = renumberDefaultPathNames(lines);

      // Duplicate collapsed state for new line
      collapsedSections.lines.splice(lineIdx + 1, 0, false);
      collapsedSections.controlPoints.splice(lineIdx + 1, 0, true);
      collapsedEventMarkers.splice(lineIdx + 1, 0, true);
      collapsedSections = { ...collapsedSections };

      recordChange();
    }
  }

  function insertWaitBefore(seqIndex: number) {
    const newSeq = [...sequence];
    newSeq.splice(seqIndex, 0, {
      kind: "wait",
      id: makeId(),
      name: "",
      durationMs: 1000,
      locked: false,
    });
    sequence = newSeq;
    recordChange("Insert Wait");
  }

  function insertWaitAfter(seqIndex: number) {
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, {
      kind: "wait",
      id: makeId(),
      name: "",
      durationMs: 1000,
      locked: false,
    });
    sequence = newSeq;
    recordChange("Insert Wait");
  }

  function insertRotateBefore(seqIndex: number) {
    const newSeq = [...sequence];
    newSeq.splice(seqIndex, 0, {
      kind: "rotate",
      id: makeId(),
      name: "",
      degrees: 0,
      locked: false,
    });
    sequence = newSeq;
    recordChange("Insert Rotate");
  }

  function insertRotateAfter(seqIndex: number) {
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, {
      kind: "rotate",
      id: makeId(),
      name: "",
      degrees: 0,
      locked: false,
    });
    sequence = newSeq;
    recordChange("Insert Rotate");
  }

  function insertPathBefore(seqIndex: number) {
    let prevEndPoint: Point | null = null;
    for (let i = seqIndex - 1; i >= 0; i--) {
      const si = sequence[i];
      if (si.kind === "path") {
        const ln = lines.find((l) => l.id === si.lineId);
        if (ln) {
          prevEndPoint = ln.endPoint;
          break;
        }
      }
    }

    const endPoint = prevEndPoint
      ? makeNewEndPointFrom(prevEndPoint)
      : makeNewEndPointFrom(startPoint);

    const newLine = {
      id: makeId(),
      endPoint: endPoint as Point,
      controlPoints: [],
      color: getRandomColor(),
      name: "",
    } as Line;

    const seqItem = sequence[seqIndex];
    let insertLineIdx = 0;
    if (seqItem && seqItem.kind === "path") {
      const lineIdx = lines.findIndex((l) => l.id === seqItem.lineId);
      if (lineIdx !== -1) insertLineIdx = lineIdx;
    } else {
      insertLineIdx = lines.length;
    }

    const newLines = [...lines];
    newLines.splice(insertLineIdx, 0, newLine);
    lines = newLines;

    const newSeq = [...sequence];
    newSeq.splice(seqIndex, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;

    lines = renumberDefaultPathNames(lines);

    collapsedSections.lines.splice(insertLineIdx, 0, false);
    collapsedSections.controlPoints.splice(insertLineIdx, 0, true);
    collapsedEventMarkers.splice(insertLineIdx, 0, true);
    collapsedSections = { ...collapsedSections };

    recordChange("Insert Path");
  }

  function insertPathAfter(seqIndex: number) {
    // Find the closest preceding path item to inherit heading from
    let prevEndPoint: Point | null = null;
    for (let i = seqIndex; i >= 0; i--) {
      const si = sequence[i];
      if (si.kind === "path") {
        const ln = lines.find((l) => l.id === si.lineId);
        if (ln) {
          prevEndPoint = ln.endPoint;
          break;
        }
      }
    }

    const endPoint: Point = prevEndPoint
      ? makeNewEndPointFrom(prevEndPoint)
      : {
          x: _.random(36, 108),
          y: _.random(36, 108),
          heading: "tangential",
          reverse: false,
        };

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

    lines = [...lines, newLine];
    lines = renumberDefaultPathNames(lines);

    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;

    collapsedSections.lines.push(allCollapsed ? true : false);
    collapsedSections.controlPoints.push(true);
    collapsedEventMarkers.push(false);

    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
    recordChange("Add Path");
  }

  function syncLinesToSequence(newSeq: SequenceItem[]) {
    const pathOrder = newSeq
      .filter((item) => item.kind === "path")
      .map((item) => item.lineId);

    const indexedLines = lines.map((line, idx) => ({
      line,
      collapsed: collapsedSections.lines[idx],
      control: collapsedSections.controlPoints[idx],
      markers: collapsedEventMarkers[idx],
    }));

    const byId = new Map(indexedLines.map((entry) => [entry.line.id, entry]));
    const reordered: typeof indexedLines = [];

    pathOrder.forEach((id) => {
      const entry = byId.get(id);
      if (entry) {
        reordered.push(entry);
        byId.delete(id);
      }
    });

    reordered.push(...byId.values());

    lines = reordered.map((entry) => entry.line);
    lines = renumberDefaultPathNames(lines);

    collapsedSections = {
      ...collapsedSections,
      lines: reordered.map((entry) => entry.collapsed ?? false),
      controlPoints: reordered.map((entry) => entry.control ?? true),
    };
    collapsedEventMarkers = reordered.map((entry) => entry.markers ?? false);
  }

  export function moveSequenceItem(seqIndex: number, delta: number) {
    const targetIndex = seqIndex + delta;
    if (targetIndex < 0 || targetIndex >= sequence.length) return;

    const isLockedSequenceItem = (index: number) => {
      const it = sequence[index];
      if (!it) return false;
      if (it.kind === "path") {
        const ln = lines.find((l) => l.id === it.lineId);
        return ln?.locked ?? false;
      }
      if (it.kind === "wait") {
        return (it as any).locked ?? false;
      }
      if (it.kind === "rotate") {
        return (it as any).locked ?? false;
      }
      if (it.kind === "macro") {
        return (it as any).locked ?? false;
      }
      return false;
    };

    if (isLockedSequenceItem(seqIndex) || isLockedSequenceItem(targetIndex))
      return;

    const newSeq = [...sequence];
    const [item] = newSeq.splice(seqIndex, 1);
    newSeq.splice(targetIndex, 0, item);
    sequence = newSeq;

    syncLinesToSequence(newSeq);
    recordChange?.("Reorder Sequence");
  }

  function isItemLocked(item: SequenceItem, lines: Line[]): boolean {
    if (item.kind === "path") {
      return lines.find((l) => l.id === (item as any).lineId)?.locked ?? false;
    }
    if (item.kind === "rotate") {
      return getRotate(item).locked ?? false;
    }
    if (item.kind === "macro") {
      return getMacro(item).locked ?? false;
    }
    return getWait(item).locked ?? false;
  }

  export async function scrollToItem(itemId: string) {
    const seqIndex = sequence.findIndex((s) => {
      if (s.kind === "path") return s.lineId === itemId;
      return (s as any).id === itemId;
    });

    if (seqIndex !== -1) {
      const item = sequence[seqIndex];

      if (item.kind === "path") {
        const lineId = (item as any).lineId;
        const lineIdx = lines.findIndex((l) => l.id === lineId);
        if (lineIdx !== -1) {
          collapsedSections.lines[lineIdx] = false;
        }
      } else {
        collapsedSections.items[(item as any).id] = false;
      }

      collapsedSections = { ...collapsedSections };

      await tick();

      const el = document.getElementById(`sequence-item-${itemId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  export function toggleCollapseSelected() {
    const sel = $selectedPointId;
    if (!sel) return;

    const parts = sel.split("-");
    if (parts[0] === "point") {
      const lineNum = Number(parts[1]);
      if (lineNum > 0) {
        const lineIdx = lineNum - 1;
        collapsedSections.lines[lineIdx] = !collapsedSections.lines[lineIdx];
      }
    } else if (parts.length >= 2) {
      const id = sel.substring(parts[0].length + 1);
      collapsedSections.items[id] = !collapsedSections.items[id];
    }
    collapsedSections = { ...collapsedSections };
  }

  function handleAddAction(def: any) {
    if (def.createDefault) {
      const newItem = def.createDefault();
      sequence = [...sequence, newItem];
      selectedPointId.set(`${def.kind}-${newItem.id}`);
      selectedLineId.set(null);
      if (def.isWait) sequence = updateLinkedWaits(sequence, newItem.id);
      if (def.isRotate) sequence = updateLinkedRotations(sequence, newItem.id);
      recordChange(`Add ${def.label}`);
    }
  }

  function handleAddActionAfter(seqIndex: number, def: any) {
    if (def.isPath) {
      insertLineAfter(seqIndex);
    } else if (def.createDefault) {
      const newItem = def.createDefault();
      const newSeq = [...sequence];
      newSeq.splice(seqIndex + 1, 0, newItem);
      sequence = newSeq;
      if (def.isWait) sequence = updateLinkedWaits(sequence, newItem.id);
      if (def.isRotate) sequence = updateLinkedRotations(sequence, newItem.id);
      recordChange(`Add ${def.label}`);
    }
  }

  // Small helper to wrap handlers and avoid inline typed parameters in markup
  function addActionAfterFor(idx: number, def: any) {
    handleAddActionAfter(idx, def);
  }

  // Helper for button classes
  function getButtonColorClass(color: string) {
    return getButtonFilledClass(color);
  }
</script>

{#if contextMenuOpen}
  <ContextMenu
    x={contextMenuX}
    y={contextMenuY}
    items={contextMenuItems}
    on:close={() => (contextMenuOpen = false)}
  />
{/if}

<div
  class="w-full flex flex-col gap-4 p-4 pb-32 outline-none"
  id="path-list-container"
  tabindex="-1"
>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="flex items-center justify-between gap-4 w-full"
    on:contextmenu={(e) => handleContextMenu(e, -1)}
  >
    <StartingPointSection
      bind:startPoint
      {addPathAtStart}
      {addWaitAtStart}
      {addRotateAtStart}
      {toggleCollapseAll}
      {allCollapsed}
      {settings}
    />
  </div>

  {#if showDebug}
    <DebugPanel
      componentName="PathTab"
      {debugMissing}
      {debugInvalidRefs}
      linesLength={lines.length}
      sequenceLength={(sequence || []).length}
    />
  {/if}

  {#if sequence.length === 0}
    <EmptyState
      title="Start your path"
      description="Add your first path segment, wait command, or rotation to begin."
    >
      <div slot="icon">
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
            d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59"
          />
        </svg>
      </div>
      <div
        slot="action"
        class="flex flex-row justify-center items-center gap-3 flex-wrap"
      >
        <PathActionButtons
          {settings}
          onAddLine={addLine}
          onHandleAddAction={handleAddAction}
        />
      </div>
    </EmptyState>
  {/if}

  {#each sequence as item, sIdx (getItemId(item))}
    {@const isLocked = isItemLocked(item, lines)}
    {@const def = $actionRegistry[item.kind]}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      role="listitem"
      data-index={sIdx}
      id={`sequence-item-${getItemId(item)}`}
      class="w-full transition-all duration-200 rounded-lg"
      draggable={!isItemLocked(item, lines)}
      on:dragstart={(e) => handleDragStart(e, sIdx)}
      on:dragend={handleDragEnd}
      on:contextmenu={(e) => handleContextMenu(e, sIdx)}
      class:border-t-4={dragOverIndex === sIdx && dragPosition === "top"}
      class:border-b-4={dragOverIndex === sIdx && dragPosition === "bottom"}
      class:border-blue-500={dragOverIndex === sIdx}
      class:dark:border-blue-400={dragOverIndex === sIdx}
      class:opacity-50={draggingIndex === sIdx}
    >
      {#if item.kind === "path"}
        {#each lines.filter((l) => l.id === getPathLineId(item)) as ln (ln.id)}
          <PathLineSection
            bind:line={ln}
            idx={lines.findIndex((l) => l.id === ln.id)}
            bind:lines
            bind:collapsed={
              collapsedSections.lines[lines.findIndex((l) => l.id === ln.id)]
            }
            bind:collapsedControlPoints={
              collapsedSections.controlPoints[
                lines.findIndex((l) => l.id === ln.id)
              ]
            }
            onRemove={() => removeLine(lines.findIndex((l) => l.id === ln.id))}
            onInsertAfter={() => insertLineAfter(sIdx)}
            onAddWaitAfter={() =>
              handleAddActionAfter(sIdx, $actionRegistry["wait"])}
            onAddRotateAfter={() =>
              handleAddActionAfter(sIdx, $actionRegistry["rotate"])}
            onAddAction={addActionAfterFor.bind(null, sIdx)}
            onMoveUp={() => moveSequenceItem(sIdx, -1)}
            onMoveDown={() => moveSequenceItem(sIdx, 1)}
            canMoveUp={sIdx !== 0}
            canMoveDown={sIdx !== sequence.length - 1}
            {recordChange}
          />
        {/each}
      {:else if def && def.sectionComponent}
        <svelte:component
          this={def.sectionComponent}
          {...{ [def.kind]: item }}
          bind:sequence
          collapsed={collapsedSections.items[getItemId(item)]}
          onRemove={() => {
            const newSeq = [...sequence];
            newSeq.splice(sIdx, 1);
            sequence = newSeq;
            recordChange?.("Remove Item");
          }}
          onInsertAfter={() => handleAddActionAfter(sIdx, def)}
          onAddPathAfter={() => insertLineAfter(sIdx)}
          onAddWaitAfter={() =>
            handleAddActionAfter(sIdx, $actionRegistry["wait"])}
          onAddRotateAfter={() =>
            handleAddActionAfter(sIdx, $actionRegistry["rotate"])}
          onAddAction={addActionAfterFor.bind(null, sIdx)}
          onUnlink={() => {
            if (item.kind === "macro") {
              unlinkMacro(item, sIdx);
            }
          }}
          onMoveUp={() => moveSequenceItem(sIdx, -1)}
          onMoveDown={() => moveSequenceItem(sIdx, 1)}
          canMoveUp={sIdx !== 0}
          canMoveDown={sIdx !== sequence.length - 1}
          {recordChange}
        />
      {/if}
    </div>
  {/each}
  <!-- Add Buttons at end of list -->
  {#if sequence.length > 0}
    <div class="flex flex-row justify-center items-center gap-3 pt-4 flex-wrap">
      <PathActionButtons
        {settings}
        onAddLine={addLine}
        onHandleAddAction={handleAddAction}
      />
    </div>
  {/if}
</div>

<svelte:window on:dragover={handleWindowDragOver} on:drop={handleWindowDrop} />
