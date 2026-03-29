<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { SequenceWaitItem, SequenceItem } from "../../../types";
  import { tooltipPortal } from "../../actions/portal";
  import TrashIcon from "../icons/TrashIcon.svelte";
  import EllipsisHorizontalIcon from "../icons/EllipsisHorizontalIcon.svelte";
  import LinkIcon from "../icons/LinkIcon.svelte";
  import LockIcon from "../icons/LockIcon.svelte";
  import UnlockIcon from "../icons/UnlockIcon.svelte";
  import { isWaitLinked } from "../../../utils/pointLinking";
  import { focusRequest } from "../../../stores";

  export let item: SequenceWaitItem;
  export let index: number;
  export let isLocked: boolean = false;

  // Drag & Drop props
  export let dragOverIndex: number | null = null;
  export let dragPosition: string | null = null;
  export let draggingIndex: number | null = null;

  // Interaction callbacks
  export let onUpdate: (item: SequenceWaitItem) => void;
  export let onLock: () => void;
  export let onDelete: () => void;
  export let onDragStart: (e: DragEvent) => void;
  export let onDragEnd: () => void;
  export let onContextMenu: (e: MouseEvent) => void;

  export let sequence: SequenceItem[] = []; // Needed for linking checks

  $: waitItem = item; // Cast for template usage

  let hoveredWaitId: string | null = null;
  let hoveredWaitAnchor: HTMLElement | null = null;

  function handleWaitHoverEnter(e: MouseEvent, id: string | null) {
    hoveredWaitId = id;
    hoveredWaitAnchor = e.currentTarget as HTMLElement;
  }
  function handleWaitHoverLeave() {
    hoveredWaitId = null;
    hoveredWaitAnchor = null;
  }

  // Focus Handling Action (copied/adapted from WaypointTable)
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

  function handleDurationInput(e: Event) {
    const target = e.target as HTMLInputElement;
    (item as any).durationMs = parseFloat(target.value);
    onUpdate(item);
  }
</script>

<tr
  data-seq-index={index}
  draggable={!isLocked}
  on:dragstart={onDragStart}
  on:dragend={onDragEnd}
  on:contextmenu={onContextMenu}
  class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 bg-amber-50 dark:bg-amber-900/20 transition-colors duration-150"
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
        class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-amber-500 focus:outline-none text-xs pr-6"
        class:text-amber-500={hoveredWaitId === item.id}
        value={item.name}
        on:input={handleNameInput}
        use:focusOnRequest={{
          id: `wait-${item.id}`,
          field: "name",
        }}
        disabled={isLocked}
        placeholder="Wait"
        aria-label="Wait"
      />
      {#if isWaitLinked(sequence, item.id)}
        <div
          role="presentation"
          class="absolute right-1 top-1/2 -translate-y-1/2 text-amber-500 cursor-help flex items-center justify-center"
          on:mouseenter={(e) => handleWaitHoverEnter(e, item.id)}
          on:mouseleave={handleWaitHoverLeave}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          {#if hoveredWaitId === item.id}
            <div
              use:tooltipPortal={hoveredWaitAnchor}
              class="w-64 p-2 bg-amber-100 dark:bg-amber-900 border border-amber-300 dark:border-amber-700 rounded shadow-lg text-xs text-amber-900 dark:text-amber-100 z-50 pointer-events-none"
            >
              <strong>Linked Wait</strong><br />
              Logic: Same Name = Shared Duration.<br />
              This wait event shares its duration with other waits named '{item.name}'.
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </td>
  <td class="px-3 py-2">
    <input
      type="number"
      class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-amber-500 focus:outline-none text-xs"
      min="0"
      value={waitItem.durationMs}
      aria-label="{item.name || 'Wait'} Duration"
      on:input={handleDurationInput}
      use:focusOnRequest={{ id: `wait-${item.id}`, field: "x" }}
      disabled={isLocked}
    />
  </td>
  <td class="px-3 py-2 text-neutral-400 text-xs italic"> - </td>
  <td class="px-3 py-2 text-left flex items-center justify-start gap-1">
    <!-- Lock toggle for wait -->
    <button
      on:click|stopPropagation={onLock}
      title={isLocked ? "Unlock wait" : "Lock wait"}
      aria-label={isLocked ? "Unlock wait" : "Lock wait"}
      class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
      aria-pressed={isLocked}
    >
      {#if isLocked}
        <LockIcon className="size-5 stroke-yellow-500" />
      {:else}
        <UnlockIcon className="size-5 stroke-gray-400" />
      {/if}
    </button>

    <!-- Delete slot (hidden when locked) -->
    {#if !isLocked}
      <button
        on:click|stopPropagation={onDelete}
        title="Delete wait"
        aria-label="Delete wait"
        class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        <TrashIcon className="size-4" strokeWidth={2} />
      </button>
    {:else}
      <span class="h-6 w-6" aria-hidden="true"></span>
    {/if}
  </td>
</tr>
