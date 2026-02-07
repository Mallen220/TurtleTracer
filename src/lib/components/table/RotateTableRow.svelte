<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type { SequenceRotateItem, SequenceItem } from "../../../types";
  import TrashIcon from "../icons/TrashIcon.svelte";
  import { isRotateLinked } from "../../../utils/pointLinking";
  import { transformAngle } from "../../../utils/math";
  import { focusRequest } from "../../../stores";

  export let item: SequenceRotateItem;
  export let index: number;
  export let isLocked: boolean = false;

  // Drag & Drop props
  export let dragOverIndex: number | null = null;
  export let dragPosition: string | null = null;
  export let draggingIndex: number | null = null;

  // Interaction callbacks
  export let onUpdate: (item: SequenceRotateItem) => void;
  export let onLock: () => void;
  export let onDelete: () => void;
  export let onDragStart: (e: DragEvent) => void;
  export let onDragEnd: () => void;
  export let onContextMenu: (e: MouseEvent) => void;

  export let sequence: SequenceItem[] = [];

  $: rotateItem = item; // Cast for template usage

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
    // Note: WaypointTable handles `handleRotateRename` in `onUpdate` wrapper usually?
    // Wait, in WaypointTable I changed it to:
    // onUpdate={(updatedItem) => { sequence[seqIndex] = updatedItem; ... }}
    // For Wait, I handled linked updates.
    // For Rotate, I should check if I need to handle linked updates.
    // `handleRotateRename` is the equivalent.
    onUpdate(item);
  }

  function handleDegreesInput(e: Event) {
    const target = e.target as HTMLInputElement;
    (item as any).degrees = parseFloat(target.value);
    // `updateLinkedRotations` is needed here.
    onUpdate(item);
  }

  function normalizeDegrees() {
    (item as any).degrees = transformAngle(rotateItem.degrees);
    onUpdate(item);
  }

  $: isOutOfBounds =
    rotateItem.degrees !== undefined &&
    (rotateItem.degrees > 180 || rotateItem.degrees <= -180);
</script>

<tr
  data-seq-index={index}
  draggable={!isLocked}
  on:dragstart={onDragStart}
  on:dragend={onDragEnd}
  on:contextmenu={onContextMenu}
  class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 bg-pink-50 dark:bg-pink-900/20 transition-colors duration-150"
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
        class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-pink-500 focus:outline-none text-xs pr-6"
        value={item.name}
        on:input={handleNameInput}
        use:focusOnRequest={{
          id: `rotate-${item.id}`,
          field: "name",
        }}
        disabled={isLocked}
        placeholder="Rotate"
        aria-label="Rotate"
      />
      {#if isRotateLinked(sequence, item.id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="absolute right-1 top-1/2 -translate-y-1/2 text-pink-500 cursor-help flex items-center justify-center"
          title="Linked Rotate: Same Name = Shared Degrees"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="w-3.5 h-3.5"
          >
            <path
              fill-rule="evenodd"
              d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
      {/if}
    </div>
  </td>
  <td class="px-3 py-2 text-neutral-400 text-xs italic"> - </td>
  <td class="px-3 py-2">
    <div class="flex items-center gap-1">
      <input
        type="number"
        class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-pink-500 focus:outline-none text-xs"
        class:border-yellow-500={isOutOfBounds}
        class:dark:border-yellow-500={isOutOfBounds}
        value={rotateItem.degrees}
        aria-label="{item.name || 'Rotate'} Degrees"
        on:input={handleDegreesInput}
        use:focusOnRequest={{
          id: `rotate-${item.id}`,
          field: "heading",
        }}
        disabled={isLocked}
      />
      {#if isOutOfBounds && !isLocked}
        <button
          on:click={normalizeDegrees}
          title="Angle is out of bounds. Click to normalize to [-180, 180]."
          class="p-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-4"
          >
            <path
              d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      {/if}
    </div>
  </td>
  <td class="px-3 py-2 text-left flex items-center justify-start gap-1">
    <!-- Lock toggle for rotate -->
    <button
      on:click|stopPropagation={onLock}
      title={isLocked ? "Unlock rotate" : "Lock rotate"}
      aria-label={isLocked ? "Unlock rotate" : "Lock rotate"}
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
        title="Delete rotate"
        aria-label="Delete rotate"
        class="inline-flex items-center justify-center h-6 w-6 p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        <TrashIcon className="size-4" strokeWidth={2} />
      </button>
    {:else}
      <span class="h-6 w-6" aria-hidden="true"></span>
    {/if}
  </td>
</tr>
