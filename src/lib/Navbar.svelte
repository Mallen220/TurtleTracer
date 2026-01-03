<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type { Point, Line, Shape, Settings, SequenceItem } from "../types";
  import { onMount, onDestroy } from "svelte";
  import {
    showRuler,
    showProtractor,
    showGrid,
    protractorLockToRobot,
    gridSize,
    currentFilePath,
    isUnsaved,
    snapToGrid,
    showSettings,
    exportDialogState,
  } from "../stores";
  import { getRandomColor } from "../utils";
  import {
    getDefaultStartPoint,
    getDefaultLines,
    getDefaultShapes,
  } from "../config";
  import FileManager from "./FileManager.svelte";
  import SettingsDialog from "./components/SettingsDialog.svelte";
  import KeyboardShortcutsDialog from "./components/KeyboardShortcutsDialog.svelte";
  import ExportCodeDialog from "./components/ExportCodeDialog.svelte";
  import { calculatePathTime, formatTime } from "../utils";
  import { showShortcuts } from "../stores";

  export let loadFile: (evt: any) => any;

  export let startPoint: Point;
  export let lines: Line[];
  export let shapes: Shape[];
  export let sequence: SequenceItem[];
  export let robotLength: number;
  export let robotWidth: number;
  export let settings: Settings;

  export let showSidebar = true;
  export let isLargeScreen = true;

  export let saveProject: () => any;
  export let saveFileAs: () => any;
  export let exportGif: () => any;
  export let undoAction: () => any;
  export let redoAction: () => any;
  export let recordChange: () => any;
  export let canUndo: boolean;
  export let canRedo: boolean;

  let fileManagerOpen = false;
  let shortcutsOpen = false;
  let exportMenuOpen = false;
  let exportDialog: ExportCodeDialog;

  let saveDropdownOpen = false;
  let saveDropdownRef: HTMLElement;
  let saveButtonRef: HTMLElement;
  let exportMenuRef: HTMLElement;
  let exportButtonRef: HTMLElement;

  let selectedGridSize = 12;
  const gridSizeOptions = [1, 3, 6, 12, 24];

  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);

  onMount(() => {
    const unsubscribeGridSize = gridSize.subscribe((value) => {
      selectedGridSize = value;
    });

    return () => {
      unsubscribeGridSize();
    };
  });

  // Sync local state with global store for shortcuts
  onMount(() => {
    const unsubscribeShortcuts = showShortcuts.subscribe((value) => {
      shortcutsOpen = value;
    });

    return () => {
      unsubscribeShortcuts();
    };
  });

  // Update store when local state changes (from closing dialog)
  $: showShortcuts.set(shortcutsOpen);

  // Sync export dialog state
  $: if ($exportDialogState.isOpen && exportDialog) {
    exportDialog.openWithFormat($exportDialogState.format);
  }

  function handleGridSizeChange(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    selectedGridSize = value;
    gridSize.set(value);
  }

  function handleExport(format: "java" | "points" | "sequential" | "json") {
    exportMenuOpen = false;
    exportDialogState.set({ isOpen: true, format });
  }

  function resetPath() {
    startPoint = getDefaultStartPoint();
    lines = getDefaultLines();
    sequence = lines.map((ln) => ({
      kind: "path",
      lineId: ln.id || `line-${Math.random().toString(36).slice(2)}`,
    }));
    shapes = getDefaultShapes();
  }

  function handleResetPathWithConfirmation() {
    // Check if there's unsaved work
    const hasChanges = $isUnsaved || lines.length > 1 || shapes.length > 0;

    let message = "Are you sure you want to reset the path?\n\n";

    if (hasChanges) {
      if ($currentFilePath) {
        message += `This will reset "${$currentFilePath.split(/[\\/]/).pop()}" to the default path.`;
      } else {
        message += "This will reset your current work to the default path.";
      }

      if ($isUnsaved) {
        message += "\n\n⚠ WARNING: You have unsaved changes that will be lost!";
      }
    } else {
      message += "This will reset to the default starting path.";
    }

    message += "\n\nClick OK to reset, or Cancel to keep your current path.";

    if (confirm(message)) {
      resetPath();
      if (recordChange) recordChange();
    }
  }

  $: if (settings) {
    settings.rWidth = robotWidth;
    settings.rLength = robotLength;
  }

  function handleClickOutside(event: MouseEvent) {
    if (
      saveDropdownOpen &&
      saveDropdownRef &&
      !saveDropdownRef.contains(event.target as Node) &&
      saveButtonRef &&
      !saveButtonRef.contains(event.target as Node)
    ) {
      saveDropdownOpen = false;
    }

    if (
      exportMenuOpen &&
      exportMenuRef &&
      !exportMenuRef.contains(event.target as Node) &&
      exportButtonRef &&
      !exportButtonRef.contains(event.target as Node)
    ) {
      exportMenuOpen = false;
    }
  }

  // Handle Escape key to close dropdown
  function handleKeyDown(event: KeyboardEvent) {
    if (saveDropdownOpen && event.key === "Escape") {
      saveDropdownOpen = false;
    }
    if (exportMenuOpen && event.key === "Escape") {
      exportMenuOpen = false;
    }
  }

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });
</script>

{#if fileManagerOpen}
  <FileManager
    bind:isOpen={fileManagerOpen}
    bind:startPoint
    bind:lines
    bind:shapes
    bind:sequence
    bind:settings
  />
{/if}

<ExportCodeDialog
  bind:this={exportDialog}
  bind:startPoint
  bind:lines
  bind:sequence
  bind:shapes
  bind:settings
/>

<SettingsDialog bind:isOpen={$showSettings} bind:settings />
<KeyboardShortcutsDialog bind:isOpen={shortcutsOpen} bind:settings />

<div
  class="w-full z-50 bg-neutral-50 dark:bg-neutral-900 shadow-md flex flex-wrap justify-between items-center px-4 md:px-6 py-3 border-b border-neutral-200 dark:border-neutral-800"
>
  <!-- Left: Brand & File -->
  <div class="flex items-center gap-4">
    <!-- Menu Button (Mobile/Sidebar toggle for consistency if desired, or just File Manager) -->
    <button
        title="Open File Manager"
        aria-label="Open File Manager"
        on:click={() => (fileManagerOpen = true)}
        class="text-neutral-700 dark:text-neutral-200 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-6"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
        />
      </svg>
    </button>

    <div class="flex flex-col">
        <span class="font-bold text-lg leading-tight tracking-tight text-neutral-900 dark:text-neutral-100">Pedro Pathing</span>
        {#if $currentFilePath}
          <div class="flex items-center text-xs text-neutral-500 dark:text-neutral-400">
            <span class="truncate max-w-[200px]">{$currentFilePath.split(/[\\/]/).pop()}</span>
            {#if $isUnsaved}
              <span class="text-amber-500 font-bold ml-1" title="Unsaved changes">*</span>
            {/if}
          </div>
        {:else}
            <span class="text-xs text-neutral-500 dark:text-neutral-400">Untitled Project</span>
        {/if}
    </div>
  </div>

  <!-- Center: Contextual Info (Desktop only usually) -->
  {#if isLargeScreen}
  <div class="flex items-center gap-6 text-sm">
      <div class="flex flex-col items-center">
        <span class="text-xs text-neutral-400 font-medium uppercase tracking-wider">Est. Time</span>
        <span class="font-semibold text-neutral-800 dark:text-neutral-200">{formatTime(timePrediction.totalTime)}</span>
      </div>
      <div class="w-px h-6 bg-neutral-200 dark:bg-neutral-700"></div>
      <div class="flex flex-col items-center">
        <span class="text-xs text-neutral-400 font-medium uppercase tracking-wider">Distance</span>
        <span class="font-semibold text-neutral-800 dark:text-neutral-200">{timePrediction.totalDistance.toFixed(0)} in</span>
      </div>
  </div>
  {/if}

  <!-- Right: Toolbar Actions -->
  <div class="flex items-center gap-2 md:gap-3">
    <!-- View Options Group -->
    <div class="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-md p-1 gap-1">
        <button
            title="Toggle Grid"
            aria-label="Toggle Grid"
            aria-pressed={$showGrid}
            on:click={() => showGrid.update((v) => !v)}
            class="p-1.5 rounded-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors {$showGrid ? 'text-blue-500' : 'text-neutral-500 dark:text-neutral-400'}"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="3" y1="15" x2="21" y2="15"></line>
                <line x1="9" y1="3" x2="9" y2="21"></line>
                <line x1="15" y1="3" x2="15" y2="21"></line>
            </svg>
        </button>

        {#if $showGrid}
        <div class="relative">
             <select
                class="w-full bg-transparent text-xs font-medium text-neutral-600 dark:text-neutral-300 focus:outline-none cursor-pointer appearance-none pl-1 pr-3"
                bind:value={selectedGridSize}
                on:change={handleGridSizeChange}
                aria-label="Select grid spacing"
            >
                {#each gridSizeOptions as option}
                <option value={option}>{option}"</option>
                {/each}
            </select>
        </div>
        <!-- Snap Toggle -->
        <button
            title={$snapToGrid ? "Disable Snap" : "Enable Snap"}
            aria-label={$snapToGrid ? "Disable Snap" : "Enable Snap"}
            aria-pressed={$snapToGrid}
            on:click={() => snapToGrid.update((v) => !v)}
            class="p-1.5 rounded-sm hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors {$snapToGrid ? 'text-green-500' : 'text-neutral-400'}"
        >
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                 <path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"></path>
            </svg>
        </button>
        {/if}
    </div>

    <div class="w-px h-6 bg-neutral-200 dark:bg-neutral-700 hidden md:block"></div>

    <!-- Undo/Redo Group -->
    <div class="flex items-center gap-1">
        <button
          title="Undo"
          aria-label="Undo"
          on:click={undoAction}
          disabled={!canUndo}
          class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 1 1 0 12h-3" />
          </svg>
        </button>
        <button
          title="Redo"
          aria-label="Redo"
          on:click={redoAction}
          disabled={!canRedo}
          class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 9l6 6m0 0-6 6m6-6H9a6 6 0 1 1 0-12h3" />
          </svg>
        </button>
    </div>

    <div class="w-px h-6 bg-neutral-200 dark:bg-neutral-700 hidden md:block"></div>

    <!-- Main Actions -->
    <div class="flex items-center gap-2">
        <!-- Load -->
        <label
            for="file-upload"
            class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 cursor-pointer transition-colors"
            title="Open Project"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <input id="file-upload" type="file" accept=".pp" on:change={loadFile} class="hidden" />
        </label>

        <!-- Save -->
        <div class="relative">
             <button
                bind:this={saveButtonRef}
                on:click={() => (saveDropdownOpen = !saveDropdownOpen)}
                class="flex items-center gap-1 p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
                title="Save Options"
             >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75h1.5m9 0h-9" />
                </svg>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-3 transition-transform {saveDropdownOpen ? 'rotate-180' : ''}">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
             </button>

             {#if saveDropdownOpen}
                <div bind:this={saveDropdownRef} class="absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-lg shadow-xl py-1 z-50 border border-neutral-200 dark:border-neutral-700 animate-in fade-in zoom-in-95 duration-100">
                    <button
                        on:click={() => { saveProject(); saveDropdownOpen = false; }}
                        class="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                    >
                         <span class="font-medium">Save</span>
                    </button>
                     <button
                        on:click={() => { saveFileAs(); saveDropdownOpen = false; }}
                        class="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                    >
                         <span class="font-medium">Save As...</span>
                    </button>
                </div>
             {/if}
        </div>

        <!-- Export -->
        <div class="relative">
            <button
                bind:this={exportButtonRef}
                on:click={() => (exportMenuOpen = !exportMenuOpen)}
                class="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-md shadow-sm transition-colors text-sm font-medium"
            >
                <span>Export</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-3 transition-transform {exportMenuOpen ? 'rotate-180' : ''}">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
            </button>
             {#if exportMenuOpen}
                <div bind:this={exportMenuRef} class="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-800 rounded-lg shadow-xl py-1 z-50 border border-neutral-200 dark:border-neutral-700 animate-in fade-in zoom-in-95 duration-100">
                    <button on:click={() => handleExport("java")} class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700">Java Code</button>
                    <button on:click={() => handleExport("points")} class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700">Points Array</button>
                    <button on:click={() => handleExport("sequential")} class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700">Sequential Command</button>
                    <button on:click={() => handleExport("json")} class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700">.pp File</button>
                    <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>
                    <button on:click={() => { exportMenuOpen = false; exportGif && exportGif(); }} class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700">Export GIF</button>
                </div>
            {/if}
        </div>
    </div>

    <!-- More Options -->
    <div class="flex items-center gap-1 ml-2">
         <button
            title="Settings"
            on:click={() => showSettings.set(true)}
            class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
         >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
         </button>

         <button
            title={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
            aria-label={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
            on:click={() => (showSidebar = !showSidebar)}
            class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
         >
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 3v18" />
             </svg>
         </button>
    </div>
  </div>
</div>
