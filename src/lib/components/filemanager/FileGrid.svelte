<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { FileInfo } from "../../../types";
  import { AVAILABLE_FIELD_MAPS } from "../../../config/defaults";
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
  } from "../icons";
  import {
    FileBrowserState,
    filePreviews,
    fileSections,
    loadPreviewWhenVisible,
    formatFileSize,
    isToday,
    renameableName,
    setDraggedFile,
    type FileBrowserProps,
  } from "./fileBrowser.svelte";
  import { ui } from "../../ui";

  type Props = FileBrowserProps;

  let {
    files = [],
    selectedFilePath = null,
    sortMode = "name",
    renamingFile = null,
    fieldImage = null,
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
  const PRELOAD_COUNT = 30;

  const browser = new FileBrowserState(() => ({
    renamingFile,
    onselect,
    onrenameStart,
    onmenuAction,
    onmoveFile,
  }));

  const previews = $derived(filePreviews.previews);

  function handleFieldImageError(e: Event) {
    (e.target as HTMLImageElement).src =
      `/fields/${AVAILABLE_FIELD_MAPS[0].value}`;
  }

  // The "..." button opens the same menu, anchored to the button.
  function openContextMenuFromEvent(e: Event, file: FileInfo) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    browser.openMenuAt(
      Math.round(rect.right - 8),
      Math.round(rect.top + 8),
      file,
    );
  }

  function handleDragStart(e: DragEvent, file: FileInfo) {
    setDraggedFile(e, file);
    const preview = (e.currentTarget as HTMLElement).querySelector(
      ".preview-container, .mb-2.relative",
    );
    if (!(preview instanceof HTMLElement) || !e.dataTransfer) return;

    // Drag a fixed-size copy of the thumbnail; dragging the original looks
    // stretched because of its flex layout.
    const ghost = preview.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, {
      position: "absolute",
      top: "-9999px",
      left: "-9999px",
      width: "80px",
      height: "80px",
    });
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 40, 40);
    setTimeout(() => ghost.remove(), 0);
  }

  let groups = $derived(fileSections(files, sortMode));

  // Load previews for the first files and anything edited today straight
  // away; the rest load as they scroll into view.
  $effect(() => {
    files.forEach((f, i) => {
      if (f.isDirectory) return;
      if (i < PRELOAD_COUNT || isToday(new Date(f.modified))) {
        filePreviews.load(f.path);
      }
    });
  });
</script>

<div
  class="flex-1 overflow-y-auto pb-4"
  onclick={browser.closeMenu}
  role="button"
  tabindex="0"
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") browser.closeMenu();
  }}
>
  {#each groups as group}
    {#if sortMode === "date"}
      <div
        class="px-3 py-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider bg-neutral-50/50 dark:bg-neutral-800/50 sticky top-0 z-1 mb-2"
      >
        {group.title}
      </div>
    {/if}

    <div
      class="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 px-2"
    >
      {#each group.files as file (file.path)}
        <div
          class="group flex flex-col items-center p-2 rounded-md cursor-pointer transition-all border relative
          {selectedFilePath === file.path
            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 ring-1 ring-blue-300 dark:ring-blue-700'
            : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm'}
          {browser.dragOverTarget === file.path
            ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500'
            : ''}"
          onclick={() => onselect?.(file)}
          ondblclick={() => onopen?.(file)}
          oncontextmenu={(e) => browser.handleContextMenu(e, file)}
          role="button"
          tabindex="0"
          aria-label={file.name}
          use:loadPreviewWhenVisible={file}
          draggable="true"
          ondragstart={(e) => handleDragStart(e, file)}
          ondragover={(e) => browser.handleDragOver(e, file)}
          ondragleave={(e) => browser.handleDragLeave(e, file)}
          ondrop={(e) => browser.handleDrop(e, file)}
          onkeydown={(e) => {
            if (e.key === "Enter") onopen?.(file);
          }}
        >
          <!-- Icon / Preview -->
          <div class="mb-2 relative">
            <!-- Git Status Badge -->
            {#if showGitStatus && file.gitStatus && file.gitStatus !== "clean"}
              <div
                class="group/tooltip absolute top-1 left-1 z-10 p-1 rounded-full shadow-sm border cursor-help {ui
                  .badgeColor[ui.gitTone(file.gitStatus)]}"
              >
                <!-- Custom Tooltip -->
                <div
                  class="absolute left-0 bottom-full mb-1 w-max px-2 py-1 text-[10px] font-medium text-white bg-neutral-800 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-20"
                >
                  {gitStatusTitle(file.gitStatus)}
                </div>

                {#if file.gitStatus === "modified"}
                  <PenIcon className="size-3" strokeWidth={2} />
                {:else if file.gitStatus === "staged"}
                  <CheckIcon className="size-3" strokeWidth={2.5} />
                {:else}
                  <QuestionMarkIcon className="size-3" strokeWidth={2} />
                {/if}
              </div>
            {/if}

            {#if file.isDirectory}
              <div
                class="{ui.well} w-[80px] h-[80px] flex items-center justify-center text-blue-500 dark:text-blue-400"
              >
                <FolderIcon className="size-12" />
              </div>
            {:else if previews[file.path]}
              {@const preview = previews[file.path]!}
              <PathPreview
                startPoint={preview.startPoint}
                lines={preview.lines}
                fieldImage={fieldImage ? `/fields/${fieldImage}` : null}
                width={80}
                height={80}
              />
            {:else}
              <div class="{ui.well} w-[80px] h-[80px] overflow-hidden">
                {#if fieldImage}
                  <img
                    src={`/fields/${fieldImage}`}
                    alt="Field Map"
                    class="w-full h-full object-contain object-center"
                    onerror={handleFieldImageError}
                  />
                {:else}
                  <div
                    class="w-full h-full flex items-center justify-center text-blue-500 dark:text-blue-400"
                  >
                    <DocumentIcon className="size-8" />
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Kebab menu overlay (visible on hover) -->
            <button
              class="{ui.iconBtnSm
                .neutral} absolute top-1 right-1 opacity-0 group-hover:opacity-100"
              aria-label="More actions"
              onclick={(e) => {
                e.stopPropagation();
                openContextMenuFromEvent(e, file);
              }}
              title="More actions"
            >
              <EllipsisHorizontalIcon
                className="size-4 text-neutral-700 dark:text-neutral-300"
              />
            </button>
          </div>

          <!-- Content -->
          <div class="w-full text-center">
            {#if renamingFile?.path === file.path}
              <div class="w-full px-1">
                <FileRenameInput
                  bind:value={browser.renameInput}
                  class="text-center"
                  onsave={onrenameSave}
                  oncancel={onrenameCancel}
                />
              </div>
            {:else}
              <div class="flex items-center justify-center gap-1 w-full px-1">
                <span
                  class="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate"
                  title={file.name}
                >
                  {renameableName(file)}
                </span>
                <FileTypeBadge {file} />
              </div>
              {#if file.error}
                <div class="text-[10px] text-red-500 truncate">
                  {file.error}
                </div>
              {/if}
              {#if !file.isDirectory}
                <div
                  class="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1"
                >
                  {formatFileSize(file.size)}
                </div>
              {/if}
            {/if}
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
