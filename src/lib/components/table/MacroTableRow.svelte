<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { SequenceMacroItem, SequenceItem } from "../../../types";
  import TrashIcon from "../icons/TrashIcon.svelte";
  import EllipsisHorizontalIcon from "../icons/EllipsisHorizontalIcon.svelte";
  import LinkIcon from "../icons/LinkIcon.svelte";
  import LockIcon from "../icons/LockIcon.svelte";
  import UnlockIcon from "../icons/UnlockIcon.svelte";
  import UnlinkIcon from "../icons/UnlinkIcon.svelte";
  import { focusRequest } from "../../../stores";

  export let item: SequenceMacroItem;
  export let index: number;
  export let isLocked: boolean = false;

  // Drag & Drop props
  export let dragOverIndex: number | null = null;
  export let dragPosition: string | null = null;
  export let draggingIndex: number | null = null;

  // Interaction callbacks
  export let onUpdate: (item: SequenceMacroItem) => void;
  export let onLock: () => void;
  export let onDelete: () => void;
  export let onUnlink: (() => void) | undefined = undefined;
  export let onDragStart: (e: DragEvent) => void;
  export let onDragEnd: () => void;
  export let onContextMenu: (e: MouseEvent) => void;

  export const sequence: SequenceItem[] = [];

  $: macroItem = item as any; // Cast for template usage

  function focusOnRequest(
    node: HTMLElement,
    params: { id: string; field: string },
  ) {
    const unsubscribe = focusRequest.subscribe((req) => {
      if (req && req.id === params.id && req.field === params.field) {
        node.focus();
        if (node instanceof HTMLInputElement) node.select();
      }
    });
    return {
      update(newParams: { id: string; field: string }) {
        params = newParams;
      },
      destroy() {
        unsubscribe();
      },
    };
  }

  function handleNameInput(e: Event) {
    const target = e.target as HTMLInputElement;
    item.name = target.value;
    onUpdate(item);
  }

  $: filePath = (item as any).filePath || "";
</script>

<tr
  data-seq-index={index}
  draggable={!isLocked}
  on:dragstart={onDragStart}
  on:dragend={onDragEnd}
  on:contextmenu={onContextMenu}
  class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 bg-teal-50 dark:bg-teal-900/20 transition-colors duration-150"
  class:border-t-2={dragOverIndex === index && dragPosition === "top"}
  class:border-b-2={dragOverIndex === index && dragPosition === "bottom"}
  class:border-blue-500={dragOverIndex === index}
  class:dark:border-blue-400={dragOverIndex === index}
  class:opacity-50={draggingIndex === index}
>
  <td
    class="w-8 px-2 py-2 text-center cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
  >
    <EllipsisHorizontalIcon className="w-4 h-4 mx-auto" />
  </td>
  <td class="px-3 py-2">
    <div class="relative w-full max-w-[160px]">
      <input
        class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-teal-500 focus:outline-none text-xs pr-6"
        value={item.name}
        on:input={handleNameInput}
        use:focusOnRequest={{
          id: `macro-${item.id}`,
          field: "name",
        }}
        disabled={isLocked}
        placeholder="Macro"
        aria-label="Macro Name"
      />
      <!-- Macro Icon -->
      <div
        class="absolute right-1 top-1/2 -translate-y-1/2 text-teal-500 flex items-center justify-center"
        title={`Macro: ${macroItem.filePath}`}
      >
        <LinkIcon className="w-3.5 h-3.5" />
      </div>
    </div>
  </td>
  <td
    class="px-3 py-2 text-neutral-400 text-xs italic truncate max-w-[100px]"
    title={macroItem.filePath}
  >
    {(macroItem.filePath || "").split(/[/\\]/).pop()}
  </td>
  <td class="px-3 py-2 text-neutral-400 text-xs italic"> - </td>
  <td class="px-3 py-2 text-left flex items-center justify-start gap-1">
    <!-- Lock toggle for macro -->
    <button
      on:click|stopPropagation={onLock}
      title={isLocked ? "Unlock macro" : "Lock macro"}
      aria-label={isLocked ? "Unlock macro" : "Lock macro"}
      class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
      aria-pressed={isLocked}
    >
      {#if isLocked}
        <LockIcon className="size-5 stroke-yellow-500" />
      {:else}
        <UnlockIcon className="size-5 stroke-gray-400" />
      {/if}
    </button>

    <!-- Unlink and Delete slots (hidden when locked) -->
    {#if !isLocked}
      {#if onUnlink}
        <button
          on:click|stopPropagation={onUnlink}
          title="Unlink macro"
          aria-label="Unlink macro"
          class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-teal-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
        >
          <UnlinkIcon className="size-4" />
        </button>
      {/if}
      <button
        on:click|stopPropagation={onDelete}
        title="Delete macro"
        aria-label="Delete macro"
        class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        <TrashIcon className="size-4" strokeWidth={2} />
      </button>
    {:else}
      {#if onUnlink}<span class="h-6 w-6" aria-hidden="true"></span>{/if}
      <span class="h-6 w-6" aria-hidden="true"></span>
    {/if}
  </td>
</tr>
