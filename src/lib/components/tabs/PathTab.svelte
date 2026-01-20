<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    Point,
    Line,
    SequenceItem,
    SequenceWaitItem,
    SequenceRotateItem,
    Settings,
  } from "../../../types";
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
  } from "../../../utils/nameGenerator";
  import StartingPointSection from "../StartingPointSection.svelte";
  import EmptyState from "../common/EmptyState.svelte";
  import PathLineSection from "../PathLineSection.svelte";
  import WaitSection from "../WaitSection.svelte";
  import RotateSection from "../RotateSection.svelte";
  import {
    selectedLineId,
    selectedPointId,
    toggleCollapseAllTrigger,
  } from "../../../stores";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let settings: Settings;
  export let recordChange: () => void;
  export let isActive: boolean = false; // instead of checking activeTab === 'path'

  $: showDebug = (settings as any)?.showDebugSequence;

  // --- Logic from ControlTab ---
  let collapsedEventMarkers: boolean[] = lines.map(() => false);

  // State for collapsed sections
  let collapsedSections = {
    lines: lines.map(() => false),
    controlPoints: lines.map(() => true), // Start with control points collapsed
    // Track collapsed state for waits by their ID
    waits: {} as Record<string, boolean>,
    // Track collapsed state for rotates by their ID
    rotates: {} as Record<string, boolean>,
  };

  // Debug helpers
  $: debugLinesIds = Array.isArray(lines) ? lines.map((l) => l.id) : [];
  $: debugSequenceIds = Array.isArray(sequence)
    ? sequence.filter((s) => s.kind === "path").map((s: any) => s.lineId)
    : [];
  $: debugMissing = debugLinesIds.filter(
    (id) => !debugSequenceIds.includes(id),
  );
  $: debugInvalidRefs = debugSequenceIds.filter(
    (id) => !debugLinesIds.includes(id),
  );

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
    const missing = lines.filter((l) => !presentIds.has(l.id));

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
      recordChange?.();
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
    // Only toggle if this tab is active or we want global hotkey to work regardless?
    // ControlTab logic implies global trigger.
    toggleCollapseAll();
  }

  // Drag and drop state
  let draggingIndex: number | null = null;
  let dragOverIndex: number | null = null;
  let dragPosition: DragPosition | null = null;

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
    if (draggingIndex === null || !isActive) return;
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

  function handleWindowDrop(e: DragEvent) {
    if (draggingIndex === null || !isActive) return;
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
    recordChange?.();

    handleDragEnd();
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

  function getPathLineId(item: SequenceItem) {
    return item.kind === "path" ? (item as any).lineId : undefined;
  }

  function insertLineAfter(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    const currentLine = lines[lineIndex];

    let newPoint: Point;
    if (currentLine.endPoint.heading === "linear") {
      newPoint = {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "linear",
        startDeg: currentLine.endPoint.startDeg,
        endDeg: currentLine.endPoint.endDeg,
      };
    } else if (currentLine.endPoint.heading === "constant") {
      newPoint = {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "constant",
        degrees: currentLine.endPoint.degrees,
      };
    } else {
      newPoint = {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "tangential",
        reverse: currentLine.endPoint.reverse,
      };
    }

    const newLine = {
      id: makeId(),
      endPoint: newPoint,
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

  function removeLine(idx: number) {
    if (lines.length <= 1) return;
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
    recordChange();
  }

  function addLine() {
    const newLine: Line = {
      id: makeId(),
      name: "",
      endPoint: {
        x: _.random(0, 144),
        y: _.random(0, 144),
        heading: "tangential",
        reverse: false,
      },
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
    recordChange();
  }

  function collapseAll() {
    collapsedSections.lines = lines.map(() => true);
    collapsedSections.controlPoints = lines.map(() => true);
    collapsedEventMarkers = lines.map(() => true);

    const newWaits = { ...collapsedSections.waits };
    sequence.forEach((s) => {
      if (s.kind === "wait") {
        newWaits[s.id] = true;
      }
    });
    collapsedSections.waits = newWaits;

    const newRotates = { ...collapsedSections.rotates };
    sequence.forEach((s) => {
      if (s.kind === "rotate") {
        newRotates[s.id] = true;
      }
    });
    collapsedSections.rotates = newRotates;

    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
  }

  function expandAll() {
    collapsedSections.lines = lines.map(() => false);
    collapsedSections.controlPoints = lines.map(() => false);
    collapsedEventMarkers = lines.map(() => false);

    const newWaits = { ...collapsedSections.waits };
    sequence.forEach((s) => {
      if (s.kind === "wait") {
        newWaits[s.id] = false;
      }
    });
    collapsedSections.waits = newWaits;

    const newRotates = { ...collapsedSections.rotates };
    sequence.forEach((s) => {
      if (s.kind === "rotate") {
        newRotates[s.id] = false;
      }
    });
    collapsedSections.rotates = newRotates;

    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
  }

  $: allCollapsed =
    collapsedSections.lines.length > 0 &&
    collapsedSections.lines.every((v) => v) &&
    collapsedSections.controlPoints.every((v) => v) &&
    collapsedEventMarkers.every((v) => v) &&
    (sequence.filter((s) => s.kind === "wait").length === 0 ||
      sequence
        .filter((s) => s.kind === "wait")
        .every((s) => collapsedSections.waits[s.id])) &&
    (sequence.filter((s) => s.kind === "rotate").length === 0 ||
      sequence
        .filter((s) => s.kind === "rotate")
        .every((s) => collapsedSections.rotates[s.id]));

  function toggleCollapseAll() {
    if (allCollapsed) expandAll();
    else collapseAll();
  }

  function addWait() {
    const wait = {
      kind: "wait",
      id: makeId(),
      name: "",
      durationMs: 1000,
      locked: false,
    } as SequenceItem;
    sequence = [...sequence, wait];
    selectedPointId.set(`wait-${(wait as any).id}`);
    selectedLineId.set(null);
    recordChange();
  }

  function addRotate() {
    const rotate = {
      kind: "rotate",
      id: makeId(),
      name: "",
      degrees: 0,
      locked: false,
    } as SequenceItem;
    sequence = [...sequence, rotate];
    selectedPointId.set(`rotate-${(rotate as any).id}`);
    selectedLineId.set(null);
    recordChange();
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
    recordChange();
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
    recordChange();
  }

  export function addPathAtStart() {
    const newLine: Line = {
      id: makeId(),
      name: "",
      endPoint: {
        x: _.random(0, 144),
        y: _.random(0, 144),
        heading: "tangential",
        reverse: false,
      },
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
    recordChange();
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
  }

  function insertPathAfter(seqIndex: number) {
    const newLine: Line = {
      id: makeId(),
      name: "",
      endPoint: {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "tangential",
        reverse: false,
      },
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
    recordChange();
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
      return false;
    };

    if (isLockedSequenceItem(seqIndex) || isLockedSequenceItem(targetIndex))
      return;

    const newSeq = [...sequence];
    const [item] = newSeq.splice(seqIndex, 1);
    newSeq.splice(targetIndex, 0, item);
    sequence = newSeq;

    syncLinesToSequence(newSeq);
    recordChange?.();
  }

  function isItemLocked(item: SequenceItem, lines: Line[]): boolean {
    if (item.kind === "path") {
      return lines.find((l) => l.id === (item as any).lineId)?.locked ?? false;
    }
    if (item.kind === "rotate") {
      return getRotate(item).locked ?? false;
    }
    return getWait(item).locked ?? false;
  }

  export async function scrollToItem(itemId: string) {
    const seqIndex = sequence.findIndex((s) => {
      if (s.kind === "path") return s.lineId === itemId;
      if (s.kind === "wait") return (s as any).id === itemId;
      if (s.kind === "rotate") return (s as any).id === itemId;
      return false;
    });

    if (seqIndex !== -1) {
      const item = sequence[seqIndex];

      if (item.kind === "path") {
        const lineId = (item as any).lineId;
        const lineIdx = lines.findIndex((l) => l.id === lineId);
        if (lineIdx !== -1) {
          collapsedSections.lines[lineIdx] = false;
        }
      } else if (item.kind === "wait") {
        collapsedSections.waits[(item as any).id] = false;
      } else if (item.kind === "rotate") {
        collapsedSections.rotates[(item as any).id] = false;
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

    if (sel.startsWith("wait-")) {
      const id = sel.substring(5);
      collapsedSections.waits[id] = !collapsedSections.waits[id];
    } else if (sel.startsWith("rotate-")) {
      const id = sel.substring(7);
      collapsedSections.rotates[id] = !collapsedSections.rotates[id];
    } else if (sel.startsWith("point-")) {
      const parts = sel.split("-");
      const lineNum = Number(parts[1]);
      if (lineNum > 0) {
        const lineIdx = lineNum - 1;
        collapsedSections.lines[lineIdx] = !collapsedSections.lines[lineIdx];
      }
    }
    collapsedSections = { ...collapsedSections };
  }
</script>

<div class="w-full flex flex-col gap-4 p-4 pb-32">
  <div class="flex items-center justify-between gap-4 w-full">
    <StartingPointSection
      bind:startPoint
      {addPathAtStart}
      {addWaitAtStart}
      {addRotateAtStart}
      {toggleCollapseAll}
      {allCollapsed}
    />
  </div>

  {#if showDebug}
    <div class="p-2 text-xs text-neutral-500">
      <div>
        <strong>DEBUG (PathTab)</strong> — lines: {lines.length}, sequence: {(
          sequence || []
        ).length}
      </div>
      <div>
        Missing: {JSON.stringify(debugMissing)}
      </div>
      <div>
        Invalid refs: {JSON.stringify(debugInvalidRefs)}
      </div>
    </div>
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
    </EmptyState>
  {/if}

  {#each sequence as item, sIdx (item.kind === "path" ? getPathLineId(item) : item.kind === "wait" ? getWait(item).id : getRotate(item).id)}
    {@const isLocked =
      item.kind === "path"
        ? (lines.find((l) => l.id === getPathLineId(item))?.locked ?? false)
        : (item.locked ?? false)}
    <div
      role="listitem"
      data-index={sIdx}
      id={`sequence-item-${item.kind === "path" ? getPathLineId(item) : item.kind === "wait" ? getWait(item).id : getRotate(item).id}`}
      class="w-full transition-all duration-200 rounded-lg"
      draggable={!isItemLocked(item, lines)}
      on:dragstart={(e) => handleDragStart(e, sIdx)}
      on:dragend={handleDragEnd}
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
            onAddWaitAfter={() => insertWaitAfter(sIdx)}
            onAddRotateAfter={() => insertRotateAfter(sIdx)}
            onMoveUp={() => moveSequenceItem(sIdx, -1)}
            onMoveDown={() => moveSequenceItem(sIdx, 1)}
            canMoveUp={sIdx !== 0}
            canMoveDown={sIdx !== sequence.length - 1}
            {recordChange}
          />
        {/each}
      {:else if item.kind === "rotate"}
        <RotateSection
          bind:rotate={item}
          bind:sequence
          bind:collapsed={collapsedSections.rotates[getRotate(item).id]}
          onRemove={() => {
            const newSeq = [...sequence];
            newSeq.splice(sIdx, 1);
            sequence = newSeq;
            recordChange?.();
          }}
          onInsertAfter={() => insertRotateAfter(sIdx)}
          onAddPathAfter={() => insertPathAfter(sIdx)}
          onAddWaitAfter={() => insertWaitAfter(sIdx)}
          onMoveUp={() => moveSequenceItem(sIdx, -1)}
          onMoveDown={() => moveSequenceItem(sIdx, 1)}
          canMoveUp={sIdx !== 0}
          canMoveDown={sIdx !== sequence.length - 1}
          {recordChange}
        />
      {:else}
        <WaitSection
          bind:wait={item}
          bind:sequence
          bind:collapsed={collapsedSections.waits[getWait(item).id]}
          onRemove={() => {
            const newSeq = [...sequence];
            newSeq.splice(sIdx, 1);
            sequence = newSeq;
            recordChange?.();
          }}
          onInsertAfter={() => {
            const newSeq = [...sequence];
            newSeq.splice(sIdx + 1, 0, {
              kind: "wait",
              id: makeId(),
              name: "",
              durationMs: 1000,
              locked: false,
            });
            sequence = newSeq;
            recordChange?.();
          }}
          onAddPathAfter={() => insertPathAfter(sIdx)}
          onAddRotateAfter={() => insertRotateAfter(sIdx)}
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
  <div class="flex flex-row justify-center items-center gap-3 pt-4">
    <button
      on:click={addLine}
      class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 dark:bg-green-700 rounded-md shadow-sm hover:bg-green-700 dark:hover:bg-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-green-300 dark:focus:ring-green-700"
      aria-label="Add new path segment"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-4"
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
      on:click={addWait}
      class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-500 dark:bg-amber-600 rounded-md shadow-sm hover:bg-amber-600 dark:hover:bg-amber-500 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500"
      aria-label="Add wait command"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="size-4"
      >
        <circle cx="12" cy="12" r="9" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2" />
      </svg>
      Add Wait
    </button>

    <button
      on:click={addRotate}
      class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pink-500 dark:bg-pink-600 rounded-md shadow-sm hover:bg-pink-600 dark:hover:bg-pink-500 transition-colors focus:outline-none focus:ring-2 focus:ring-pink-200 dark:focus:ring-pink-500"
      aria-label="Add rotate command"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="size-4"
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

<svelte:window on:dragover={handleWindowDragOver} on:drop={handleWindowDrop} />
