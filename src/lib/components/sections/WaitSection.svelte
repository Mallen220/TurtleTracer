<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { selectedPointId, selectedLineId } from "../../../stores";
  import DeleteButtonWithConfirm from "../common/DeleteButtonWithConfirm.svelte";
  import type { SequenceWaitItem, SequenceItem } from "../../../types/index";
  import {
    isWaitLinked,
    handleWaitRename,
    updateLinkedWaits,
  } from "../../../utils/pointLinking";
  import { tooltipPortal } from "../../actions/portal";
  import { actionRegistry } from "../../actionRegistry";
  import { getSmallButtonClass } from "../../../utils/buttonStyles";
  import ChevronDownIcon from "../icons/ChevronDownIcon.svelte";
  import ChevronUpIcon from "../icons/ChevronUpIcon.svelte";
  import EyeIcon from "../icons/EyeIcon.svelte";
  import EyeSlashIcon from "../icons/EyeSlashIcon.svelte";
  import InfoIcon from "../icons/InfoIcon.svelte";
  import LockIcon from "../icons/LockIcon.svelte";
  import PlusIcon from "../icons/PlusIcon.svelte";
  import UnlockIcon from "../icons/UnlockIcon.svelte";
  import WaitIcon from "../icons/WaitIcon.svelte";

  export let wait: SequenceWaitItem;
  export let sequence: SequenceItem[];
  // export let idx: number = 0;

  // Collapsed state
  export let collapsed: boolean = false;
  // Markers collapsed state (for "Collapse All" deep behavior)
  // export let collapsedMarkers: boolean = false;

  export let onRemove: () => void;
  export let onInsertAfter: () => void; // Deprecated in favor of onAddAction, but kept for compatibility if needed
  export let onAddPathAfter: () => void; // Deprecated
  export let onAddRotateAfter: () => void; // Deprecated
  export let onAddAction: ((def: any) => void) | undefined = undefined;
  export let onMoveUp: () => void;
  export let onMoveDown: () => void;
  export let canMoveUp: boolean = true;
  export let canMoveDown: boolean = true;
  export let recordChange: (() => void) | undefined = undefined;

  $: isSelected = $selectedPointId === `wait-${wait.id}`;
  $: isHidden = wait.hidden ?? false;
  $: linked = isWaitLinked(sequence, wait.id);

  let hoveredWaitId: string | null = null;
  let hoveredWaitAnchor: HTMLElement | null = null;

  function handleWaitHoverEnter(e: MouseEvent, id: string | null) {
    hoveredWaitId = id;
    hoveredWaitAnchor = e.currentTarget as HTMLElement;
  }
  function handleWaitHoverLeave() {
    hoveredWaitId = null;
    hoveredWaitAnchor = null;
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  function handleNameInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const newName = input.value;
    sequence = handleWaitRename(sequence, wait.id, newName);
  }

  function handleBlur() {
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
    if (linked) {
      sequence = updateLinkedWaits(sequence, wait.id);
    } else {
      sequence = [...sequence];
    }
    if (recordChange) recordChange();
  }
</script>

<div
  role="button"
  tabindex="0"
  aria-pressed={isSelected}
  class={`bg-white dark:bg-neutral-800 rounded-xl shadow-sm border transition-all duration-200 ${
    isSelected
      ? "border-amber-400 ring-1 ring-amber-400/20"
      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
  } ${isHidden ? "opacity-50 grayscale-[50%]" : ""}`}
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
  <!-- Card Header -->
  <div class="flex items-center justify-between p-3 gap-3">
    <!-- Left: Title & Name -->
    <div class="flex items-center gap-3 flex-1 min-w-0">
      <button
        on:click|stopPropagation={toggleCollapsed}
        class="flex items-center gap-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 transition-colors px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        title="{collapsed ? 'Expand' : 'Collapse'} wait"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} wait"
        aria-expanded={!collapsed}
      >
        <ChevronDownIcon
          strokeWidth={2.5}
          className="size-3.5 transition-transform duration-200 {collapsed
            ? '-rotate-90'
            : 'rotate-0'}"
        />
        <span
          class="text-xs font-bold uppercase tracking-wider text-amber-500 whitespace-nowrap"
          >Wait</span
        >
      </button>

      <div class="flex items-center gap-2 flex-1 min-w-0">
        <div class="relative flex-1 min-w-0">
          <input
            value={wait.name}
            placeholder="Wait"
            aria-label="Wait name"
            title="Edit wait name"
            class="w-full pl-2 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-neutral-400 truncate"
            class:text-amber-500={hoveredWaitId === wait.id}
            disabled={wait.locked}
            on:input={handleNameInput}
            on:blur={handleBlur}
            on:click|stopPropagation
          />
          {#if linked}
            <div
              role="presentation"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-amber-500 cursor-help"
              on:mouseenter={(e) => handleWaitHoverEnter(e, wait.id)}
              on:mouseleave={handleWaitHoverLeave}
            >
              <InfoIcon className="w-3.5 h-3.5" />
              {#if hoveredWaitId === wait.id}
                <div
                  use:tooltipPortal={hoveredWaitAnchor}
                  class="w-64 p-2 bg-amber-100 dark:bg-amber-900 border border-amber-300 dark:border-amber-700 rounded shadow-lg text-xs text-amber-900 dark:text-amber-100 z-50 pointer-events-none"
                >
                  <strong>Linked Wait</strong><br />
                  Logic: Same Name = Shared Duration.<br />
                  This wait event shares its duration with other waits named '{wait.name}'.
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
          wait.hidden = !isHidden;
          sequence = [...sequence];
          if (recordChange) recordChange();
        }}
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        title={isHidden ? "Show Wait" : "Hide Wait"}
        aria-label={isHidden ? "Show Wait" : "Hide Wait"}
      >
        {#if isHidden}
          <EyeSlashIcon className="size-4 text-neutral-400" strokeWidth={2} />
        {:else}
          <EyeIcon className="size-4" strokeWidth={2} />
        {/if}
      </button>

      <button
        title={wait.locked ? "Unlock Wait" : "Lock Wait"}
        aria-label={wait.locked ? "Unlock Wait" : "Lock Wait"}
        on:click|stopPropagation={() => {
          wait.locked = !wait.locked;
          if (recordChange) recordChange();
        }}
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        {#if wait.locked}
          <LockIcon className="size-4 text-amber-500" />
        {:else}
          <UnlockIcon className="size-4" strokeWidth={2} />
        {/if}
      </button>

      <div
        class="h-4 w-px bg-neutral-200 dark:bg-neutral-700 mx-1"
        role="presentation"
        aria-hidden="true"
      ></div>

      <div
        class="flex items-center bg-neutral-100 dark:bg-neutral-900 rounded-lg p-0.5"
      >
        <button
          on:click|stopPropagation={() => {
            if (!wait.locked && canMoveUp && onMoveUp) onMoveUp();
          }}
          disabled={!canMoveUp || wait.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          title="Move Up"
          aria-label="Move Up"
        >
          <ChevronUpIcon className="size-3.5" />
        </button>
        <button
          on:click|stopPropagation={() => {
            if (!wait.locked && canMoveDown && onMoveDown) onMoveDown();
          }}
          disabled={!canMoveDown || wait.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          title="Move Down"
          aria-label="Move Down"
        >
          <ChevronDownIcon className="size-3.5" />
        </button>
      </div>

      <DeleteButtonWithConfirm
        on:click={() => {
          if (!wait.locked && onRemove) onRemove();
        }}
        disabled={wait.locked}
        title="Remove Wait"
      />
    </div>
  </div>

  {#if !collapsed}
    <div class="px-3 pb-3 space-y-4">
      <!-- Duration Input -->
      <div class="space-y-2">
        <label
          for="wait-duration-{wait.id}"
          class="text-xs font-semibold text-neutral-500 uppercase tracking-wide block"
        >
          Duration (ms)
        </label>
        <div class="relative">
          <WaitIcon
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400"
          />
          <input
            id="wait-duration-{wait.id}"
            class="w-full pl-9 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
            type="number"
            min="0"
            step="50"
            value={wait.durationMs}
            on:change={handleDurationChange}
            on:click|stopPropagation
            disabled={wait.locked}
          />
        </div>
      </div>

      <!-- Action Bar -->
      <div
        class="flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-700/50 flex-wrap"
      >
        <span class="text-xs font-medium text-neutral-400 mr-auto"
          >Insert after:</span
        >
        {#each Object.values($actionRegistry) as def (def.kind)}
          {#if def.createDefault || def.isPath}
            {@const color = def.buttonColor || "gray"}
            <button
              on:click|stopPropagation={() => {
                if (onAddAction) onAddAction(def);
                else if (def.isPath) onAddPathAfter();
                else if (def.isWait) onInsertAfter();
                else if (def.isRotate) onAddRotateAfter();
              }}
              class={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${getSmallButtonClass(color)}`}
              title={`Add ${def.label} After`}
              aria-label={`Add ${def.label} After`}
            >
              <PlusIcon className="size-3" strokeWidth={2} />
              {def.label}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
