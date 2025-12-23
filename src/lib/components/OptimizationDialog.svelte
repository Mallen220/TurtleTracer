<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import type { Line, Point, SequenceItem, Settings } from "../../types";
  import {
    PathOptimizer,
    type OptimizationResult,
  } from "../../utils/pathOptimizer";
  import { formatTime } from "../../utils"; // Assuming formatTime is exported from index or timeCalculator

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let settings: Settings;
  export let sequence: SequenceItem[];
  export let onApply: (newLines: Line[]) => void;
  export let onPreviewChange: ((lines: Line[] | null) => void) | null = null;

  let isRunning = false;
  let progress = 0;
  let currentBestTime = 0;
  let logs: string[] = [];
  let optimizedLines: Line[] | null = null;
  let showPreview = false;

  async function startOptimization() {
    isRunning = true;
    progress = 0;
    logs = [];

    const optimizer = new PathOptimizer(startPoint, lines, settings, sequence);

    logs = [...logs, "Initializing population..."];

    optimizedLines = await optimizer.optimize((result: OptimizationResult) => {
      progress = result.generation;
      currentBestTime = result.bestTime;
      // Log every 10 generations to avoid clutter
      if (result.generation % 10 === 0 || result.generation === 1) {
        logs = [
          ...logs,
          `Gen ${result.generation}: Best Time ${formatTime(result.bestTime)}`,
        ];
        // Auto-scroll logs
        const logContainer = document.getElementById("opt-logs");
        if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
      }
    });

    logs = [...logs, "Optimization Complete!"];
    isRunning = false;
  }

  function handleApply() {
    if (optimizedLines) {
      onApply(optimizedLines);
      isOpen = false;
    }
  }

  function handleClose() {
    if (isRunning) return; // Prevent closing while running
    isOpen = false;
    logs = [];
    progress = 0;
    optimizedLines = null;
    showPreview = false;
    if (onPreviewChange) onPreviewChange(null);
  }

  function togglePreview() {
    showPreview = !showPreview;
    if (onPreviewChange) {
      onPreviewChange(showPreview ? optimizedLines : null);
    }
  }
</script>

{#if isOpen}
  <div
    transition:fade={{ duration: 200 }}
    class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
  >
    <div
      transition:fly={{ y: 20, duration: 300, easing: cubicInOut }}
      class="w-full max-w-md bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden flex flex-col max-h-[80vh]"
    >
      <div
        class="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center"
      >
        <h2 class="text-lg font-semibold text-neutral-900 dark:text-white">
          Path Optimizer
        </h2>
        {#if !isRunning}
          <button
            on:click={handleClose}
            class="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        {/if}
      </div>

      <div class="p-6 space-y-4 flex-1 overflow-y-auto">
        <p class="text-sm text-neutral-600 dark:text-neutral-400">
          The optimizer uses a genetic algorithm to adjust control points to
          minimize total travel time.
        </p>

        <div
          class="flex items-center justify-between bg-neutral-100 dark:bg-neutral-800 p-3 rounded-md"
        >
          <span class="text-sm font-medium">Current Best Time:</span>
          <span class="text-lg font-bold text-blue-600 dark:text-blue-400">
            {currentBestTime > 0 ? formatTime(currentBestTime) : "--"}
          </span>
        </div>

        <div
          class="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2.5"
        >
          <div
            class="bg-blue-600 h-2.5 rounded-full transition-all duration-75"
            style="width: {progress}%"
          ></div>
        </div>
        <div class="text-xs text-center text-neutral-500">
          {progress} / 100 Generations
        </div>

        <div
          id="opt-logs"
          class="h-40 bg-neutral-50 dark:bg-black/20 rounded-md p-2 overflow-y-auto font-mono text-xs space-y-1 border border-neutral-200 dark:border-neutral-700"
        >
          {#each logs as log}
            <div class="text-neutral-600 dark:text-neutral-400">{log}</div>
          {/each}
        </div>

        {#if !isRunning && optimizedLines}
          <div
            class="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-200 dark:border-blue-800"
          >
            <button
              on:click={togglePreview}
              class="flex items-center gap-2 flex-1 text-sm text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4 transition-transform"
                class:rotate-90={showPreview}
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m8.25 4.5 7.5 7.5-7.5 7.5"
                />
              </svg>
              <span class="font-medium"
                >{showPreview ? "Hide" : "Show"} Preview</span
              >
            </button>
          </div>
        {/if}
      </div>

      <div
        class="px-6 py-4 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-200 dark:border-neutral-700 flex justify-end gap-3"
      >
        {#if !isRunning && !optimizedLines}
          <button
            on:click={startOptimization}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
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
        {:else if isRunning}
          <button
            disabled
            class="px-4 py-2 bg-neutral-400 text-white rounded-md text-sm font-medium cursor-not-allowed flex items-center gap-2"
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
        {:else}
          <button
            on:click={handleClose}
            class="px-4 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-200 rounded-md text-sm font-medium transition-colors"
          >
            Discard
          </button>
          <button
            on:click={handleApply}
            class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            Apply New Path
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
