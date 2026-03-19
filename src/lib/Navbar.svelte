<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { Point, Line, Shape, Settings, SequenceItem } from "../types";
  import { onMount, onDestroy } from "svelte";
  import {
    currentFilePath,
    isUnsaved,
    exportDialogState,
    showExportImage,
    showStrategySheet,
    gitStatusStore,
  } from "../stores";
  import { SaveIcon } from "./components/icons";
  import {
    calculatePathTime,
    formatTime,
    getShortcutFromSettings,
  } from "../utils";
  import { formatDisplayDistance } from "../utils/coordinates";
  import { customExportersStore } from "./pluginsStore";
  import { navbarActionRegistry } from "./registries";
  import { menuNavigation } from "./actions/menuNavigation";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let robotLength: number;
  export let robotWidth: number;
  export let settings: Settings;

  export let showSidebar = true;
  export let isLargeScreen = true;

  export let saveProject: () => any;
  export let saveFileAs: () => any;
  export let exportGif: () => any;


  let exportMenuOpen = false;
  let saveDropdownOpen = false;
  let saveDropdownSide: "left" | "right" = "left";
  let saveDropdownRef: HTMLElement;
  let saveButtonRef: HTMLElement;
  let saveOptionsButtonRef: HTMLElement;
  let exportMenuRef: HTMLElement;
  let exportButtonRef: HTMLElement;

  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);

  function handleExport(
    format: "java" | "points" | "sequential" | "json" | "custom",
    exporterName?: string,
  ) {
    exportMenuOpen = false;
    exportDialogState.set({ isOpen: true, format, exporterName });
  }

  $: if (settings) {
    settings.rWidth = robotWidth;
    settings.rLength = robotLength;
  }

  function toggleSaveDropdown() {
    if (!saveDropdownOpen && saveOptionsButtonRef) {
      const rect = saveOptionsButtonRef.getBoundingClientRect();
      const dropdownWidth = 192; // Tailwind w-48
      const padding = 16;
      const spaceRight = window.innerWidth - rect.right;
      const spaceLeft = rect.left;

      if (spaceRight >= dropdownWidth + padding) {
        saveDropdownSide = "right";
      } else if (spaceLeft >= dropdownWidth + padding) {
        saveDropdownSide = "left";
      } else {
        // If neither side has enough room, choose the side with more space
        saveDropdownSide = spaceRight >= spaceLeft ? "right" : "left";
      }
    }
    saveDropdownOpen = !saveDropdownOpen;
  }

  function handleClickOutside(event: MouseEvent) {
    if (
      saveDropdownOpen &&
      saveDropdownRef &&
      !saveDropdownRef.contains(event.target as Node) &&
      saveButtonRef &&
      !saveButtonRef.contains(event.target as Node) &&
      saveOptionsButtonRef &&
      !saveOptionsButtonRef.contains(event.target as Node)
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

  function handleKeyDown(event: KeyboardEvent) {
    if (saveDropdownOpen && event.key === "Escape") {
      saveDropdownOpen = false;
    }
    if (exportMenuOpen && event.key === "Escape") {
      exportMenuOpen = false;
    }
  }

  $: leftActions = $navbarActionRegistry
    .filter((a) => a.location === "left")
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  $: centerActions = $navbarActionRegistry
    .filter((a) => a.location === "center")
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  $: rightActions = $navbarActionRegistry
    .filter((a) => !a.location || a.location === "right")
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });
</script>

<div
  class="w-full z-50 bg-neutral-50 dark:bg-neutral-900 shadow-sm flex flex-wrap justify-between items-center px-4 md:px-6 py-3 border-b border-neutral-200 dark:border-neutral-800"
>
  <!-- Left: Brand & File -->
  <div class="flex items-center gap-4">
    <!-- Save (Moved to the leftmost position) -->
    <div class="relative inline-flex items-center divide-x divide-neutral-200 dark:divide-neutral-700 rounded-md border border-neutral-200 dark:border-neutral-700">
      <button
        id="save-project-btn"
        bind:this={saveButtonRef}
        on:click={() => {
          saveProject();
          saveDropdownOpen = false;
        }}
        class="flex items-center justify-center p-2 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 first:rounded-l-md"
        title={`Save${getShortcutFromSettings(settings, "save-project")}`}
        aria-label="Save"
      >
        <SaveIcon className="size-5" />
      </button>

      <button
        bind:this={saveOptionsButtonRef}
        class="flex items-center justify-center p-2 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 last:rounded-r-md"
        aria-expanded={saveDropdownOpen}
        aria-label="Save options"
        on:click={toggleSaveDropdown}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-3 transition-transform {saveDropdownOpen
            ? 'rotate-180'
            : ''}"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {#if saveDropdownOpen}
        <div
          bind:this={saveDropdownRef}
          use:menuNavigation
          on:close={() => (saveDropdownOpen = false)}
          class="absolute top-full mt-2 w-48 bg-white dark:bg-neutral-800 rounded-lg shadow-xl py-1 z-50 border border-neutral-200 dark:border-neutral-700 animate-in fade-in zoom-in-95 duration-100 max-w-[calc(100vw-1rem)] {saveDropdownSide === 'left' ? 'right-full' : 'left-full'}"
        >
          <button
            on:click={() => {
              saveProject();
              saveDropdownOpen = false;
            }}
            class="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Save${getShortcutFromSettings(settings, "save-project")}`}
          >
            <span class="font-medium">Save</span>
          </button>
          <button
            on:click={() => {
              saveFileAs();
              saveDropdownOpen = false;
            }}
            class="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Save As${getShortcutFromSettings(settings, "save-file-as")}`}
          >
            <span class="font-medium">Save As...</span>
          </button>
        </div>
      {/if}
    </div>

    <div class="flex flex-col">
      <span
        class="font-bold text-lg leading-tight tracking-tight text-neutral-900 dark:text-neutral-100"
        >Turtle Tracer</span
      >
      {#if $currentFilePath}
        <div
          class="flex items-center text-xs text-neutral-500 dark:text-neutral-400"
        >
          <span class="truncate max-w-[200px]"
            >{$currentFilePath.split(/[\\/]/).pop()}</span
          >
          {#if settings.gitIntegration && $gitStatusStore[$currentFilePath] && $gitStatusStore[$currentFilePath] !== "clean"}
            <div
              class="ml-2 text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 whitespace-nowrap
                {$gitStatusStore[$currentFilePath] === 'modified'
                ? 'bg-amber-100 border-amber-200 text-amber-700 dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-300'
                : $gitStatusStore[$currentFilePath] === 'staged'
                  ? 'bg-green-100 border-green-200 text-green-700 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300'
                  : 'bg-neutral-100 border-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:border-neutral-600 dark:text-neutral-300'}"
              title={$gitStatusStore[$currentFilePath] === "modified"
                ? "Git: Modified (Unstaged Changes)"
                : $gitStatusStore[$currentFilePath] === "staged"
                  ? "Git: Staged (Ready to Commit)"
                  : "Git: Untracked (New File)"}
            >
              {#if $gitStatusStore[$currentFilePath] === "modified"}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                  stroke="currentColor"
                  class="size-3 flex-shrink-0"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                  />
                </svg>
                <span>Modified</span>
              {:else if $gitStatusStore[$currentFilePath] === "staged"}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="2.5"
                  stroke="currentColor"
                  class="size-3 flex-shrink-0"
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
                  class="size-3 flex-shrink-0"
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
          {#if $isUnsaved}
            <span class="text-amber-500 font-bold ml-1" title="Unsaved changes"
              >*</span
            >
          {/if}
        </div>
      {:else}
        <span class="text-xs text-neutral-500 dark:text-neutral-400"
          >Untitled Project</span
        >
      {/if}
    </div>

    {#each leftActions as action (action.id)}
      <button
        title={action.title}
        aria-label={action.title}
        on:click={action.onClick}
        class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        {@html action.icon}
      </button>
    {/each}
  </div>

  <!-- Center: Contextual Info -->
  {#if true}
    <div class="flex items-center gap-6 text-sm hidden md:flex">
      <div class="flex flex-col items-center">
        <span
          class="text-xs text-neutral-400 font-medium uppercase tracking-wider"
          >Est. Time</span
        >
        <span class="font-semibold text-neutral-800 dark:text-neutral-200"
          >{formatTime(timePrediction.totalTime)}</span
        >
      </div>
      <div class="w-px h-6 bg-neutral-200 dark:bg-neutral-700"></div>
      <div class="flex flex-col items-center">
        <span
          class="text-xs text-neutral-400 font-medium uppercase tracking-wider"
          >Distance</span
        >
        <span class="font-semibold text-neutral-800 dark:text-neutral-200"
          >{formatDisplayDistance(
            timePrediction?.totalDistance ?? 0,
            settings,
            0,
          )}</span
        >
      </div>
    </div>
    <!-- Mobile version of stats -->
    <div
      class="flex flex-col md:hidden text-xs text-neutral-600 dark:text-neutral-300"
    >
      <span>{formatTime(timePrediction?.totalTime ?? 0)}</span>
      <span
        >{formatDisplayDistance(
          timePrediction?.totalDistance ?? 0,
          settings,
          0,
        )}</span
      >
    </div>

    {#each centerActions as action (action.id)}
      <button
        title={action.title}
        aria-label={action.title}
        on:click={action.onClick}
        class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors hidden md:block focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        {@html action.icon}
      </button>
    {/each}
  {/if}

  <!-- Right: Export + Sidebar Toggle -->
  <div class="flex items-center gap-2 md:gap-3">
    <!-- Export -->
    <div class="relative">
      <button
        id="export-project-btn"
        bind:this={exportButtonRef}
        on:click={() => (exportMenuOpen = !exportMenuOpen)}
        class="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-md shadow-sm transition-colors text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
      >
        <span>Export</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-3 transition-transform {exportMenuOpen
            ? 'rotate-180'
            : ''}"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>
      {#if exportMenuOpen}
        <div
          bind:this={exportMenuRef}
          use:menuNavigation
          on:close={() => (exportMenuOpen = false)}
          class="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-neutral-800 rounded-lg shadow-xl py-1 z-50 border border-neutral-200 dark:border-neutral-700 animate-in fade-in zoom-in-95 duration-100 max-w-[calc(100vw-1rem)]"
        >
          <button
            on:click={() => handleExport("java")}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Export Java${getShortcutFromSettings(settings, "export-java")}`}
            >Java Code</button
          >
          <button
            on:click={() => handleExport("points")}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Export Points${getShortcutFromSettings(settings, "export-points")}`}
            >Points Array</button
          >
          <button
            on:click={() => handleExport("sequential")}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Export Sequential${getShortcutFromSettings(settings, "export-sequential")}`}
            >Sequential Command</button
          >
          <button
            on:click={() => handleExport("json")}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Export .turt${getShortcutFromSettings(settings, "export-pp")}`}
            >.turt File</button
          >

          <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>
          <button
            on:click={() => {
              exportMenuOpen = false;
              showExportImage.set(true);
            }}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title="Export as Image">Export as Image</button
          >
          <button
            on:click={() => {
              exportMenuOpen = false;
              exportGif && exportGif();
            }}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Export GIF${getShortcutFromSettings(settings, "export-gif")}`}
            >Export Animated</button
          >
          <button
            on:click={() => {
              exportMenuOpen = false;
              showStrategySheet.set(true);
            }}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title="Print Strategy Sheet">Strategy Sheet</button
          >

          {#if $customExportersStore.length > 0}
            <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>
            <div
              class="px-4 py-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider"
            >
              Plugins
            </div>
            {#each $customExportersStore as exporter}
              <button
                on:click={() => handleExport("custom", exporter.name)}
                class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                {exporter.name}
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>

    <!-- Plugin Actions (Right) -->
    {#each rightActions as action (action.id)}
      <button
        title={action.title}
        aria-label={action.title}
        on:click={action.onClick}
        class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        {@html action.icon}
      </button>
    {/each}

    <!-- Sidebar Toggle (Rightmost) -->
    <button
      id="sidebar-toggle-btn"
      title={`${showSidebar ? "Hide Sidebar" : "Show Sidebar"}${getShortcutFromSettings(settings, "toggle-sidebar")}`}
      aria-label={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
      on:click={() => (showSidebar = !showSidebar)}
      class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
    >
      {#if showSidebar && isLargeScreen}
        <!-- Sidebar visible: show icon with left pane -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          class="size-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" ry="2"></rect>
          <rect x="12" y="4" width="9" height="16"></rect>
        </svg>
      {:else if showSidebar && !isLargeScreen}
        <!-- Shown on vertical: icon with bottom pane -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          class="size-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" ry="2"></rect>
          <rect x="3" y="12" width="18" height="8"></rect>
        </svg>
      {:else}
        <!-- Hidden: Empty Box -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          class="size-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" ry="2"></rect>
        </svg>
      {/if}
    </button>
  </div>
</div>
