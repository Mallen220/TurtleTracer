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
</script>

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
  class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-20 sm:w-28"
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
  <div class="flex items-center gap-1">
    <label
      class="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400"
    >
      Start:
      <input
        class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-20 sm:w-28 text-black dark:text-white"
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
    </label>
    <label
      class="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400 ml-1"
    >
      End:
      <input
        class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-20 sm:w-28 text-black dark:text-white"
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
    </label>
  </div>
{:else if endPoint.heading === "constant"}
  <div class="flex items-center gap-1">
    <label
      class="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400"
    >
      Deg:
      <input
        class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-20 sm:w-28 text-black dark:text-white"
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
    </label>
  </div>
{:else if endPoint.heading === "tangential"}
  <label class="flex items-center gap-2 cursor-pointer">
    <span class="text-sm font-extralight select-none">Reverse:</span>
    <input
      type="checkbox"
      bind:checked={endPoint.reverse}
      on:change={() => dispatch("change")}
      on:blur={() => dispatch("commit")}
      title="Reverse the direction the robot faces along the tangential path"
      disabled={locked}
      {tabindex}
    />
  </label>
{/if}
