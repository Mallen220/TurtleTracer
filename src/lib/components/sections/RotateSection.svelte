<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import SequenceItemCard from "./SequenceItemCard.svelte";
  import type {
    ActionDefinition,
    SequenceRotateItem,
    SequenceItem,
  } from "../../../types/index";
  import {
    isRotateLinked,
    handleRotateRename,
    updateLinkedRotations,
  } from "../../../utils/pointLinking";
  import { ClockIcon } from "../icons";

  interface Props {
    rotate: SequenceRotateItem;
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
    rotate,
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

  let linked = $derived(isRotateLinked(sequence, rotate.id));

  function setDegrees(e: Event & { currentTarget: HTMLInputElement }) {
    const degrees = Number.parseFloat(e.currentTarget.value);
    if (!Number.isNaN(degrees)) {
      const updated = sequence.map((s) =>
        s.kind === "rotate" && s.id === rotate.id ? { ...s, degrees } : s,
      );
      // Turns with the same name share their heading.
      sequence = linked ? updateLinkedRotations(updated, rotate.id) : updated;
    }
    recordChange?.();
  }
</script>

<SequenceItemCard
  item={rotate}
  bind:sequence
  bind:collapsed
  label="Rotate"
  accent="pink"
  onRename={(name) =>
    (sequence = handleRotateRename(sequence, rotate.id, name))}
  linkedNote={linked
    ? `Turns with the same name share their heading. This one shares it with others named '${rotate.name}'.`
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
    <label
      for="rotate-heading-{rotate.id}"
      class="text-xs font-semibold text-neutral-500 uppercase tracking-wide block"
    >
      Heading (deg)
    </label>
    <div class="relative">
      <ClockIcon
        className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400"
      />
      <input
        id="rotate-heading-{rotate.id}"
        class="w-full pl-9 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700  focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
        type="number"
        step="any"
        value={rotate.degrees}
        onchange={setDegrees}
        onclick={(e) => e.stopPropagation()}
        disabled={rotate.locked}
      />
    </div>
  </div>
</SequenceItemCard>
