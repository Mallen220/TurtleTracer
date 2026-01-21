<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
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
  import {
    PathOptimizer,
    type OptimizationResult,
  } from "../../../utils/pathOptimizer";
  import { formatTime } from "../../../utils"; // Assuming formatTime is exported from index or timeCalculator

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
  let logs: string[] = [];
  export let optimizedLines: Line[] | null = null;
  let showPreview = true;
  // True if optimizer finished but best candidate still has collision penalty
  export let optimizationFailed = false;

  // Runtime optimizer instance (allows us to request stop)
  let optimizer: PathOptimizer | null = null;
  let isStopping = false;

  export async function startOptimization() {
    isRunning = true;
    progress = 0;
    logs = [];
    optimizationFailed = false;
    isStopping = false;

    if (settings) {
      optimizer = new PathOptimizer(
        startPoint,
        lines,
        settings,
        sequence,
        shapes,
      );
    } else {
      logs = [...logs, "Error: Settings not loaded."];
      isRunning = false;
      return;
    }

    logs = [...logs, "Initializing population..."];

    if (!optimizer) {
      logs = [...logs, "Error: Optimizer initialization failed."];
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
          logs = [
            ...logs,
            `Gen ${result.generation}: Best Time ${timeDisplay}`,
          ];
          // Auto-scroll logs
          const logContainer = document.getElementById("opt-logs");
          if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
        }
      },
    );

    optimizedLines = optimizationResult.lines;
    const finalBestTime = optimizationResult.bestTime;
    const wasStopped = optimizationResult.stopped ?? false;

    if (wasStopped) {
      logs = [...logs, "Optimization stopped by user."];
    }

    // If bestTime is still in penalty range (>=10000), treat as failure to find collision-free path
    optimizationFailed = finalBestTime >= 10000;
    if (optimizationFailed) {
      logs = [
        ...logs,
        "Warning: No collision-free path was found. You can help the optimizer by creating an initial path that avoids obstacles before running optimization.",
      ];
    }

    logs = [...logs, "Optimization Complete!"];
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
      logs = [];
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
    logs = [];
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
    logs = [...logs, "Stop requested — finishing current generation..."];
    optimizer.stop();
  }

  export function togglePreview() {
    showPreview = !showPreview;
    if (onPreviewChange) {
      onPreviewChange(showPreview ? optimizedLines : null);
    }
  }
</script>

<!-- Only embedded panel version -->
<div class="w-full space-y-4">
  <div class="flex justify-between items-center">
    <h3 class="text-base font-semibold text-neutral-900 dark:text-white">
      Path Optimizer
    </h3>
    <button
      on:click={handleClose}
      disabled={isRunning}
      class="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Close optimization panel"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M6 18 18 6M6 6l12 12"
        />
      </svg>
    </button>
  </div>

  <p class="text-sm text-neutral-600 dark:text-neutral-400">
    The optimizer uses a genetic algorithm to adjust control points to minimize
    total travel time. Locking paths and adjusting settings can help guide the
    optimization process. Additionally, obstacles on the field will be
    considered to avoid collisions. You can help the optimization process by
    creating an initial path that avoids obstacles. Make sure to review the
    optimized path before applying it.
  </p>

  <div
    class="flex items-center justify-between bg-neutral-100 dark:bg-neutral-800 p-3 rounded-md"
  >
    <span class="text-sm font-medium">Current Best Time:</span>
    <span class="text-lg font-bold text-blue-600 dark:text-blue-400">
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

  {#if !isRunning}
    <div class="flex gap-2 my-2">
      <button
        on:click={togglePreview}
        class="px-3 py-1 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-200 rounded text-xs font-medium transition-colors"
      >
        {showPreview ? "Hide Preview" : "Show Preview"}
      </button>
    </div>
  {/if}

  <div
    id="opt-logs"
    class="bg-neutral-100 dark:bg-neutral-800 rounded-md p-3 h-32 overflow-y-auto font-mono text-xs text-neutral-700 dark:text-neutral-300 space-y-1"
  >
    {#each logs as log (log)}
      <div>{log}</div>
    {/each}
  </div>

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
