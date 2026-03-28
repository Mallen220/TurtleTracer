<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
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
  import { actionRegistry } from "../../actionRegistry";
  import { getSmallButtonClass } from "../../../utils/buttonStyles";
  import {
    ChevronRightIcon,
    LinkIcon,
    EyeIcon,
    EyeSlashIcon,
    LockIcon,
    UnlockIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    ProtractorIcon,
    PlusIcon,
  } from "../icons";

  export let rotate: SequenceRotateItem;
  export let sequence: SequenceItem[];

  // Collapsed state
  export let collapsed: boolean = false;

  export let onRemove: () => void;
  export let onInsertAfter: () => void; // Usually insert wait after
  export let onAddPathAfter: () => void;
  export let onAddWaitAfter: () => void;
  export let onAddAction: ((def: any) => void) | undefined = undefined;
  export let onMoveUp: () => void;
  export let onMoveDown: () => void;
  export let canMoveUp: boolean = true;
  export let canMoveDown: boolean = true;
  export let recordChange: (() => void) | undefined = undefined;

  $: isSelected = $selectedPointId === `rotate-${rotate.id}`;
  $: isHidden = rotate.hidden ?? false;
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
      } else {
        sequence = [...sequence]; // Force reactivity
      }
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
      ? "border-pink-500 ring-1 ring-pink-500/20"
      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
  } ${isHidden ? "opacity-50 grayscale-[50%]" : ""}`}
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
        class="flex items-center gap-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 transition-colors px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        title="{collapsed ? 'Expand' : 'Collapse'} rotate"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} rotate"
        aria-expanded={!collapsed}
      >
        <ChevronRightIcon
          className="size-3.5 transition-transform duration-200 {collapsed
            ? 'rotate-0'
            : 'rotate-90'}"
        />
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
            <div
              role="presentation"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-pink-500 cursor-help"
              on:mouseenter={(e) => handleRotateHoverEnter(e, rotate.id)}
              on:mouseleave={handleRotateHoverLeave}
            >
              <LinkIcon className="w-3.5 h-3.5" />
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
          rotate.hidden = !isHidden;
          sequence = [...sequence];
          if (recordChange) recordChange();
        }}
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        title={isHidden ? "Show Rotate" : "Hide Rotate"}
        aria-label={isHidden ? "Show Rotate" : "Hide Rotate"}
      >
        {#if isHidden}
          <EyeSlashIcon className="size-4 text-neutral-400" strokeWidth={2} />
        {:else}
          <EyeIcon className="size-4" strokeWidth={2} />
        {/if}
      </button>

      <button
        on:click|stopPropagation={() => {
          rotate.locked = !rotate.locked;
          if (recordChange) recordChange();
        }}
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        title={rotate.locked ? "Unlock Rotate" : "Lock Rotate"}
        aria-label={rotate.locked ? "Unlock Rotate" : "Lock Rotate"}
      >
        {#if rotate.locked}
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
            if (!rotate.locked && canMoveUp && onMoveUp) onMoveUp();
          }}
          disabled={!canMoveUp || rotate.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          title="Move Up"
          aria-label="Move Up"
        >
          <ArrowUpIcon className="size-3.5" />
        </button>
        <button
          on:click|stopPropagation={() => {
            if (!rotate.locked && canMoveDown && onMoveDown) onMoveDown();
          }}
          disabled={!canMoveDown || rotate.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
          title="Move Down"
          aria-label="Move Down"
        >
          <ArrowDownIcon className="size-3.5" />
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
          <ProtractorIcon
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400"
          />
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
                else if (def.isWait) onAddWaitAfter();
                else if (def.isRotate) onInsertAfter();
              }}
              class={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${getSmallButtonClass(color)}`}
              title={`Add ${def.label} After`}
              aria-label={`Add ${def.label} After`}
            >
              <PlusIcon className="size-3" />
              {def.label}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
