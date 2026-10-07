<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { slide } from "svelte/transition";
  import SequenceItemCard from "./SequenceItemCard.svelte";
  import MacroTransformControls from "./MacroTransformControls.svelte";
  import type {
    ActionDefinition,
    SequenceMacroItem,
    SequenceItem,
  } from "../../../types/index";
  import { ChevronDownIcon, LinkIcon } from "../icons";

  interface Props {
    macro: SequenceMacroItem;
    sequence: SequenceItem[];
    collapsed?: boolean;
    onRemove: () => void;
    /** Turns the macro's steps into ordinary, editable steps. */
    onUnlink?: () => void;
    onAddAction?: (def: ActionDefinition) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    recordChange?: () => void;
  }

  let {
    macro = $bindable(),
    sequence = $bindable(),
    collapsed = $bindable(false),
    onUnlink,
    recordChange,
    onRemove,
    onAddAction,
    onMoveUp,
    onMoveDown,
    canMoveUp,
    canMoveDown,
  }: Props = $props();

  let showTransforms = $state(false);

  function rename(name: string) {
    sequence = sequence.map((s) =>
      s.kind === "macro" && s.id === macro.id ? { ...s, name } : s,
    );
  }
</script>

<SequenceItemCard
  item={macro}
  bind:sequence
  bind:collapsed
  label="Macro"
  accent="teal"
  namePlaceholder="Macro Name"
  onRename={rename}
  {recordChange}
  {onRemove}
  {onAddAction}
  {onMoveUp}
  {onMoveDown}
  {canMoveUp}
  {canMoveDown}
>
  {#snippet headerButtons()}
    {#if onUnlink}
      <button
        onclick={(e) => {
          e.stopPropagation();
          if (!macro.locked) onUnlink();
        }}
        disabled={macro.locked}
        title="Unlink Macro"
        aria-label="Unlink Macro"
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        <LinkIcon className="size-4" />
      </button>
    {/if}
  {/snippet}

  <!-- File Path Display -->
  <div class="space-y-1">
    <div class="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
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
      onclick={(e) => {
        e.stopPropagation();
        showTransforms = !showTransforms;
      }}
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
</SequenceItemCard>
