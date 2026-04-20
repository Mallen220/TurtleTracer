<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { SequenceRotateItem, SequenceItem } from "../../../types";
  import TrashIcon from "../icons/TrashIcon.svelte";
  import Bars3Icon from "../icons/Bars3Icon.svelte";
  import LinkIcon from "../icons/LinkIcon.svelte";
  import TriangleWarningIcon from "../icons/TriangleWarningIcon.svelte";
  import LockIcon from "../icons/LockIcon.svelte";
  import UnlockIcon from "../icons/UnlockIcon.svelte";
  import { isRotateLinked } from "../../../utils/pointLinking";
  import { transformAngle } from "../../../utils/math";
  import { focusRequest } from "../../../stores";

  interface Props {
    item: SequenceRotateItem;
    index: number;
    isLocked?: boolean;
    // Drag & Drop props
    dragOverIndex?: number | null;
    dragPosition?: string | null;
    draggingIndex?: number | null;
    // Interaction callbacks
    onUpdate: (item: SequenceRotateItem) => void;
    onLock: () => void;
    onDelete: () => void;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
    onContextMenu: (e: MouseEvent) => void;
    sequence?: SequenceItem[];
  }

  let {
    item = $bindable(),
    index,
    isLocked = false,
    dragOverIndex = null,
    dragPosition = null,
    draggingIndex = null,
    onUpdate,
    onLock,
    onDelete,
    onDragStart,
    onDragEnd,
    onContextMenu,
    sequence = [],
  }: Props = $props();

  let rotateItem = $derived(item); // Cast for template usage

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
    (item as any).degrees = Number.parseFloat(target.value);
    // `updateLinkedRotations` is needed here.
    onUpdate(item);
  }

  function normalizeDegrees() {
    (item as any).degrees = transformAngle(rotateItem.degrees);
    onUpdate(item);
  }

  let isOutOfBounds = $derived(
    rotateItem.degrees !== undefined &&
      (rotateItem.degrees > 180 || rotateItem.degrees <= -180),
  );
</script>

<tr
  data-seq-index={index}
  draggable={!isLocked}
  ondragstart={onDragStart}
  ondragend={onDragEnd}
  oncontextmenu={onContextMenu}
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
    <Bars3Icon className="w-4 h-4 mx-auto" />
  </td>
  <td class="px-3 py-2">
    <div class="relative w-full max-w-[160px]">
      <input
        class="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-pink-500 focus:outline-none text-xs pr-6"
        value={item.name}
        oninput={handleNameInput}
        use:focusOnRequest={{
          id: `rotate-${item.id}`,
          field: "name",
        }}
        disabled={isLocked}
        placeholder="Rotate"
        aria-label="Rotate"
      />
      {#if isRotateLinked(sequence, item.id)}
        <div
          class="absolute right-1 top-1/2 -translate-y-1/2 text-pink-500 cursor-help flex items-center justify-center"
          title="Linked Rotate: Same Name = Shared Degrees"
        >
          <LinkIcon className="w-3.5 h-3.5" />
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
        oninput={handleDegreesInput}
        use:focusOnRequest={{
          id: `rotate-${item.id}`,
          field: "heading",
        }}
        disabled={isLocked}
      />
      {#if isOutOfBounds && !isLocked}
        <button
          onclick={normalizeDegrees}
          title="Angle is out of bounds. Click to normalize to [-180, 180]."
          aria-label="Normalize angle"
          class="p-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 transition-colors"
        >
          <TriangleWarningIcon className="size-4" />
        </button>
      {/if}
    </div>
  </td>
  <td class="px-3 py-2 text-left flex items-center justify-start gap-1">
    <!-- Lock toggle for rotate -->
    <button
      onclick={(e) => {
        e.stopPropagation();
        onLock();
      }}
      title={isLocked ? "Unlock rotate" : "Lock rotate"}
      aria-label={isLocked ? "Unlock rotate" : "Lock rotate"}
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
        onclick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
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
