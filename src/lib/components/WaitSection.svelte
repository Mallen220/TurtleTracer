<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { selectedPointId, selectedLineId } from "../../stores";
  import TrashIcon from "./icons/TrashIcon.svelte";
  import WaitMarkersSection from "./WaitMarkersSection.svelte";
  import type { SequenceWaitItem } from "../../types";

  export let wait: SequenceWaitItem;
  export let idx: number = 0; // Keeping idx for potential future use or consistency

  // Collapsed state
  export let collapsed: boolean = false;
  // Markers collapsed state (for "Collapse All" deep behavior)
  export let collapsedMarkers: boolean = false;

  export let onRemove: () => void;
  export let onInsertAfter: () => void;
  export let onAddPathAfter: () => void;
  export let onMoveUp: () => void;
  export let onMoveDown: () => void;
  export let canMoveUp: boolean = true;
  export let canMoveDown: boolean = true;
  export let recordChange: (() => void) | undefined = undefined;

  // We assume the parent binds to 'wait' or handles updates via object mutation reference.
  // We trigger recordChange on updates.

  $: isSelected = $selectedPointId === `wait-${wait.id}`;

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  function handleNameChange() {
    if (recordChange) recordChange();
  }

  function handleDurationChange(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const val = parseFloat(target.value);
    if (!Number.isNaN(val) && val >= 0) {
      wait.durationMs = val;
    } else {
      wait.durationMs = 0;
    }
    if (recordChange) recordChange();
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  role="button"
  tabindex="0"
  aria-pressed={isSelected}
  class={`flex flex-col w-full justify-start items-start gap-1 ${isSelected ? "border-l-4 border-amber-400 pl-2" : ""}`}
  on:click|stopPropagation={() => {
    if (!wait.locked) {
        selectedPointId.set(`wait-${wait.id}`);
        selectedLineId.set(null);
    }
  }}
  on:keydown|stopPropagation={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!wait.locked) {
        selectedPointId.set(`wait-${wait.id}`);
        selectedLineId.set(null);
      }
    }
  }}
>
  <div
    class="flex flex-row w-full justify-between items-center flex-wrap gap-y-2"
  >
    <div class="flex flex-row items-center gap-2 flex-wrap">
      <!-- Collapse Button & Title -->
      <button
        on:click|stopPropagation={toggleCollapsed}
        class="flex items-center gap-2 font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors"
        title="{collapsed ? 'Expand' : 'Collapse'} wait"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} wait"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-4 transition-transform {collapsed
            ? 'rotate-0'
            : 'rotate-90'}"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>
        Wait
      </button>

      <!-- Name Input -->
      <input
        bind:value={wait.name}
        placeholder="Wait Name"
        class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-semibold min-w-[100px]"
        disabled={wait.locked}
        on:input={() => {
          // Trigger reactivity if needed, usually Svelte handles object prop mutation
        }}
        on:blur={handleNameChange}
        on:click|stopPropagation
      />

      <!-- Lock/Unlock Button -->
      <button
        title={wait.locked ? "Unlock Wait" : "Lock Wait"}
        aria-label={wait.locked ? "Unlock Wait" : "Lock Wait"}
        on:click|stopPropagation={() => {
          wait.locked = !wait.locked;
          if (recordChange) recordChange();
        }}
        class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
      >
        {#if wait.locked}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 stroke-yellow-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 stroke-gray-400"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {/if}
      </button>

      <div class="flex flex-row gap-0.5 ml-1">
        <button
          title={wait.locked ? "Wait locked" : "Move up"}
          aria-label="Move wait up"
          on:click|stopPropagation={() => {
            if (!wait.locked && canMoveUp && onMoveUp) onMoveUp();
          }}
          class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canMoveUp || wait.locked}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m5 15 7-7 7 7"
            />
          </svg>
        </button>
        <button
          title={wait.locked ? "Wait locked" : "Move down"}
          aria-label="Move wait down"
          on:click|stopPropagation={() => {
            if (!wait.locked && canMoveDown && onMoveDown) onMoveDown();
          }}
          class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canMoveDown || wait.locked}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m19 9-7 7-7-7"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="flex flex-row justify-end items-center gap-1 ml-auto">
      <!-- Add Path After Button -->
      <button
        title="Add Path After This Wait"
        aria-label="Add Path After This Wait"
        on:click|stopPropagation={onAddPathAfter}
        class="text-green-500 hover:text-green-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-5"
        >
            <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
            />
        </svg>
      </button>

      <!-- Add Wait After Button -->
      <button
        title="Add Wait After"
        aria-label="Add Wait After"
        on:click|stopPropagation={onInsertAfter}
        class="text-amber-500 hover:text-amber-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-5"
        >
          <circle cx="12" cy="12" r="9" />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 7v5l3 2"
          />
        </svg>
      </button>

      <button
        title="Remove Wait"
        aria-label="Remove Wait"
        class="text-red-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
        on:click|stopPropagation={() => {
          if (!wait.locked && onRemove) onRemove();
        }}
        aria-disabled={wait.locked}
        disabled={wait.locked}
      >
        <TrashIcon className="size-5" strokeWidth={2} />
      </button>
    </div>
  </div>

  {#if !collapsed}
    <div class={`h-[0.75px] w-full bg-amber-400/50 my-1`} />

    <div class="flex flex-col justify-start items-start w-full gap-2 pl-2">
      <!-- Duration Input -->
      <div class="flex items-center gap-2">
        <span class="text-sm font-light">Duration:</span>
        <input
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-24"
          type="number"
          min="0"
          step="50"
          value={wait.durationMs}
          on:change={handleDurationChange}
          on:click|stopPropagation
          disabled={wait.locked}
        />
        <span class="text-sm font-extralight">ms</span>
      </div>

      <!-- Wait Markers (Embedded) -->
      <WaitMarkersSection
        bind:wait={wait}
        allCollapsed={collapsedMarkers}
      />
    </div>
  {/if}
</div>
