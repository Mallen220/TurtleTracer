<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { FileInfo } from "../../../types";
  import PathPreview from "./PathPreview.svelte";
  import FileBrowserMenu from "./FileBrowserMenu.svelte";
  import FileRenameInput from "./FileRenameInput.svelte";
  import FileTypeBadge from "./FileTypeBadge.svelte";
  import { gitStatusTitle } from "../../../utils/gitStatusTitle";
  import {
    FolderIcon,
    DocumentIcon,
    PenIcon,
    CheckIcon,
    QuestionMarkIcon,
    EllipsisHorizontalIcon,
    TriangleWarningIcon,
    DotIcon,
  } from "../icons";
  import {
    FileBrowserState,
    filePreviews,
    fileSections,
    loadPreviewWhenVisible,
    formatFileSize,
    renameableName,
    setDraggedFile,
    type FileBrowserProps,
  } from "./fileBrowser.svelte";
  import { ui } from "../../ui";

  type Props = FileBrowserProps;

  let {
    fieldImage = null,
    files = [],
    selectedFilePath = null,
    sortMode = "name",
    renamingFile = null,
    showGitStatus = true,
    onselect,
    onopen,
    onrenameStart,
    onrenameSave,
    onrenameCancel,
    onmoveFile,
    lockFolders = false,
    onmenuAction,
  }: Props = $props();

  // How many of the first files get their previews loaded straight away.
  const PRELOAD_COUNT = 12;

  const browser = new FileBrowserState(() => ({
    renamingFile,
    onselect,
    onrenameStart,
    onmenuAction,
    onmoveFile,
  }));

  const previews = $derived(filePreviews.previews);

  const formatDate = (date: Date) => new Date(date).toLocaleDateString();

  function handleDragStart(e: DragEvent, file: FileInfo) {
    setDraggedFile(e, file);
    const icon = (e.currentTarget as HTMLElement).querySelector(
      ".preview-container, .shrink-0",
    );
    if (icon) e.dataTransfer?.setDragImage(icon, 24, 24);
  }

  let groups = $derived(fileSections(files, sortMode));

  // Load previews for the first few files straight away; the rest load as
  // they scroll into view.
  $effect(() => {
    for (const f of files.slice(0, PRELOAD_COUNT)) {
      if (!f.isDirectory) filePreviews.load(f.path);
    }
  });
</script>

<div
  class="flex-1 overflow-y-auto pb-4"
  onclick={browser.closeMenu}
  role="presentation"
>
  {#each groups as group}
    {#if sortMode === "date"}
      <div
        class="px-3 py-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider bg-neutral-50/50 dark:bg-neutral-800/50 sticky top-0 z-1"
        role="presentation"
      >
        {group.title}
      </div>
    {/if}

    <div class="space-y-0.5 px-2 mt-1">
      {#each group.files as file (file.path)}
        <div
          use:loadPreviewWhenVisible={file}
          class="group flex items-center p-2 rounded-md cursor-pointer transition-colors border border-transparent
          {selectedFilePath === file.path
            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}
          {browser.dragOverTarget === file.path
            ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500'
            : ''}"
          onclick={() => onselect?.(file)}
          ondblclick={() => onopen?.(file)}
          oncontextmenu={(e) => browser.handleContextMenu(e, file)}
          role="button"
          tabindex="0"
          aria-label={file.name}
          draggable="true"
          ondragstart={(e) => handleDragStart(e, file)}
          ondragover={(e) => browser.handleDragOver(e, file)}
          ondragleave={(e) => browser.handleDragLeave(e, file)}
          ondrop={(e) => browser.handleDrop(e, file)}
          onkeydown={(e) => {
            if (e.key === "Enter") onopen?.(file);
          }}
        >
          <!-- Icon -->
          <div class="mr-3 text-blue-500 dark:text-blue-400 shrink-0">
            {#if file.isDirectory}
              <div
                class="w-12 h-12 flex items-center justify-center text-blue-500 dark:text-blue-400"
              >
                <FolderIcon className="size-5" />
              </div>
            {:else if previews[file.path]}
              {@const preview = previews[file.path]!}
              <PathPreview
                startPoint={preview.startPoint}
                lines={preview.lines}
                fieldImage={fieldImage ? `/fields/${fieldImage}` : null}
                width={48}
                height={48}
              />
            {:else}
              <div
                class="w-12 h-12 flex items-center justify-center text-blue-500 dark:text-blue-400"
              >
                <DocumentIcon className="size-6" />
              </div>
            {/if}
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            {#if renamingFile?.path === file.path}
              <div
                class="flex items-center gap-1"
                onclick={(e) => {
                  e.stopPropagation();
                }}
                role="presentation"
              >
                <FileRenameInput
                  bind:value={browser.renameInput}
                  onsave={onrenameSave}
                  oncancel={onrenameCancel}
                />
              </div>
            {:else}
              <div class="flex items-baseline justify-between gap-2">
                <span class="flex items-center gap-1.5 min-w-0">
                  <span
                    class="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate"
                    title={file.name}
                  >
                    {renameableName(file)}
                  </span>
                  <FileTypeBadge {file} />
                </span>
                <div class="flex items-center gap-1">
                  {#if showGitStatus && file.gitStatus && file.gitStatus !== "clean"}
                    <div
                      class={ui.badge[ui.gitTone(file.gitStatus)]}
                      title={gitStatusTitle(file.gitStatus)}
                    >
                      {#if file.gitStatus === "modified"}
                        <PenIcon className="size-3" strokeWidth={2} />
                        <span>Modified</span>
                      {:else if file.gitStatus === "staged"}
                        <CheckIcon className="size-3" strokeWidth={2.5} />
                        <span>Staged</span>
                      {:else}
                        <QuestionMarkIcon className="size-3" />
                        <span>Untracked</span>
                      {/if}
                    </div>
                  {/if}
                  {#if file.error}
                    <TriangleWarningIcon className="size-3 text-red-500" />
                  {/if}
                </div>
              </div>
              <div
                class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400"
              >
                {#if !file.isDirectory}
                  <span>{formatFileSize(file.size)}</span>
                {/if}
                {#if sortMode === "name" && !file.isDirectory}
                  <DotIcon className="-mx-1 opacity-40 shrink-0" />
                {/if}
                {#if sortMode === "name" || file.isDirectory}
                  <span>{formatDate(file.modified)}</span>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Quick Actions (Hover) -->
          <div
            class="ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center"
          >
            <button
              class={ui.iconBtnSm.neutral}
              onclick={(e: MouseEvent) => {
                e.stopPropagation();
                browser.handleContextMenu(e, file);
              }}
              title="More actions"
              aria-label="File actions"
            >
              <EllipsisHorizontalIcon className="size-5" />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/each}
</div>

{#if browser.contextMenu}
  <FileBrowserMenu
    menu={browser.contextMenu}
    {lockFolders}
    onclose={browser.closeMenu}
    onaction={browser.handleMenuAction}
  />
{/if}
