<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    ActionDefinition,
    Point,
    Line,
    SequenceItem,
    SequenceMacroItem,
    Settings,
  } from "../../../types/index";
  import { tick } from "svelte";
  import random from "lodash/random";
  import { createLine, endPointAfter } from "../../actions/PathAction";
  import { createWait } from "../../actions/WaitAction";
  import { createRotate } from "../../actions/RotateAction";
  import {
    reorderSequence,
    getClosestTarget,
    type DragPosition,
  } from "../../../utils/dragDrop";
  import { renumberDefaultPathNames } from "../../../utils/nameGenerator";
  import StartingPointSection from "../sections/StartingPointSection.svelte";
  import EmptyState from "../common/EmptyState.svelte";
  import PathLineSection from "../sections/PathLineSection.svelte";
  import {
    selectedLineId,
    selectedPointId,
    toggleCollapseAllTrigger,
  } from "../../../stores";
  import { ensureSequenceConsistency } from "../../../lib/projectStore";
  import { actionRegistry } from "../../actionRegistry";
  import {
    isSequenceItemLocked,
    lineOrderForSequence,
    moveSequenceItem as moveItem,
    unlinkMacro as unlinkMacroItems,
    isMacroDrag,
    getDroppedMacroPath,
    insertMacro,
    sequenceItemKey,
    toggleChain,
  } from "../../sequenceOperations";
  import {
    updateLinkedWaits,
    updateLinkedRotations,
  } from "../../../utils/pointLinking";
  import PathActionButtons from "./PathActionButtons.svelte";
  import DebugPanel from "../common/DebugPanel.svelte";
  import MapPinIcon from "../icons/MapPinIcon.svelte";

  interface Props {
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    settings: Settings;
    recordChange: (action?: string) => void;
    isActive?: boolean; // instead of checking activeTab === 'path'
  }

  let {
    startPoint = $bindable(),
    lines = $bindable(),
    sequence = $bindable(),
    settings,
    recordChange,
    isActive = false,
  }: Props = $props();

  // --- Logic from ControlTab ---
  let collapsedEventMarkers: boolean[] = $state(lines.map(() => false));

  // State for collapsed sections
  let collapsedSections = $state({
    lines: lines.map(() => false),
    controlPoints: lines.map(() => true), // Start with control points collapsed
    // Generic map for all sequence items by ID (waits, rotates, macros, etc.)
    items: {} as Record<string, boolean>,
  });

  let repairedSequenceOnce = $state(false);

  let _lastToggleCollapse = $state($toggleCollapseAllTrigger);

  // Drag and drop state
  let draggingIndex: number | null = $state(null);
  let dragOverIndex: number | null = $state(null);
  let dragPosition: DragPosition | null = $state(null);

  function handleDragStart(e: DragEvent, index: number) {
    const originElem = document.elementFromPoint(
      e.clientX,
      e.clientY,
    ) as HTMLElement | null;
    if (originElem?.closest("[data-event-marker-slider]")) {
      e.preventDefault();
      return;
    }

    if (
      originElem?.tagName === "INPUT" ||
      originElem?.tagName === "TEXTAREA" ||
      originElem?.tagName === "SELECT"
    ) {
      e.preventDefault();
      return;
    }

    if (isSequenceItemLocked(sequence[index], lines)) {
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
    if (draggingIndex === null && !isMacroDrag(e)) return;
    e.preventDefault();

    const target = getClosestTarget(e, '[role="listitem"]', document.body);

    if (!target) return;

    const index = Number.parseInt(
      target.element.getAttribute("data-index") || "-1",
    );
    if (index === -1) return;

    if (dragOverIndex !== index || dragPosition !== target.position) {
      dragOverIndex = index;
      dragPosition = target.position;
    }
  }

  async function handleWindowDrop(e: DragEvent) {
    if (!isActive) return;

    const isReorder = draggingIndex !== null;
    const isMacroDrop = !isReorder && isMacroDrag(e);
    if (!isReorder && !isMacroDrop) return;

    e.preventDefault();
    e.stopPropagation();

    if (isMacroDrop) {
      const filePath = getDroppedMacroPath(e);
      // Dropped between items, or at the end if not over any item.
      let index = sequence.length;
      if (dragOverIndex !== null && dragPosition !== null) {
        index = dragPosition === "bottom" ? dragOverIndex + 1 : dragOverIndex;
      }
      if (filePath) await addMacroToSequence(filePath, index);
    } else if (
      draggingIndex !== null &&
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
      recordChange?.("Reorder Sequence");
    }

    handleDragEnd();
  }

  async function addMacroToSequence(filePath: string, index: number) {
    const result = await insertMacro(sequence, filePath, index);
    if (!result) return;
    sequence = result.sequence;
    collapsedSections.items[result.macro.id] = false;
    recordChange?.("Add Macro");
  }

  function handleDragEnd() {
    draggingIndex = null;
    dragOverIndex = null;
    dragPosition = null;
  }

  // Generic getter for ID
  function getPathLineId(item: SequenceItem) {
    return item.kind === "path" ? item.lineId : undefined;
  }

  /**
   * Given the endPoint of the PREVIOUS line (or startPoint), build a new
   * endPoint that:
   *   - inherits the heading type
   *   - for "linear":   startDeg = prev.endDeg  (direction continues), endDeg = prev.endDeg
   *   - for "constant": degrees  = prev.degrees
   *   - for "tangential" / "facingPoint": copies reverse / targetX,Y
   */
  /** A spot for a new path's end, turning the way `previous` does. */
  function newEndPoint(previous?: Point): Point {
    return previous
      ? endPointAfter(previous, random(36, 108), random(36, 108))
      : endPointAfter(undefined, random(0, 144), random(0, 144));
  }

  function insertLineAfter(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    const currentLine = lines[lineIndex];

    const newLine = createLine(newEndPoint(currentLine.endPoint));

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
    ({ lines, sequence } = unlinkMacroItems(
      lines,
      sequence,
      macroItem,
      seqIndex,
    ));
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
    const newLine = createLine(newEndPoint(lines.at(-1)?.endPoint));
    lines = [...lines, newLine];
    sequence = [...sequence, { kind: "path", lineId: newLine.id! }];
    collapsedSections.lines.push(allCollapsed ? true : false);
    collapsedSections.controlPoints.push(true);
    selectedLineId.set(newLine.id!);
    const newIndex = lines.findIndex((l) => l.id === newLine.id!);
    selectedPointId.set(`point-${newIndex + 1}-0`);
    recordChange("Add Path");
  }

  function collapseAll() {
    collapsedSections.lines = lines.map(() => true);
    collapsedSections.controlPoints = lines.map(() => true);
    collapsedEventMarkers = lines.map(() => true);

    const newItems = { ...collapsedSections.items };
    sequence.forEach((s) => {
      if (s.kind !== "path") newItems[s.id] = true;
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
      if (s.kind !== "path") newItems[s.id] = false;
    });
    collapsedSections.items = newItems;

    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
  }

  function toggleCollapseAll() {
    if (allCollapsed) expandAll();
    else collapseAll();
  }

  export function addWaitAtStart() {
    const wait = createWait();
    sequence = [wait, ...sequence];
    selectedPointId.set(`wait-${wait.id}`);
    selectedLineId.set(null);
    recordChange("Add Wait");
  }

  export function addRotateAtStart() {
    const rotate = createRotate();
    sequence = [rotate, ...sequence];
    selectedPointId.set(`rotate-${rotate.id}`);
    selectedLineId.set(null);
    recordChange("Add Rotate");
  }

  export function addPathAtStart() {
    const newLine = createLine(newEndPoint(lines[0]?.endPoint));
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

  // Keep `lines` (and each line's collapsed state) in sequence order.
  function syncLinesToSequence(newSeq: SequenceItem[]) {
    const order = lineOrderForSequence(lines, newSeq);
    lines = renumberDefaultPathNames(order.map((i) => lines[i]));
    collapsedSections = {
      ...collapsedSections,
      lines: order.map((i) => collapsedSections.lines[i] ?? false),
      controlPoints: order.map(
        (i) => collapsedSections.controlPoints[i] ?? true,
      ),
    };
    collapsedEventMarkers = order.map((i) => collapsedEventMarkers[i] ?? false);
  }

  export function moveSequenceItem(seqIndex: number, delta: number) {
    const moved = moveItem(sequence, lines, seqIndex, delta);
    if (!moved) return;
    sequence = moved;
    syncLinesToSequence(moved);
    recordChange?.("Reorder Sequence");
  }

  export async function scrollToItem(itemId: string) {
    const seqIndex = sequence.findIndex((s) => sequenceItemKey(s) === itemId);

    if (seqIndex !== -1) {
      const item = sequence[seqIndex];

      if (item.kind === "path") {
        const lineIdx = lines.findIndex((l) => l.id === item.lineId);
        if (lineIdx !== -1) {
          collapsedSections.lines[lineIdx] = false;
        }
      } else {
        collapsedSections.items[item.id] = false;
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
      const id = sel.slice(Math.max(0, parts[0].length + 1));
      collapsedSections.items[id] = !collapsedSections.items[id];
    }
    collapsedSections = { ...collapsedSections };
  }

  /** Inserts a new `def` item at `index`, picking up linked settings. */
  function insertAction(index: number, def: ActionDefinition) {
    const newItem = def.createDefault?.();
    if (!newItem || newItem.kind === "path") return;
    sequence = sequence.toSpliced(index, 0, newItem);
    if (newItem.kind === "wait") {
      sequence = updateLinkedWaits(sequence, newItem.id);
    } else if (newItem.kind === "rotate") {
      sequence = updateLinkedRotations(sequence, newItem.id);
    }
    recordChange(`Add ${def.label}`);
  }

  function handleAddAction(def: ActionDefinition) {
    const index = sequence.length;
    insertAction(index, def);
    const added = sequence[index];
    if (added && added.kind !== "path") {
      selectedPointId.set(`${added.kind}-${added.id}`);
      selectedLineId.set(null);
    }
  }

  function addActionAfterFor(seqIndex: number, def: ActionDefinition) {
    if (def.isPath) insertLineAfter(seqIndex);
    else insertAction(seqIndex + 1, def);
  }

  let showDebug = $derived(settings?.showDebugSequence);
  // Debug helpers
  let debugLinesIds = $derived(
    Array.isArray(lines)
      ? lines.map((l) => l.id).filter((id): id is string => id != null)
      : [],
  );
  $effect(() => {
    if (lines && sequence && !repairedSequenceOnce) {
      ensureSequenceConsistency();
      repairedSequenceOnce = true;
    }
  });
  let debugSequenceIds = $derived(
    Array.isArray(sequence)
      ? sequence.flatMap((s) => (s.kind === "path" ? [s.lineId] : []))
      : ([] as string[]),
  );
  let debugMissing = $derived(
    debugLinesIds.filter(
      (id) => id && !debugSequenceIds.includes(id),
    ) as string[],
  );
  let debugInvalidRefs = $derived(
    debugSequenceIds.filter((id) => !debugLinesIds.includes(id)) as string[],
  );
  // Reactive statements to update UI state when lines change
  $effect(() => {
    if (lines.length !== collapsedSections.lines.length) {
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
  });
  $effect(() => {
    if ($toggleCollapseAllTrigger !== _lastToggleCollapse) {
      _lastToggleCollapse = $toggleCollapseAllTrigger;
      toggleCollapseAll();
    }
  });
  let allCollapsed = $derived(
    collapsedSections.lines.length > 0 &&
      collapsedSections.lines.every((v) => v) &&
      collapsedSections.controlPoints.every((v) => v) &&
      collapsedEventMarkers.every((v) => v) &&
      sequence
        .filter((s) => s.kind !== "path")
        .every((s) => collapsedSections.items[s.id]),
  );
</script>

<div
  class="w-full flex flex-col gap-4 p-4 pb-32 outline-none"
  id="path-list-container"
  tabindex="-1"
>
  <div class="flex items-center justify-between gap-4 w-full">
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
      {#snippet icon()}
        <div>
          <MapPinIcon className="size-6 text-neutral-400" strokeWidth={1.5} />
        </div>
      {/snippet}
      {#snippet action()}
        <div class="flex flex-row justify-center items-center gap-3 flex-wrap">
          <PathActionButtons
            {settings}
            onAddLine={addLine}
            onHandleAddAction={handleAddAction}
          />
        </div>
      {/snippet}
    </EmptyState>
  {/if}

  <div role="list" class="flex flex-col gap-4">
    {#each sequence as item, sIdx (sequenceItemKey(item))}
      {@const def = $actionRegistry[item.kind]}
      {@const prevItem = sIdx > 0 ? sequence[sIdx - 1] : null}
      {@const nextItem = sIdx < sequence.length - 1 ? sequence[sIdx + 1] : null}
      {@const isChain =
        item.kind === "path" && prevItem?.kind === "path" && !!item.isChain}
      {@const isChainedWithNext =
        item.kind === "path" && nextItem?.kind === "path" && !!nextItem.isChain}

      {#if item.kind === "path" && prevItem?.kind === "path"}
        <div class="flex justify-center -my-3 z-10 relative">
          <button
            class="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-full p-1 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-sm {isChain
              ? 'text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'text-neutral-400 dark:text-neutral-500'}"
            title={isChain ? "Unchain paths" : "Chain paths"}
            aria-label={isChain ? "Unchain paths" : "Chain paths"}
            onclick={() => {
              ({ lines, sequence } = toggleChain(lines, sequence, sIdx));
              recordChange?.("Toggle Path Chain");
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="w-4 h-4"
            >
              {#if isChain}
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                />
              {:else}
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                  stroke-dasharray="2 2"
                />
              {/if}
            </svg>
          </button>
        </div>
      {/if}

      <div
        role="listitem"
        data-index={sIdx}
        id={`sequence-item-${sequenceItemKey(item)}`}
        class="w-full transition-all duration-200 rounded-lg {isChain
          ? '-mt-2'
          : ''} {isChainedWithNext ? '-mb-2' : ''}"
        draggable={!isSequenceItemLocked(item, lines)}
        ondragstart={(e) => handleDragStart(e, sIdx)}
        ondragend={handleDragEnd}
        class:border-t-4={dragOverIndex === sIdx && dragPosition === "top"}
        class:border-b-4={dragOverIndex === sIdx && dragPosition === "bottom"}
        class:border-blue-500={dragOverIndex === sIdx}
        class:dark:border-blue-400={dragOverIndex === sIdx}
        class:opacity-50={draggingIndex === sIdx}
      >
        {#if item.kind === "path"}
          {@const lineIdx = lines.findIndex(
            (l) => l.id === getPathLineId(item),
          )}
          {#if lineIdx !== -1}
            <PathLineSection
              line={lines[lineIdx]}
              idx={lineIdx}
              bind:lines
              bind:collapsed={collapsedSections.lines[lineIdx]}
              bind:collapsedControlPoints={
                collapsedSections.controlPoints[lineIdx]
              }
              onRemove={() => removeLine(lineIdx)}
              onAddAction={(def) => addActionAfterFor(sIdx, def)}
              onMoveUp={() => moveSequenceItem(sIdx, -1)}
              onMoveDown={() => moveSequenceItem(sIdx, 1)}
              canMoveUp={sIdx !== 0}
              canMoveDown={sIdx !== sequence.length - 1}
              {recordChange}
              onScrollToItem={scrollToItem}
            />
          {/if}
        {:else if def && def.sectionComponent}
          <def.sectionComponent
            {...{ [def.kind]: item }}
            bind:sequence
            collapsed={collapsedSections.items[sequenceItemKey(item)]}
            onRemove={() => {
              const newSeq = [...sequence];
              newSeq.splice(sIdx, 1);
              sequence = newSeq;
              recordChange?.("Remove Item");
            }}
            onInsertAfter={() => addActionAfterFor(sIdx, def)}
            onAddPathAfter={() => insertLineAfter(sIdx)}
            onAddWaitAfter={() =>
              addActionAfterFor(sIdx, $actionRegistry["wait"])}
            onAddRotateAfter={() =>
              addActionAfterFor(sIdx, $actionRegistry["rotate"])}
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
  </div>
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

<svelte:window ondragover={handleWindowDragOver} ondrop={handleWindowDrop} />
