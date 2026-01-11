<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import TrashIcon from "./icons/TrashIcon.svelte";
  import type { Line } from "../../types";

  export let line: Line;
  export let lineIdx: number;
  export let collapsed: boolean;

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  function addEventMarker() {
    if (!line.eventMarkers) {
      line.eventMarkers = [];
    }
    line.eventMarkers.push({
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Event_${lineIdx + 1}_${line.eventMarkers.length + 1}`,
      position: 0.5,
      lineIndex: lineIdx,
    });
    line = { ...line }; // Force reactivity
  }

  function removeEventMarker(eventIdx: number) {
    if (line.eventMarkers) {
      line.eventMarkers.splice(eventIdx, 1);
      line = { ...line };
    }
  }

  function handleInput(e: Event, event: any) {
    const target = e.target as HTMLInputElement;
    const value = parseFloat(target.value);
    if (!isNaN(value)) {
      event.position = value;
      line.eventMarkers = [...line.eventMarkers!];
    }
  }

  function handleBlur(e: Event, event: any) {
    const target = e.target as HTMLInputElement;
    const value = parseFloat(target.value);
    if (isNaN(value) || value < 0 || value > 1) {
      // Invalid - revert to current value
      target.value = event.position.toString();
      return;
    }
    // Valid - update
    event.position = value;
    line.eventMarkers = [...line.eventMarkers!];
  }

  function handleKeydown(e: KeyboardEvent, event: any) {
    if (e.key === "Enter") {
      const target = e.target as HTMLInputElement;
      const value = parseFloat(target.value);
      if (isNaN(value) || value < 0 || value > 1) {
        // Invalid - revert
        target.value = event.position.toString();
        e.preventDefault();
        return;
      }
      // Valid - update
      event.position = value;
      line.eventMarkers = [...line.eventMarkers!];
      target.blur(); // Trigger blur to update
    }
  }
</script>

<div class="flex flex-col w-full justify-start items-start mt-2">
  <div class="flex items-center justify-between w-full">
    <button
      on:click={toggleCollapsed}
      class="flex items-center gap-2 font-light hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-sm"
      title="{collapsed ? 'Show' : 'Hide'} event markers"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-3 transition-transform {collapsed
          ? 'rotate-0'
          : 'rotate-90'}"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m8.25 4.5 7.5 7.5-7.5 7.5"
        />
      </svg>
      Event Markers ({line.eventMarkers?.length || 0})
    </button>
    <button
      on:click={addEventMarker}
      class="text-sm text-purple-500 hover:text-purple-600 flex items-center gap-1 px-2 py-1"
      title="Add Event Marker"
      disabled={line.locked}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-4"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
      Add Marker
    </button>
  </div>

  {#if !collapsed && line.eventMarkers && line.eventMarkers.length > 0}
    <div class="w-full mt-2 space-y-2">
      {#each line.eventMarkers as event, eventIdx}
        <div
          class="flex flex-col p-2 border border-purple-300 dark:border-purple-700 rounded-md bg-purple-50 dark:bg-purple-900/20"
        >
          <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div class="flex items-center gap-2 flex-1 min-w-[150px]">
              <div class="w-3 h-3 rounded-full bg-purple-500 shrink-0"></div>
              <input
                bind:value={event.name}
                class="pl-1.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm w-full min-w-[100px]"
                placeholder="Event name"
                aria-label="Event name"
                disabled={line.locked}
                on:change={() => {
                  // Update the array to trigger reactivity
                  if (line.eventMarkers)
                    line.eventMarkers = [...line.eventMarkers];
                }}
              />
            </div>
            <!-- Event delete Button -->

            <button
              on:click={() => removeEventMarker(eventIdx)}
              class="text-red-500 hover:text-red-600 ml-auto"
              title="Remove Event Marker"
              aria-label="Remove Event Marker"
              disabled={line.locked}
            >
              <TrashIcon className="size-4" strokeWidth={2} />
            </button>
          </div>

          <!-- Position Slider and text -->
          <div class="flex items-center gap-2 flex-wrap w-full">
            <span class="text-xs text-neutral-600 dark:text-neutral-400"
              >Position:</span
            >
            <div class="flex flex-1 items-center gap-2 min-w-[200px]">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={event.position}
                class="flex-1 slider"
                aria-label="Event position"
                data-event-marker-slider
                disabled={line.locked}
                on:dragstart|preventDefault|stopPropagation
                on:input={(e) => handleInput(e, event)}
              />
              <input
                type="number"
                value={event.position}
                aria-label="Event position value"
                disabled={line.locked}
                min="0"
                max="1"
                step="0.01"
                class="w-16 px-2 py-1 text-xs rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                on:input={(e) => {
                  // Don't update immediately, just show the typed value
                  // We'll validate on blur or Enter
                }}
                on:blur={(e) => handleBlur(e, event)}
                on:keydown={(e) => handleKeydown(e, event)}
              />
            </div>
          </div>

          <div class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Line {lineIdx + 1}, Position: {event.position.toFixed(2)}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
