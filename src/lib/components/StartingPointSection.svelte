<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type { Point } from "../../types";
  import { selectedPointId, focusRequest } from "../../stores";
  export let startPoint: Point;
  export let addPathAtStart: () => void;
  export let addWaitAtStart: () => void;
  export let addRotateAtStart: () => void;
  import CollapseAllButton from "./CollapseAllButton.svelte";
  import { tick } from "svelte";
  export let toggleCollapseAll: () => void;
  export let allCollapsed: boolean;

  let xInput: HTMLInputElement;
  let yInput: HTMLInputElement;

  // Subscribe to focus requests
  $: if ($focusRequest) {
    if ($selectedPointId === "point-0-0") {
      if ($focusRequest.field === "x" && xInput) xInput.focus();
      if ($focusRequest.field === "y" && yInput) yInput.focus();
    }
  }
</script>

<div
  class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-4 space-y-4"
>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <div class="bg-neutral-100 dark:bg-neutral-700 p-1.5 rounded-lg">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="size-4 text-neutral-500 dark:text-neutral-400"
        >
          <path
            fill-rule="evenodd"
            d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z"
            clip-rule="evenodd"
          />
        </svg>
      </div>
      <span class="text-sm font-bold text-neutral-700 dark:text-neutral-200"
        >STARTING POINT</span
      >
      <button
        title={startPoint.locked
          ? "Unlock Starting Point"
          : "Lock Starting Point"}
        on:click|stopPropagation={() => {
          startPoint.locked = !startPoint.locked;
          startPoint = { ...startPoint };
        }}
        class="ml-1 p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
      >
        {#if startPoint.locked}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="size-4 text-amber-500"
          >
            <path
              fill-rule="evenodd"
              d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
              clip-rule="evenodd"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-4 text-neutral-400"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {/if}
      </button>
    </div>
    <CollapseAllButton {allCollapsed} onToggle={toggleCollapseAll} />
  </div>

  <div class="flex items-end gap-3">
    <!-- Position Inputs -->
    <div class="flex items-center gap-2 flex-1">
      <div class="relative w-24">
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400 select-none"
          >X</span
        >
        <input
          bind:this={xInput}
          bind:value={startPoint.x}
          min="0"
          max="144"
          type="number"
          class="w-full pl-6 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          step="0.1"
          disabled={startPoint.locked}
          aria-label="Starting X position"
          placeholder="0"
        />
      </div>
      <div class="relative w-24">
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400 select-none"
          >Y</span
        >
        <input
          bind:this={yInput}
          bind:value={startPoint.y}
          min="0"
          max="144"
          type="number"
          class="w-full pl-6 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          step="0.1"
          disabled={startPoint.locked}
          aria-label="Starting Y position"
          placeholder="0"
        />
      </div>
    </div>
  </div>

  <div
    class="flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-700/50"
  >
    <span class="text-xs font-medium text-neutral-400 mr-auto"
      >After first step:</span
    >
    <button
      on:click={addPathAtStart}
      aria-label="Add Path after start"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors border border-green-200 dark:border-green-800/30"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="size-3"
      >
        <path
          d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
        />
      </svg>
      Path
    </button>
    <button
      on:click={addWaitAtStart}
      aria-label="Add Wait after start"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors border border-amber-200 dark:border-amber-800/30"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="size-3"
      >
        <path
          d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
        />
      </svg>
      Wait
    </button>
    <button
      on:click={addRotateAtStart}
      aria-label="Add Rotate after start"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/30 transition-colors border border-pink-200 dark:border-pink-800/30"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="size-3"
      >
        <path
          d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
        />
      </svg>
      Rotate
    </button>
  </div>
</div>
