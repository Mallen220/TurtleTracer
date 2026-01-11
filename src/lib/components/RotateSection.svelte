<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { selectedPointId, selectedLineId } from "../../stores";
  import TrashIcon from "./icons/TrashIcon.svelte";
  import type { SequenceRotateItem, SequenceItem } from "../../types";
  import { isRotateLinked, handleRotateRename } from "../../utils/pointLinking";
  import { tooltipPortal } from "../actions/portal";

  export let rotate: SequenceRotateItem;
  export let sequence: SequenceItem[];

  // Collapsed state
  export let collapsed: boolean = false;

  export let onRemove: () => void;
  export let onInsertAfter: () => void; // Usually insert wait after
  export let onAddPathAfter: () => void;
  export let onAddWaitAfter: () => void;
  export let onMoveUp: () => void;
  export let onMoveDown: () => void;
  export let canMoveUp: boolean = true;
  export let canMoveDown: boolean = true;
  export let recordChange: (() => void) | undefined = undefined;

  $: isSelected = $selectedPointId === `rotate-${rotate.id}`;
  $: linked = isRotateLinked(sequence, rotate.id);

  let hoveredRotateId: string | null = null;
  let hoveredRotateAnchor: HTMLElement | null = null;

  function handleRotateHoverEnter(e: MouseEvent, id: string | null) {
    hoveredRotateId = id;
    hoveredRotateAnchor = e.currentTarget as HTMLElement;
  }
  function handleRotateHoverLeave() {
    hoveredRotateId = null;
    hoveredRotateAnchor = null;
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  function handleNameInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const newName = input.value;
    sequence = handleRotateRename(sequence, rotate.id, newName);
  }

  function handleBlur() {
    if (recordChange) recordChange();
  }

  function handleDegreesChange(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const val = parseFloat(target.value);
    if (!Number.isNaN(val)) {
      rotate.degrees = val;
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
  class={`flex flex-col w-full justify-start items-start gap-1 ${isSelected ? "border-l-4 border-pink-500 pl-2" : ""}`}
  on:click|stopPropagation={() => {
    if (!rotate.locked) {
      selectedPointId.set(`rotate-${rotate.id}`);
      selectedLineId.set(null);
    }
  }}
  on:keydown|stopPropagation={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!rotate.locked) {
        selectedPointId.set(`rotate-${rotate.id}`);
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
        tabindex="-1"
        on:click|stopPropagation={toggleCollapsed}
        class="flex items-center gap-2 font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors"
        title="{collapsed ? 'Expand' : 'Collapse'} rotate"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} rotate"
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
        Rotate
      </button>

      <!-- Name Input -->
      <div class="relative">
        <input
          tabindex="-1"
          value={rotate.name}
          placeholder="Rotate Name"
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-semibold min-w-[100px] pr-6"
          class:text-pink-500={hoveredRotateId === rotate.id}
          disabled={rotate.locked}
          on:input={handleNameInput}
          on:blur={handleBlur}
          on:click|stopPropagation
        />
        {#if linked}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="absolute right-1 top-1/2 -translate-y-1/2 text-pink-500 cursor-help flex items-center justify-center"
            on:mouseenter={(e) => handleRotateHoverEnter(e, rotate.id)}
            on:mouseleave={handleRotateHoverLeave}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="w-3.5 h-3.5"
            >
              <path
                fill-rule="evenodd"
                d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                clip-rule="evenodd"
              />
            </svg>
            {#if hoveredRotateId === rotate.id}
              <div
                use:tooltipPortal={hoveredRotateAnchor}
                class="w-64 p-2 bg-pink-100 dark:bg-pink-900 border border-pink-300 dark:border-pink-700 rounded shadow-lg text-xs text-pink-900 dark:text-pink-100 z-50 pointer-events-none"
              >
                <strong>Linked Rotate</strong><br />
                Logic: Same Name = Shared Degrees.<br />
                This rotate event shares its degrees with other rotates named '{rotate.name}'.
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Lock/Unlock Button -->
      <button
        tabindex="-1"
        title={rotate.locked ? "Unlock Rotate" : "Lock Rotate"}
        aria-label={rotate.locked ? "Unlock Rotate" : "Lock Rotate"}
        on:click|stopPropagation={() => {
          rotate.locked = !rotate.locked;
          if (recordChange) recordChange();
        }}
        class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
      >
        {#if rotate.locked}
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
          tabindex="-1"
          title={rotate.locked ? "Rotate locked" : "Move up"}
          aria-label="Move rotate up"
          on:click|stopPropagation={() => {
            if (!rotate.locked && canMoveUp && onMoveUp) onMoveUp();
          }}
          class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canMoveUp || rotate.locked}
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
          tabindex="-1"
          title={rotate.locked ? "Rotate locked" : "Move down"}
          aria-label="Move rotate down"
          on:click|stopPropagation={() => {
            if (!rotate.locked && canMoveDown && onMoveDown) onMoveDown();
          }}
          class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canMoveDown || rotate.locked}
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
        tabindex="-1"
        title="Add Path After This Rotate"
        aria-label="Add Path After This Rotate"
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
        tabindex="-1"
        title="Add Wait After"
        aria-label="Add Wait After"
        on:click|stopPropagation={onAddWaitAfter}
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

      <!-- Add Rotate After Button (Maybe? The prompt didn't strictly say so, but usually you want to be able to add another of same type. "Insert After" in WaitSection just calls insertWait) -->
      <button
        tabindex="-1"
        title="Add Rotate After"
        aria-label="Add Rotate After"
        on:click|stopPropagation={onInsertAfter}
        class="text-pink-500 hover:text-pink-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
      </button>

      <button
        tabindex="-1"
        title="Remove Rotate"
        aria-label="Remove Rotate"
        class="text-red-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
        on:click|stopPropagation={() => {
          if (!rotate.locked && onRemove) onRemove();
        }}
        aria-disabled={rotate.locked}
        disabled={rotate.locked}
      >
        <TrashIcon className="size-5" strokeWidth={2} />
      </button>
    </div>
  </div>

  {#if !collapsed}
    <div class={`h-[0.75px] w-full bg-pink-400/50 my-1`} />

    <div class="flex flex-col justify-start items-start w-full gap-2 pl-2">
      <!-- Degrees Input -->
      <div class="flex items-center gap-2">
        <span class="text-sm font-light">Heading:</span>
        <input
          tabindex="-1"
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-24"
          type="number"
          step="any"
          value={rotate.degrees}
          on:change={handleDegreesChange}
          on:click|stopPropagation
          disabled={rotate.locked}
        />
        <span class="text-sm font-extralight">deg</span>
      </div>

      <!-- Event Markers could be added here later as per prompt, but for now prompt says focus on creating the new type -->
    </div>
  {/if}
</div>
