<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import _ from "lodash";
  import {
    snapToGrid,
    showGrid,
    gridSize,
    selectedPointId,
    focusRequest,
  } from "../../../stores";
  import type { Line } from "../../../types/index";
  import {
    calculateDragPosition,
    reorderSequence,
    getClosestTarget,
    type DragPosition,
  } from "../../../utils/dragDrop";
  import DeleteButtonWithConfirm from "../common/DeleteButtonWithConfirm.svelte";

  export let line: Line;
  export let lineIdx: number;
  export let collapsed: boolean;
  export let recordChange: () => void;

  $: snapToGridTitle =
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping";

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  // Drag and drop state
  let draggingIndex: number | null = null;
  let dragOverIndex: number | null = null;
  let dragPosition: DragPosition | null = null;
  let containerRef: HTMLElement;

  let xInputs: (HTMLInputElement | null)[] = [];
  let yInputs: (HTMLInputElement | null)[] = [];

  // Handle focus request
  $: if ($focusRequest) {
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

    // Ensure we are dragging over THIS component's container
    if (!containerRef) return;

    e.preventDefault();

    const target = getClosestTarget(e, "div[data-cp-index]", containerRef);

    if (!target) return;

    const index = parseInt(target.element.getAttribute("data-cp-index") || "");
    if (isNaN(index)) return;

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

  function moveControlPoint(index: number, delta: number) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= line.controlPoints.length) return;

    const newPoints = [...line.controlPoints];
    const temp = newPoints[index];
    newPoints[index] = newPoints[targetIndex];
    newPoints[targetIndex] = temp;

    line.controlPoints = newPoints;
    recordChange();
  }
</script>

<svelte:window on:dragover={handleWindowDragOver} on:drop={handleWindowDrop} />

<div class="flex flex-col w-full justify-start items-start">
  <!-- Control Points header with toggle and add button -->
  <div class="flex items-center justify-between w-full py-1">
    <button
      on:click={toggleCollapsed}
      class="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-wide hover:text-neutral-800 dark:hover:text-neutral-300 transition-colors"
      title="{collapsed ? 'Show' : 'Hide'} control points"
      aria-expanded={!collapsed}
      aria-controls="control-points-list-{lineIdx}"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2.5}
        stroke="currentColor"
        class="size-3 transition-transform duration-200 {collapsed
          ? '-rotate-90'
          : 'rotate-0'}"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m19.5 8.25-7.5 7.5-7.5-7.5"
        />
      </svg>
      Control Points ({line.controlPoints.length})
    </button>

    <button
      on:click={() => {
        line.controlPoints = [
          ...line.controlPoints,
          {
            x: _.random(36, 108),
            y: _.random(36, 108),
          },
        ];
        recordChange();
      }}
      class="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-neutral-900"
      title="Add Control Point"
      disabled={line.locked}
      aria-label="Add Control Point"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2.5}
        stroke="currentColor"
        class="size-3"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
      Add
    </button>
  </div>

  <!-- Control Points list (shown when expanded) -->
  {#if !collapsed && line.controlPoints.length > 0}
    <div
      id="control-points-list-{lineIdx}"
      class="w-full mt-2 space-y-2"
      bind:this={containerRef}
      role="list"
    >
      {#each line.controlPoints as point, idx (idx)}
        <div
          role="listitem"
          data-cp-index={idx}
          draggable={!line.locked}
          on:dragstart={(e) => handleDragStart(e, idx)}
          on:dragend={handleDragEnd}
          class="flex items-center gap-3 p-2 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 transition-all duration-200 group"
          class:border-t-4={dragOverIndex === idx && dragPosition === "top"}
          class:border-b-4={dragOverIndex === idx && dragPosition === "bottom"}
          class:border-blue-500={dragOverIndex === idx}
          class:dark:border-blue-400={dragOverIndex === idx}
          class:opacity-50={draggingIndex === idx}
          class:cursor-move={!line.locked}
        >
          <!-- Drag Handle -->
          {#if !line.locked}
            <div
              class="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 pl-1"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-4 h-4"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 3a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
                  clip-rule="evenodd"
                />
              </svg>
            </div>
          {/if}

          <!-- Content -->
          <div class="flex-1 flex flex-col gap-1 min-w-0">
            <div class="flex items-center gap-2">
              <span
                class="text-xs font-semibold text-blue-600 dark:text-blue-400"
                >Point {idx + 1}</span
              >

              <!-- Spacer -->
              <div class="flex-1"></div>

              <!-- Reorder Buttons -->
              <div
                class="flex items-center bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
              >
                <button
                  title={line.locked ? "Locked" : "Move up"}
                  aria-label="Move control point up"
                  on:click|stopPropagation={() => moveControlPoint(idx, -1)}
                  class="p-0.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={idx === 0 || line.locked}
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
                      d="m5 15 7-7 7 7"
                    />
                  </svg>
                </button>
                <div class="w-px h-3 bg-neutral-200 dark:bg-neutral-700"></div>
                <button
                  title={line.locked ? "Locked" : "Move down"}
                  aria-label="Move control point down"
                  on:click|stopPropagation={() => moveControlPoint(idx, 1)}
                  class="p-0.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={idx === line.controlPoints.length - 1 ||
                    line.locked}
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
                      d="m19 9-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>

              <!-- Delete Button -->
              <DeleteButtonWithConfirm
                on:click={() => {
                  let _pts = line.controlPoints;
                  _pts.splice(idx, 1);
                  line.controlPoints = _pts;
                  recordChange();
                }}
                disabled={line.locked}
                title="Remove Control Point"
              />
            </div>

            <!-- Position Inputs -->
            <div class="flex items-center gap-2 flex-wrap">
              <div class="relative flex-1 min-w-[4rem]">
                <span
                  class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400 select-none"
                  >X</span
                >
                <input
                  bind:this={xInputs[idx]}
                  bind:value={point.x}
                  type="number"
                  min="0"
                  max="144"
                  step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                  class="w-full pl-5 pr-1 py-1 text-xs rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  aria-label="Line {lineIdx + 1} Control Point {idx + 1} X"
                  on:change={() => {
                    // Update the array to trigger reactivity
                    line.controlPoints = [...line.controlPoints];
                  }}
                  disabled={line.locked}
                  title={snapToGridTitle}
                />
              </div>
              <div class="relative flex-1 min-w-[4rem]">
                <span
                  class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400 select-none"
                  >Y</span
                >
                <input
                  bind:this={yInputs[idx]}
                  bind:value={point.y}
                  type="number"
                  min="0"
                  max="144"
                  step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                  class="w-full pl-5 pr-1 py-1 text-xs rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  aria-label="Line {lineIdx + 1} Control Point {idx + 1} Y"
                  on:change={() => {
                    // Update the array to trigger reactivity
                    line.controlPoints = [...line.controlPoints];
                  }}
                  disabled={line.locked}
                  title={snapToGridTitle}
                />
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
