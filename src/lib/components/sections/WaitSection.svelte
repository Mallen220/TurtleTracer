<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import SequenceItemCard from "./SequenceItemCard.svelte";
  import type {
    ActionDefinition,
    SequenceWaitItem,
    SequenceItem,
  } from "../../../types/index";
  import {
    isWaitLinked,
    handleWaitRename,
    updateLinkedWaits,
  } from "../../../utils/pointLinking";
  import ClockIcon from "../icons/ClockIcon.svelte";
  import { ui } from "../../ui";

  interface Props {
    wait: SequenceWaitItem;
    sequence: SequenceItem[];
    collapsed?: boolean;
    onRemove: () => void;
    onAddAction?: (def: ActionDefinition) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    recordChange?: () => void;
  }

  let {
    wait,
    sequence = $bindable(),
    collapsed = $bindable(false),
    recordChange,
    onRemove,
    onAddAction,
    onMoveUp,
    onMoveDown,
    canMoveUp,
    canMoveDown,
  }: Props = $props();

  let linked = $derived(isWaitLinked(sequence, wait.id));

  function setDuration(e: Event & { currentTarget: HTMLInputElement }) {
    const ms = Number.parseFloat(e.currentTarget.value);
    const durationMs = Number.isNaN(ms) || ms < 0 ? 0 : ms;
    const updated = sequence.map((s) =>
      s.kind === "wait" && s.id === wait.id ? { ...s, durationMs } : s,
    );
    // Waits with the same name share their duration.
    sequence = linked ? updateLinkedWaits(updated, wait.id) : updated;
    recordChange?.();
  }
</script>

<SequenceItemCard
  item={wait}
  bind:sequence
  bind:collapsed
  label="Wait"
  accent="amber"
  onRename={(name) => (sequence = handleWaitRename(sequence, wait.id, name))}
  linkedNote={linked
    ? `Waits with the same name share their duration. This one shares it with others named '${wait.name}'.`
    : null}
  {recordChange}
  {onRemove}
  {onAddAction}
  {onMoveUp}
  {onMoveDown}
  {canMoveUp}
  {canMoveDown}
>
  <div class="space-y-2">
    <label for="wait-duration-{wait.id}" class="{ui.heading} block">
      Duration (ms)
    </label>
    <div class="relative">
      <ClockIcon
        className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400"
      />
      <input
        id="wait-duration-{wait.id}"
        class="{ui.inputSm} w-full pl-9 pr-2"
        type="number"
        min="0"
        step="50"
        value={wait.durationMs}
        onchange={setDuration}
        onclick={(e) => e.stopPropagation()}
        disabled={wait.locked}
      />
    </div>
  </div>
</SequenceItemCard>
