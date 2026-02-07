<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileList.svelte -->
<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import type { FileInfo } from "../../../types";
  import FileContextMenu from "./FileContextMenu.svelte";
  import PathPreview from "./PathPreview.svelte";
  import { AVAILABLE_FIELD_MAPS } from "../../../config/defaults";

  export let fieldImage: string | null = null;

  export let files: FileInfo[] = [];
  export let selectedFilePath: string | null = null;
  export let sortMode: "name" | "date" = "name";
  export let renamingFile: FileInfo | null = null;
  export let showGitStatus = true;

  const dispatch = createEventDispatcher<{
    select: FileInfo;
    open: FileInfo;
    "rename-start": FileInfo;
    "rename-save": string;
    "rename-cancel": void;
    "context-menu": { event: MouseEvent; file: FileInfo };
  }>();

  let contextMenu: { x: number; y: number; file: FileInfo } | null = null;
  let renameInput: string = "";

  function focusInput(node: HTMLInputElement): { destroy: () => void } {
    tick().then(() => node.select());
    return {
      destroy: () => {},
    };
  }

  // Preview cache + retry logic (similar to FileGrid)
  let previews: Record<string, { startPoint: any; lines: any[] } | undefined> =
    {};
  let previewRetryCount: Record<string, number> = {};
  const MAX_PREVIEW_RETRIES = 5;
  const previewQueue: string[] = [];
  let loadingPreviews = false;

  // Debugging toggle for preview failures (enable to see logs)
  const PREVIEW_DEBUG = true;

  // Number of top files to proactively preload when icons are enabled
  const PRELOAD_COUNT = 30;

  let lastRenamingPath: string | null = null;
  $: if (renamingFile) {
    if (renamingFile.path !== lastRenamingPath) {
      renameInput = renamingFile.name.replace(/\.pp$/, "");
      lastRenamingPath = renamingFile.path;
    }
  } else {
    lastRenamingPath = null;
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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
            const content = await window.electronAPI.readFile(filePath);
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
    e.dataTransfer.setData("application/x-pedro-macro", file.path);
    e.dataTransfer.setData("text/plain", file.path);
    e.dataTransfer.effectAllowed = "copy";
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

    // Dispatch the action to the parent component via a generic event or specific ones
    // We will re-emit appropriately
    // The parent (FileManager) can handle the specific logic

    // We will bubble this up as specific events for clarity in usage
    const eventMap: Record<string, any> = {
      open: "open",
      rename: "rename-start",
      delete: "delete",
      duplicate: "duplicate",
      mirror: "mirror",
      "save-to": "save-to",
    };

    // We need to dispatch a custom event that the parent listens to
    // But since `dispatch` is strictly typed above, let's just emit a generic "action" event
    // or we can add it to the dispatcher types.
    // Let's modify the dispatcher types in the parent component instead or here.

    // Actually, easier to dispatch a unified event for menu actions
    if (action === "rename") {
      dispatch("rename-start", file);
    } else {
      dispatch("menu-action" as any, { action, file });
    }
  }

  // Grouping logic for Date sort
  $: groups =
    sortMode === "date" ? groupFilesByDate(files) : [{ title: "Files", files }];

  function groupFilesByDate(files: FileInfo[]) {
    const today: FileInfo[] = [];
    const yesterday: FileInfo[] = [];
    const older: FileInfo[] = [];

    files.forEach((f) => {
      const d = new Date(f.modified);
      if (isToday(d)) today.push(f);
      else if (isYesterday(d)) yesterday.push(f);
      else older.push(f);
    });

    const result = [];
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

  function observeElement(node: HTMLElement, filePath: string) {
    if (!observer) setupObserver();
    elementMap.set(node, filePath);
    observer.observe(node);

    return {
      destroy() {
        if (observer) observer.unobserve(node);
        elementMap.delete(node);
      },
      update(newPath: string) {
        if (newPath !== filePath) {
          elementMap.set(node, newPath);
          observer.unobserve(node);
          observer.observe(node);
        }
      },
    };
  }

  // Preload top N files proactively when files change (helps when toggling icon display)
  $: if (files && files.length) {
    const PRELOAD_COUNT = 12;
    files.slice(0, PRELOAD_COUNT).forEach((f) => {
      if (previews[f.path] === undefined) loadPreview(f.path);
      // If previous attempts failed, force a retry
      if (previews[f.path] && previews[f.path]!.startPoint == null)
        loadPreview(f.path, true);
    });
  }

  // If the field image changes, retry previously failed previews
  $: if (fieldImage !== undefined) {
    Object.keys(previews).forEach((p) => {
      if (previews[p] && previews[p].startPoint == null) loadPreview(p, true);
    });
  }

  // Initialize observer on mount
  import { onMount, onDestroy } from "svelte";
  onMount(() => setupObserver());
  onDestroy(() => observer && observer.disconnect());
</script>

<div
  class="flex-1 overflow-y-auto pb-4"
  on:click={() => (contextMenu = null)}
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
          use:observeElement={file.path}
          class="group flex items-center p-2 rounded-md cursor-pointer transition-colors border border-transparent
          {selectedFilePath === file.path
            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'}"
          on:click={() => dispatch("select", file)}
          on:dblclick={() => dispatch("open", file)}
          on:contextmenu={(e) => handleContextMenu(e, file)}
          role="button"
          tabindex="0"
          aria-label={file.name}
          draggable="true"
          on:dragstart={(e) => handleDragStart(e, file)}
          on:keydown={(e) => {
            if (e.key === "Enter") dispatch("open", file);
          }}
        >
          <!-- Icon -->
          <div class="mr-3 text-blue-500 dark:text-blue-400 shrink-0">
            {#if previews[file.path]?.startPoint}
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  class="size-6"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </div>
            {/if}
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            {#if renamingFile?.path === file.path}
              <div
                class="flex items-center gap-1"
                on:click|stopPropagation
                role="presentation"
              >
                <input
                  type="text"
                  bind:value={renameInput}
                  use:focusInput
                  class="w-full px-1 py-0.5 text-sm border border-blue-400 rounded focus:outline-none dark:bg-neutral-700"
                  on:keydown={(e) => {
                    if (e.key === "Enter") dispatch("rename-save", renameInput);
                    if (e.key === "Escape") dispatch("rename-cancel");
                  }}
                  on:blur={() => dispatch("rename-cancel")}
                />
              </div>
            {:else}
              <div class="flex items-baseline justify-between gap-2">
                <span
                  class="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate"
                  title={file.name}
                >
                  {file.name.replace(/\.pp$/, "")}
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
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke-width="2"
                          stroke="currentColor"
                          class="size-3"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                          />
                        </svg>
                        <span>Modified</span>
                      {:else if file.gitStatus === "staged"}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke-width="2.5"
                          stroke="currentColor"
                          class="size-3"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="m4.5 12.75 6 6 9-13.5"
                          />
                        </svg>
                        <span>Staged</span>
                      {:else}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke-width="2"
                          stroke="currentColor"
                          class="size-3"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
                          />
                        </svg>
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
                <span>{formatFileSize(file.size)}</span>
                {#if sortMode === "name"}
                  <span>•</span>
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
              on:click|stopPropagation={(e) => handleContextMenu(e, file)}
              title="More actions"
              aria-label="File actions"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                />
              </svg>
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
    on:close={() => (contextMenu = null)}
    on:action={(e) => handleMenuAction(e.detail)}
  />
{/if}
