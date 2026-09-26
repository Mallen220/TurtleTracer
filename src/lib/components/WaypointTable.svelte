<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { focusOnRequest } from "../actions/focusOnRequest";
  import type {
    ActionDefinition,
    MenuEntry,
    Point,
    Line,
    ControlPoint,
    SequenceItem,
    SequenceMacroItem,
  } from "../../types/index";
  import {
    ensureSequenceConsistency,
    timePredictionStore,
  } from "../projectStore";
  import {
    isSequenceItemLocked,
    linesInSequenceOrder,
    moveSequenceItem as moveItem,
    unlinkMacro as unlinkMacroItems,
    isMacroDrag,
    getDroppedMacroPath,
    insertMacro as insertMacroItem,
    sequenceItemKey,
    toggleChain as toggleChainAt,
    duplicateStep,
  } from "../sequenceOperations";
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
    notification,
  } from "../../stores";
  import { tick } from "svelte";
  import { derived } from "svelte/store";
  import { tooltipPortal } from "../actions/portal";
  import TrashIcon from "./icons/TrashIcon.svelte";
  import ColorPicker from "./tools/ColorPicker.svelte";
  import ContextMenu from "./tools/ContextMenu.svelte";
  import {
    ClockIcon,
    ArrowCircleIcon,
    PlusIcon,
    LockIcon,
    UnlockIcon,
    CheckIcon,
    EyeIcon,
    EyeSlashIcon,
    ClipboardIcon,
    Bars3Icon,
    InfoIcon,
    LinkIcon,
  } from "./icons";
  import { renumberDefaultPathNames } from "../../utils/nameGenerator";
  import {
    updateLinkedWaypoints,
    handleWaypointRename,
    updateLinkedWaits,
    isLineLinked,
    updateLinkedRotations,
  } from "../../utils/pointLinking";
  import { actionRegistry } from "../actionRegistry";
  import { getButtonFilledClass } from "../../utils/buttonStyles";
  import { getShortcutFromSettings } from "../../utils";
  import { toUser, toField } from "../../utils/coordinates";
  import { formatTime } from "../../utils/timeCalculator";
  import DebugPanel from "./common/DebugPanel.svelte";

  let {
    startPoint = $bindable(),
    lines = $bindable(),
    sequence = $bindable(),
    recordChange,
    settings = undefined,
    shapes = $bindable([]),
    collapsedObstacles = $bindable([]),
    isActive = true,
  }: {
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    recordChange: (description?: string) => void;
    settings?: import("../../types/index").Settings | undefined;
    shapes: import("../../types/index").Shape[];
    collapsedObstacles: boolean[];
    isActive?: boolean;
  } = $props();

  /** Steps the row menu can insert, with their labels. */
  const INSERTABLE = [
    ["wait", "Wait"],
    ["rotate", "Rotate"],
    ["path", "Path"],
  ] as const;

  let showDebug = $derived(settings?.showDebugSequence);

  // Compute segment statistics for contextual display
  let timePrediction = $derived($timePredictionStore);

  let pathStatsMap = $derived.by(() => {
    const map = new Map();
    if (timePrediction && timePrediction.timeline) {
      timePrediction.timeline.forEach((event) => {
        if (event.type === "travel" && event.lineIndex !== undefined) {
          const lineId = lines[event.lineIndex]?.id;
          if (lineId) map.set(lineId, event);
        }
      });
    }
    return map;
  });

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
  const multiSelectedPointIdsSet = derived(
    multiSelectedPointIds,
    ($ids) => new Set($ids),
  );

  // Use snap stores to determine step size for inputs
  let stepSize = $derived($snapToGrid && $showGrid ? $gridSize : 0.1);

  function handleInput(
    e: Event,
    point: Point | ControlPoint,
    field: "x" | "y",
    lineId?: string,
  ) {
    const input = e.target as HTMLInputElement;
    let val = Number.parseFloat(input.value);
    if (!Number.isNaN(val)) {
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

  // Helper to find the index in the real `sequence` array for a display item
  function findSequenceIndex(item: SequenceItem) {
    if (!Array.isArray(sequence)) return -1;
    const key = sequenceItemKey(item);
    return sequence.findIndex(
      (s) => s.kind === item.kind && sequenceItemKey(s) === key,
    );
  }

  // Ensure UI shows any lines that might be missing from the sequence (robustness)
  let displaySequence = $derived(
    (() => {
      try {
        // Keep original sequence order and append any missing path items for lines
        const seqCopy = Array.isArray(sequence) ? [...sequence] : [];
        const pathIds = new Set(
          seqCopy.flatMap((s) => (s.kind === "path" ? [s.lineId] : [])),
        );
        lines.forEach((l) => {
          if (l.id && !pathIds.has(l.id) && !l.isMacroElement) {
            seqCopy.push({ kind: "path", lineId: l.id });
          }
        });
        return seqCopy;
      } catch {
        return sequence || [];
      }
    })(),
  );

  // Computed debug values to keep template expressions simple
  let debugLinesIds = $derived(
    Array.isArray(lines)
      ? lines.map((l) => l.id).filter((id): id is string => id != null)
      : [],
  );
  // The line ids the sequence refers to.
  let debugSequenceIds = $derived(
    Array.isArray(sequence)
      ? sequence.flatMap((s) => (s.kind === "path" ? [s.lineId] : []))
      : [],
  );
  let debugMissing = $derived(
    debugLinesIds.filter(
      (id) => id && !debugSequenceIds.includes(id),
    ) as string[],
  );
  let debugInvalidRefs = $derived(
    debugSequenceIds.filter(
      (id) => id && !debugLinesIds.includes(id),
    ) as string[],
  );

  // Drag and drop state
  let draggingIndex: number | null = $state(null);
  let dragOverIndex: number | null = $state(null);
  let dragPosition: DragPosition | null = $state(null);

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

    const index = Number.parseInt(
      target.element.getAttribute("data-seq-index") || "",
    );
    if (Number.isNaN(index)) return;

    // Start Point special case: cannot drop before it (index -1, top)
    if (index === -1 && target.position === "top") return;

    if (dragOverIndex !== index || dragPosition !== target.position) {
      dragOverIndex = index;
      dragPosition = target.position;
    }
  }

  function handleWindowDrop(e: DragEvent) {
    if (!isActive) return;

    if (isMacroDrag(e)) {
      e.preventDefault();
      e.stopPropagation();
      const filePath = getDroppedMacroPath(e);
      if (filePath) {
        const target = getClosestTarget(e, "tr[data-seq-index]", document.body);
        const index = Number.parseInt(
          target?.element.getAttribute("data-seq-index") ?? "",
        );
        const dropIndex = Number.isNaN(index)
          ? sequence.length
          : index + (target?.position === "bottom" ? 1 : 0);
        insertMacro(dropIndex, filePath);
      }
      handleDragEnd();
      return;
    }

    if (draggingIndex === null) return;
    e.preventDefault();
    e.stopPropagation();

    if (
      dragOverIndex !== null &&
      dragPosition !== null &&
      draggingIndex !== dragOverIndex
    ) {
      const newSequence = reorderSequence(
        sequence,
        draggingIndex,
        dragOverIndex,
        dragPosition,
      );
      sequence = newSequence;
      syncLinesToSequence(newSequence);
      recordChange();
    }
    handleDragEnd();
  }

  function handleDragEnd() {
    draggingIndex = null;
    dragOverIndex = null;
    dragPosition = null;
  }

  function syncLinesToSequence(newSeq: SequenceItem[]) {
    lines = linesInSequenceOrder(lines, newSeq);
  }

  // Watch for missing sequence entries and repair once to keep UI in sync
  $effect(() => {
    if (lines && sequence && !repairedOnce) {
      ensureSequenceConsistency();
      repairedOnce = true;
    }
  });

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

  function unlinkMacro(macroItem: SequenceMacroItem, seqIndex: number) {
    if (macroItem.locked) return;
    ({ lines, sequence } = unlinkMacroItems(
      lines,
      sequence,
      macroItem,
      seqIndex,
    ));
    recordChange("Unlink Macro");
  }

  function deleteSequenceItem(index: number) {
    const item = sequence[index];
    if (!item) return;

    if (item.kind === "path") {
      deleteLine(item.lineId);
      return;
    }

    if (item.locked) return;

    sequence.splice(index, 1);
    sequence = [...sequence];
    syncLinesToSequence(sequence);
    if (recordChange) recordChange();
    selectedPointId.set(null);
  }

  let copyButtonText = $state("Copy Table");

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

  let contextMenuOpen = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextMenuItems: MenuEntry[] = $state([]);

  let hoveredLinkId: string | null = $state(null);
  let hoveredStatsLineId: string | null = $state(null);
  // Anchor elements used for portal positioning (moved to body)
  let hoveredLinkAnchor: HTMLElement | null = $state(null);
  let hoveredStatsAnchor: HTMLElement | null = $state(null);

  function handleLinkHoverEnter(e: MouseEvent, id: string | null) {
    hoveredLinkId = id;
    // currentTarget is the icon container
    hoveredLinkAnchor = e.currentTarget as HTMLElement;
  }
  function handleLinkHoverLeave() {
    hoveredLinkId = null;
    hoveredLinkAnchor = null;
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
        ...INSERTABLE.map(([kind, label]) => ({
          label: `Insert ${label} After`,
          onClick: () => insertAction(kind, 0),
        })),
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
      disabled: item.kind === "macro" || (isLocked && item.kind === "path"),
    });

    items.push({ separator: true });

    for (const [kind, label] of INSERTABLE) {
      items.push(
        {
          label: `Insert ${label} Before`,
          onClick: () => insertAction(kind, seqIndex),
        },
        {
          label: `Insert ${label} After`,
          onClick: () => insertAction(kind, seqIndex + 1),
        },
      );
    }

    items.push({ separator: true });

    // Delete
    items.push({
      label: "Delete",
      onClick: () => deleteSequenceItem(seqIndex),
      danger: true,
      disabled: isLocked || (lines.length <= 1 && item.kind === "path"),
    });

    contextMenuItems = items;
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    contextMenuOpen = true;
  }

  function toggleChain(seqIndex: number) {
    ({ lines, sequence } = toggleChainAt(lines, sequence, seqIndex));
    recordChange();
  }

  function toggleLock(seqIndex: number) {
    const item = sequence[seqIndex];
    if (item.kind === "path") {
      const lineIdx = lines.findIndex((l) => l.id === item.lineId);
      if (lineIdx !== -1) {
        lines[lineIdx] = { ...lines[lineIdx], locked: !lines[lineIdx].locked };
        lines = [...lines]; // Trigger reactivity
      }
    } else {
      // wait, rotate, macro
      const newSeq = [...sequence];
      newSeq[seqIndex] = {
        ...item,
        locked: !item.locked,
      } as SequenceItem;
      sequence = newSeq;
    }
    if (recordChange) recordChange();
  }

  // Edits from the wait, turn and macro rows
  function handleUpdateFromComponent(idx: number, updatedItem: SequenceItem) {
    // Create a new array reference to ensure Svelte reactivity triggers,
    // especially for ControlTab which binds to sequence.
    const newSeq = [...sequence];
    newSeq[idx] = updatedItem;

    // Waits and turns that share a name share their settings.
    if (updatedItem.kind === "wait") {
      sequence = updateLinkedWaits(newSeq, updatedItem.id);
    } else if (updatedItem.kind === "rotate") {
      sequence = updateLinkedRotations(newSeq, updatedItem.id);
    } else {
      sequence = newSeq;
    }
    recordChange();
  }

  function duplicateItem(seqIndex: number) {
    const result = duplicateStep(
      $state.snapshot({ startPoint, lines, sequence }) as {
        startPoint: Point;
        lines: Line[];
        sequence: SequenceItem[];
      },
      seqIndex,
      {
        width: settings?.fieldWidth ?? 144,
        height: settings?.fieldHeight ?? 144,
      },
    );
    if (!result) return;
    lines = result.lines;
    sequence = result.sequence;
    recordChange();
  }

  /** Inserts a new step of `kind` at `index`, as that action defines it. */
  function insertAction(kind: string, index: number) {
    actionRegistry.get(kind)?.onInsert?.({
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

  function handleAddAction(def: ActionDefinition) {
    if (def.createDefault) {
      const newItem = def.createDefault();
      const newSeq = [...sequence];
      newSeq.push(newItem);
      sequence = newSeq;
      syncLinesToSequence(newSeq);
      if (newItem.kind === "wait") {
        sequence = updateLinkedWaits(sequence, newItem.id);
      } else if (newItem.kind === "rotate") {
        sequence = updateLinkedRotations(sequence, newItem.id);
      }
      recordChange();
    }
  }

  function getButtonColorClass(color: string) {
    return getButtonFilledClass(color);
  }

  async function insertMacro(index: number, filePath: string) {
    const result = await insertMacroItem(sequence, filePath, index);
    if (!result) return;
    sequence = result.sequence;
    syncLinesToSequence(result.sequence);
    recordChange();
  }

  function moveSequenceItem(seqIndex: number, delta: number) {
    const moved = moveItem(sequence, lines, seqIndex, delta);
    if (!moved) return;
    sequence = moved;
    syncLinesToSequence(moved);
    recordChange();
  }
</script>

<svelte:window ondragover={handleWindowDragOver} ondrop={handleWindowDrop} />

{#if contextMenuOpen}
  <ContextMenu
    x={contextMenuX}
    y={contextMenuY}
    items={contextMenuItems}
    onclose={() => (contextMenuOpen = false)}
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
        onclick={copyTableToClipboard}
        class="flex flex-row items-center gap-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-neutral-600 dark:text-neutral-400 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
      >
        <span>{copyButtonText}</span>
        {#if copyButtonText === "Copied!"}
          <CheckIcon className="size-6 text-green-500" strokeWidth={1.5} />
        {:else}
          <ClipboardIcon className="size-6" strokeWidth={1.5} />
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
          $multiSelectedPointIdsSet.has("point-0-0")}
        onclick={(e) => handleRowClick(e, "point-0-0", null)}
        oncontextmenu={(e) => handleContextMenu(e, -1)}
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
            onchange={(e) => handleInput(e, startPoint, "x")}
            use:focusOnRequest={{
              id: "point-0-0",
              field: "x",
              enabled: isActive,
            }}
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
            onchange={(e) => handleInput(e, startPoint, "y")}
            use:focusOnRequest={{
              id: "point-0-0",
              field: "y",
              enabled: isActive,
            }}
            disabled={startPoint.locked}
          />
        </td>
        <td class="px-3 py-2 flex items-center justify-between gap-1">
          {#if startPoint.locked}
            <span
              title="Locked"
              class="inline-flex items-center justify-center h-6 w-6 text-neutral-400"
            >
              <LockIcon className="h-4 w-4" />
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
          <!-- If previous item was a path, add a small chaining button between them -->
          {#if seqIdx > 0 && displaySequence[seqIdx - 1].kind === "path"}
            <tr class="group h-4 p-0 m-0 leading-none">
              <td colspan="5" class="p-0 text-center relative border-none">
                <button
                  class="absolute left-[36px] -top-2 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded p-0.5 z-10 transition-colors bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800"
                  onclick={() => toggleChain(seqIndex)}
                  title={item.isChain
                    ? "Unchain paths"
                    : "Chain paths together"}
                  aria-label="Toggle Path Chain"
                >
                  <LinkIcon
                    className={`w-3.5 h-3.5 ${item.isChain ? "text-green-500 dark:text-green-400" : "text-neutral-400 opacity-50"}`}
                    strokeWidth={item.isChain ? 2.5 : 1.5}
                  />
                </button>
                {#if item.isChain}
                  <div
                    class="absolute left-[42px] top-[-10px] w-[2px] h-[20px] bg-green-500 dark:bg-green-400 -z-10 opacity-30"
                  ></div>
                {/if}
              </td>
            </tr>
          {/if}

          {#each lines.filter((l) => l.id === item.lineId) as line (line.id)}
            {@const lineIdx = lines.indexOf(line)}
            <!-- End Point -->
            {@const endPointId = `point-${lineIdx + 1}-0`}
            <tr
              data-seq-index={seqIndex}
              draggable={!line.locked}
              ondragstart={(e) => handleDragStart(e, seqIndex)}
              ondragend={handleDragEnd}
              oncontextmenu={(e) => handleContextMenu(e, seqIndex)}
              class={`hover:bg-neutral-50 dark:hover:bg-neutral-800/50 font-medium ${$selectedLineId === line.id ? "bg-green-50 dark:bg-green-900/20" : ""} ${$multiSelectedPointIdsSet.size > 1 && $multiSelectedPointIdsSet.has(endPointId) ? "bg-green-100 dark:bg-green-800/40" : ""} transition-colors duration-150 ${line.hidden ? "opacity-50 grayscale-[50%]" : ""}`}
              class:border-t-2={dragOverIndex === seqIndex &&
                dragPosition === "top"}
              class:border-b-2={dragOverIndex === seqIndex &&
                dragPosition === "bottom"}
              class:border-blue-500={dragOverIndex === seqIndex}
              class:dark:border-blue-400={dragOverIndex === seqIndex}
              class:opacity-50={draggingIndex === seqIndex}
              onclick={(e) => handleRowClick(e, endPointId, line.id || null)}
            >
              <td
                class="w-8 px-2 py-2 text-center cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <Bars3Icon className="w-4 h-4 mx-auto" />
              </td>
              <td class="px-3 py-2">
                <div class="flex flex-row items-center gap-2">
                  <ColorPicker
                    bind:color={line.color}
                    oninput={() => {
                      lines = [...lines];
                    }}
                    onchange={() => {
                      lines = [...lines];
                      if (recordChange) recordChange("Change Path Color");
                    }}
                    disabled={line.locked}
                    title="Path Color"
                  />
                  <div class="relative flex-1 max-w-[140px]">
                    <input
                      class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs pr-6"
                      class:text-blue-500={hoveredLinkId === line.id}
                      value={line.name}
                      oninput={function (
                        e: Event & {
                          currentTarget: EventTarget & HTMLInputElement;
                        },
                      ) {
                        const target = (e.currentTarget ||
                          e.target) as HTMLInputElement;
                        if (target instanceof HTMLInputElement) {
                          updateLineName(item.lineId, target.value);
                        }
                      }}
                      use:focusOnRequest={{
                        id: line.id || "",
                        field: "name",
                        enabled: isActive,
                      }}
                      disabled={line.locked}
                      placeholder="Path {lineIdx + 1}"
                      aria-label="Path Name"
                    />
                    {#if line.id && pathStatsMap.has(line.id)}
                      <div
                        role="presentation"
                        class="absolute right-[22px] top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-help flex items-center justify-center"
                        onmouseenter={(e) =>
                          handleStatsHoverEnter(e, line.id || null)}
                        onmouseleave={handleStatsHoverLeave}
                      >
                        <InfoIcon className="w-3.5 h-3.5" />
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
                        onmouseenter={(e) =>
                          handleLinkHoverEnter(e, line.id || null)}
                        onmouseleave={handleLinkHoverLeave}
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
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
                    onchange={(e) =>
                      handleInput(e, line.endPoint, "x", line.id)}
                    use:focusOnRequest={{
                      id: endPointId,
                      field: "x",
                      enabled: isActive,
                    }}
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
                  onchange={(e) => handleInput(e, line.endPoint, "y", line.id)}
                  use:focusOnRequest={{
                    id: endPointId,
                    field: "y",
                    enabled: isActive,
                  }}
                  disabled={line.locked}
                />
              </td>
              <td class="px-3 py-2 flex items-center justify-between gap-1">
                <!-- Eye/Hide icon -->
                <button
                  title={line.hidden ? "Show Path" : "Hide Path"}
                  aria-label={line.hidden ? "Show Path" : "Hide Path"}
                  onclick={(e) => {
                    e.stopPropagation();
                    const lIdx = lines.findIndex((l) => l.id === line.id);
                    if (lIdx !== -1) {
                      lines[lIdx] = {
                        ...lines[lIdx],
                        hidden: !lines[lIdx].hidden,
                      };
                      lines = [...lines];
                    }
                    if (recordChange) recordChange();
                  }}
                  class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  {#if line.hidden}
                    <EyeSlashIcon className="size-5 text-neutral-400" />
                  {:else}
                    <EyeIcon className="size-5 text-gray-400" />
                  {/if}
                </button>

                <!-- Left slot: lock/unlock button always visible -->
                <button
                  title={line.locked ? "Unlock Path" : "Lock Path"}
                  aria-label={line.locked ? "Unlock Path" : "Lock Path"}
                  onclick={(e) => {
                    e.stopPropagation();
                    const lIdx = lines.findIndex((l) => l.id === line.id);
                    if (lIdx !== -1) {
                      lines[lIdx] = {
                        ...lines[lIdx],
                        locked: !lines[lIdx].locked,
                      };
                      lines = [...lines];
                    }
                    if (recordChange) recordChange();
                  }}
                  class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                  aria-pressed={line.locked}
                >
                  {#if line.locked}
                    <LockIcon className="size-5 stroke-yellow-500" />
                  {:else}
                    <UnlockIcon className="size-5 stroke-gray-400" />
                  {/if}
                </button>

                <!-- Right slot: delete or placeholder -->
                {#if lines.length > 1 && !line.locked}
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
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
              {@const cpIndex = [line.endPoint, ...line.controlPoints].indexOf(
                cp,
              )}
              {@const pointId = `point-${lineIdx + 1}-${cpIndex}`}
              <tr
                class={`hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${$selectedLineId === line.id ? "bg-green-50 dark:bg-green-900/20" : ""} ${$multiSelectedPointIdsSet.size > 1 && $multiSelectedPointIdsSet.has(pointId) ? "bg-green-100 dark:bg-green-800/40" : ""}`}
                onclick={(e) => handleRowClick(e, pointId, line.id || null)}
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
                    onchange={(e) => handleInput(e, cp, "x")}
                    use:focusOnRequest={{
                      id: pointId,
                      field: "x",
                      enabled: isActive,
                    }}
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
                    onchange={(e) => handleInput(e, cp, "y")}
                    use:focusOnRequest={{
                      id: pointId,
                      field: "y",
                      enabled: isActive,
                    }}
                    disabled={line.locked}
                  />
                </td>
                <td class="px-3 py-2 flex items-center justify-between gap-1">
                  {#if line.locked}
                    <span
                      title="Locked"
                      class="inline-flex items-center justify-center h-6 w-6 text-neutral-400"
                    >
                      <LockIcon className="h-4 w-4" />
                    </span>
                    <span class="h-6 w-6" aria-hidden="true"></span>
                  {:else}
                    <span class="h-6 w-6" aria-hidden="true"></span>
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        deleteControlPoint(line, j);
                      }}
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
          {@const DynamicComponent = actionDef.component}
          <DynamicComponent
            {item}
            index={seqIndex}
            isLocked={isSequenceItemLocked(item, lines)}
            {dragOverIndex}
            {dragPosition}
            {draggingIndex}
            onUpdate={(updated: SequenceItem) =>
              handleUpdateFromComponent(seqIndex, updated)}
            onLock={() => toggleLock(seqIndex)}
            onDelete={() => deleteSequenceItem(seqIndex)}
            onUnlink={() => {
              if (item.kind === "macro") {
                unlinkMacro(item, seqIndex);
              }
            }}
            onDragStart={(e: DragEvent) => handleDragStart(e, seqIndex)}
            onDragEnd={handleDragEnd}
            onContextMenu={(e: MouseEvent) => handleContextMenu(e, seqIndex)}
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
                <PlusIcon
                  className="size-6 text-neutral-400 strokeWidth={1.5}"
                />
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
      onclick={() => insertAction("path", sequence.length)}
      class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-green-600 dark:bg-green-700 rounded-md shadow-sm hover:bg-green-700 dark:hover:bg-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-green-300 dark:focus:ring-green-700"
      aria-label="Add new path segment"
      title={`Add new path segment${getShortcutFromSettings(settings, "add-path")}`}
    >
      <PlusIcon className="size-3" strokeWidth={2} />
      Add Path
    </button>

    {#each Object.values($actionRegistry) as def (def.kind)}
      {#if def.createDefault && !def.isPath}
        <button
          onclick={() => handleAddAction(def)}
          class={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 ${getButtonColorClass(def.buttonColor || "gray")}`}
          aria-label={`Add ${def.label} command`}
          title={`Add ${def.label} command${getShortcutFromSettings(settings, def.kind === "wait" ? "add-wait" : def.kind === "rotate" ? "add-rotate" : "")}`}
        >
          <!-- Render Icon based on kind for now as SVG string is not easily injectable here without raw HTML -->
          {#if def.kind === "wait"}
            <ClockIcon className="size-3" />
          {:else if def.kind === "rotate"}
            <ArrowCircleIcon className="size-3" />
          {:else}
            <!-- Fallback icon -->
            <PlusIcon className="size-3" strokeWidth={2} />
          {/if}
          Add {def.label}
        </button>
      {/if}
    {/each}
  </div>
</div>
