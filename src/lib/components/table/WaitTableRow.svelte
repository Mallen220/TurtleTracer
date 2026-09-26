<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import StepTableRow from "./StepTableRow.svelte";
  import { focusOnRequest } from "../../actions/focusOnRequest";
  import type { SequenceWaitItem, SequenceItem } from "../../../types";
  import { isWaitLinked } from "../../../utils/pointLinking";

  interface Props {
    item: SequenceWaitItem;
    index: number;
    isLocked?: boolean;
    dragOverIndex?: number | null;
    dragPosition?: string | null;
    draggingIndex?: number | null;
    onUpdate: (item: SequenceWaitItem) => void;
    onLock: () => void;
    onDelete: () => void;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
    onContextMenu: (e: MouseEvent) => void;
    /** Used to show when other waits share this one's duration. */
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
  noun="wait"
  placeholder="Wait"
  accent="amber"
  badge={isWaitLinked(sequence, item.id)
    ? `Linked wait: shares its duration with other waits named '${item.name}'`
    : null}
  onRename={(name) => onUpdate({ ...item, name })}
>
  {#snippet cells()}
    <td class="px-3 py-2">
      <input
        type="number"
        class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-amber-500 focus:outline-none text-xs"
        min="0"
        value={item.durationMs}
        aria-label="{item.name || 'Wait'} Duration"
        oninput={(e) =>
          onUpdate({
            ...item,
            // Blank or negative means no wait, as in the path list.
            durationMs: Math.max(
              0,
              Number.parseFloat(e.currentTarget.value) || 0,
            ),
          })}
        use:focusOnRequest={{ id: `wait-${item.id}`, field: "x" }}
        disabled={isLocked}
      />
    </td>
    <td class="px-3 py-2 text-neutral-400 text-xs italic"> - </td>
  {/snippet}
</StepTableRow>
