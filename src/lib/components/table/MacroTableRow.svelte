<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import StepTableRow from "./StepTableRow.svelte";
  import type { SequenceMacroItem, SequenceItem } from "../../../types";
  import LinkIcon from "../icons/LinkIcon.svelte";

  interface Props {
    item: SequenceMacroItem;
    index: number;
    isLocked?: boolean;
    dragOverIndex?: number | null;
    dragPosition?: string | null;
    draggingIndex?: number | null;
    onUpdate: (item: SequenceMacroItem) => void;
    onLock: () => void;
    onDelete: () => void;
    /** Turns the macro's steps into ordinary, editable steps. */
    onUnlink?: () => void;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
    onContextMenu: (e: MouseEvent) => void;
    /** Passed to every row; macros don't need it. */
    sequence?: SequenceItem[];
  }

  let {
    item,
    onUpdate,
    onUnlink,
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
  noun="macro"
  placeholder="Macro"
  nameLabel="Macro Name"
  accent="teal"
  badge="Macro: {item.filePath}"
  onRename={(name) => onUpdate({ ...item, name })}
>
  {#snippet cells()}
    <td
      class="px-3 py-2 text-neutral-400 text-xs italic truncate max-w-[100px]"
      title={item.filePath}
    >
      {(item.filePath || "").split(/[/\\]/).pop()}
    </td>
    <td class="px-3 py-2 text-neutral-400 text-xs italic"> - </td>
  {/snippet}
  {#snippet actions()}
    {#if onUnlink}
      <button
        onclick={(e) => {
          e.stopPropagation();
          onUnlink();
        }}
        title="Unlink macro"
        aria-label="Unlink macro"
        class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-teal-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        <LinkIcon className="size-4" />
      </button>
    {/if}
  {/snippet}
</StepTableRow>
