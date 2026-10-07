<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { FileInfo } from "../../../types";
  import { AVAILABLE_FIELD_MAPS } from "../../../config/defaults";
  import FileContextMenu from "./FileContextMenu.svelte";
  import PathPreview from "./PathPreview.svelte";
  import {
    FolderIcon,
    DocumentIcon,
    PenIcon,
    CheckIcon,
    QuestionMarkIcon,
    EllipsisHorizontalIcon,
  } from "../icons";
  import {
    filePreviews,
    loadPreviewWhenVisible,
    selectOnMount,
    formatFileSize,
    groupFilesByDate,
    isToday,
    renameableName,
    setDraggedFile,
    getDraggedFile,
  } from "./fileBrowser.svelte";

  interface Props {
    files?: FileInfo[];
    selectedFilePath?: string | null;
    sortMode?: "name" | "date";
    renamingFile?: FileInfo | null;
    fieldImage?: string | null;
    showGitStatus?: boolean;
    onselect?: (file: FileInfo) => void;
    onopen?: (file: FileInfo) => void;
    onrenameStart?: (file: FileInfo) => void;
    onrenameSave?: (name: string) => void;
    onrenameCancel?: () => void;
    onmoveFile?: (data: { sourceFile: FileInfo; targetDir: FileInfo }) => void;
    /** Folders can't be renamed or deleted (in a GitHub repository). */
    lockFolders?: boolean;
    onmenuAction?: (data: { action: string; file: FileInfo }) => void;
  }

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

  let contextMenu: { x: number; y: number; file: FileInfo } | null =
    $state(null);
  let renameInput = $state("");
  let lastRenamingPath: string | null = null;
  let dragOverTarget: string | null = $state(null);

  const previews = $derived(filePreviews.previews);

  function handleFieldImageError(e: Event) {
    (e.target as HTMLImageElement).src =
      `/fields/${AVAILABLE_FIELD_MAPS[0].value}`;
  }

  function handleContextMenu(event: MouseEvent, file: FileInfo) {
    event.preventDefault();
    contextMenu = { x: event.clientX, y: event.clientY, file };
    onselect?.(file);
  }

  // The "..." button opens the same menu, anchored to the button.
  function openContextMenuFromEvent(e: Event, file: FileInfo) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    contextMenu = {
      x: Math.round(rect.right - 8),
      y: Math.round(rect.top + 8),
      file,
    };
    onselect?.(file);
  }

  function handleMenuAction(action: string) {
    if (!contextMenu) return;
    const file = contextMenu.file;
    contextMenu = null;
    if (action === "rename") onrenameStart?.(file);
    else onmenuAction?.({ action, file });
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

  function handleDragOver(e: DragEvent, file: FileInfo) {
    if (!file.isDirectory) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dragOverTarget = file.path;
  }

  function handleDragLeave(_e: DragEvent, file: FileInfo) {
    if (dragOverTarget === file.path) dragOverTarget = null;
  }

  function handleDrop(e: DragEvent, file: FileInfo) {
    dragOverTarget = null;
    // Don't let the window's file-drop handler treat this as opening a file.
    e.preventDefault();
    e.stopPropagation();
    if (!file.isDirectory) return;

    const sourceFile = getDraggedFile(e);
    if (sourceFile && sourceFile.path !== file.path) {
      onmoveFile?.({ sourceFile, targetDir: file });
    }
  }

  $effect(() => {
    if (!renamingFile) {
      lastRenamingPath = null;
    } else if (renamingFile.path !== lastRenamingPath) {
      renameInput = renameableName(renamingFile);
      lastRenamingPath = renamingFile.path;
    }
  });

  let groups = $derived(
    sortMode === "date" ? groupFilesByDate(files) : [{ title: "Files", files }],
  );

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
  onclick={() => (contextMenu = null)}
  role="button"
  tabindex="0"
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") contextMenu = null;
  }}
>
  {#each groups as group}
    {#if sortMode === "date"}
      <div
        class="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider bg-neutral-50/50 dark:bg-neutral-800/50 sticky top-0 z-1 mb-2"
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
          {dragOverTarget === file.path
            ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500'
            : ''}"
          onclick={() => onselect?.(file)}
          ondblclick={() => onopen?.(file)}
          oncontextmenu={(e) => handleContextMenu(e, file)}
          role="button"
          tabindex="0"
          aria-label={file.name}
          use:loadPreviewWhenVisible={file}
          draggable="true"
          ondragstart={(e) => handleDragStart(e, file)}
          ondragover={(e) => handleDragOver(e, file)}
          ondragleave={(e) => handleDragLeave(e, file)}
          ondrop={(e) => handleDrop(e, file)}
          onkeydown={(e) => {
            if (e.key === "Enter") onopen?.(file);
          }}
        >
          <!-- Icon / Preview -->
          <div class="mb-2 relative">
            <!-- Git Status Badge -->
            {#if showGitStatus && file.gitStatus && file.gitStatus !== "clean"}
              <div
                class="group/tooltip absolute top-1 left-1 z-10 p-1 rounded-full shadow-sm border cursor-help
                  {file.gitStatus === 'modified'
                  ? 'bg-amber-100 border-amber-200 text-amber-700 dark:bg-amber-900/80 dark:border-amber-700/50 dark:text-amber-300'
                  : file.gitStatus === 'staged'
                    ? 'bg-green-100 border-green-200 text-green-700 dark:bg-green-900/80 dark:border-green-700/50 dark:text-green-300'
                    : 'bg-neutral-100 border-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-300'}"
              >
                <!-- Custom Tooltip -->
                <div
                  class="absolute left-0 bottom-full mb-1 w-max px-2 py-1 text-[10px] font-medium text-white bg-neutral-800 rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-20"
                >
                  {file.gitStatus === "modified"
                    ? "Git: Modified (Unstaged Changes)"
                    : file.gitStatus === "staged"
                      ? "Git: Staged (Ready to Commit)"
                      : "Git: Untracked (New File)"}
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
                class="w-[80px] h-[80px] rounded flex items-center justify-center text-blue-500 dark:text-blue-400 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700"
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
              <div
                class="w-[80px] h-[80px] rounded overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50"
              >
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
              class="absolute top-1 right-1 p-1 rounded-full bg-white/80 dark:bg-neutral-800/80 shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              aria-label="More actions"
              onclick={(e) => {
                e.stopPropagation();
                openContextMenuFromEvent(e, file);
              }}
              title="More actions"
            >
              <EllipsisHorizontalIcon
                className="size-4 text-neutral-600 dark:text-neutral-300"
              />
            </button>
          </div>

          <!-- Content -->
          <div class="w-full text-center">
            {#if renamingFile?.path === file.path}
              <div class="w-full px-1">
                <input
                  type="text"
                  bind:value={renameInput}
                  use:selectOnMount
                  onclick={(e) => {
                    e.stopPropagation();
                  }}
                  class="w-full text-xs text-center border border-blue-400 rounded focus:outline-none dark:bg-neutral-700 py-0.5"
                  onkeydown={(e: KeyboardEvent) => {
                    e.stopPropagation();
                    if (e.key === "Enter") onrenameSave?.(renameInput);
                    if (e.key === "Escape") onrenameCancel?.();
                  }}
                  onblur={() => onrenameCancel?.()}
                />
              </div>
            {:else}
              <div
                class="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate w-full px-1"
                title={file.name}
              >
                {file.name.replaceAll(/\.(pp|turt)$/gi, "")}
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

{#if contextMenu}
  <FileContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    fileName={contextMenu.file.name}
    isDirectory={contextMenu.file.isDirectory}
    canChange={!(lockFolders && contextMenu.file.isDirectory)}
    onclose={() => (contextMenu = null)}
    onaction={(action) => handleMenuAction(action)}
  />
{/if}
