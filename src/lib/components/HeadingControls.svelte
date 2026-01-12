<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  export let endPoint: any;
  export let locked: boolean = false;
  export let tabindex: number | undefined = undefined;
  const dispatch = createEventDispatcher();

  // Helper to handle constant heading input safely
  function handleConstantInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = parseFloat(target.value);
    if (!isNaN(value)) {
      endPoint.degrees = value;
    }
    dispatch("change");
  }

  function handleConstantBlur(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.value === "" || isNaN(parseFloat(target.value))) {
      endPoint.degrees = 0;
      target.value = "0";
    }
    dispatch("commit");
  }

  let constantInput: HTMLInputElement;
  let startInput: HTMLInputElement;
  let endInput: HTMLInputElement;
  let reverseInput: HTMLInputElement;

  export function focus() {
    if (endPoint.heading === "constant" && constantInput) constantInput.focus();
    else if (endPoint.heading === "linear" && startInput) startInput.focus();
    else if (endPoint.heading === "tangential" && reverseInput)
      reverseInput.focus();
  }
</script>

<div class="flex gap-2 w-full">
  <select
    aria-label="Heading style"
    bind:value={endPoint.heading}
    on:change={() => {
      // Notify parent that a change occurred and commit it so timeline and
      // playback recalculate immediately.
      // Also ensure required numeric fields exist when switching types so
      // calculateRobotState doesn't encounter undefined values.
      if (endPoint.heading === "linear") {
        // Initialize linear-specific fields if missing
        if (typeof endPoint.startDeg !== "number")
          endPoint.startDeg = endPoint.degrees ?? 0;
        if (typeof endPoint.endDeg !== "number")
          endPoint.endDeg = endPoint.degrees ?? 0;
      } else if (endPoint.heading === "constant") {
        // Ensure constant degree exists (prefer endDeg/startDeg if present)
        if (typeof endPoint.degrees !== "number") {
          endPoint.degrees = endPoint.endDeg ?? endPoint.startDeg ?? 0;
        }
      }

      dispatch("change");
      dispatch("commit");
    }}
    class="w-full pl-3 pr-8 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all flex-1"
    title="The heading style of the robot.
  With constant heading, the robot maintains the same heading throughout the line.
  With linear heading, heading changes linearly between given start and end angles.
  With tangential heading, the heading follows the direction of the line."
    disabled={locked}
    {tabindex}
  >
    <option value="constant">Constant</option>
    <option value="linear">Linear</option>
    <option value="tangential">Tangential</option>
  </select>

  {#if endPoint.heading === "linear"}
    <div class="flex items-center gap-2 flex-[2]">
      <div class="relative flex-1">
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400 select-none uppercase tracking-wider"
          >Start</span
        >
        <input
          bind:this={startInput}
          class="w-full pl-12 pr-1 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          step="1"
          type="number"
          min="-180"
          max="180"
          bind:value={endPoint.startDeg}
          on:input={() => dispatch("change")}
          on:blur={() => dispatch("commit")}
          title="The heading the robot starts this line at (in degrees)"
          disabled={locked}
          {tabindex}
        />
      </div>
      <div class="relative flex-1">
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400 select-none uppercase tracking-wider"
          >End</span
        >
        <input
          bind:this={endInput}
          class="w-full pl-8 pr-1 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          step="1"
          type="number"
          min="-180"
          max="180"
          bind:value={endPoint.endDeg}
          on:input={() => dispatch("change")}
          on:blur={() => dispatch("commit")}
          title="The heading the robot ends this line at (in degrees)"
          disabled={locked}
          {tabindex}
        />
      </div>
    </div>
  {:else if endPoint.heading === "constant"}
    <div class="flex items-center gap-2 flex-[2]">
      <div class="relative flex-1">
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400 select-none"
          >°</span
        >
        <input
          bind:this={constantInput}
          class="w-full pl-6 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          step="1"
          type="number"
          min="-180"
          max="180"
          value={endPoint.degrees || 0}
          on:input={handleConstantInput}
          on:blur={handleConstantBlur}
          title="The constant heading the robot maintains throughout this line (in degrees)"
          disabled={locked}
          {tabindex}
        />
      </div>
    </div>
  {:else if endPoint.heading === "tangential"}
    <div
      class="flex items-center gap-2 flex-[2] bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 min-w-0"
    >
      <label
        class="flex items-center gap-2 cursor-pointer w-full h-full py-1.5 overflow-hidden"
      >
        <input
          bind:this={reverseInput}
          type="checkbox"
          bind:checked={endPoint.reverse}
          on:change={() => dispatch("change")}
          on:blur={() => dispatch("commit")}
          title="Reverse the direction the robot faces along the tangential path"
          disabled={locked}
          {tabindex}
          class="rounded text-purple-600 focus:ring-purple-500 flex-none"
        />
        <span
          class="text-sm text-neutral-600 dark:text-neutral-400 select-none truncate"
          >Reverse</span
        >
      </label>
    </div>
  {/if}
</div>
