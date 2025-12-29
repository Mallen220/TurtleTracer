<script lang="ts">
  import type { EventMarker, SequenceWaitItem } from "../../types";
  import TrashIcon from "./icons/TrashIcon.svelte";

  export let wait: SequenceWaitItem;
  let collapsed: boolean = false;

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  function addEventMarker() {
    const list = wait.eventMarkers ?? [];
    const newMarker: EventMarker = {
      id: `wait-event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `WaitEvent_${(wait.eventMarkers?.length ?? 0) + 1}`,
      position: 0.5,
      waitId: wait.id,
    };
    wait.eventMarkers = [...list, newMarker];
  }

  function removeEventMarker(eventIdx: number) {
    const list = wait.eventMarkers ?? [];
    if (eventIdx >= 0 && eventIdx < list.length) {
      const next = [...list];
      next.splice(eventIdx, 1);
      wait.eventMarkers = next;
    }
  }

  function handlePositionInput(e: any, evt: EventMarker) {
    const value = parseFloat(e.target?.value);
    if (!isNaN(value)) {
      evt.position = value;
      wait.eventMarkers = [...(wait.eventMarkers ?? [])];
    }
  }

  function handlePositionBlur(e: any, evt: EventMarker) {
    const value = parseFloat(e.target?.value);
    if (isNaN(value) || value < 0 || value > 1) {
      if (e && e.target) e.target.value = String(evt.position);
      return;
    }
    evt.position = value;
    wait.eventMarkers = [...(wait.eventMarkers ?? [])];
  }

  function handlePositionKeydown(e: any, evt: EventMarker) {
    const tgt = e?.target;
    if (e.key === "Enter") {
      const value = parseFloat(tgt?.value);
      if (isNaN(value) || value < 0 || value > 1) {
        if (tgt) tgt.value = String(evt.position);
        e.preventDefault();
        return;
      }
      evt.position = value;
      wait.eventMarkers = [...(wait.eventMarkers ?? [])];
      if (tgt && typeof tgt.blur === "function") tgt.blur();
    }
  }
</script>

<div class="flex flex-col w-full justify-start items-start mt-2">
  <div class="flex items-center justify-between w-full">
    <button
      on:click={toggleCollapsed}
      class="flex items-center gap-2 font-light hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-sm"
      title={(collapsed ? "Show" : "Hide") + " event markers"}
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
      Event Markers ({wait.eventMarkers?.length || 0})
    </button>
    <button
      on:click={addEventMarker}
      class="text-sm text-purple-500 hover:text-purple-600 flex items-center gap-1 px-2 py-1"
      title="Add Event Marker"
      disabled={wait.locked}
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

  {#if !collapsed && wait.eventMarkers && wait.eventMarkers.length > 0}
    <div class="w-full mt-2 space-y-2">
      {#each wait.eventMarkers as event, eventIdx}
        <div
          class="flex flex-col p-2 border border-purple-300 dark:border-purple-700 rounded-md bg-purple-50 dark:bg-purple-900/20"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-purple-500"></div>
              <input
                bind:value={event.name}
                class="pl-1.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm w-36"
                placeholder="Event name"
                disabled={wait.locked}
                on:change={() => {
                  wait.eventMarkers = [...(wait.eventMarkers ?? [])];
                }}
              />
            </div>
            <button
              on:click={() => removeEventMarker(eventIdx)}
              class="text-red-500 hover:text-red-600"
              title="Remove Event Marker"
              disabled={wait.locked}
            >
              <TrashIcon class_="size-4" strokeWidth={2} />
            </button>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-xs text-neutral-600 dark:text-neutral-400"
              >Position:</span
            >
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={event.position}
              class="flex-1 slider"
              data-event-marker-slider
              disabled={wait.locked}
              on:dragstart|preventDefault|stopPropagation
              on:input={(e) => handlePositionInput(e, event)}
            />
            <input
              type="number"
              value={event.position}
              disabled={wait.locked}
              min="0"
              max="1"
              step="0.01"
              class="w-16 px-2 py-1 text-xs rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
              on:blur={(e) => handlePositionBlur(e, event)}
              on:keydown={(e) => handlePositionKeydown(e, event)}
            />
          </div>

          <div class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Wait: {wait.name}, Position: {event.position.toFixed(2)}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
