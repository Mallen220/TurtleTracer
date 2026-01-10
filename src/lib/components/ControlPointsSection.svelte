<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import _ from "lodash";
  import { snapToGrid, showGrid, gridSize } from "../../stores";
  import type { Line } from "../../types";
  import {
    calculateDragPosition,
    reorderSequence,
    getClosestTarget,
    type DragPosition,
  } from "../../utils/dragDrop";

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

<div class="flex flex-col w-full justify-start items-start mt-2">
  <!-- Control Points header with toggle and add button -->
  <div class="flex items-center justify-between w-full">
    <button
      on:click={toggleCollapsed}
      class="flex items-center gap-2 font-light hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      title="{collapsed ? 'Show' : 'Hide'} control points"
      aria-expanded={!collapsed}
      aria-controls="control-points-list-{lineIdx}"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-3 transition-transform {collapsed
          ? 'rotate-0'
          : 'rotate-90'}"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m8.25 4.5 7.5 7.5-7.5 7.5"
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
      class="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1 px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      title="Add Control Point"
      disabled={line.locked}
      aria-label="Add Control Point"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-4"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
      Add Control Point
    </button>
  </div>

  <!-- Control Points list (shown when expanded) -->
  {#if !collapsed && line.controlPoints.length > 0}
    <div
      id="control-points-list-{lineIdx}"
      class="w-full mt-2 space-y-2"
      bind:this={containerRef}
    >
      {#each line.controlPoints as point, idx (idx)}
        <div
          role="listitem"
          data-cp-index={idx}
          draggable={!line.locked}
          on:dragstart={(e) => handleDragStart(e, idx)}
          on:dragend={handleDragEnd}
          class="flex flex-col p-2 border border-blue-300 dark:border-blue-700 rounded-md bg-blue-50 dark:bg-blue-900/20 transition-all duration-200"
          class:border-t-4={dragOverIndex === idx && dragPosition === "top"}
          class:border-b-4={dragOverIndex === idx && dragPosition === "bottom"}
          class:border-blue-500={dragOverIndex === idx}
          class:dark:border-blue-400={dragOverIndex === idx}
          class:opacity-50={draggingIndex === idx}
          class:cursor-move={!line.locked}
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              {#if !line.locked}
                <div
                  class="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
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
              <div class="w-3 h-3 rounded-full bg-blue-500"></div>
              <span
                class="text-sm font-medium text-blue-700 dark:text-blue-300"
              >
                Control Point {idx + 1}
              </span>
            </div>

            <div class="flex items-center gap-1">
              <!-- Move Up/Down Buttons -->
              <div class="flex flex-row gap-0.5 mr-2">
                <button
                  title={line.locked ? "Locked" : "Move up"}
                  aria-label="Move control point up"
                  on:click|stopPropagation={() => moveControlPoint(idx, -1)}
                  class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <button
                  title={line.locked ? "Locked" : "Move down"}
                  aria-label="Move control point down"
                  on:click|stopPropagation={() => moveControlPoint(idx, 1)}
                  class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
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

              <button
                on:click={() => {
                  let _pts = line.controlPoints;
                  _pts.splice(idx, 1);
                  line.controlPoints = _pts;
                  recordChange();
                }}
                class="text-red-500 hover:text-red-600 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                title="Remove Control Point"
                aria-label="Remove Control Point"
                disabled={line.locked}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width={2}
                  class="size-4"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Control Point Position Inputs -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex items-center gap-2">
              <span class="text-xs text-neutral-600 dark:text-neutral-400"
                >X:</span
              >
              <input
                bind:value={point.x}
                type="number"
                min="0"
                max="144"
                step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                class="w-16 sm:w-20 px-2 py-1 text-xs rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Line {lineIdx + 1} Control Point {idx + 1} X"
                on:change={() => {
                  // Update the array to trigger reactivity
                  line.controlPoints = [...line.controlPoints];
                }}
                disabled={line.locked}
                title={snapToGridTitle}
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-neutral-600 dark:text-neutral-400"
                >Y:</span
              >
              <input
                bind:value={point.y}
                type="number"
                min="0"
                max="144"
                step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                class="w-16 sm:w-20 px-2 py-1 text-xs rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          <div class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Line {lineIdx + 1}, Control Point {idx + 1}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
