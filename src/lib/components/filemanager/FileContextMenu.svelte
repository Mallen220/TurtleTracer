<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileContextMenu.svelte -->
<script lang="ts">
  import { tick } from "svelte";
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
    ChevronRightIcon,
  } from "../icons";
  import { ui } from "../../ui";
  import { customExportersStore } from "../../pluginsStore";
  import { isSupportedProjectFileName } from "../../../utils/fileExtensions";

  interface Props {
    x: number;
    y: number;
    fileName: string;
    isDirectory?: boolean;
    /** False hides Rename and Delete, for folders that can't be changed. */
    canChange?: boolean;
    /** Above 1: the menu acts on that many files, with Open, Rename and Save Current on the primary. */
    selectionCount?: number;
    primaryName?: string;
    onclose?: () => void;
    onaction?: (
      action:
        | "open"
        | "rename"
        | "delete"
        | "duplicate"
        | "mirror"
        | "reverse"
        | "save-to"
        | `export:${string}`,
    ) => void;
  }

  let {
    x,
    y,
    fileName,
    isDirectory = false,
    canChange = true,
    selectionCount = 1,
    primaryName = "",
    onclose,
    onaction,
  }: Props = $props();

  // The same formats as the Export menu in the navbar.
  const exportGroups = $derived([
    [
      ["java", "Java Code"],
      ["kotlin", "Kotlin Code"],
      ["points", "Points Array"],
      ["sequential", "Sequential Command"],
      ["json", ".turt File"],
    ],
    [
      ["image", "Export as Image"],
      ["gif", "Export Animated"],
      ["strategy", "Strategy Sheet"],
    ],
    $customExportersStore.map((e) => [`custom:${e.name}`, e.name]),
  ]);

  const many = $derived(selectionCount > 1);
  const all = $derived(many ? " All" : "");

  let exportOpen = $state(false);
  let exportButton: HTMLButtonElement | undefined = $state();
  let flyout: HTMLElement | undefined = $state();

  /** Opens to the right of the row, or to the left / higher up if it wouldn't fit. */
  function keepFlyoutOnScreen(node: HTMLElement) {
    const rect = node.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      node.style.left = "auto";
      node.style.right = "100%";
    }
    if (rect.bottom > window.innerHeight) {
      node.style.top = `${window.innerHeight - rect.bottom}px`;
    }
  }

  async function onExportKey(e: KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    exportOpen = true;
    await tick();
    flyout?.querySelector("button")?.focus();
  }

  function onFlyoutKey(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft") return;
    e.stopPropagation();
    exportOpen = false;
    exportButton?.focus();
  }
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
    class="px-3 py-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700 mb-1 truncate max-w-[260px]"
  >
    {many ? `${selectionCount} files · primary: ${primaryName}` : fileName}
  </div>

  <button onclick={() => onaction?.("open")} class={ui.menuItem}>
    <ArrowRightIcon className="size-4" />
    Open
    {#if many}<span
        class="ml-auto truncate max-w-[80px] text-xs font-normal text-neutral-400"
        >{primaryName}</span
      >{/if}
  </button>

  {#if !isDirectory}
    <button onclick={() => onaction?.("save-to")} class={ui.menuItem}>
      <ArrowDownTrayIcon className="size-4" />
      Save Current to File
      {#if many}<span
          class="ml-auto truncate max-w-[80px] text-xs font-normal text-neutral-400"
          >{primaryName}</span
        >{/if}
    </button>
  {/if}
  {#if canChange}
    <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>

    <button onclick={() => onaction?.("rename")} class={ui.menuItem}>
      <PenIcon className="size-4" strokeWidth={1.5} />
      Rename
      {#if many}<span
          class="ml-auto truncate max-w-[80px] text-xs font-normal text-neutral-400"
          >{primaryName}</span
        >{/if}
    </button>
  {/if}

  {#if !isDirectory}
    <button onclick={() => onaction?.("duplicate")} class={ui.menuItem}>
      <DocumentIcon className="size-4" strokeWidth={1.5} />
      Duplicate{all}
    </button>

    <button onclick={() => onaction?.("mirror")} class={ui.menuItem}>
      <!-- Need to flip vertically or similar for Mirror vs Reverse, we'll use ArrowCircleIcon or reverse its scale.
      <!-- Since ArrowCircleIcon is symmetrical, we'll just use it for both for now to replace SVG, or ArrowRightIcon -->
      <ArrowCircleIcon className="size-4" strokeWidth={1.5} />
      Mirror Copy{all}
    </button>

    <button onclick={() => onaction?.("reverse")} class={ui.menuItem}>
      <ArrowCircleIcon className="size-4" strokeWidth={1.5} />
      Reverse Copy{all}
    </button>
  {/if}
  {#if !isDirectory && isSupportedProjectFileName(fileName)}
    <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>

    <div
      class="relative"
      role="none"
      onmouseenter={() => (exportOpen = true)}
      onmouseleave={() => (exportOpen = false)}
    >
      <button
        bind:this={exportButton}
        class={ui.menuItem}
        aria-haspopup="menu"
        aria-expanded={exportOpen}
        onclick={() => (exportOpen = !exportOpen)}
        onkeydown={onExportKey}
      >
        <ArrowDownTrayIcon className="size-4" />
        Export{all}
        <ChevronRightIcon className="size-4 ml-auto" />
      </button>
      {#if exportOpen}
        <div
          bind:this={flyout}
          use:keepFlyoutOnScreen
          class="{ui.menu} absolute left-full top-0 w-52"
          role="menu"
          tabindex="-1"
          onkeydown={onFlyoutKey}
        >
          {#each exportGroups.filter((g) => g.length) as group, i}
            {#if i}
              <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>
            {/if}
            {#each group as [id, label]}
              <button
                onclick={() => onaction?.(`export:${id}`)}
                class={ui.menuItem}>{label}</button
              >
            {/each}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  {#if canChange}
    <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>

    <button onclick={() => onaction?.("delete")} class={ui.menuItemDanger}>
      <TrashIcon className="size-4" strokeWidth={1.5} />
      Delete{all}
    </button>
  {/if}
</div>
