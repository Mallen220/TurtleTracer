<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileContextMenu.svelte -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { menuNavigation } from "../../actions/menuNavigation";
  import { floatingMenu } from "../../actions/floatingMenu";
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
</script>

<div
  use:menuNavigation
  onclose={() => onclose?.()}
  use:floatingMenu={{ x, y, onclose: () => onclose?.() }}
  class="{ui.menu} fixed z-[1200] min-w-[160px] text-sm"
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
