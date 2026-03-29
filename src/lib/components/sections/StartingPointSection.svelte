<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { Point, Settings } from "../../../types/index";
  import { selectedPointId, focusRequest } from "../../../stores";
  import { linesStore } from "../../../lib/projectStore";
  import { getShortcutFromSettings } from "../../../utils";
  import {
    toField,
    toUser,
    formatDisplayCoordinate,
    cmToInch,
  } from "../../../utils/coordinates";
  import HeadingControls from "../HeadingControls.svelte";

  export let startPoint: Point;
  export let settings: Settings;
  export let addPathAtStart: () => void;
  export let addWaitAtStart: () => void;
  export let addRotateAtStart: () => void;
  import CollapseAllButton from "../tools/CollapseAllButton.svelte";
  import { tick } from "svelte";
  import LockIcon from "../icons/LockIcon.svelte";
  import MapPinIcon from "../icons/MapPinIcon.svelte";
  import PlusIcon from "../icons/PlusIcon.svelte";
  import UnlockIcon from "../icons/UnlockIcon.svelte";

  export let toggleCollapseAll: () => void;
  export let allCollapsed: boolean;

  let xInput: HTMLInputElement;
  let yInput: HTMLInputElement;
  let headingControls: HeadingControls;

  $: lines = $linesStore;

  // Subscribe to focus requests
  $: if ($focusRequest) {
    if ($selectedPointId === "point-0-0") {
      if ($focusRequest.field === "x" && xInput) xInput.focus();
      if ($focusRequest.field === "y" && yInput) yInput.focus();
      if ($focusRequest.field === "heading" && headingControls)
        headingControls.focus();
    }
  }
</script>

<div
  class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-4 space-y-4"
>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <div class="bg-neutral-100 dark:bg-neutral-700 p-1.5 rounded-lg">
        <MapPinIcon className="size-4 text-neutral-500 dark:text-neutral-400" />
      </div>
      <span class="text-sm font-bold text-neutral-700 dark:text-neutral-200"
        >STARTING POINT</span
      >
      <button
        title={startPoint.locked
          ? "Unlock Starting Point"
          : "Lock Starting Point"}
        aria-label={startPoint.locked
          ? "Unlock Starting Point"
          : "Lock Starting Point"}
        on:click|stopPropagation={() => {
          startPoint.locked = !startPoint.locked;
          startPoint = { ...startPoint };
        }}
        class="ml-1 p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        {#if startPoint.locked}
          <LockIcon className="size-4 text-amber-500" />
        {:else}
          <UnlockIcon className="size-4 text-neutral-400" strokeWidth={2} />
        {/if}
      </button>
    </div>
    <CollapseAllButton {allCollapsed} onToggle={toggleCollapseAll} />
  </div>

  <div class="flex items-end gap-3">
    <!-- Position Inputs -->
    <div class="flex items-center gap-2 flex-1 flex-wrap">
      <div class="relative flex-1 min-w-[5rem]">
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400 select-none"
          >X</span
        >
        <input
          bind:this={xInput}
          value={formatDisplayCoordinate(
            toUser(startPoint, settings?.coordinateSystem || "Pedro").x,
            settings,
          )}
          on:change={(e) => {
            let val = parseFloat(e.currentTarget.value);
            if (!isNaN(val)) {
              if (settings?.visualizerUnits === "metric") val = cmToInch(val);
              const newPt = toField(
                {
                  x: val,
                  y: toUser(startPoint, settings?.coordinateSystem || "Pedro")
                    .y,
                },
                settings?.coordinateSystem || "Pedro",
              );
              startPoint.x = newPt.x;
            }
          }}
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
      <div class="relative flex-1 min-w-[5rem]">
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400 select-none"
          >Y</span
        >
        <input
          bind:this={yInput}
          value={formatDisplayCoordinate(
            toUser(startPoint, settings?.coordinateSystem || "Pedro").y,
            settings,
          )}
          on:change={(e) => {
            let val = parseFloat(e.currentTarget.value);
            if (!isNaN(val)) {
              if (settings?.visualizerUnits === "metric") val = cmToInch(val);
              const newPt = toField(
                {
                  x: toUser(startPoint, settings?.coordinateSystem || "Pedro")
                    .x,
                  y: val,
                },
                settings?.coordinateSystem || "Pedro",
              );
              startPoint.y = newPt.y;
            }
          }}
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

  {#if lines.length === 0}
    <div class="space-y-2">
      <span
        class="text-xs font-semibold text-neutral-500 uppercase tracking-wide block"
      >
        Initial Heading
      </span>
      <HeadingControls
        bind:this={headingControls}
        endPoint={startPoint}
        locked={startPoint.locked}
        on:change={() => (startPoint = { ...startPoint })}
        on:commit={() => (startPoint = { ...startPoint })}
      />
    </div>
  {/if}

  <div
    class="flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-700/50 flex-wrap"
  >
    <span class="text-xs font-medium text-neutral-400 mr-auto"
      >After first step:</span
    >
    <button
      on:click={addPathAtStart}
      aria-label="Add Path after start"
      title={`Add Path${getShortcutFromSettings(settings, "add-path-start")}`}
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors border border-green-200 dark:border-green-800/30 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 dark:focus:ring-offset-neutral-900"
    >
      <PlusIcon className="size-3" strokeWidth={2} />
      Path
    </button>
    <button
      on:click={addWaitAtStart}
      aria-label="Add Wait after start"
      title={`Add Wait${getShortcutFromSettings(settings, "add-wait-start")}`}
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors border border-amber-200 dark:border-amber-800/30 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 dark:focus:ring-offset-neutral-900"
    >
      <PlusIcon className="size-3" strokeWidth={2} />
      Wait
    </button>
    <button
      on:click={addRotateAtStart}
      aria-label="Add Rotate after start"
      title={`Add Rotate${getShortcutFromSettings(settings, "add-rotate-start")}`}
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/30 transition-colors border border-pink-200 dark:border-pink-800/30 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-1 dark:focus:ring-offset-neutral-900"
    >
      <PlusIcon className="size-3" strokeWidth={2} />
      Rotate
    </button>
  </div>
</div>
