<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { transformAngle } from "../../utils/math";
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

  $: isStartOutOfBounds =
    endPoint.heading === "linear" &&
    (endPoint.startDeg > 180 || endPoint.startDeg <= -180);
  $: isEndOutOfBounds =
    endPoint.heading === "linear" &&
    (endPoint.endDeg > 180 || endPoint.endDeg <= -180);
  $: isConstantOutOfBounds =
    endPoint.heading === "constant" &&
    (endPoint.degrees > 180 || endPoint.degrees <= -180);

  function normalizeStart() {
    endPoint.startDeg = transformAngle(endPoint.startDeg);
    dispatch("change");
    dispatch("commit");
  }

  function normalizeEnd() {
    endPoint.endDeg = transformAngle(endPoint.endDeg);
    dispatch("change");
    dispatch("commit");
  }

  function normalizeConstant() {
    endPoint.degrees = transformAngle(endPoint.degrees);
    dispatch("change");
    dispatch("commit");
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
          class="w-full pl-12 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          class:pr-6={isStartOutOfBounds}
          class:pr-1={!isStartOutOfBounds}
          class:border-yellow-500={isStartOutOfBounds}
          class:dark:border-yellow-500={isStartOutOfBounds}
          step="1"
          type="number"
          bind:value={endPoint.startDeg}
          on:input={() => dispatch("change")}
          on:blur={() => dispatch("commit")}
          title="The heading the robot starts this line at (in degrees)"
          disabled={locked}
          {tabindex}
        />
        {#if isStartOutOfBounds && !locked}
          <button
            on:click={normalizeStart}
            title="Angle is out of bounds. Click to normalize to [-180, 180]."
            class="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="size-3"
            >
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        {/if}
      </div>
      <div class="relative flex-1">
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400 select-none uppercase tracking-wider"
          >End</span
        >
        <input
          bind:this={endInput}
          class="w-full pl-8 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          class:pr-6={isEndOutOfBounds}
          class:pr-1={!isEndOutOfBounds}
          class:border-yellow-500={isEndOutOfBounds}
          class:dark:border-yellow-500={isEndOutOfBounds}
          step="1"
          type="number"
          bind:value={endPoint.endDeg}
          on:input={() => dispatch("change")}
          on:blur={() => dispatch("commit")}
          title="The heading the robot ends this line at (in degrees)"
          disabled={locked}
          {tabindex}
        />
        {#if isEndOutOfBounds && !locked}
          <button
            on:click={normalizeEnd}
            title="Angle is out of bounds. Click to normalize to [-180, 180]."
            class="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="size-3"
            >
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        {/if}
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
          class="w-full pl-6 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          class:pr-6={isConstantOutOfBounds}
          class:pr-2={!isConstantOutOfBounds}
          class:border-yellow-500={isConstantOutOfBounds}
          class:dark:border-yellow-500={isConstantOutOfBounds}
          step="1"
          type="number"
          value={endPoint.degrees || 0}
          on:input={handleConstantInput}
          on:blur={handleConstantBlur}
          title="The constant heading the robot maintains throughout this line (in degrees)"
          disabled={locked}
          {tabindex}
        />
        {#if isConstantOutOfBounds && !locked}
          <button
            on:click={normalizeConstant}
            title="Angle is out of bounds. Click to normalize to [-180, 180]."
            class="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="size-3"
            >
              <path
                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        {/if}
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
