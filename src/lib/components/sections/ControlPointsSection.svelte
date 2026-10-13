<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import random from "lodash/random";
  import {
    snapToGrid,
    showGrid,
    gridSize,
    selectedLineId,
    selectedPointId,
    focusRequest,
  } from "../../../stores";
  import { settingsStore } from "../../projectStore";
  import { toUser, toField } from "../../../utils/coordinates";
  import type { Line } from "../../../types/index";
  import ChevronDownIcon from "../icons/ChevronDownIcon.svelte";
  import ChevronUpIcon from "../icons/ChevronUpIcon.svelte";
  import PlusIcon from "../icons/PlusIcon.svelte";
  import ViewListIcon from "../icons/ViewListIcon.svelte";
  import {
    reorderSequence,
    getClosestTarget,
    type DragPosition,
  } from "../../../utils/dragDrop";
  import DeleteButtonWithConfirm from "../common/DeleteButtonWithConfirm.svelte";
  import { ui } from "../../ui";
  import { readableTextOn } from "../../../utils/readableText";

  interface Props {
    line: Line;
    lineIdx: number;
    collapsed: boolean;
    recordChange: () => void;
  }

  let {
    line = $bindable(),
    lineIdx,
    collapsed = $bindable(),
    recordChange,
  }: Props = $props();

  let snapToGridTitle = $derived(
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping",
  );
  let coordinateSystem = $derived($settingsStore.coordinateSystem || "Pedro");

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  // The id the field uses for control point `idx`; point 0 is the path's end.
  const pointId = (idx: number) => `point-${lineIdx + 1}-${idx + 1}`;

  function selectPoint(idx: number) {
    if (line.id) selectedLineId.set(line.id);
    selectedPointId.set(pointId(idx));
  }

  // Drag and drop state
  let draggingIndex: number | null = $state(null);
  let dragOverIndex: number | null = $state(null);
  let dragPosition: DragPosition | null = $state(null);
  let containerRef: HTMLElement | undefined = $state();

  let xInputs: (HTMLInputElement | null)[] = $state([]);
  let yInputs: (HTMLInputElement | null)[] = $state([]);

  // Bring a point picked on the field into view in the list.
  $effect(() => {
    const id = $selectedPointId;
    if (!id || collapsed || !containerRef) return;
    const idx = line.controlPoints.findIndex((_, i) => pointId(i) === id);
    if (idx === -1) return;
    containerRef
      .querySelector(`[data-cp-index="${idx}"]`)
      ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  });

  // Handle focus request
  $effect(() => {
    if ($focusRequest) {
      if (
        $selectedPointId &&
        $selectedPointId.startsWith(`point-${lineIdx + 1}-`)
      ) {
        const ptIdxStr = $selectedPointId.split("-")[2];
        const ptIdx = Number(ptIdxStr);
        // Control points are indexed 1..N in the selection ID (since 0 is the endpoint)
        if (ptIdx > 0) {
          const cpIndex = ptIdx - 1;
          if ($focusRequest.field === "x" && xInputs[cpIndex])
            xInputs[cpIndex]?.focus();
          if ($focusRequest.field === "y" && yInputs[cpIndex])
            yInputs[cpIndex]?.focus();
        }
      }
    }
  });

  function addPoint() {
    if (line.locked) return;
    line.controlPoints = [
      ...line.controlPoints,
      { x: random(36, 108), y: random(36, 108) },
    ];
    collapsed = false;
    recordChange();
    selectPoint(line.controlPoints.length - 1);
  }

  function removePoint(idx: number) {
    if ($selectedPointId === pointId(idx)) selectedPointId.set(null);
    line.controlPoints = line.controlPoints.filter((_, i) => i !== idx);
    recordChange();
  }

  function moveControlPoint(index: number, delta: number) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= line.controlPoints.length) return;

    const wasSelected = $selectedPointId === pointId(index);
    const newPoints = [...line.controlPoints];
    const temp = newPoints[index];
    newPoints[index] = newPoints[targetIndex];
    newPoints[targetIndex] = temp;

    line.controlPoints = newPoints;
    recordChange();
    // The highlight stays with the point as it moves.
    if (wasSelected) selectPoint(targetIndex);
  }

  // Typing in a field moves the point as you go; the edit is recorded for
  // undo once, when you leave the field.
  let edited = false;

  function setCoordinate(
    point: Line["controlPoints"][number],
    axis: "x" | "y",
    raw: string,
  ) {
    const value = Number.parseFloat(raw);
    if (Number.isNaN(value)) return;
    const user = toUser(point, coordinateSystem);
    const next = toField(
      axis === "x" ? { x: value, y: user.y } : { x: user.x, y: value },
      coordinateSystem,
    );
    point.x = next.x;
    point.y = next.y;
    line.controlPoints = [...line.controlPoints];
    edited = true;
  }

  function commitEdit() {
    if (!edited) return;
    edited = false;
    recordChange();
  }

  // Dragging a row to reorder.
  function handleDragStart(e: DragEvent, index: number) {
    if (line.locked) {
      e.preventDefault();
      return;
    }
    draggingIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  }

  function handleWindowDragOver(e: DragEvent) {
    if (draggingIndex === null) return;

    if (!containerRef) return;

    e.preventDefault();

    const target = getClosestTarget(e, "div[data-cp-index]", containerRef);

    if (!target) return;

    const index = Number.parseInt(
      target.element.getAttribute("data-cp-index") || "",
    );
    if (Number.isNaN(index)) return;

    if (dragOverIndex !== index || dragPosition !== target.position) {
      dragOverIndex = index;
      dragPosition = target.position;
    }
  }

  function handleWindowDrop(e: DragEvent) {
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

    const newPoints = reorderSequence(
      line.controlPoints,
      draggingIndex,
      dragOverIndex,
      dragPosition,
    );

    line.controlPoints = newPoints;
    recordChange();

    handleDragEnd();
  }

  function handleDragEnd() {
    draggingIndex = null;
    dragOverIndex = null;
    dragPosition = null;
  }
</script>

<svelte:window ondragover={handleWindowDragOver} ondrop={handleWindowDrop} />

<div class="flex flex-col w-full">
  <!-- Header: show or hide the list, and add a point -->
  <div class="flex items-center justify-between gap-2 w-full">
    <button
      onclick={toggleCollapsed}
      class="{ui.btnSm.ghost} -ml-2"
      title="{collapsed ? 'Show' : 'Hide'} control points"
      aria-expanded={!collapsed}
      aria-controls="control-points-list-{lineIdx}"
    >
      <ChevronDownIcon
        className="size-3 transition-transform duration-200 {collapsed
          ? '-rotate-90'
          : 'rotate-0'}"
        strokeWidth={2.5}
      />
      <span class={ui.heading}>Control Point ({line.controlPoints.length})</span
      >
    </button>

    <button
      onclick={addPoint}
      class={ui.btnSm.accentSoft}
      title="Add Control Point"
      disabled={line.locked}
    >
      <PlusIcon className="size-3.5" strokeWidth={2.5} />
      Add Point
    </button>
  </div>

  {#if !collapsed}
    <div
      id="control-points-list-{lineIdx}"
      class="w-full mt-2 space-y-1.5"
      bind:this={containerRef}
      role="list"
    >
      {#each line.controlPoints as point, idx (idx)}
        {@const selected = $selectedPointId === pointId(idx)}
        {@const user = toUser(point, coordinateSystem)}
        <!-- Keyboard users select a point by tabbing into its fields (onfocusin). -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          role="listitem"
          data-cp-index={idx}
          draggable={!line.locked}
          ondragstart={(e) => handleDragStart(e, idx)}
          ondragend={handleDragEnd}
          onclick={() => selectPoint(idx)}
          onfocusin={() => selectPoint(idx)}
          class="{ui.row(
            selected,
          )} flex flex-wrap items-center gap-2 px-2 py-1.5"
          class:border-t-2={dragOverIndex === idx && dragPosition === "top"}
          class:border-t-emerald-500={dragOverIndex === idx &&
            dragPosition === "top"}
          class:border-b-2={dragOverIndex === idx && dragPosition === "bottom"}
          class:border-b-emerald-500={dragOverIndex === idx &&
            dragPosition === "bottom"}
          class:opacity-50={draggingIndex === idx}
        >
          {#if !line.locked}
            <div
              class="cursor-grab active:cursor-grabbing text-neutral-500 dark:text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              title="Drag to reorder"
            >
              <ViewListIcon className="w-4 h-4" />
            </div>
          {/if}

          <!-- The number the point wears on the field, in the path's color. The
               digit is black or white, whichever reads on that color. -->
          <span
            class="size-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ring-1 ring-black/20 dark:ring-white/30"
            style="background-color: {line.color}; color: {readableTextOn(
              line.color,
            )}"
            aria-hidden="true"
          >
            {idx + 1}
          </span>

          <!-- Position -->
          <div class="flex items-center gap-2 flex-1 min-w-[11rem]">
            <div class="relative flex-1 min-w-0 max-w-[200px]">
              <span
                class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-500 dark:text-neutral-400 select-none"
                >X</span
              >
              <input
                bind:this={xInputs[idx]}
                value={user.x}
                type="number"
                min={$settingsStore.coordinateSystem === "FTC"
                  ? -($settingsStore.fieldHeight ?? 144) / 2
                  : 0}
                max={$settingsStore.coordinateSystem === "FTC"
                  ? ($settingsStore.fieldHeight ?? 144) / 2
                  : ($settingsStore.fieldWidth ?? 144)}
                step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                class="{ui.inputSm} w-full pl-6 pr-2"
                aria-label="Line {lineIdx + 1} Control Point {idx + 1} X"
                oninput={(e) =>
                  setCoordinate(point, "x", e.currentTarget.value)}
                onblur={commitEdit}
                disabled={line.locked}
                title={snapToGridTitle}
              />
            </div>
            <div class="relative flex-1 min-w-0 max-w-[200px]">
              <span
                class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-500 dark:text-neutral-400 select-none"
                >Y</span
              >
              <input
                bind:this={yInputs[idx]}
                value={user.y}
                type="number"
                min={$settingsStore.coordinateSystem === "FTC"
                  ? -($settingsStore.fieldWidth ?? 144) / 2
                  : 0}
                max={$settingsStore.coordinateSystem === "FTC"
                  ? ($settingsStore.fieldWidth ?? 144) / 2
                  : ($settingsStore.fieldHeight ?? 144)}
                step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                class="{ui.inputSm} w-full pl-6 pr-2"
                aria-label="Line {lineIdx + 1} Control Point {idx + 1} Y"
                oninput={(e) =>
                  setCoordinate(point, "y", e.currentTarget.value)}
                onblur={commitEdit}
                disabled={line.locked}
                title={snapToGridTitle}
              />
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1 ml-auto">
            <div
              class="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-md p-0.5"
            >
              <button
                title={line.locked ? "Locked" : "Move up"}
                aria-label="Move control point up"
                onclick={(e) => {
                  e.stopPropagation();
                  moveControlPoint(idx, -1);
                }}
                class={ui.iconBtnSm.neutral}
                disabled={idx === 0 || line.locked}
              >
                <ChevronUpIcon className="size-3.5" />
              </button>
              <button
                title={line.locked ? "Locked" : "Move down"}
                aria-label="Move control point down"
                onclick={(e) => {
                  e.stopPropagation();
                  moveControlPoint(idx, 1);
                }}
                class={ui.iconBtnSm.neutral}
                disabled={idx === line.controlPoints.length - 1 || line.locked}
              >
                <ChevronDownIcon className="size-3.5" />
              </button>
            </div>

            <DeleteButtonWithConfirm
              onclick={() => removePoint(idx)}
              disabled={line.locked}
              title="Remove Control Point"
            />
          </div>
        </div>
      {:else}
        <div
          class="{ui.well} border-dashed px-3 py-3 text-xs text-center text-neutral-500 dark:text-neutral-400"
        >
          Add a control point to bend the path.
        </div>
      {/each}
    </div>
  {/if}
</div>
