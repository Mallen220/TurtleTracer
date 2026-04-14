<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { Point, Line, Settings, SequenceItem } from "../types";
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
    getShortcutFromSettings,
    isBrowser,
  } from "../utils";
  import {
    ChevronUpIcon,
    PenIcon,
    PlusIcon,
    ValidIcon,
    SidebarLeftIcon,
    SidebarBottomIcon,
    SidebarHiddenIcon,
  } from "./components/icons";
  import { formatDisplayDistance } from "../utils/coordinates";
  import { customExportersStore } from "./pluginsStore";
  import { navbarActionRegistry } from "./registries";
  import { menuNavigation } from "./actions/menuNavigation";
  import ValidationButton from "./components/tools/ValidationButton.svelte";

  interface Props {
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    robotLength: number;
    robotWidth: number;
    settings: Settings;
    showSidebar?: boolean;
    isLargeScreen?: boolean;
    saveProject: () => any;
    saveFileAs: () => any;
    exportGif: () => any;
  }

  let {
    startPoint,
    lines,
    sequence,
    robotLength,
    robotWidth,
    settings = $bindable(),
    showSidebar = $bindable(true),
    isLargeScreen = true,
    saveProject,
    saveFileAs,
    exportGif,
  }: Props = $props();

  let exportMenuOpen = $state(false);
  let saveDropdownOpen = $state(false);
  let saveDropdownSide: "left" | "right" = $state("left");
  let saveDropdownRef: HTMLElement | undefined = $state();
  let saveButtonRef: HTMLElement | undefined = $state();
  let saveOptionsButtonRef: HTMLElement | undefined = $state();
  let exportMenuRef: HTMLElement | undefined = $state();
  let exportButtonRef: HTMLElement | undefined = $state();

  let timePrediction = $derived(
    calculatePathTime(startPoint, lines, settings, sequence),
  );

  function formatEstimatedTime(totalSeconds: number): string {
    if (!Number.isFinite(totalSeconds)) return "Infinite";
    if (totalSeconds <= 0) return "0.0s";

    const roundedSeconds = Math.round(totalSeconds * 100) / 100;
    const minutes = Math.floor(roundedSeconds / 60);
    const seconds = roundedSeconds % 60;

    if (minutes > 0) {
      return `${minutes}:${seconds.toFixed(2).padStart(4, "0")}s`;
    }

    return `${seconds.toFixed(2)}s`;
  }

  function handleExport(
    format: "java" | "points" | "sequential" | "json" | "custom",
    exporterName?: string,
  ) {
    exportMenuOpen = false;
    exportDialogState.set({ isOpen: true, format, exporterName });
  }

  $effect(() => {
    if (
      settings &&
      (settings.rWidth !== robotWidth || settings.rLength !== robotLength)
    ) {
      settings = {
        ...settings,
        rWidth: robotWidth,
        rLength: robotLength,
      };
    }
  });

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

  let leftActions = $derived(
    $navbarActionRegistry
      .filter((a) => a.location === "left")
      .sort((a, b) => (a.order || 0) - (b.order || 0)),
  );
  let centerActions = $derived(
    $navbarActionRegistry
      .filter((a) => a.location === "center")
      .sort((a, b) => (a.order || 0) - (b.order || 0)),
  );
  let rightActions = $derived(
    $navbarActionRegistry
      .filter((a) => !a.location || a.location === "right")
      .sort((a, b) => (a.order || 0) - (b.order || 0)),
  );

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
    <div
      class="relative inline-flex items-center divide-x divide-neutral-200 dark:divide-neutral-700 rounded-md border border-neutral-200 dark:border-neutral-700"
    >
      <button
        id="save-project-btn"
        bind:this={saveButtonRef}
        onclick={() => {
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
        onclick={toggleSaveDropdown}
      >
        <ChevronUpIcon
          className="size-3 transition-transform {saveDropdownOpen
            ? 'rotate-180'
            : ''}"
        />
      </button>

      {#if saveDropdownOpen}
        <div
          bind:this={saveDropdownRef}
          use:menuNavigation
          onclose={() => (saveDropdownOpen = false)}
          class="absolute top-full mt-2 w-48 bg-white dark:bg-neutral-800 rounded-lg shadow-xl py-1 z-50 border border-neutral-200 dark:border-neutral-700 animate-in fade-in zoom-in-95 duration-100 max-w-[calc(100vw-1rem)] {saveDropdownSide ===
          'left'
            ? 'right-full'
            : 'left-full'}"
        >
          <button
            onclick={() => {
              saveProject();
              saveDropdownOpen = false;
            }}
            class="flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Save${getShortcutFromSettings(settings, "save-project")}`}
          >
            <span class="font-medium">Save</span>
          </button>
          <button
            onclick={() => {
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
      <div class="flex items-baseline gap-2">
        <span
          class="font-bold text-lg leading-tight tracking-tight text-neutral-900 dark:text-neutral-100"
          >Turtle Tracer</span
        >
        {#if isBrowser}
          <a
            href="https://github.com/Mallen220/TurtleTracer/releases"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-200 bg-purple-100 text-purple-700 hover:bg-purple-200 hover:border-purple-300 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 dark:hover:border-purple-700 transition-colors whitespace-nowrap uppercase tracking-wider"
            title="Faster, more stable, and better support/features"
          >
            Download Desktop App
          </a>
        {/if}
      </div>
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
                <PenIcon className="size-3 flex-shrink-0" />
                <span>Modified</span>
              {:else if $gitStatusStore[$currentFilePath] === "staged"}
                <ValidIcon className="size-3 flex-shrink-0" />
                <span>Staged</span>
              {:else}
                <PlusIcon className="size-3 flex-shrink-0" />
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
        onclick={action.onClick}
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
          >{formatEstimatedTime(timePrediction?.totalTime ?? 0)}</span
        >
      </div>
      <div
        class="w-px h-6 bg-neutral-200 dark:bg-neutral-700"
        role="presentation"
        aria-hidden="true"
      ></div>
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
      <span>{formatEstimatedTime(timePrediction?.totalTime ?? 0)}</span>
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
        onclick={action.onClick}
        class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors hidden md:block focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        {@html action.icon}
      </button>
    {/each}
  {/if}

  <!-- Right: Export + Sidebar Toggle -->
  <div class="flex items-center gap-2 md:gap-3">
    <!-- Validation Button -->
    <ValidationButton />

    <!-- Export -->
    <div class="relative">
      <button
        id="export-project-btn"
        bind:this={exportButtonRef}
        onclick={() => (exportMenuOpen = !exportMenuOpen)}
        class="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-md shadow-sm transition-colors text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
      >
        <span>Export</span>
        <ChevronUpIcon
          className="size-3 transition-transform {exportMenuOpen
            ? 'rotate-180'
            : ''}"
        />
      </button>
      {#if exportMenuOpen}
        <div
          bind:this={exportMenuRef}
          use:menuNavigation
          onclose={() => (exportMenuOpen = false)}
          class="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-neutral-800 rounded-lg shadow-xl py-1 z-50 border border-neutral-200 dark:border-neutral-700 animate-in fade-in zoom-in-95 duration-100 max-w-[calc(100vw-1rem)]"
        >
          <button
            onclick={() => handleExport("java")}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Export Java${getShortcutFromSettings(settings, "export-java")}`}
            >Java Code</button
          >
          <button
            onclick={() => handleExport("points")}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Export Points${getShortcutFromSettings(settings, "export-points")}`}
            >Points Array</button
          >
          <button
            onclick={() => handleExport("sequential")}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Export Sequential${getShortcutFromSettings(settings, "export-sequential")}`}
            >Sequential Command</button
          >
          <button
            onclick={() => handleExport("json")}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Export .turt${getShortcutFromSettings(settings, "export-pp")}`}
            >.turt File</button
          >

          <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>
          <button
            onclick={() => {
              exportMenuOpen = false;
              showExportImage.set(true);
            }}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title="Export as Image">Export as Image</button
          >
          <button
            onclick={() => {
              exportMenuOpen = false;
              exportGif && exportGif();
            }}
            class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            title={`Export GIF${getShortcutFromSettings(settings, "export-gif")}`}
            >Export Animated</button
          >
          <button
            onclick={() => {
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
                onclick={() => handleExport("custom", exporter.name)}
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
        onclick={action.onClick}
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
      onclick={() => (showSidebar = !showSidebar)}
      class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
    >
      {#if showSidebar && isLargeScreen}
        <!-- Sidebar visible: show icon with left pane -->
        <SidebarLeftIcon className="size-5" />
      {:else if showSidebar && !isLargeScreen}
        <!-- Shown on vertical: icon with bottom pane -->
        <SidebarBottomIcon className="size-5" />
      {:else}
        <!-- Hidden: Empty Box -->
        <SidebarHiddenIcon className="size-5" />
      {/if}
    </button>
  </div>
</div>
