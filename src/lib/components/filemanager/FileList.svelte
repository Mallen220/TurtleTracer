<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileList.svelte -->
<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
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
  } from "../icons";

  const dispatch = createEventDispatcher<{
    select: FileInfo;
    open: FileInfo;
    "rename-start": FileInfo;
    "rename-save": string;
    "rename-cancel": void;
    "context-menu": { event: MouseEvent; file: FileInfo };
    "move-file": { sourceFile: FileInfo; targetDir: FileInfo };
  }>();

  let contextMenu: { x: number; y: number; file: FileInfo } | null =
    $state(null);
  let renameInput: string = $state("");

  function focusInput(node: HTMLInputElement): { destroy: () => void } {
    tick().then(() => node.select());
    return {
      destroy: () => {},
    };
  }

  // Preview cache + retry logic (similar to FileGrid)
  let previews: Record<string, { startPoint: any; lines: any[] } | undefined> =
    $state({});
  let previewRetryCount: Record<string, number> = {};
  const MAX_PREVIEW_RETRIES = 5;
  const previewQueue: string[] = [];
  let loadingPreviews = false;

  // Debugging toggle for preview failures (enable to see logs)
  const PREVIEW_DEBUG = true;

  // Number of top files to proactively preload when icons are enabled
  const PRELOAD_COUNT = 30;

  let lastRenamingPath: string | null = $state(null);

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
      Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    );
  }

  async function processPreviewQueue() {
    if (loadingPreviews || previewQueue.length === 0) return;
    loadingPreviews = true;
    const BATCH_SIZE = 3;
    const batch = previewQueue.splice(0, BATCH_SIZE);

    try {
      await Promise.all(
        batch.map(async (filePath) => {
          if (
            previews[filePath] &&
            previews[filePath] !== null &&
            previews[filePath].startPoint
          )
            return;
          try {
            const content = await (globalThis as any).electronAPI.readFile(
              filePath,
            );
            const data = JSON.parse(content);
            if (data.startPoint && Array.isArray(data.lines)) {
              previews[filePath] = {
                startPoint: data.startPoint,
                lines: data.lines,
              };
              previewRetryCount[filePath] = 0;
              if (PREVIEW_DEBUG) console.debug(`[preview] Loaded ${filePath}`);
            } else {
              if (PREVIEW_DEBUG)
                console.warn(
                  `[preview] Malformed preview data for ${filePath}`,
                  data,
                );
              schedulePreviewRetry(filePath);
            }
          } catch (e) {
            if (PREVIEW_DEBUG)
              console.warn(`[preview] Failed to read/parse ${filePath}:`, e);
            schedulePreviewRetry(filePath);
          }
        }),
      );
      previews = previews;
    } finally {
      loadingPreviews = false;
      if (previewQueue.length > 0) setTimeout(processPreviewQueue, 10);
    }
  }

  function schedulePreviewRetry(filePath: string) {
    previewRetryCount[filePath] = (previewRetryCount[filePath] || 0) + 1;
    if (PREVIEW_DEBUG)
      console.debug(
        `[preview] Scheduling retry #${previewRetryCount[filePath]} for ${filePath}`,
      );
    if (previewRetryCount[filePath] <= MAX_PREVIEW_RETRIES) {
      previews[filePath] = { startPoint: null, lines: [] };
      const delay = 1000 * Math.min(4, previewRetryCount[filePath]);
      if (PREVIEW_DEBUG)
        console.debug(`[preview] Will retry ${filePath} in ${delay}ms`);
      setTimeout(() => {
        previews[filePath] = undefined;
        if (!previewQueue.includes(filePath)) {
          previewQueue.push(filePath);
          processPreviewQueue();
        }
      }, delay);
    } else {
      previews[filePath] = { startPoint: null, lines: [] };
      if (PREVIEW_DEBUG)
        console.error(
          `[preview] Giving up on ${filePath} after ${previewRetryCount[filePath]} retries`,
        );
    }
  }

  function loadPreview(filePath: string, force = false) {
    if (previews[filePath] !== undefined && !force) return;
    if (force) {
      previews[filePath] = undefined;
      previewRetryCount[filePath] = 0;
    }
    if (previewQueue.includes(filePath)) return;
    previewQueue.push(filePath);
    processPreviewQueue();
  }

  export function refreshPreview(filePath: string) {
    previews[filePath] = undefined;
    previewRetryCount[filePath] = 0;
    loadPreview(filePath, true);
  }

  export function clearPreview(filePath: string) {
    delete previews[filePath];
    delete previewRetryCount[filePath];
  }

  // Retry all previews that previously failed (startPoint === null)
  export function refreshAllFailed() {
    Object.keys(previews).forEach((p) => {
      if (previews[p] && previews[p].startPoint == null) {
        refreshPreview(p);
      }
    });
  }

  // Force refresh for all files (use sparingly)
  export function refreshAll() {
    files.forEach((f) => refreshPreview(f.path));
  }

  function handleDragStart(e: DragEvent, file: FileInfo) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData("application/x-turtle-tracer-macro", file.path);
    e.dataTransfer.setData("application/x-pedro-macro", file.path);
    e.dataTransfer.setData("text/plain", file.path);
    e.dataTransfer.setData("application/json", JSON.stringify(file));
    e.dataTransfer.effectAllowed = "copyMove";

    // Set a custom drag image from the preview icon container if possible
    if (e.currentTarget instanceof HTMLElement) {
      const iconContainer =
        e.currentTarget.querySelector(".preview-container") ||
        e.currentTarget.querySelector(".shrink-0");
      if (iconContainer) {
        e.dataTransfer.setDragImage(iconContainer as Element, 24, 24);
      }
    }
  }

  let dragOverTarget: string | null = $state(null);

  function handleDragOver(e: DragEvent, file: FileInfo) {
    if (file.isDirectory) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      dragOverTarget = file.path;
    }
  }

  function handleDragLeave(e: DragEvent, file: FileInfo) {
    if (dragOverTarget === file.path) {
      dragOverTarget = null;
    }
  }

  function handleDrop(e: DragEvent, file: FileInfo) {
    dragOverTarget = null;

    // Stop the event from bubbling up to the main window drop handlers
    // which might try to interpret this as importing a new macro
    e.preventDefault();
    e.stopPropagation();

    if (!file.isDirectory) return;

    try {
      const data = e.dataTransfer?.getData("application/json");
      if (data) {
        const sourceFile = JSON.parse(data) as FileInfo;
        if (sourceFile.path !== file.path) {
          dispatch("move-file", { sourceFile, targetDir: file });
        }
      }
    } catch (err) {
      // Ignored
    }
  }

  function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString();
  }

  function isToday(date: Date): boolean {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  function isYesterday(date: Date): boolean {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return (
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()
    );
  }

  function handleContextMenu(event: MouseEvent, file: FileInfo) {
    event.preventDefault();
    contextMenu = { x: event.clientX, y: event.clientY, file };
    dispatch("select", file);
  }

  function handleMenuAction(action: string) {
    if (!contextMenu) return;
    const file = contextMenu.file;
    contextMenu = null;

    const eventMap: Record<string, any> = {
      open: "open",
      rename: "rename-start",
      delete: "delete",
      duplicate: "duplicate",
      mirror: "mirror",
      "save-to": "save-to",
    };

    if (action === "rename") {
      dispatch("rename-start", file);
    } else {
      dispatch("menu-action" as any, { action, file });
    }
  }

  function groupFilesByDate(files: FileInfo[]) {
    const folders: FileInfo[] = [];
    const today: FileInfo[] = [];
    const yesterday: FileInfo[] = [];
    const older: FileInfo[] = [];

    files.forEach((f) => {
      if (f.isDirectory) {
        folders.push(f);
        return;
      }
      const d = new Date(f.modified);
      if (isToday(d)) today.push(f);
      else if (isYesterday(d)) yesterday.push(f);
      else older.push(f);
    });

    const result = [];
    if (folders.length) result.push({ title: "Folders", files: folders });
    if (today.length) result.push({ title: "Today", files: today });
    if (yesterday.length) result.push({ title: "Yesterday", files: yesterday });
    if (older.length) result.push({ title: "Older", files: older });

    return result;
  }

  // --- Visibility-based preview loading ---
  let observer: IntersectionObserver;
  let elementMap = new Map<HTMLElement, string>();

  function setupObserver() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const path = elementMap.get(entry.target as HTMLElement);
            if (path) {
              loadPreview(path);
              observer.unobserve(entry.target);
            }
          }
        });
      },
      { rootMargin: "200px", threshold: 0.05 },
    );
  }

  function observeElement(node: HTMLElement, file: FileInfo) {
    if (file.isDirectory) return { destroy() {} };
    if (!observer) setupObserver();
    elementMap.set(node, file.path);
    observer.observe(node);

    return {
      destroy() {
        if (observer) observer.unobserve(node);
        elementMap.delete(node);
      },
      update(newFile: FileInfo) {
        if (newFile.isDirectory) {
          if (observer) observer.unobserve(node);
          elementMap.delete(node);
          return;
        }
        if (newFile.path !== file.path) {
          elementMap.set(node, newFile.path);
          observer.unobserve(node);
          observer.observe(node);
        }
      },
    };
  }

  // Initialize observer on mount
  import { onMount, onDestroy } from "svelte";
  interface Props {
    fieldImage?: string | null;
    files?: FileInfo[];
    selectedFilePath?: string | null;
    sortMode?: "name" | "date";
    renamingFile?: FileInfo | null;
    showGitStatus?: boolean;
  }

  let {
    fieldImage = null,
    files = [],
    selectedFilePath = null,
    sortMode = "name",
    renamingFile = null,
    showGitStatus = true,
  }: Props = $props();
  onMount(() => setupObserver());
  onDestroy(() => observer && observer.disconnect());
  $effect(() => {
    if (renamingFile) {
      if (renamingFile.path !== lastRenamingPath) {
        renameInput = renamingFile.name.replaceAll(/\.(pp|turt)$/gi, "");
        lastRenamingPath = renamingFile.path;
      }
    } else {
      lastRenamingPath = null;
    }
  });
  // Grouping logic for Date sort
  let groups = $derived(
    sortMode === "date" ? groupFilesByDate(files) : [{ title: "Files", files }],
  );
  // Preload top N files proactively when files change (helps when toggling icon display)
  $effect(() => {
    if (files && files.length) {
      const PRELOAD_COUNT = 12;
      files.slice(0, PRELOAD_COUNT).forEach((f) => {
        if (f.isDirectory) return;
        if (previews[f.path] === undefined) loadPreview(f.path);
        // If previous attempts failed, force a retry
        if (previews[f.path] && previews[f.path]!.startPoint == null)
          loadPreview(f.path, true);
      });
    }
  });
  // If the field image changes, retry previously failed previews
  $effect(() => {
    if (fieldImage !== undefined) {
      Object.keys(previews).forEach((p) => {
        if (previews[p] && previews[p].startPoint == null) loadPreview(p, true);
      });
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
          use:observeElement={file}
          class="group flex items-center p-2 rounded-md cursor-pointer transition-colors border border-transparent
          {selectedFilePath === file.path
            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}
          {dragOverTarget === file.path
            ? 'bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500'
            : ''}"
          onclick={() => dispatch("select", file)}
          ondblclick={() => dispatch("open", file)}
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
            if (e.key === "Enter") dispatch("open", file);
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
            {:else if previews[file.path]?.startPoint}
              <PathPreview
                startPoint={previews[file.path]?.startPoint}
                lines={previews[file.path]?.lines ?? []}
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
                  use:focusInput
                  class="w-full px-1 py-0.5 text-sm border border-blue-400 rounded focus:outline-none dark:bg-neutral-700"
                  onkeydown={(e: KeyboardEvent) => {
                    e.stopPropagation();
                    if (e.key === "Enter") dispatch("rename-save", renameInput);
                    if (e.key === "Escape") dispatch("rename-cancel");
                  }}
                  onblur={() => dispatch("rename-cancel")}
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
                    <span class="text-xs text-red-500">⚠</span>
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
                  <span>•</span>
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
              class="p-1 rounded-full bg-white/80 dark:bg-neutral-800/80 shadow-sm text-neutral-600 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
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
    on:close={() => (contextMenu = null)}
    on:action={(e) => handleMenuAction(e.detail)}
  />
{/if}
