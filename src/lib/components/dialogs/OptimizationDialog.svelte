<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import type {
    Line,
    Point,
    SequenceItem,
    Settings,
    Shape,
  } from "../../../types/index";
  import SectionHeader from "../common/SectionHeader.svelte";
  import { LockIcon, SpinnerIcon } from "../icons/index";
  import {
    PathOptimizer,
    type OptimizationResult,
  } from "../../../utils/pathOptimizer";
  import { formatTime } from "../../../utils";
  import { dimmedLinesStore } from "../../../stores";
  import { onDestroy } from "svelte";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let settings: Settings | undefined = undefined;
  export let sequence: SequenceItem[];
  export let shapes: Shape[] = [];
  export let onApply: (newLines: Line[]) => void;
  export let onPreviewChange: ((lines: Line[] | null) => void) | null = null;
  export let onClose: (() => void) | null = null;

  export let isRunning = false;
  let progress = 0;
  let currentBestTime = 0;
  export let optimizedLines: Line[] | null = null;
  let showPreview = true;
  export let optimizationFailed = false;
  export let collapsed = false;

  let selectionState: Record<string, boolean> = {};

  $: {
    lines.forEach((l, idx) => {
      const id = l.id || `idx-${idx}`;
      if (selectionState[id] === undefined) {
        selectionState[id] = true;
      }
    });
  }

  $: {
    const unselectedIds = lines
      .filter((l, idx) => {
        const id = l.id || `idx-${idx}`;
        return selectionState[id] === false;
      })
      .map((l) => l.id as string)
      .filter((id) => !!id);

    dimmedLinesStore.set(unselectedIds);
  }

  function toggleSelection(id: string) {
    selectionState[id] = !selectionState[id];
    selectionState = selectionState;
  }

  function selectAll() {
    lines.forEach((l, idx) => {
      const id = l.id || `idx-${idx}`;
      selectionState[id] = true;
    });
    selectionState = selectionState;
  }

  function deselectAll() {
    lines.forEach((l, idx) => {
      const id = l.id || `idx-${idx}`;
      selectionState[id] = false;
    });
    selectionState = selectionState;
  }

  onDestroy(() => {
    dimmedLinesStore.set([]);
  });

  let optimizer: PathOptimizer | null = null;
  let isStopping = false;

  export async function startOptimization() {
    isRunning = true;
    progress = 0;
    optimizationFailed = false;
    isStopping = false;

    if (settings) {
      const linesToOptimize = structuredClone(lines).map((l, idx) => {
        const id = l.id || `idx-${idx}`;
        if (!selectionState[id]) {
          l.locked = true;
        }
        return l;
      });

      optimizer = new PathOptimizer(
        startPoint,
        linesToOptimize,
        settings,
        sequence,
        shapes,
      );
    } else {
      isRunning = false;
      return;
    }

    if (!optimizer) {
      isRunning = false;
      return;
    }

    const optimizationResult = await optimizer.optimize(
      (result: OptimizationResult) => {
        progress = result.generation;
        currentBestTime = result.bestTime;
      },
    );

    optimizedLines = optimizationResult.lines;

    if (optimizedLines) {
      optimizedLines.forEach((l, idx) => {
        const originalLine = lines[idx];
        if (originalLine) {
          const id = originalLine.id || `idx-${idx}`;
          if (!selectionState[id]) {
            l.locked = originalLine.locked;
          }
        }
      });
    }

    const finalBestTime = optimizationResult.bestTime;
    optimizationFailed = finalBestTime >= 10000;

    isRunning = false;
    isStopping = false;
    optimizer = null;
    showPreview = true;

    if (onPreviewChange) {
      onPreviewChange(optimizedLines);
    }
  }

  export function handleApply() {
    if (optimizationFailed) return;
    if (optimizedLines) {
      const result = optimizedLines;
      onApply(result);

      progress = 0;
      optimizedLines = null;
      showPreview = false;
      optimizationFailed = false;
      if (onPreviewChange) onPreviewChange(null);

      isOpen = false;
      if (onClose) onClose();
    }
  }

  export function handleClose() {
    if (isRunning) return;
    isOpen = false;
    progress = 0;
    optimizedLines = null;
    showPreview = false;
    if (onPreviewChange) onPreviewChange(null);
    if (onClose) onClose();
  }

  export function stopOptimization() {
    if (!optimizer) return;
    isStopping = true;
    optimizer.stop();
  }

  export function togglePreview() {
    showPreview = !showPreview;
    if (onPreviewChange) {
      onPreviewChange(
        showPreview && !optimizationFailed ? optimizedLines : null,
      );
    }
  }

  $: if (optimizationFailed && showPreview) {
    showPreview = false;
    if (onPreviewChange) onPreviewChange(null);
  }
</script>

```svelte
<div
  class="flex flex-col w-full border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 overflow-hidden mb-4"
>
  <SectionHeader title="Path Optimization" bind:collapsed />

  {#if !collapsed}
    <div
      class="p-4 space-y-4 border-t border-neutral-200 dark:border-neutral-700"
    >
      <details class="text-sm text-neutral-600 dark:text-neutral-400 group">
        <summary
          class="cursor-pointer font-medium hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors list-none appearance-none [&::-webkit-details-marker]:hidden flex items-center gap-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-3 transition-transform group-open:rotate-90 text-neutral-500 dark:text-neutral-400"
          >
            <path
              d="M6.3 2.841A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.269l9.344-5.89a1.5 1.5 0 0 0 0-2.538L6.3 2.84z"
            />
          </svg>
          About Path Optimization
        </summary>
        <div class="mt-2 text-xs leading-relaxed">
          The optimizer uses a genetic algorithm to adjust control points to
          minimize total travel time. Locking paths and adjusting settings can
          help guide the optimization process. Additionally, obstacles on the
          field will be considered to avoid collisions. You can help the
          optimization process by creating an initial path that avoids
          obstacles. Make sure to review the optimized path before applying it.
        </div>
      </details>

      {#if !isRunning && optimizedLines === null}
        <details
          class="space-y-2 text-sm text-neutral-600 dark:text-neutral-400 group"
        >
          <summary
            class="flex justify-between items-center cursor-pointer list-none appearance-none [&::-webkit-details-marker]:hidden"
          >
            <div class="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="size-3 transition-transform group-open:rotate-90 text-neutral-500 dark:text-neutral-400"
              >
                <path
                  d="M6.3 2.841A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.269l9.344-5.89a1.5 1.5 0 0 0 0-2.538L6.3 2.84z"
                />
              </svg>
              <span
                class="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                >Paths to Optimize</span
              >
            </div>
            <div class="flex gap-2 items-center">
              <button
                on:click|preventDefault|stopPropagation={selectAll}
                class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >All</button
              >
              <button
                on:click|preventDefault|stopPropagation={deselectAll}
                class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >None</button
              >
            </div>
          </summary>
          <div
            class="max-h-32 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-900 p-2 space-y-1 mt-2"
          >
            {#each lines as line, i (line.id || i)}
              {@const id = line.id || `idx-${i}`}
              <label
                class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded px-1 py-0.5"
              >
                <input
                  type="checkbox"
                  checked={selectionState[id]}
                  on:change={() => toggleSelection(id)}
                  class="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                />
                <span class="truncate flex-1"
                  >{line.name || `Path ${i + 1}`}</span
                >
                {#if line.locked}
                  <LockIcon className="size-3 text-yellow-500" />
                {/if}
              </label>
            {/each}
            {#if lines.length === 0}
              <div class="text-xs text-neutral-400 italic text-center py-2">
                No paths available
              </div>
            {/if}
          </div>
        </details>
      {/if}

      {#if isRunning || optimizedLines !== null}
        <div
          class="flex items-center justify-between bg-neutral-100 dark:bg-neutral-800 p-3 rounded-md text-sm font-mono"
        >
          <span class="text-neutral-600 dark:text-neutral-400"
            >Gen {progress}</span
          >
          <span class="font-medium text-blue-600 dark:text-blue-400">
            {#if optimizationFailed}
              No valid path
            {:else}
              {currentBestTime > 1000
                ? "Validating..."
                : currentBestTime > 0
                  ? formatTime(currentBestTime)
                  : "--"}
            {/if}
          </span>
        </div>
      {/if}

      {#if !isRunning && !optimizationFailed}
        <div class="flex gap-2 my-2">
          <button
            on:click={togglePreview}
            class="px-3 py-1 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-200 rounded text-xs font-medium transition-colors"
          >
            {showPreview ? "Hide Preview" : "Show Preview"}
          </button>
        </div>
      {/if}

      {#if optimizationFailed}
        <div
          class="mt-2 rounded-md bg-yellow-50 border-l-4 border-yellow-400 p-3 text-sm text-yellow-800"
        >
          ⚠️ <strong>No valid path found.</strong> The optimizer finished but the
          best candidates still collide with obstacles. Try creating an initial path
          that avoids obstacles to guide the optimizer.
        </div>
      {/if}

      {#if isRunning}
        <div class="flex gap-2">
          <button
            disabled
            class="flex-1 px-4 py-2 bg-neutral-400 text-white rounded-md text-sm font-medium cursor-not-allowed flex items-center justify-center gap-2"
          >
            <SpinnerIcon className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
            Optimizing...
          </button>
          <button
            on:click={stopOptimization}
            class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
            disabled={isStopping}
          >
            {isStopping ? "Stopping..." : "Stop"}
          </button>
        </div>
      {:else if optimizedLines !== null}
        {#if optimizationFailed}
          <div class="flex gap-2">
            <button
              on:click={handleClose}
              class="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-200 rounded-md text-sm font-medium transition-colors"
            >
              Discard
            </button>
            <button
              on:click={startOptimization}
              class="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium transition-colors"
              disabled={isRunning}
              title={isRunning
                ? "Optimization already running"
                : "Retry optimization with current path"}
            >
              Retry Optimization
            </button>
          </div>
        {:else}
          <div class="flex gap-2">
            <button
              on:click={handleClose}
              class="flex-1 px-4 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-200 rounded-md text-sm font-medium transition-colors"
            >
              Discard
            </button>
            <button
              on:click={handleApply}
              class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors"
            >
              Apply New Path
            </button>
          </div>
        {/if}
      {:else}
        <button
          on:click={startOptimization}
          class="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            viewBox="0 0 24 24"
            class="size-4"
          >
            <path
              fill-rule="evenodd"
              d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
              clip-rule="evenodd"
            />
          </svg>
          Start Optimization
        </button>
      {/if}
    </div>
  {/if}
</div>
```
