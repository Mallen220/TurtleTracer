<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileContextMenu.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { fade } from "svelte/transition";
  import {
    ArrowRightIcon,
    ArrowDownTrayIcon,
    PenIcon,
    DocumentIcon,
    ArrowCircleIcon,
    TrashIcon,
  } from "../icons";

  interface Props {
    x: number;
    y: number;
    fileName: string;
    isDirectory?: boolean;
  }

  let { x, y, fileName, isDirectory = false }: Props = $props();

  const dispatch = createEventDispatcher<{
    close: void;
    action:
      | "open"
      | "rename"
      | "delete"
      | "duplicate"
      | "mirror"
      | "reverse"
      | "save-to";
  }>();

  let menuElement: HTMLDivElement | undefined = $state();

  function handleClickOutside(event: MouseEvent) {
    if (menuElement && !menuElement.contains(event.target as Node)) {
      dispatch("close");
    }
  }

  // Adjust position if it goes off screen
  let adjustedX = $state(x);
  let adjustedY = $state(y);

  onMount(() => {
    if (menuElement) {
      const rect = menuElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (x + rect.width > viewportWidth) {
        adjustedX = x - rect.width;
      }
      if (y + rect.height > viewportHeight) {
        adjustedY = y - rect.height;
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  });
</script>

<div
  bind:this={menuElement}
  class="fixed z-[1200] min-w-[160px] py-1 bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 text-sm"
  style="top: {adjustedY}px; left: {adjustedX}px;"
  transition:fade={{ duration: 100 }}
  role="menu"
>
  <div
    class="px-3 py-1.5 text-xs font-semibold text-neutral-400 dark:text-neutral-500 border-b border-neutral-100 dark:border-neutral-700 mb-1 truncate max-w-[200px]"
  >
    {fileName}
  </div>

  <button
    onclick={() => dispatch("action", "open")}
    class="w-full text-left px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
  >
    <ArrowRightIcon className="size-4" />
    Open
  </button>

  {#if !isDirectory}
    <button
      onclick={() => dispatch("action", "save-to")}
      class="w-full text-left px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
    >
      <ArrowDownTrayIcon className="size-4" />
      Save Current to File
    </button>
  {/if}
  <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>

  <button
    onclick={() => dispatch("action", "rename")}
    class="w-full text-left px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
  >
    <PenIcon className="size-4" strokeWidth={1.5} />
    Rename
  </button>

  {#if !isDirectory}
    <button
      onclick={() => dispatch("action", "duplicate")}
      class="w-full text-left px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
    >
      <DocumentIcon className="size-4" strokeWidth={1.5} />
      Duplicate
    </button>

    <button
      onclick={() => dispatch("action", "mirror")}
      class="w-full text-left px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
    >
      <!-- Need to flip vertically or similar for Mirror vs Reverse, we'll use ArrowCircleIcon or reverse its scale.
      <!-- Since ArrowCircleIcon is symmetrical, we'll just use it for both for now to replace SVG, or ArrowRightIcon -->
      <ArrowCircleIcon className="size-4" strokeWidth={1.5} />
      Mirror Copy
    </button>

    <button
      onclick={() => dispatch("action", "reverse")}
      class="w-full text-left px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 flex items-center gap-2"
    >
      <ArrowCircleIcon className="size-4" strokeWidth={1.5} />
      Reverse Copy
    </button>
  {/if}
  <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>

  <button
    onclick={() => dispatch("action", "delete")}
    class="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center gap-2"
  >
    <TrashIcon className="size-4" strokeWidth={1.5} />
    Delete
  </button>
</div>
