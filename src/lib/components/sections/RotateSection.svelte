<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { selectedPointId, selectedLineId } from "../../../stores";
  import DeleteButtonWithConfirm from "../common/DeleteButtonWithConfirm.svelte";
  import type { SequenceRotateItem, SequenceItem } from "../../../types/index";
  import {
    isRotateLinked,
    handleRotateRename,
    updateLinkedRotations,
  } from "../../../utils/pointLinking";
  import { tooltipPortal } from "../../actions/portal";

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
      if (linked) {
        sequence = updateLinkedRotations(sequence, rotate.id);
      }
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
  class={`bg-white dark:bg-neutral-800 rounded-xl shadow-sm border transition-all duration-200 ${
    isSelected
      ? "border-pink-500 ring-1 ring-pink-500/20"
      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
  }`}
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
  <!-- Card Header -->
  <div class="flex items-center justify-between p-3 gap-3">
    <!-- Left: Title & Name -->
    <div class="flex items-center gap-3 flex-1 min-w-0">
      <button
        on:click|stopPropagation={toggleCollapsed}
        class="flex items-center gap-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 transition-colors px-1 py-1"
        title="{collapsed ? 'Expand' : 'Collapse'} rotate"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} rotate"
        aria-expanded={!collapsed}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2.5}
          stroke="currentColor"
          class="size-3.5 transition-transform duration-200 {collapsed
            ? '-rotate-90'
            : 'rotate-0'}"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
        <span
          class="text-xs font-bold uppercase tracking-wider text-pink-500 whitespace-nowrap"
          >Rotate</span
        >
      </button>

      <div class="flex items-center gap-2 flex-1 min-w-0">
        <div class="relative flex-1 min-w-0">
          <input
            value={rotate.name}
            placeholder="Rotate"
            aria-label="Rotate name"
            title="Edit rotate name"
            class="w-full pl-2 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 outline-none transition-all placeholder-neutral-400 truncate"
            class:text-pink-500={hoveredRotateId === rotate.id}
            disabled={rotate.locked}
            on:input={handleNameInput}
            on:blur={handleBlur}
            on:click|stopPropagation
          />
          {#if linked}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="absolute right-2 top-1/2 -translate-y-1/2 text-pink-500 cursor-help"
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
      </div>
    </div>

    <!-- Right: Controls -->
    <div class="flex items-center gap-1">
      <button
        on:click|stopPropagation={() => {
          rotate.locked = !rotate.locked;
          if (recordChange) recordChange();
        }}
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors"
        title={rotate.locked ? "Unlock Rotate" : "Lock Rotate"}
        aria-label={rotate.locked ? "Unlock Rotate" : "Lock Rotate"}
      >
        {#if rotate.locked}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="size-4 text-amber-500"
          >
            <path
              fill-rule="evenodd"
              d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
              clip-rule="evenodd"
            />
          </svg>
        {:else}
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
              d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {/if}
      </button>

      <div class="h-4 w-px bg-neutral-200 dark:bg-neutral-700 mx-1"></div>

      <div
        class="flex items-center bg-neutral-100 dark:bg-neutral-900 rounded-lg p-0.5"
      >
        <button
          on:click|stopPropagation={() => {
            if (!rotate.locked && canMoveUp && onMoveUp) onMoveUp();
          }}
          disabled={!canMoveUp || rotate.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow"
          title="Move Up"
          aria-label="Move Up"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-3.5"
          >
            <path
              fill-rule="evenodd"
              d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <button
          on:click|stopPropagation={() => {
            if (!rotate.locked && canMoveDown && onMoveDown) onMoveDown();
          }}
          disabled={!canMoveDown || rotate.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow"
          title="Move Down"
          aria-label="Move Down"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-3.5"
          >
            <path
              fill-rule="evenodd"
              d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>

      <DeleteButtonWithConfirm
        on:click={() => {
          if (!rotate.locked && onRemove) onRemove();
        }}
        disabled={rotate.locked}
        title="Remove Rotate"
      />
    </div>
  </div>

  {#if !collapsed}
    <div class="px-3 pb-3 space-y-4">
      <!-- Degrees Input -->
      <div class="space-y-2">
        <label
          for="rotate-heading-{rotate.id}"
          class="text-xs font-semibold text-neutral-500 uppercase tracking-wide block"
        >
          Heading (deg)
        </label>
        <div class="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            class="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <!-- Semicircle protractor arc -->
            <path d="M3 12a9 9 0 0 1 18 0" />

            <!-- Major tick marks at 0,30,60,90,120,150,180 degrees -->
            <line x1="21" y1="12" x2="19.2" y2="12" />
            <line x1="19.794" y1="7.5" x2="18.235" y2="8.4" />
            <line x1="16.5" y1="4.206" x2="15.6" y2="5.765" />
            <line x1="12" y1="3" x2="12" y2="4.8" />
            <line x1="7.5" y1="4.206" x2="8.4" y2="5.765" />
            <line x1="4.206" y1="7.5" x2="5.765" y2="8.4" />
            <line x1="3" y1="12" x2="4.8" y2="12" />

            <!-- Needle indicating an angle (visual hint) -->
            <line x1="12" y1="12" x2="17" y2="7" stroke-width="1.8" />
            <!-- Small degree symbol near needle tip -->
            <circle
              cx="17.6"
              cy="6.4"
              r="0.9"
              fill="currentColor"
              stroke="none"
            />
          </svg>
          <input
            id="rotate-heading-{rotate.id}"
            class="w-full pl-9 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
            type="number"
            step="any"
            value={rotate.degrees}
            on:change={handleDegreesChange}
            on:click|stopPropagation
            disabled={rotate.locked}
          />
        </div>
      </div>

      <!-- Action Bar -->
      <div
        class="flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-700/50"
      >
        <span class="text-xs font-medium text-neutral-400 mr-auto"
          >Insert after:</span
        >

        <button
          on:click|stopPropagation={onAddPathAfter}
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors border border-green-200 dark:border-green-800/30"
          title="Add Path After"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-3"
          >
            <path
              d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
            />
          </svg>
          Path
        </button>

        <button
          on:click|stopPropagation={onAddWaitAfter}
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors border border-amber-200 dark:border-amber-800/30"
          title="Add Wait After"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-3"
          >
            <path
              d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
            />
          </svg>
          Wait
        </button>

        <button
          on:click|stopPropagation={onInsertAfter}
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/30 transition-colors border border-pink-200 dark:border-pink-800/30"
          title="Add Rotate After"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-3"
          >
            <path
              d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
            />
          </svg>
          Rotate
        </button>
      </div>
    </div>
  {/if}
</div>
