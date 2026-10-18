<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import StepTableRow from "./StepTableRow.svelte";
  import { focusOnRequest } from "../../actions/focusOnRequest";
  import type { SequenceWaitItem } from "../../../types";
  import type { StepRowProps } from "./stepRowProps";
  import { isWaitLinked } from "../../../utils/pointLinking";
  import { ui } from "../../ui";

  type Props = StepRowProps<SequenceWaitItem>;

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
        class="{ui.inputXs} w-20"
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
    <td class="px-3 py-2 text-neutral-500 dark:text-neutral-400 text-xs italic">
      -
    </td>
  {/snippet}
</StepTableRow>
