<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { formatTime } from "../../utils/timeCalculator";
  import { formatDisplayDistance } from "../../utils/coordinates";
  import { settingsStore } from "../projectStore";

  interface Props {
    visible: boolean;
    x: number;
    y: number;
    velocity: number;
    time: number;
    distance?: number;
  }

  let {
    visible = false,
    x = 0,
    y = 0,
    velocity = 0,
    time = 0,
    distance,
  }: Props = $props();

  let settings = $derived($settingsStore);
</script>

{#if visible}
  <div
    class="absolute pointer-events-none select-none z-[3000] bg-white/95 dark:bg-neutral-800/95 backdrop-blur-sm px-3 py-2  shadow-lg border border-neutral-200 dark:border-neutral-700 transition-opacity duration-150 transform -translate-x-1/2 -translate-y-full mt-[-10px]"
    style="left: {x}px; top: {y}px;"
    role="tooltip"
  >
    <div class="flex flex-col gap-1 text-xs whitespace-nowrap">
      <div class="flex justify-between items-center gap-4">
        <span class="text-neutral-500 dark:text-neutral-400 font-medium"
          >Velocity:</span
        >
        <span class="font-mono text-emerald-600 dark:text-emerald-400 font-bold"
          >{velocity.toFixed(1)} in/s</span
        >
      </div>
      <div class="flex justify-between items-center gap-4">
        <span class="text-neutral-500 dark:text-neutral-400 font-medium"
          >Time:</span
        >
        <span class="font-mono text-neutral-800 dark:text-neutral-200 font-bold"
          >{formatTime(time)}</span
        >
      </div>
      {#if distance !== undefined}
        <div
          class="flex justify-between items-center gap-4 border-t border-neutral-100 dark:border-neutral-700 pt-1 mt-0.5"
        >
          <span class="text-neutral-500 dark:text-neutral-400 font-medium"
            >Distance:</span
          >
          <span
            class="font-mono text-neutral-800 dark:text-neutral-200 font-bold"
            >{formatDisplayDistance(distance, settings, 1)}</span
          >
        </div>
      {/if}
    </div>
  </div>
{/if}
