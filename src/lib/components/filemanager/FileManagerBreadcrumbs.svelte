<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileManagerBreadcrumbs.svelte -->
<script lang="ts">
  import { tick } from "svelte";
  import { FolderIcon, UndoIcon } from "../icons";
  import { isBrowser } from "../../../utils/platform";
  import { displayPath, shortPathText } from "../../../utils/displayPaths";

  interface Props {
    currentPath: string;
    isAtBase?: boolean;
    onchangeDir?: (path: string) => void;
    onchangeDirDialog?: () => void;
    ongoUp?: () => void;
  }

  let {
    currentPath,
    isAtBase = false,
    onchangeDir,
    onchangeDirDialog,
    ongoUp,
  }: Props = $props();

  let isEditing = $state(false);
  let inputPath = $state("");
  let inputElement: HTMLInputElement | undefined = $state();

  async function startEditing() {
    isEditing = true;
    inputPath = currentPath;
    await tick();
    if (inputElement) {
      inputElement.select();
    }
  }

  function finishEditing() {
    if (!isEditing) return;
    isEditing = false;
    if (inputPath !== currentPath && inputPath.trim() !== "") {
      onchangeDir?.(inputPath.trim());
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      finishEditing();
    } else if (e.key === "Escape") {
      isEditing = false;
    }
  }
</script>

{#if isEditing}
  <div class="px-2 py-1 bg-white dark:bg-neutral-900 border-b border-blue-500">
    <input
      bind:this={inputElement}
      bind:value={inputPath}
      onblur={finishEditing}
      onkeydown={handleKeydown}
      class="w-full text-xs font-mono bg-transparent border-none focus:outline-none focus:ring-0 p-1 text-neutral-900 dark:text-neutral-100"
    />
  </div>
{:else}
  <div
    class="flex items-center px-2 py-1.5 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 dark:text-neutral-400 font-mono transition-colors"
  >
    {#if !isAtBase}
      <button
        class="p-1 mr-2 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 shrink-0"
        onclick={() => ongoUp?.()}
        title="Go up one directory"
        aria-label="Go Up"
      >
        <UndoIcon className="size-4" />
      </button>
    {/if}
    <div
      class="flex-1 min-w-0 truncate cursor-text hover:text-neutral-700 dark:hover:text-neutral-200 px-2 py-0.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
      title={`${displayPath(currentPath)}\nClick to edit`}
      onclick={startEditing}
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === "Enter" && startEditing()}
    >
      {shortPathText(currentPath)}
    </div>

    {#if !isBrowser}
      <button
        onclick={() => onchangeDirDialog?.()}
        class="p-1 ml-1 text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        title="Change Directory"
        aria-label="Change Directory"
      >
        <FolderIcon className="size-4" />
      </button>
    {/if}
  </div>
{/if}
