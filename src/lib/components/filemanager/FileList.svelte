<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { FileInfo } from "../../../types";
  import FileContextMenu from "./FileContextMenu.svelte";
  import PathPreview from "./PathPreview.svelte";
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
    filePreviews,
    loadPreviewWhenVisible,
    selectOnMount,
    formatFileSize,
    groupFilesByDate,
    renameableName,
    setDraggedFile,
    getDraggedFile,
  } from "./fileBrowser.svelte";

  interface Props {
    fieldImage?: string | null;
    files?: FileInfo[];
    selectedFilePath?: string | null;
    sortMode?: "name" | "date";
    renamingFile?: FileInfo | null;
    showGitStatus?: boolean;
    onselect?: (file: FileInfo) => void;
    onopen?: (file: FileInfo) => void;
    onrenameStart?: (file: FileInfo) => void;
    onrenameSave?: (name: string) => void;
    onrenameCancel?: () => void;
    onmoveFile?: (data: { sourceFile: FileInfo; targetDir: FileInfo }) => void;
    onmenuAction?: (data: { action: string; file: FileInfo }) => void;
  }

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
    onmenuAction,
  }: Props = $props();

  // How many of the first files get their previews loaded straight away.
  const PRELOAD_COUNT = 12;

  let contextMenu: { x: number; y: number; file: FileInfo } | null =
    $state(null);
  let renameInput = $state("");
  let lastRenamingPath: string | null = null;
  let dragOverTarget: string | null = $state(null);

  const previews = $derived(filePreviews.previews);

  const formatDate = (date: Date) => new Date(date).toLocaleDateString();

  function handleContextMenu(event: MouseEvent, file: FileInfo) {
    event.preventDefault();
    contextMenu = { x: event.clientX, y: event.clientY, file };
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
    const icon = (e.currentTarget as HTMLElement).querySelector(
      ".preview-container, .shrink-0",
    );
    if (icon) e.dataTransfer?.setDragImage(icon, 24, 24);
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
  onclick={() => (contextMenu = null)}
  role="presentation"
>
  {#each groups as group}
    {#if sortMode === "date"}
      <div
        class="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider bg-neutral-50/50 dark:bg-neutral-800/50 sticky top-0 backdrop-blur-sm z-1"
        role="presentation"
      >
        {group.title}
      </div>
    {/if}

    <div class="space-y-0.5 px-2 mt-1">
      {#each group.files as file (file.path)}
        <div
          use:loadPreviewWhenVisible={file}
          class="group flex items-center p-2 cursor-pointer transition-colors border border-transparent
          {selectedFilePath === file.path
            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}
          {dragOverTarget === file.path
            ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500'
            : ''}"
          onclick={() => onselect?.(file)}
          ondblclick={() => onopen?.(file)}
          oncontextmenu={(e) => handleContextMenu(e, file)}
          role="button"
          tabindex="0"
          aria-label={file.name}
          draggable="true"
          ondragstart={(e) => handleDragStart(e, file)}
          ondragover={(e) => handleDragOver(e, file)}
          ondragleave={(e) => handleDragLeave(e, file)}
          ondrop={(e) => handleDrop(e, file)}
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
                <input
                  type="text"
                  bind:value={renameInput}
                  use:selectOnMount
                  class="w-full px-1 py-0.5 text-sm border border-blue-400 rounded focus:outline-none dark:bg-neutral-700"
                  onkeydown={(e: KeyboardEvent) => {
                    e.stopPropagation();
                    if (e.key === "Enter") onrenameSave?.(renameInput);
                    if (e.key === "Escape") onrenameCancel?.();
                  }}
                  onblur={() => onrenameCancel?.()}
                />
              </div>
            {:else}
              <div class="flex items-baseline justify-between gap-2">
                <span
                  class="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate"
                  title={file.name}
                >
                  {file.name.replaceAll(/\.(pp|turt)$/gi, "")}
                </span>
                <div class="flex items-center gap-1">
                  {#if showGitStatus && file.gitStatus && file.gitStatus !== "clean"}
                    <div
                      class="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border
                      {file.gitStatus === 'modified'
                        ? 'bg-amber-100 border-amber-200 text-amber-700 dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-300'
                        : file.gitStatus === 'staged'
                          ? 'bg-green-100 border-green-200 text-green-700 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300'
                          : 'bg-neutral-100 border-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-300'}"
                      title={file.gitStatus === "modified"
                        ? "Git: Modified (Unstaged Changes)"
                        : file.gitStatus === "staged"
                          ? "Git: Staged (Ready to Commit)"
                          : "Git: Untracked (New File)"}
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
              class="p-1 bg-white/80 dark:bg-neutral-800/80 shadow-sm text-neutral-600 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
              onclick={(e: MouseEvent) => {
                e.stopPropagation();
                handleContextMenu(e, file);
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

{#if contextMenu}
  <FileContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    fileName={contextMenu.file.name}
    isDirectory={contextMenu.file.isDirectory}
    onclose={() => (contextMenu = null)}
    onaction={(action) => handleMenuAction(action)}
  />
{/if}
