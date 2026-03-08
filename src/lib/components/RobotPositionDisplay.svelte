<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { BasePoint, Settings } from "../../types/index";
  import { getShortcutFromSettings } from "../../utils";

  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let settings: Settings;
  // x and y scales are no longer needed as robotXY is now in inches
  // export let x: d3.ScaleLinear<number, number, number>;
  // export let y: d3.ScaleLinear<number, number, number>;
  export let onToggleOptimization: (() => void) | null = null;
  export let onValidate: (() => void) | null = null;
</script>

<div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
  <div class="font-semibold">Current Robot Position</div>
  <div class="flex flex-row justify-between items-center w-full">
    <div class="flex flex-row justify-start items-center gap-2">
      <div class="font-extralight">X:</div>
      <div class="w-16">{robotXY.x.toFixed(3)}</div>
      <div class="font-extralight">Y:</div>
      <div class="w-16">{robotXY.y.toFixed(3)}</div>
      <div class="font-extralight">Heading:</div>
      <div>
        {robotHeading.toFixed(0) === "-0" ? "0" : -robotHeading.toFixed(0)}&deg;
      </div>
    </div>

    <div class="flex items-center gap-2">
      <button
        title={`Validate Path${getShortcutFromSettings(settings, "validate-path")}`}
        on:click={() => onValidate && onValidate()}
        class="flex flex-row items-center gap-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-blue-500"
      >
        <span>Validate</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      </button>
      <button
        title={`Optimize Path${getShortcutFromSettings(settings, "optimize-start")}`}
        on:click={() => onToggleOptimization && onToggleOptimization()}
        class="flex flex-row items-center gap-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-purple-500"
      >
        <span>Optimize</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
          />
        </svg>
      </button>
    </div>
  </div>
</div>
