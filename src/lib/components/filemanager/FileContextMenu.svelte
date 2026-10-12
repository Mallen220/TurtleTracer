<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileContextMenu.svelte -->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { fade } from "svelte/transition";
  import { menuNavigation } from "../../actions/menuNavigation";
  import {
    ArrowRightIcon,
    ArrowDownTrayIcon,
    PenIcon,
    DocumentIcon,
    ArrowCircleIcon,
    TrashIcon,
  } from "../icons";
  import { ui } from "../../ui";

  interface Props {
    x: number;
    y: number;
    fileName: string;
    isDirectory?: boolean;
    /** False hides Rename and Delete, for folders that can't be changed. */
    canChange?: boolean;
    onclose?: () => void;
    onaction?: (
      action:
        | "open"
        | "rename"
        | "delete"
        | "duplicate"
        | "mirror"
        | "reverse"
        | "save-to",
    ) => void;
  }

  let {
    x,
    y,
    fileName,
    isDirectory = false,
    canChange = true,
    onclose,
    onaction,
  }: Props = $props();

  let menuElement: HTMLDivElement | undefined = $state();

  function handleClickOutside(event: MouseEvent) {
    if (menuElement && !menuElement.contains(event.target as Node)) {
      onclose?.();
    }
  }

  // Adjust position if it goes off screen
  let adjustedX = $state(0);
  let adjustedY = $state(0);

  function updatePosition() {
    let nextX = x;
    let nextY = y;

    if (menuElement) {
      const rect = menuElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (x + rect.width > viewportWidth) {
        nextX = x - rect.width;
      }
      if (y + rect.height > viewportHeight) {
        nextY = y - rect.height;
      }
    }

    adjustedX = nextX;
    adjustedY = nextY;
  }

  $effect(() => {
    // Re-run whenever x, y or menuElement change
    // Just mentioning them here tracks them
    x;
    y;
    menuElement;

    // We defer to tick so the menuElement has a chance to be mounted/rendered
    tick().then(() => {
      updatePosition();
    });
  });

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  });
</script>

<div
  use:menuNavigation
  onclose={() => onclose?.()}
  bind:this={menuElement}
  class="{ui.menu} fixed z-[1200] min-w-[160px] text-sm"
  style="top: {adjustedY}px; left: {adjustedX}px;"
  transition:fade={{ duration: 100 }}
  role="menu"
  tabindex="-1"
>
  <div
    class="px-3 py-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700 mb-1 truncate max-w-[200px]"
  >
    {fileName}
  </div>

  <button onclick={() => onaction?.("open")} class={ui.menuItem}>
    <ArrowRightIcon className="size-4" />
    Open
  </button>

  {#if !isDirectory}
    <button onclick={() => onaction?.("save-to")} class={ui.menuItem}>
      <ArrowDownTrayIcon className="size-4" />
      Save Current to File
    </button>
  {/if}
  {#if canChange}
    <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>

    <button onclick={() => onaction?.("rename")} class={ui.menuItem}>
      <PenIcon className="size-4" strokeWidth={1.5} />
      Rename
    </button>
  {/if}

  {#if !isDirectory}
    <button onclick={() => onaction?.("duplicate")} class={ui.menuItem}>
      <DocumentIcon className="size-4" strokeWidth={1.5} />
      Duplicate
    </button>

    <button onclick={() => onaction?.("mirror")} class={ui.menuItem}>
      <!-- Need to flip vertically or similar for Mirror vs Reverse, we'll use ArrowCircleIcon or reverse its scale.
      <!-- Since ArrowCircleIcon is symmetrical, we'll just use it for both for now to replace SVG, or ArrowRightIcon -->
      <ArrowCircleIcon className="size-4" strokeWidth={1.5} />
      Mirror Copy
    </button>

    <button onclick={() => onaction?.("reverse")} class={ui.menuItem}>
      <ArrowCircleIcon className="size-4" strokeWidth={1.5} />
      Reverse Copy
    </button>
  {/if}
  {#if canChange}
    <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>

    <button onclick={() => onaction?.("delete")} class={ui.menuItemDanger}>
      <TrashIcon className="size-4" strokeWidth={1.5} />
      Delete
    </button>
  {/if}
</div>
