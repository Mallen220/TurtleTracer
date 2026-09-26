<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import StepTableRow from "./StepTableRow.svelte";
  import { focusOnRequest } from "../../actions/focusOnRequest";
  import type { SequenceRotateItem, SequenceItem } from "../../../types";
  import TriangleWarningIcon from "../icons/TriangleWarningIcon.svelte";
  import { isRotateLinked } from "../../../utils/pointLinking";
  import { transformAngle } from "../../../utils/math";

  interface Props {
    item: SequenceRotateItem;
    index: number;
    isLocked?: boolean;
    dragOverIndex?: number | null;
    dragPosition?: string | null;
    draggingIndex?: number | null;
    onUpdate: (item: SequenceRotateItem) => void;
    onLock: () => void;
    onDelete: () => void;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
    onContextMenu: (e: MouseEvent) => void;
    /** Used to show when other turns share this one's heading. */
    sequence?: SequenceItem[];
  }

  let {
    item,
    onUpdate,
    sequence = [],
    index,
    isLocked,
    dragOverIndex,
    dragPosition,
    draggingIndex,
    onLock,
    onDelete,
    onDragStart,
    onDragEnd,
    onContextMenu,
  }: Props = $props();

  // Headings are usually kept within (-180, 180].
  let isOutOfBounds = $derived(item.degrees > 180 || item.degrees <= -180);
</script>

<StepTableRow
  {item}
  {index}
  {isLocked}
  {dragOverIndex}
  {dragPosition}
  {draggingIndex}
  {onLock}
  {onDelete}
  {onDragStart}
  {onDragEnd}
  {onContextMenu}
  noun="rotate"
  placeholder="Rotate"
  accent="pink"
  badge={isRotateLinked(sequence, item.id)
    ? "Linked Rotate: Same Name = Shared Degrees"
    : null}
  onRename={(name) => onUpdate({ ...item, name })}
>
  {#snippet cells()}
    <td class="px-3 py-2 text-neutral-400 text-xs italic"> - </td>
    <td class="px-3 py-2">
      <div class="flex items-center gap-1">
        <input
          type="number"
          class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-pink-500 focus:outline-none text-xs"
          class:border-yellow-500={isOutOfBounds}
          class:dark:border-yellow-500={isOutOfBounds}
          value={item.degrees}
          aria-label="{item.name || 'Rotate'} Degrees"
          oninput={(e) => {
            const degrees = Number.parseFloat(e.currentTarget.value);
            if (!Number.isNaN(degrees)) onUpdate({ ...item, degrees });
          }}
          use:focusOnRequest={{ id: `rotate-${item.id}`, field: "heading" }}
          disabled={isLocked}
        />
        {#if isOutOfBounds && !isLocked}
          <button
            onclick={() =>
              onUpdate({ ...item, degrees: transformAngle(item.degrees) })}
            title="Angle is out of bounds. Click to normalize to [-180, 180]."
            aria-label="Angle is out of bounds. Click to normalize to [-180, 180]."
            class="p-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 transition-colors"
          >
            <TriangleWarningIcon className="size-4" />
          </button>
        {/if}
      </div>
    </td>
  {/snippet}
</StepTableRow>
