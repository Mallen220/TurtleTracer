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
  import {
    PathOptimizer,
    type OptimizationResult,
  } from "../../../utils/pathOptimizer";
  import { formatTime } from "../../../utils"; // formatTime exported from utility index
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
  // True if optimizer finished but best candidate still has collision penalty
  export let optimizationFailed = false;
  export let collapsed = false;

  // Selection state for path optimization
  let selectionState: Record<string, boolean> = {};

  // Initialize/Update selection state when lines change
  $: {
    lines.forEach((l, idx) => {
      const id = l.id || `idx-${idx}`;
      if (selectionState[id] === undefined) {
        selectionState[id] = true;
      }
    });
  }

  // Update dimmed lines store whenever selection state changes
  $: {
    // Filter lines where selectionState is false
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
    selectionState = selectionState; // Trigger reactivity
  }

  function selectAll() {
    lines.forEach((l, idx) => {
      const id = l.id || `idx-${idx}`;
      selectionState[id] = true;
    });
    selectionState = selectionState; // Trigger reactivity
  }

  function deselectAll() {
    lines.forEach((l, idx) => {
      const id = l.id || `idx-${idx}`;
      selectionState[id] = false;
    });
    selectionState = selectionState; // Trigger reactivity
  }

  onDestroy(() => {
    dimmedLinesStore.set([]);
  });

  // Runtime optimizer instance (allows us to request stop)
  let optimizer: PathOptimizer | null = null;
  let isStopping = false;

  export async function startOptimization() {
    isRunning = true;
    progress = 0;

    optimizationFailed = false;
    isStopping = false;

    if (settings) {
      // Create a copy of lines where unselected lines are forced to be locked
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
      console.log("Error: Settings not loaded.");
      isRunning = false;
      return;
    }

    console.log("Initializing population...");

    if (!optimizer) {
      console.log("Error: Optimizer initialization failed.");
      isRunning = false;
      return;
    }

    const optimizationResult = await optimizer.optimize(
      (result: OptimizationResult) => {
        progress = result.generation;
        currentBestTime = result.bestTime;
        // Log every 10 generations to avoid clutter
        if (result.generation % 10 === 0 || result.generation === 1) {
          // If time is > 1000, it means it's still validating/colliding
          const timeDisplay =
            result.bestTime > 1000
              ? "Validating..."
              : formatTime(result.bestTime);
          console.log(

            `Gen ${result.generation}: Best Time ${timeDisplay}`,
          );
          // Auto-scroll logs

        }
      },
    );

    optimizedLines = optimizationResult.lines;

    // Restore original locked state for lines that were temporarily locked
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
    const wasStopped = optimizationResult.stopped ?? false;

    if (wasStopped) {
      console.log("Optimization stopped by user.");
    }

    // If bestTime is still in penalty range (>=10000), treat as failure to find collision-free path
    optimizationFailed = finalBestTime >= 10000;
    if (optimizationFailed) {
      console.log(

        "Warning: No collision-free path was found. You can help the optimizer by creating an initial path that avoids obstacles before running optimization.",
      );
    }

    console.log("Optimization Complete!");
    isRunning = false;
    isStopping = false;
    optimizer = null;

    // Automatically show preview of optimized path
    showPreview = true;
    if (onPreviewChange) {
      onPreviewChange(optimizedLines);
    }
  }

  export function handleApply() {
    if (optimizationFailed) return; // Do not allow applying a path if optimizer couldn't find a collision-free candidate
    if (optimizedLines) {
      // Capture and apply optimized lines
      const result = optimizedLines;
      onApply(result);

      // Reset optimizer UI state so subsequent opens show 'Start Optimization'

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
    if (isRunning) return; // Prevent closing while running
    isOpen = false;

    progress = 0;
    optimizedLines = null;
    showPreview = false;
    if (onPreviewChange) onPreviewChange(null);
    if (onClose) onClose();
  }

  export function stopOptimization() {
    if (!optimizer) return;
    // Mark that user requested a stop and ask the optimizer to stop at next opportunity
    isStopping = true;
    console.log("Stop requested — finishing current generation...");
    optimizer.stop();
  }

  export function togglePreview() {
    showPreview = !showPreview;
    if (onPreviewChange) {
      onPreviewChange(showPreview && !optimizationFailed ? optimizedLines : null);
    }
  }

  // Hide preview if optimization failed
  $: if (optimizationFailed && showPreview) {
    showPreview = false;
    if (onPreviewChange) onPreviewChange(null);
  }
</script>

<!-- Only embedded panel version -->
<div class="w-full">
  <SectionHeader
    title="Path Optimizer"
    bind:collapsed
    count={optimizedLines ? 1 : 0}
  >

  </SectionHeader>

  {#if !collapsed}
  <div class="flex flex-col gap-4 mt-4 px-1">
  <details class="text-sm text-neutral-600 dark:text-neutral-400 group">
    <summary
      class="cursor-pointer font-medium hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
      >About Path Optimization</summary
    >
    <div class="mt-2 text-xs leading-relaxed">
      The optimizer uses a genetic algorithm to adjust control points to
      minimize total travel time. Locking paths and adjusting settings can help
      guide the optimization process. Additionally, obstacles on the field will
      be considered to avoid collisions. You can help the optimization process
      by creating an initial path that avoids obstacles. Make sure to review the
      optimized path before applying it.
    </div>
  </details>

  {#if !isRunning && optimizedLines === null}
    <div class="space-y-2">
      <div class="flex justify-between items-center">
        <span
          class="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400"
          >Paths to Optimize</span
        >
        <div class="flex gap-2">
          <button
            on:click={selectAll}
            class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >All</button
          >
          <button
            on:click={deselectAll}
            class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >None</button
          >
        </div>
      </div>
      <div
        class="max-h-32 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-900 p-2 space-y-1"
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
            <span class="truncate flex-1">{line.name || `Path ${i + 1}`}</span>
            {#if line.locked}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                class="size-3 text-yellow-500"
              >
                <title>Path is locked</title>
                <path
                  fill-rule="evenodd"
                  d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                  clip-rule="evenodd"
                />
              </svg>
            {/if}
          </label>
        {/each}
        {#if lines.length === 0}
          <div class="text-xs text-neutral-400 italic text-center py-2">
            No paths available
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if isRunning || optimizedLines !== null}
    <div
      class="flex items-center justify-between bg-neutral-100 dark:bg-neutral-800 p-3 rounded-md text-sm font-mono"
    >
      <span class="text-neutral-600 dark:text-neutral-400">Gen {progress}</span>
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
      ⚠️ <strong>No valid path found.</strong> The optimizer finished but the best
      candidates still collide with obstacles. Try creating an initial path that avoids
      obstacles to guide the optimizer.
    </div>
  {/if}

  {#if isRunning}
    <div class="flex gap-2">
      <button
        disabled
        class="flex-1 px-4 py-2 bg-neutral-400 text-white rounded-md text-sm font-medium cursor-not-allowed flex items-center justify-center gap-2"
      >
        <svg
          class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
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
