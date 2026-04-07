<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { stopPropagation, createBubbler } from "svelte/legacy";

  const bubble = createBubbler();
  import { selectedPointId, selectedLineId } from "../../../stores";
  import { slide } from "svelte/transition";
  import DeleteButtonWithConfirm from "../common/DeleteButtonWithConfirm.svelte";
  import MacroTransformControls from "./MacroTransformControls.svelte";
  import type { SequenceMacroItem, SequenceItem } from "../../../types/index";
  import { actionRegistry } from "../../actionRegistry";
  import { getSmallButtonClass } from "../../../utils/buttonStyles";
  import {
    ChevronRightIcon,
    EyeIcon,
    EyeSlashIcon,
    LockIcon,
    UnlockIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    PlusIcon,
    ChevronDownIcon,
    LinkIcon,
  } from "../icons";

  // onInsertAfter was previously an exported prop but unused internally.
  // If external code depends on its presence, export it as a const to avoid Svelte unused-export warning.
  export const onInsertAfter: (() => void) | undefined = undefined;

  interface Props {
    macro: SequenceMacroItem;
    sequence: SequenceItem[];
    // Collapsed state (for consistency, though macros might not have inner content to collapse yet)
    collapsed?: boolean;
    onRemove: () => void;
    onUnlink?: (() => void) | undefined;
    // PathTab usually passes specific inserters.
    onAddWaitAfter: () => void;
    onAddPathAfter: () => void;
    onAddRotateAfter: () => void;
    onAddAction?: ((def: any) => void) | undefined;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    recordChange?: (() => void) | undefined;
  }

  let {
    macro = $bindable(),
    sequence = $bindable(),
    collapsed = $bindable(false),
    onRemove,
    onUnlink = undefined,
    onAddWaitAfter,
    onAddPathAfter,
    onAddRotateAfter,
    onAddAction = undefined,
    onMoveUp,
    onMoveDown,
    canMoveUp = true,
    canMoveDown = true,
    recordChange = undefined,
  }: Props = $props();

  let isSelected = $derived($selectedPointId === `macro-${macro.id}`);
  let isHidden = $derived(macro.hidden ?? false);

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

  let showTransforms = $state(false);
</script>

<div
  role="button"
  tabindex="0"
  aria-pressed={isSelected}
  class={`bg-white dark:bg-neutral-800 rounded-xl shadow-sm border transition-all duration-200 ${
    isSelected
      ? "border-teal-400 ring-1 ring-teal-400/20"
      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
  } ${isHidden ? "opacity-50 grayscale-[50%]" : ""}`}
  onclick={stopPropagation(() => {
    if (!macro.locked) {
      selectedPointId.set(`macro-${macro.id}`);
      selectedLineId.set(null);
    }
  })}
  onkeydown={(e: KeyboardEvent) => {
    e.stopPropagation();
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
        onclick={stopPropagation(toggleCollapsed)}
        class="flex items-center gap-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 transition-colors px-1 py-1"
        title="{collapsed ? 'Expand' : 'Collapse'} macro"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} macro"
        aria-expanded={!collapsed}
      >
        <ChevronRightIcon
          className="size-3.5 transition-transform duration-200 {collapsed
            ? 'rotate-0'
            : 'rotate-90'}"
        />
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
            oninput={handleNameInput}
            onblur={handleBlur}
            onclick={stopPropagation(bubble("click"))}
          />
        </div>
      </div>
    </div>

    <!-- Right: Controls -->
    <div class="flex items-center gap-1">
      <button
        onclick={stopPropagation(() => {
          macro.hidden = !isHidden;
          sequence = [...sequence];
          if (recordChange) recordChange();
        })}
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        title={isHidden ? "Show Macro" : "Hide Macro"}
        aria-label={isHidden ? "Show Macro" : "Hide Macro"}
      >
        {#if isHidden}
          <EyeSlashIcon className="size-4 text-neutral-400" strokeWidth={2} />
        {:else}
          <EyeIcon className="size-4" strokeWidth={2} />
        {/if}
      </button>

      <button
        title={macro.locked ? "Unlock Macro" : "Lock Macro"}
        aria-label={macro.locked ? "Unlock Macro" : "Lock Macro"}
        onclick={stopPropagation(() => {
          macro.locked = !macro.locked;
          macro = { ...macro };
          const idx = sequence.findIndex((s) => (s as any).id === macro.id);
          if (idx !== -1) sequence[idx] = macro;
          sequence = [...sequence];
          if (recordChange) recordChange();
        })}
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors"
      >
        {#if macro.locked}
          <LockIcon className="size-4 text-teal-500" />
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
          onclick={stopPropagation(() => {
            if (!macro.locked && canMoveUp && onMoveUp) onMoveUp();
          })}
          disabled={!canMoveUp || macro.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow"
          title="Move Up"
          aria-label="Move Up"
        >
          <ArrowUpIcon className="size-3.5" />
        </button>
        <button
          onclick={stopPropagation(() => {
            if (!macro.locked && canMoveDown && onMoveDown) onMoveDown();
          })}
          disabled={!canMoveDown || macro.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow"
          title="Move Down"
          aria-label="Move Down"
        >
          <ArrowDownIcon className="size-3.5" />
        </button>
      </div>

      {#if onUnlink}
        <button
          onclick={stopPropagation(() => {
            if (!macro.locked && onUnlink) onUnlink();
          })}
          disabled={macro.locked}
          title="Unlink Macro"
          aria-label="Unlink Macro"
          class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <LinkIcon className="size-4" />
        </button>
      {/if}

      <DeleteButtonWithConfirm
        onclick={() => {
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
        <div
          class="text-xs font-semibold text-neutral-500 uppercase tracking-wide"
        >
          File Path
        </div>
        <div
          class="text-xs text-neutral-700 dark:text-neutral-300 break-all bg-neutral-100 dark:bg-neutral-900/50 p-2 rounded border border-neutral-200 dark:border-neutral-700/50"
        >
          {macro.filePath}
        </div>
      </div>

      <div class="pt-1">
        <button
          onclick={stopPropagation(() => (showTransforms = !showTransforms))}
          disabled={macro.locked}
          class={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors w-full justify-center border disabled:opacity-50 ${
            showTransforms
              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30 text-blue-700 dark:text-blue-300"
              : "bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300"
          }`}
        >
          <ChevronDownIcon
            className="size-3.5 transition-transform duration-200 {showTransforms
              ? 'rotate-180'
              : ''}"
          />
          <div class="flex items-center gap-1.5">
            <span>Transform Geometry</span>
            {#if macro.transformations && macro.transformations.length > 0}
              <span
                class="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 rounded-full text-[10px]"
              >
                {macro.transformations.length}
              </span>
            {/if}
          </div>
        </button>

        {#if showTransforms}
          <div transition:slide={{ duration: 200 }} class="mt-2">
            <MacroTransformControls
              bind:macro
              onUpdate={() => recordChange && recordChange()}
            />
          </div>
        {/if}
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
              onclick={stopPropagation(() => {
                if (onAddAction) onAddAction(def);
                else if (def.isPath) onAddPathAfter();
                else if (def.isWait) onAddWaitAfter();
                else if (def.isRotate) onAddRotateAfter();
              })}
              class={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${getSmallButtonClass(color)}`}
              title={`Add ${def.label} After`}
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
