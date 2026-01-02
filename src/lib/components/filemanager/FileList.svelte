<!-- src/lib/components/filemanager/FileList.svelte -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { FileInfo } from "../../../types";
  import FileContextMenu from "./FileContextMenu.svelte";

  export let files: FileInfo[] = [];
  export let selectedFilePath: string | null = null;
  export let sortMode: "name" | "date" = "name";
  export let renamingFile: FileInfo | null = null;

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

  $: if (renamingFile) {
    renameInput = renamingFile.name.replace(/\.pp$/, "");
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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
    dispatch("menu-action" as any, { action, file });
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
</script>

<div class="flex-1 overflow-y-auto pb-4" on:click={() => (contextMenu = null)}>
  {#each groups as group}
    {#if sortMode === "date"}
      <div
        class="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider bg-neutral-50/50 dark:bg-neutral-800/50 sticky top-0 backdrop-blur-sm z-1"
      >
        {group.title}
      </div>
    {/if}

    <div class="space-y-0.5 px-2 mt-1">
      {#each group.files as file (file.path)}
        <div
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
          on:keydown={(e) => {
            if (e.key === "Enter") dispatch("open", file);
          }}
        >
          <!-- Icon -->
          <div class="mr-3 text-blue-500 dark:text-blue-400 shrink-0">
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

          <!-- Content -->
          <div class="flex-1 min-w-0">
            {#if renamingFile?.path === file.path}
              <div class="flex items-center gap-1" on:click|stopPropagation>
                <input
                  type="text"
                  bind:value={renameInput}
                  class="w-full px-1 py-0.5 text-sm border border-blue-400 rounded focus:outline-none dark:bg-neutral-700"
                  autofocus
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
                {#if file.error}
                  <span class="text-xs text-red-500">⚠</span>
                {/if}
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
              class="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded"
              on:click|stopPropagation={(e) => handleContextMenu(e, file)}
              title="More actions"
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
