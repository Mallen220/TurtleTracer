<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type { SequenceItem } from "../../../types";
  import TrashIcon from "../icons/TrashIcon.svelte";
  import { focusRequest } from "../../../stores";

  export let item: SequenceItem;
  export let index: number;
  export let isLocked: boolean = false;

  // Drag & Drop props
  export let dragOverIndex: number | null = null;
  export let dragPosition: string | null = null;
  export let draggingIndex: number | null = null;

  // Interaction callbacks
  export let onUpdate: (item: SequenceItem) => void;
  export let onLock: () => void;
  export let onDelete: () => void;
  export let onDragStart: (e: DragEvent) => void;
  export let onDragEnd: () => void;
  export let onContextMenu: (e: MouseEvent) => void;

  export let sequence: SequenceItem[] = [];

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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      class="w-4 h-4 mx-auto"
    >
      <path
        fill-rule="evenodd"
        d="M10 3a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
        clip-rule="evenodd"
      />
    </svg>
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="w-3.5 h-3.5"
        >
          <path
            fill-rule="evenodd"
            d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm6.39-2.9a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0 1.06-1.06l-2.22-2.22 2.22-2.22ZM11.61 7.1a.75.75 0 1 0-1.22.872l2.22 2.22-2.22 2.22a.75.75 0 1 0 1.06 1.06l3.236-4.53-3.076-1.842Z"
            clip-rule="evenodd"
          />
        </svg>
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-5 stroke-yellow-500"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-5 stroke-gray-400"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      {/if}
    </button>

    <!-- Delete slot (hidden when locked) -->
    {#if !isLocked}
      <button
        on:click|stopPropagation={onDelete}
        title="Delete macro"
        aria-label="Delete macro"
        class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        <TrashIcon className="size-4" strokeWidth={2} />
      </button>
    {:else}
      <span class="h-6 w-6" aria-hidden="true"></span>
    {/if}
  </td>
</tr>
