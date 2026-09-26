<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  A wait, turn or macro row in the table: drag handle, name, two value
  columns (from `cells`), and lock/delete buttons.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { focusOnRequest } from "../../actions/focusOnRequest";
  import type { SequenceItem } from "../../../types";
  import TrashIcon from "../icons/TrashIcon.svelte";
  import Bars3Icon from "../icons/Bars3Icon.svelte";
  import LinkIcon from "../icons/LinkIcon.svelte";
  import LockIcon from "../icons/LockIcon.svelte";
  import UnlockIcon from "../icons/UnlockIcon.svelte";

  type Step = Extract<SequenceItem, { kind: "wait" | "rotate" | "macro" }>;

  // Full class names, so Tailwind can find them.
  const ACCENTS = {
    amber: {
      row: "bg-amber-50 dark:bg-amber-900/20",
      ring: "focus:ring-amber-500",
      text: "text-amber-500",
    },
    pink: {
      row: "bg-pink-50 dark:bg-pink-900/20",
      ring: "focus:ring-pink-500",
      text: "text-pink-500",
    },
    teal: {
      row: "bg-teal-50 dark:bg-teal-900/20",
      ring: "focus:ring-teal-500",
      text: "text-teal-500",
    },
  };

  interface Props {
    item: Step;
    index: number;
    isLocked?: boolean;
    dragOverIndex?: number | null;
    dragPosition?: string | null;
    draggingIndex?: number | null;
    /** "wait", "rotate", "macro": used in button labels. */
    noun: string;
    placeholder: string;
    nameLabel?: string;
    accent: keyof typeof ACCENTS;
    /** Hover text for the link badge; no badge when null. */
    badge?: string | null;
    onRename: (name: string) => void;
    onLock: () => void;
    onDelete: () => void;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
    onContextMenu: (e: MouseEvent) => void;
    /** The two value columns. */
    cells: Snippet;
    /** Extra buttons shown before Delete while unlocked. */
    actions?: Snippet;
  }

  let {
    item,
    index,
    isLocked = false,
    dragOverIndex = null,
    dragPosition = null,
    draggingIndex = null,
    noun,
    placeholder,
    nameLabel = placeholder,
    accent,
    badge = null,
    onRename,
    onLock,
    onDelete,
    onDragStart,
    onDragEnd,
    onContextMenu,
    cells,
    actions,
  }: Props = $props();

  let colors = $derived(ACCENTS[accent]);
</script>

<tr
  data-seq-index={index}
  draggable={!isLocked}
  ondragstart={onDragStart}
  ondragend={onDragEnd}
  oncontextmenu={onContextMenu}
  class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors duration-150 {colors.row}"
  class:border-t-2={dragOverIndex === index && dragPosition === "top"}
  class:border-b-2={dragOverIndex === index && dragPosition === "bottom"}
  class:border-blue-500={dragOverIndex === index}
  class:dark:border-blue-400={dragOverIndex === index}
  class:opacity-50={draggingIndex === index}
>
  <td
    class="w-8 px-2 py-2 text-center cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
  >
    <Bars3Icon className="w-4 h-4 mx-auto" />
  </td>
  <td class="px-3 py-2">
    <div class="relative w-full max-w-[160px]">
      <input
        class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:outline-none text-xs pr-6 {colors.ring}"
        value={item.name}
        oninput={(e) => onRename(e.currentTarget.value)}
        use:focusOnRequest={{ id: `${item.kind}-${item.id}`, field: "name" }}
        disabled={isLocked}
        {placeholder}
        aria-label={nameLabel}
      />
      {#if badge}
        <div
          class="absolute right-1 top-1/2 -translate-y-1/2 cursor-help flex items-center justify-center {colors.text}"
          title={badge}
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </div>
      {/if}
    </div>
  </td>
  {@render cells()}
  <td class="px-3 py-2 text-left flex items-center justify-start gap-1">
    <button
      onclick={(e) => {
        e.stopPropagation();
        onLock();
      }}
      title="{isLocked ? 'Unlock' : 'Lock'} {noun}"
      aria-label="{isLocked ? 'Unlock' : 'Lock'} {noun}"
      class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
      aria-pressed={isLocked}
    >
      {#if isLocked}
        <LockIcon className="size-5 stroke-yellow-500" />
      {:else}
        <UnlockIcon className="size-5 stroke-gray-400" />
      {/if}
    </button>

    {#if !isLocked}
      {@render actions?.()}
      <button
        onclick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete {noun}"
        aria-label="Delete {noun}"
        class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        <TrashIcon className="size-4" strokeWidth={2} />
      </button>
    {:else}
      <span class="h-6 w-6" aria-hidden="true"></span>
    {/if}
  </td>
</tr>
