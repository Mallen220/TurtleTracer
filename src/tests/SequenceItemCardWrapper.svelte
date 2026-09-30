<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Renders SequenceItemCard with body and header-button snippets, on reactive sequence state. -->
<script lang="ts">
  import { untrack } from "svelte";
  import SequenceItemCard from "../lib/components/sections/SequenceItemCard.svelte";
  import type { ActionDefinition, SequenceItem } from "../types";

  let {
    initial,
    label = "Wait",
    accent = "amber",
    linkedNote = null,
    canMoveUp = true,
    canMoveDown = true,
    onRename = () => {},
    onRemove = () => {},
    onMoveUp = () => {},
    onMoveDown = () => {},
    onAddAction = (_def: ActionDefinition) => {},
    recordChange = () => {},
  }: {
    initial: SequenceItem[];
    label?: string;
    accent?: "amber" | "pink" | "teal";
    linkedNote?: string | null;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    onRename?: (name: string) => void;
    onRemove?: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onAddAction?: (def: ActionDefinition) => void;
    recordChange?: () => void;
  } = $props();

  let sequence = $state(untrack(() => initial));
  let collapsed = $state(false);
  let item = $derived(sequence[0] as any);

  export const getSequence = () => $state.snapshot(sequence) as SequenceItem[];
</script>

<SequenceItemCard
  {item}
  bind:sequence
  bind:collapsed
  {label}
  {accent}
  {linkedNote}
  {canMoveUp}
  {canMoveDown}
  {onRename}
  {onRemove}
  {onMoveUp}
  {onMoveDown}
  {onAddAction}
  {recordChange}
>
  {#snippet headerButtons()}
    <button type="button" aria-label="Extra button">extra</button>
  {/snippet}
  {#snippet children()}
    <p>Card body</p>
  {/snippet}
</SequenceItemCard>
