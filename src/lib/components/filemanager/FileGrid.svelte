<!-- src/lib/components/filemanager/FileGrid.svelte -->
<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import type { FileInfo } from "../../../types";
  import FileContextMenu from "./FileContextMenu.svelte";

  export let files: FileInfo[] = [];
  export let selectedFilePath: string | null = null;
  export let sortMode: "name" | "date" = "name";
  export let renamingFile: FileInfo | null = null;

  const dispatch = createEventDispatcher<{
    "select": FileInfo;
    "open": FileInfo;
    "rename-start": FileInfo;
    "rename-save": string;
    "rename-cancel": void;
    "menu-action": { action: string; file: FileInfo };
  }>();

  let contextMenu: { x: number; y: number; file: FileInfo } | null = null;
  let renameInput = "";

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

  function isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  }

  function isYesterday(date: Date): boolean {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();
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

    // Map rename context action to local event
    if (action === "rename") {
      dispatch("rename-start", file);
    } else {
      dispatch("menu-action", { action, file });
    }
  }

  // Grouping logic for Date sort
  $: groups = sortMode === "date"
    ? groupFilesByDate(files)
    : [{ title: "Files", files }];

  function groupFilesByDate(files: FileInfo[]) {
    const today: FileInfo[] = [];
    const yesterday: FileInfo[] = [];
    const older: FileInfo[] = [];

    files.forEach(f => {
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
</script>

<div class="flex-1 overflow-y-auto pb-4" on:click={() => contextMenu = null}>
  {#each groups as group}
    {#if sortMode === "date"}
      <div class="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider bg-neutral-50/50 dark:bg-neutral-800/50 sticky top-0 backdrop-blur-sm z-1 mb-2">
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
          on:keydown={(e) => {
             if (e.key === 'Enter') dispatch('open', file);
          }}
        >
          <!-- Icon -->
          <div class="mb-2 text-blue-500 dark:text-blue-400 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>

          <!-- Content -->
          <div class="w-full text-center">
            {#if renamingFile?.path === file.path}
              <div class="w-full px-1" on:click|stopPropagation>
                <input
                  type="text"
                  bind:value={renameInput}
                  use:focusInput
                  class="w-full text-xs text-center border border-blue-400 rounded focus:outline-none dark:bg-neutral-700 py-0.5"
                  on:keydown={(e) => {
                    if (e.key === "Enter") dispatch("rename-save", renameInput);
                    if (e.key === "Escape") dispatch("rename-cancel");
                  }}
                  on:blur={() => dispatch("rename-cancel")}
                />
              </div>
            {:else}
              <div class="text-xs font-medium text-neutral-900 dark:text-neutral-100 truncate w-full px-1" title={file.name}>
                {file.name.replace(/\.pp$/, '')}
              </div>
              {#if file.error}
                 <div class="text-[10px] text-red-500 truncate">{file.error}</div>
              {/if}
              <div class="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
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
    on:close={() => contextMenu = null}
    on:action={(e) => handleMenuAction(e.detail)}
  />
{/if}
