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
  import PathText from "../PathText.svelte";
  import { ui } from "../../ui";

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
        class={ui.iconBtnSm.neutral}
      >
        <LinkIcon className="size-4" />
      </button>
    {/if}
  {/snippet}

  <!-- File Path Display -->
  <div class="space-y-1">
    <div class={ui.heading}>File Path</div>
    <div
      class="{ui.well} text-xs text-neutral-700 dark:text-neutral-300 break-all p-2"
    >
      <PathText path={macro.filePath} />
    </div>
  </div>

  <div class="pt-1">
    <button
      onclick={(e) => {
        e.stopPropagation();
        showTransforms = !showTransforms;
      }}
      disabled={macro.locked}
      class="{showTransforms ? ui.btnSm.outline : ui.btnSm.secondary} w-full"
    >
      <ChevronDownIcon
        className="size-3.5 transition-transform duration-200 {showTransforms
          ? 'rotate-180'
          : ''}"
      />
      <div class="flex items-center gap-1.5">
        <span>Transform Geometry</span>
        {#if macro.transformations && macro.transformations.length > 0}
          <span class={ui.badge.info}>
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
