<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileGrid.svelte -->
<script lang="ts">
  import { createEventDispatcher, tick, onMount, onDestroy } from "svelte";
  import type { FileInfo, Point, Line } from "../../../types";
  import FileContextMenu from "./FileContextMenu.svelte";
  import PathPreview from "./PathPreview.svelte";
  import { AVAILABLE_FIELD_MAPS } from "../../../config/defaults";
  export let files: FileInfo[] = [];
  export let selectedFilePath: string | null = null;
  export let sortMode: "name" | "date" = "name";
  export let renamingFile: FileInfo | null = null;
  export let fieldImage: string | null = null;

  const dispatch = createEventDispatcher<{
    select: FileInfo;
    open: FileInfo;
    "rename-start": FileInfo;
    "rename-save": string;
    "rename-cancel": void;
    "menu-action": { action: string; file: FileInfo };
  }>();

  let contextMenu: { x: number; y: number; file: FileInfo } | null = null;
  let renameInput = "";

  // Preview Data Cache
  let previews: Record<
    string,
    { startPoint: Point; lines: Line[] } | undefined
  > = {};
  // Retry counters for failed previews
  let previewRetryCount: Record<string, number> = {};
  const MAX_PREVIEW_RETRIES = 5;

  // Debugging toggle for preview failures
  const PREVIEW_DEBUG = true;

  // Number of top files to preload proactively
  const PRELOAD_COUNT = 30;

  let observer: IntersectionObserver;
  let elementMap = new Map<HTMLElement, string>();

  $: if (renamingFile) {
    renameInput = renamingFile.name.replace(/\.pp$/, "");
  }

  // --- Preview Loading Logic ---
  // Queue for loading previews to avoid overwhelming IPC
  const previewQueue: string[] = [];
  let loadingPreviews = false;

  async function processPreviewQueue() {
    if (loadingPreviews || previewQueue.length === 0) return;
    loadingPreviews = true;

    // Process a batch
    const BATCH_SIZE = 3;
    const batch = previewQueue.splice(0, BATCH_SIZE);

    try {
      await Promise.all(
        batch.map(async (filePath) => {
          // If another load already succeeded for this file, skip
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
              // Reset retry count on success
              previewRetryCount[filePath] = 0;
              if (PREVIEW_DEBUG) console.debug(`[preview] Loaded ${filePath}`);
            } else {
              if (PREVIEW_DEBUG)
                console.warn(
                  `[preview] Malformed preview data for ${filePath}`,
                  data,
                );
              // Malformed/empty file - mark as invalid but schedule retry later
              schedulePreviewRetry(filePath);
            }
          } catch (e) {
            if (PREVIEW_DEBUG)
              console.warn(`[preview] Failed to read/parse ${filePath}:`, e);
            // Read failed - schedule retry
            schedulePreviewRetry(filePath);
          }
        }),
      );
      previews = previews; // Reactivity update
    } finally {
      loadingPreviews = false;
      // Continue if there are more
      if (previewQueue.length > 0) {
        // Small delay to yield UI
        setTimeout(processPreviewQueue, 10);
      }
    }
  }

  function schedulePreviewRetry(filePath: string) {
    previewRetryCount[filePath] = (previewRetryCount[filePath] || 0) + 1;
    if (previewRetryCount[filePath] <= MAX_PREVIEW_RETRIES) {
      // Temporary mark so we don't keep re-queueing immediately
      previews[filePath] = { startPoint: null, lines: [] } as any;
      const delay = 1000 * Math.min(4, previewRetryCount[filePath]);
      setTimeout(() => {
        // Clear marker and requeue
        previews[filePath] = undefined;
        if (!previewQueue.includes(filePath)) {
          previewQueue.push(filePath);
          processPreviewQueue();
        }
      }, delay);
    } else {
      // Give up after too many retries
      previews[filePath] = { startPoint: null, lines: [] } as any;
    }
  }

  async function loadPreview(filePath: string, force = false) {
    // If already loaded and not forcing, skip
    if (previews[filePath] !== undefined && !force) return;

    // If forcing, clear previous markers and retry count
    if (force) {
      previews[filePath] = undefined;
      previewRetryCount[filePath] = 0;
    }

    if (previewQueue.includes(filePath)) return;

    previewQueue.push(filePath);
    processPreviewQueue();
  }

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
      { rootMargin: "100px", threshold: 0.1 },
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
          // Re-observe if changed
          observer.unobserve(node);
          observer.observe(node);
        }
      },
    };
  }
  // Fallback handler for field image load errors
  function handleFieldImageError(e: Event) {
    const target = e.target as HTMLImageElement;
    target.src = `/fields/${AVAILABLE_FIELD_MAPS[0].value}`;
  }
  onMount(() => {
    setupObserver();
  });

  onDestroy(() => {
    if (observer) observer.disconnect();
  });

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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

  // Open context menu anchored to an element (used by the kebab menu button)
  function openContextMenuAtElement(el: HTMLElement, file: FileInfo) {
    const rect = el.getBoundingClientRect();
    // Place menu near the top-right of the element; ensure integers for ipc
    contextMenu = {
      x: Math.round(rect.right - 8),
      y: Math.round(rect.top + 8),
      file,
    };
    dispatch("select", file);
  }

  // Wrapper that accepts an Event from the template and forwards a typed element to the anchor
  function openContextMenuFromEvent(e: Event, file: FileInfo) {
    const el = e.currentTarget as HTMLElement | null;
    if (el) openContextMenuAtElement(el, file);
  }

  function handleMenuAction(action: string) {
    if (!contextMenu) return;
    const file = contextMenu.file;
    contextMenu = null;

    // Map rename context action to local event
    if (action === "rename") {
      dispatch("rename-start", file);
    } else {
      dispatch("menu-action", { action, file });
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

  async function focusInput(node: HTMLInputElement) {
    await tick();
    node.select();
  }
  // When files change, proactively load previews for recently modified files (e.g., today)
  $: if (files && files.length) {
    // Preload top N files proactively
    files.slice(0, PRELOAD_COUNT).forEach((f) => {
      if (previews[f.path] === undefined) loadPreview(f.path);
      if (previews[f.path] && previews[f.path]!.startPoint == null)
        loadPreview(f.path, true);
    });
    files.forEach((f) => {
      const d = new Date(f.modified);
      if (isToday(d)) {
        // If we haven't loaded or queued a preview for this file yet, do so
        if (previews[f.path] === undefined) {
          loadPreview(f.path);
        }
      }

      // If an earlier preview attempt failed (startPoint === null), retry it
      if (previews[f.path] && previews[f.path]!.startPoint == null) {
        loadPreview(f.path, true);
      }
    });
  }

  // If the field image or other settings change, retry any previously-failed previews
  $: if (fieldImage !== undefined) {
    Object.keys(previews).forEach((p) => {
      if (previews[p] && previews[p]!.startPoint == null) {
        loadPreview(p, true);
      }
    });
  }

  // Expose functions to allow parent to force refresh/clear previews when files open/save
  export function refreshPreview(filePath: string) {
    // Force reload by clearing cached preview entry and queuing a fresh load
    previews[filePath] = undefined;
    previewRetryCount[filePath] = 0;
    loadPreview(filePath, true);
  }

  export function clearPreview(filePath: string) {
    delete previews[filePath];
    delete previewRetryCount[filePath];
  }

  export function refreshAllFailed() {
    Object.keys(previews).forEach((p) => {
      if (previews[p] && previews[p].startPoint == null) {
        refreshPreview(p);
      }
    });
  }

  export function refreshAll() {
    files.forEach((f) => refreshPreview(f.path));
  }
</script>

<div
  class="flex-1 overflow-y-auto pb-4"
  on:click={() => (contextMenu = null)}
  role="button"
  tabindex="0"
  on:keydown={(e) => {
    if (e.key === "Enter" || e.key === " ") contextMenu = null;
  }}
>
  {#each groups as group}
    {#if sortMode === "date"}
      <div
        class="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider bg-neutral-50/50 dark:bg-neutral-800/50 sticky top-0 backdrop-blur-sm z-1 mb-2"
      >
        {group.title}
      </div>
    {/if}

    <div class="grid grid-cols-3 gap-2 px-2">
      {#each group.files as file (file.path)}
        <div
          class="group flex flex-col items-center p-2 rounded-md cursor-pointer transition-all border relative
          {selectedFilePath === file.path
            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 ring-1 ring-blue-300 dark:ring-blue-700'
            : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm'}"
          on:click={() => dispatch("select", file)}
          on:dblclick={() => dispatch("open", file)}
          on:contextmenu={(e) => handleContextMenu(e, file)}
          role="button"
          tabindex="0"
          aria-label={file.name}
          use:observeElement={file.path}
          on:keydown={(e) => {
            if (e.key === "Enter") dispatch("open", file);
          }}
        >
          <!-- Icon / Preview -->
          <div class="mb-2 relative">
            {#if previews[file.path]?.startPoint}
              <PathPreview
                startPoint={previews[file.path]?.startPoint}
                lines={previews[file.path]?.lines ?? []}
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
                    on:error={handleFieldImageError}
                  />
                {:else}
                  <div
                    class="w-full h-full flex items-center justify-center text-blue-500 dark:text-blue-400"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="size-8"
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
            {/if}

            <!-- Kebab menu overlay (visible on hover) -->
            <button
              class="absolute top-1 right-1 p-1 rounded-full bg-white/80 dark:bg-neutral-800/80 shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              aria-label="File actions"
              on:click|stopPropagation={(e) =>
                openContextMenuFromEvent(e, file)}
              title="More actions"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-4 text-neutral-600 dark:text-neutral-300"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="w-full text-center">
            {#if renamingFile?.path === file.path}
              <div class="w-full px-1">
                <input
                  type="text"
                  bind:value={renameInput}
                  use:focusInput
                  on:click|stopPropagation
                  class="w-full text-xs text-center border border-blue-400 rounded focus:outline-none dark:bg-neutral-700 py-0.5"
                  on:keydown={(e) => {
                    if (e.key === "Enter") dispatch("rename-save", renameInput);
                    if (e.key === "Escape") dispatch("rename-cancel");
                  }}
                  on:blur={() => dispatch("rename-cancel")}
                />
              </div>
            {:else}
              <div
                class="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate w-full px-1"
                title={file.name}
              >
                {file.name.replace(/\.pp$/, "")}
              </div>
              {#if file.error}
                <div class="text-[10px] text-red-500 truncate">
                  {file.error}
                </div>
              {/if}
              <div
                class="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1"
              >
                {formatFileSize(file.size)}
              </div>
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
    on:close={() => (contextMenu = null)}
    on:action={(e) => handleMenuAction(e.detail)}
  />
{/if}
