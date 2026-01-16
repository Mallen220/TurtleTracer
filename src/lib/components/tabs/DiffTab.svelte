<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { diffResult } from "../../diffStore";

  $: result = $diffResult;

  function formatNum(n: number) {
    return n.toFixed(2);
  }

  function formatDiff(n: number) {
    return (n > 0 ? "+" : "") + n.toFixed(2);
  }
</script>

<div class="p-4 space-y-6 w-full">
  {#if result}
    <!-- Stats Section -->
    <div class="space-y-3">
      <h3 class="text-lg font-semibold dark:text-white border-b border-neutral-200 dark:border-neutral-700 pb-1">Statistics</h3>

      <div class="grid grid-cols-3 gap-4 text-sm">
        <div class="font-medium text-neutral-500 dark:text-neutral-400">Metric</div>
        <div class="font-medium text-neutral-500 dark:text-neutral-400 text-right">Change</div>
        <div class="font-medium text-neutral-500 dark:text-neutral-400 text-right">New Value</div>

        <!-- Time -->
        <div class="text-neutral-800 dark:text-neutral-200">Total Time</div>
        <div class="text-right {result.statsDiff.time.diff > 0 ? 'text-red-500' : result.statsDiff.time.diff < 0 ? 'text-green-500' : 'text-neutral-500'}">
          {formatDiff(result.statsDiff.time.diff)}s
        </div>
        <div class="text-right text-neutral-800 dark:text-neutral-200">
          {formatNum(result.statsDiff.time.new)}s
        </div>

        <!-- Distance -->
        <div class="text-neutral-800 dark:text-neutral-200">Total Distance</div>
        <div class="text-right {result.statsDiff.distance.diff > 0 ? 'text-neutral-500' : result.statsDiff.distance.diff < 0 ? 'text-neutral-500' : 'text-neutral-500'}">
          {formatDiff(result.statsDiff.distance.diff)}"
        </div>
        <div class="text-right text-neutral-800 dark:text-neutral-200">
          {formatNum(result.statsDiff.distance.new)}"
        </div>
      </div>
    </div>

    <!-- Events Section -->
    <div class="space-y-3">
      <h3 class="text-lg font-semibold dark:text-white border-b border-neutral-200 dark:border-neutral-700 pb-1">Events</h3>

      {#if result.eventDiff.added.length === 0 && result.eventDiff.removed.length === 0 && result.eventDiff.changed.length === 0}
        <p class="text-neutral-500 dark:text-neutral-400 italic">No event changes detected.</p>
      {:else}
        <div class="space-y-2 text-sm">
          {#each result.eventDiff.added as item}
            <div class="flex items-start gap-2">
              <span class="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold uppercase mt-0.5">Added</span>
              <span class="text-neutral-700 dark:text-neutral-300">{item}</span>
            </div>
          {/each}

          {#each result.eventDiff.removed as item}
            <div class="flex items-start gap-2">
              <span class="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold uppercase mt-0.5">Removed</span>
              <span class="text-neutral-700 dark:text-neutral-300">{item}</span>
            </div>
          {/each}

          {#each result.eventDiff.changed as item}
            <div class="flex items-start gap-2">
              <span class="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold uppercase mt-0.5">Changed</span>
              <span class="text-neutral-700 dark:text-neutral-300">{item}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <div class="flex justify-center items-center py-8">
       <p class="text-neutral-400">Loading diff...</p>
    </div>
  {/if}
</div>
