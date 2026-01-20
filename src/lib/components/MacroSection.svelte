<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { selectedPointId, selectedLineId } from "../../stores";
  import DeleteButtonWithConfirm from "./common/DeleteButtonWithConfirm.svelte";
  import type { SequenceMacroItem, SequenceItem } from "../../types";

  export let macro: SequenceMacroItem;
  export let sequence: SequenceItem[];

  // Collapsed state (for consistency, though macros might not have inner content to collapse yet)
  export let collapsed: boolean = false;

  export let onRemove: () => void;
  export let onInsertAfter: () => void; // Insert Macro After (if supported?) or generic insert?
  // PathTab usually passes specific inserters.
  export let onAddWaitAfter: () => void;
  export let onAddPathAfter: () => void;
  export let onAddRotateAfter: () => void;
  export let onMoveUp: () => void;
  export let onMoveDown: () => void;
  export let canMoveUp: boolean = true;
  export let canMoveDown: boolean = true;
  export let recordChange: (() => void) | undefined = undefined;

  $: isSelected = $selectedPointId === `macro-${macro.id}`;

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  function handleNameInput(e: Event) {
    const input = e.target as HTMLInputElement;
    macro.name = input.value;
    sequence = [...sequence]; // trigger reactivity
  }

  function handleBlur() {
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
      ? "border-teal-400 ring-1 ring-teal-400/20"
      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
  }`}
  on:click|stopPropagation={() => {
    if (!macro.locked) {
      selectedPointId.set(`macro-${macro.id}`);
      selectedLineId.set(null);
    }
  }}
  on:keydown|stopPropagation={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!macro.locked) {
        selectedPointId.set(`macro-${macro.id}`);
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
        title="{collapsed ? 'Expand' : 'Collapse'} macro"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} macro"
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
          class="text-xs font-bold uppercase tracking-wider text-teal-500 whitespace-nowrap"
          >Macro</span
        >
      </button>

      <div class="flex items-center gap-2 flex-1 min-w-0">
        <div class="relative flex-1 min-w-0">
          <input
            value={macro.name}
            placeholder="Macro Name"
            aria-label="Macro name"
            title="Edit macro name"
            class="w-full pl-2 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all placeholder-neutral-400 truncate"
            disabled={macro.locked}
            on:input={handleNameInput}
            on:blur={handleBlur}
            on:click|stopPropagation
          />
        </div>
      </div>
    </div>

    <!-- Right: Controls -->
    <div class="flex items-center gap-1">
      <button
        title={macro.locked ? "Unlock Macro" : "Lock Macro"}
        aria-label={macro.locked ? "Unlock Macro" : "Lock Macro"}
        on:click|stopPropagation={() => {
          macro.locked = !macro.locked;
          if (recordChange) recordChange();
        }}
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors"
      >
        {#if macro.locked}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="size-4 text-teal-500"
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
            if (!macro.locked && canMoveUp && onMoveUp) onMoveUp();
          }}
          disabled={!canMoveUp || macro.locked}
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
            if (!macro.locked && canMoveDown && onMoveDown) onMoveDown();
          }}
          disabled={!canMoveDown || macro.locked}
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
          if (!macro.locked && onRemove) onRemove();
        }}
        disabled={macro.locked}
        title="Remove Macro"
      />
    </div>
  </div>

  {#if !collapsed}
    <div class="px-3 pb-3 space-y-4">
      <!-- File Path Display -->
      <div class="space-y-1">
        <div class="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
          File Path
        </div>
        <div class="text-xs text-neutral-700 dark:text-neutral-300 break-all bg-neutral-100 dark:bg-neutral-900/50 p-2 rounded border border-neutral-200 dark:border-neutral-700/50">
          {macro.filePath}
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
          on:click|stopPropagation={onAddRotateAfter}
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
