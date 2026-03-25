<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import {
    showFileManager,
    showFeedbackDialog,
    showSettings,
    showHistory,
    isDrawingMode,
    showRuler,
    showProtractor,
    showGrid,
    showRobot,
    snapToGrid,
    protractorLockToRobot,
    gridSize,
    executeCommandBus,
    showPluginManager,
    isPresentationMode,
    showWhatsNew,
    startTutorial,
    showExportImage,
    showExportGif,
  } from "../../stores";
  import { settingsStore } from "../projectStore";
  import { getShortcutFromSettings } from "../../utils";
  import type { Settings } from "../../types";
  import type { createHistory } from "../../utils/history";
  import { menuNavigation } from "../actions/menuNavigation";
  import {
    MagnetIcon,
    FolderIcon,
    ListIcon,
    ArrowRightIcon,
    CodeIcon,
    TerminalIcon,
    StarIcon,
    BoltIcon,
    WrenchIcon,
    PlayIcon,
    PlusIcon,
    SaveIcon,
    TrashIcon,
    EyeIcon,
    ZapIcon,
    BoxIcon,
    CompassIcon,
  } from "./icons";
  import { SIDEBAR_ITEMS } from "../../config/sidebarItems";

  const ICON_COMPONENT_MAP: Record<string, any> = {
    List: ListIcon,
    Play: PlayIcon,
    Arrow: ArrowRightIcon,
    Code: CodeIcon,
    Terminal: TerminalIcon,
    Star: StarIcon,
    Bolt: BoltIcon,
    Wrench: WrenchIcon,
    Plus: PlusIcon,
    Folder: FolderIcon,
    Save: SaveIcon,
    Trash: TrashIcon,
    Eye: EyeIcon,
    Zap: ZapIcon,
    Box: BoxIcon,
    Compass: CompassIcon,
  };

  export let undoAction: () => any;
  export let redoAction: () => any;
  export let canUndo: boolean;
  export let canRedo: boolean;
  export let history: ReturnType<typeof createHistory>;
  export let resetProject: () => any;
  export let settings: Settings;

  $: historyStore = history?.historyStore;
  $: undoDescription = history?.undoDescriptionStore;
  $: redoDescription = history?.redoDescriptionStore;

  $: activeSidebarItems = (
    settings.sidebarItems || SIDEBAR_ITEMS.map((i) => i.id)
  )
    .map((id) => {
      let item: any = SIDEBAR_ITEMS.find((item) => item.id === id);
      if (!item && settings.customSidebarItems) {
        item = settings.customSidebarItems.find((i) => i.id === id);
      }
      return item;
    })
    .filter((item) => item !== undefined);

  function toggleSetting(key: string) {
    (settings as any)[key] = !(settings as any)[key];
    settingsStore.update((s) => ({ ...s, [key]: (settings as any)[key] }));
  }

  function checkSettingActive(key?: string): boolean {
    return key ? !!(settings as any)[key] : false;
  }

  $: undoTooltip = (() => {
    let title = !canUndo ? "Nothing to Undo" : "Undo";
    if (canUndo && $undoDescription) {
      title = `Undo: ${$undoDescription}`;
    }
    const shortcut = getShortcutFromSettings(settings, "undo");
    return shortcut ? `${title}${shortcut}` : title;
  })();

  $: redoTooltip = (() => {
    let title = !canRedo ? "Nothing to Redo" : "Redo";
    if (canRedo && $redoDescription) {
      title = `Redo: ${$redoDescription}`;
    }
    const shortcut = getShortcutFromSettings(settings, "redo");
    return shortcut ? `${title}${shortcut}` : title;
  })();

  let historyButtonRef: HTMLElement;
  let historyDropdownRef: HTMLElement;

  function handleClickOutside(event: MouseEvent) {
    if (
      $showHistory &&
      historyDropdownRef &&
      !historyDropdownRef.contains(event.target as Node) &&
      historyButtonRef &&
      !historyButtonRef.contains(event.target as Node)
    ) {
      showHistory.set(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if ($showHistory && event.key === "Escape") {
      showHistory.set(false);
    }
  }

  import { onMount, onDestroy } from "svelte";

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });

  let isResizing = false;
  $: sidebarWidth = settings.sidebarWidth || 240;
  $: sidebarExpanded = settings.sidebarExpanded || false;

  function startResizing(e: MouseEvent) {
    if (!sidebarExpanded) return;
    isResizing = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopResizing);
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing) return;
    const newWidth = Math.max(160, Math.min(450, e.clientX));
    settingsStore.update((s) => ({ ...s, sidebarWidth: newWidth }));
  }

  function stopResizing() {
    if (isResizing) {
      isResizing = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
    }
  }

  function toggleSidebar() {
    const newState = !sidebarExpanded;
    settingsStore.update((s) => ({ ...s, sidebarExpanded: newState }));
  }

  let dragSourceIndex: number | null = null;
  let dragOverIndex: number | null = null;

  function handleDragStart(e: DragEvent, index: number) {
    if (!sidebarExpanded) return;
    dragSourceIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    if (!sidebarExpanded) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dragOverIndex = index;
  }

  function handleDragLeave(idx: number) {
    if (dragOverIndex === idx) dragOverIndex = null;
  }

  function handleDrop(e: DragEvent, dropIndex: number) {
    if (!sidebarExpanded) return;
    e.preventDefault();
    if (dragSourceIndex === null || dragSourceIndex === dropIndex) {
      dragSourceIndex = null;
      dragOverIndex = null;
      return;
    }

    const currentItems =
      settings.sidebarItems || SIDEBAR_ITEMS.map((i) => i.id);
    const arr = [...currentItems];
    const [moved] = arr.splice(dragSourceIndex, 1);
    arr.splice(dropIndex, 0, moved);

    settingsStore.update((s) => ({
      ...s,
      sidebarItems: arr,
    }));

    dragSourceIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    dragSourceIndex = null;
    dragOverIndex = null;
  }
</script>

<aside
  aria-label="Main Sidebar"
  class="h-full flex-none bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col items-center z-40 relative {isResizing
    ? ''
    : 'transition-[width] duration-300'}"
  style="width: {sidebarExpanded
    ? sidebarWidth + 'px'
    : '3.5rem'}; --sidebar-icon-size: {settings.sidebarIconSize || 20}px;"
>
  <div
    id="sidebar-toolbar"
    role="list"
    aria-label="Sidebar Actions"
    class="flex-grow w-full flex flex-col items-center py-2 gap-1.5 overflow-y-auto no-scrollbar"
  >
    {#each activeSidebarItems as item, idx}
      {#if item.type === "separator"}
        <div
          draggable={sidebarExpanded}
          on:dragstart={(e) => handleDragStart(e, idx)}
          on:dragover={(e) => handleDragOver(e, idx)}
          on:dragleave={() => handleDragLeave(idx)}
          on:drop={(e) => handleDrop(e, idx)}
          on:dragend={handleDragEnd}
          role="presentation"
          aria-hidden="true"
          class="w-8 h-px bg-neutral-200 dark:bg-neutral-700 my-1 transition-all {dragOverIndex ===
            idx && dragSourceIndex !== idx
            ? 'scale-x-150 bg-blue-400 dark:bg-blue-500'
            : ''} {dragSourceIndex === idx ? 'opacity-30' : ''}"
        ></div>
      {:else if item.type === "spacer"}
        <div
          draggable={sidebarExpanded}
          on:dragstart={(e) => handleDragStart(e, idx)}
          on:dragover={(e) => handleDragOver(e, idx)}
          on:dragleave={() => handleDragLeave(idx)}
          on:drop={(e) => handleDrop(e, idx)}
          on:dragend={handleDragEnd}
          role="presentation"
          aria-hidden="true"
          class="flex-grow w-full transition-all {dragOverIndex === idx &&
          dragSourceIndex !== idx
            ? 'bg-blue-50/50 dark:bg-blue-900/10'
            : ''} {dragSourceIndex === idx ? 'opacity-30' : ''}"
        ></div>
      {:else if item.type === "setting"}
        {@const isActive = checkSettingActive(item.settingKey)}
        <div
          draggable={sidebarExpanded}
          on:dragstart={(e) => handleDragStart(e, idx)}
          on:dragover={(e) => handleDragOver(e, idx)}
          on:dragleave={() => handleDragLeave(idx)}
          on:drop={(e) => handleDrop(e, idx)}
          on:dragend={handleDragEnd}
          role="listitem"
          class="w-full flex justify-center transition-all {dragOverIndex ===
            idx && dragSourceIndex !== idx
            ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
        >
          <button
            title={`${item.label}${item.shortcutKey ? getShortcutFromSettings(settings, item.shortcutKey) : ""}`}
            aria-label={item.label}
            aria-pressed={isActive}
            on:click={() => item.settingKey && toggleSetting(item.settingKey)}
            class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
              ? 'w-[calc(100%-1.1rem)] px-3'
              : 'justify-center'} {isActive
              ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
          >
            <div
              class="sidebar-icon flex-none flex items-center justify-center"
            >
              {#if item.iconComponent}
                <svelte:component
                  this={item.iconComponent}
                  className="sidebar-icon flex-none"
                />
              {:else}
                {@html item.iconSvg}
              {/if}
            </div>
            {#if sidebarExpanded}
              <span class="ml-3 text-sm font-medium truncate">{item.label}</span
              >
            {/if}
          </button>
        </div>
      {:else if item.commandId}
        <div
          draggable={sidebarExpanded}
          on:dragstart={(e) => handleDragStart(e, idx)}
          on:dragover={(e) => handleDragOver(e, idx)}
          on:dragleave={() => handleDragLeave(idx)}
          on:drop={(e) => handleDrop(e, idx)}
          on:dragend={handleDragEnd}
          role="listitem"
          class="w-full flex justify-center transition-all {dragOverIndex ===
            idx && dragSourceIndex !== idx
            ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
        >
          <button
            title={item.label}
            aria-label={item.label}
            on:click={() => executeCommandBus.set(item.commandId)}
            class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
              ? 'w-[calc(100%-1.1rem)] px-3'
              : 'justify-center'} text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
          >
            <div
              class="sidebar-icon flex-none flex items-center justify-center"
            >
              {#if item.iconComponent}
                <svelte:component
                  this={item.iconComponent}
                  className="sidebar-icon flex-none"
                />
              {:else if item.iconSvg && ICON_COMPONENT_MAP[item.iconSvg]}
                <svelte:component
                  this={ICON_COMPONENT_MAP[item.iconSvg]}
                  className="sidebar-icon flex-none"
                />
              {:else}
                <svelte:component
                  this={StarIcon}
                  className="sidebar-icon flex-none"
                />
              {/if}
            </div>
            {#if sidebarExpanded}
              <span class="ml-3 text-sm font-medium truncate">{item.label}</span
              >
            {/if}
          </button>
        </div>
      {:else if item.type === "system"}
        {#if item.id === "fileManager"}
          <!-- File Manager -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              id="sidebar-file-manager-btn"
              title={`Open File Manager${getShortcutFromSettings(settings, "toggle-file-manager")}`}
              aria-label="Open File Manager"
              on:click={() => showFileManager.set(true)}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-purple-600 dark:hover:text-purple-400 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                {#if item.iconComponent}
                  <svelte:component
                    this={item.iconComponent}
                    className="sidebar-icon flex-none"
                  />
                {:else}
                  <FolderIcon className="sidebar-icon flex-none" />
                {/if}
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "undo"}
          <!-- Undo -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title={undoTooltip}
              aria-label={undoTooltip}
              on:click={undoAction}
              disabled={!canUndo}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                {#if item.iconComponent}
                  <svelte:component
                    this={item.iconComponent}
                    className="sidebar-icon-small flex-none"
                  />
                {:else}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                    class="sidebar-icon-small flex-none"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 1 1 0 12h-3"
                    />
                  </svg>
                {/if}
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "history"}
          <!-- History Dropdown -->
          {#if history}
            <div
              draggable={sidebarExpanded}
              on:dragstart={(e) => handleDragStart(e, idx)}
              on:dragover={(e) => handleDragOver(e, idx)}
              on:dragleave={() => handleDragLeave(idx)}
              on:drop={(e) => handleDrop(e, idx)}
              on:dragend={handleDragEnd}
              role="listitem"
              class="w-full flex justify-center transition-all {dragOverIndex ===
                idx && dragSourceIndex !== idx
                ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
            >
              <button
                bind:this={historyButtonRef}
                title={`History Panel${getShortcutFromSettings(settings, "toggle-history")}`}
                aria-label="History Panel"
                aria-haspopup="menu"
                aria-expanded={$showHistory}
                aria-controls="history-menu"
                on:click={() => showHistory.set(!$showHistory)}
                class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                  ? 'w-[calc(100%-1.1rem)] px-3'
                  : 'justify-center'} {$showHistory
                  ? 'bg-neutral-200 dark:bg-neutral-800'
                  : ''}"
              >
                <div
                  class="sidebar-icon flex-none flex items-center justify-center"
                >
                  {#if item.iconComponent}
                    <svelte:component
                      this={item.iconComponent}
                      className="sidebar-icon-small flex-none"
                    />
                  {:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="2"
                      stroke="currentColor"
                      class="sidebar-icon-small flex-none"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                  {/if}
                </div>
                {#if sidebarExpanded}
                  <span class="ml-3 text-sm font-medium truncate"
                    >{item.label}</span
                  >
                {/if}
              </button>

              {#if $showHistory && $historyStore}
                <div
                  id="history-menu"
                  role="menu"
                  aria-label="History Menu"
                  bind:this={historyDropdownRef}
                  use:menuNavigation
                  on:close={() => showHistory.set(false)}
                  class="absolute left-full ml-2 mt-0 w-64 bg-white dark:bg-neutral-800 rounded-lg shadow-xl py-1 z-50 border border-neutral-200 dark:border-neutral-700 animate-in fade-in zoom-in-95 duration-100 max-h-[50vh] overflow-y-auto"
                >
                  <div
                    class="px-4 py-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-700 mb-1"
                  >
                    History
                  </div>
                  {#if $historyStore.length === 0}
                    <div
                      class="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400 text-center italic"
                    >
                      No history yet
                    </div>
                  {:else}
                    {#each $historyStore as entry, i}
                      <button
                        role="menuitem"
                        on:click={() => {
                          history.restore(entry.item.id);
                          showHistory.set(false);
                        }}
                        class="w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center justify-between group {entry.future
                          ? 'opacity-50 hover:opacity-100 text-neutral-600 dark:text-neutral-400'
                          : i === 0 && !entry.future // First non-future item is 'Current'
                            ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-medium'
                            : 'text-neutral-700 dark:text-neutral-200'}"
                      >
                        <span class="truncate">{entry.item.description}</span>
                        <span
                          class="text-xs text-neutral-400 dark:text-neutral-500 ml-2"
                        >
                          {new Date(entry.item.timestamp).toLocaleTimeString(
                            [],
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            },
                          )}
                        </span>
                      </button>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        {:else if item.id === "redo"}
          <!-- Redo -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title={redoTooltip}
              aria-label={redoTooltip}
              on:click={redoAction}
              disabled={!canRedo}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                  stroke="currentColor"
                  class="sidebar-icon-small flex-none"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 9l6 6m0 0-6 6m6-6H9a6 6 0 1 1 0-12h3"
                  />
                </svg>
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "drawPath"}
          <!-- Drawing toggle -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title={`Draw Path${getShortcutFromSettings(settings, "toggle-draw")}`}
              aria-label="Draw Path"
              aria-pressed={$isDrawingMode}
              on:click={() => isDrawingMode.update((v) => !v)}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} {$isDrawingMode
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svelte:component this={item.iconComponent} />
              </div>
              {#if sidebarExpanded}
                <span
                  class="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "ruler"}
          <!-- View Options / Toggles -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title={`Toggle Ruler${getShortcutFromSettings(settings, "toggle-ruler")}`}
              aria-label="Toggle Ruler"
              aria-pressed={$showRuler}
              on:click={() => showRuler.update((v) => !v)}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} {$showRuler
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="sidebar-icon-small flex-none"
                >
                  <path
                    d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0z"
                  ></path>
                  <path d="m14.5 12.5 2-2"></path>
                  <path d="m11.5 9.5 2-2"></path>
                  <path d="m8.5 6.5 2-2"></path>
                  <path d="m17.5 15.5 2-2"></path>
                </svg>
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "protractor"}
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex flex-col items-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title={`Toggle Protractor${getShortcutFromSettings(settings, "toggle-protractor")}`}
              aria-label="Toggle Protractor"
              aria-pressed={$showProtractor}
              on:click={() => showProtractor.update((v) => !v)}
              class="p-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} {$showProtractor
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="sidebar-icon-small flex-none"
                >
                  <path d="M12 21a9 9 0 1 1 0-18c2.52 0 4.93 1 6.74 2.74L21 8"
                  ></path>
                  <path d="M12 3v6l3.7 2.7"></path>
                </svg>
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
            {#if $showProtractor}
              <button
                title={$protractorLockToRobot
                  ? "Unlock Protractor from Robot"
                  : "Lock Protractor to Robot"}
                aria-label={$protractorLockToRobot
                  ? "Unlock Protractor from Robot"
                  : "Lock Protractor to Robot"}
                aria-pressed={$protractorLockToRobot}
                on:click={() => protractorLockToRobot.update((v) => !v)}
                class="p-1 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                  ? 'w-[calc(100%-1.1rem)] px-3'
                  : 'justify-center'} {$protractorLockToRobot
                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                  : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
              >
                <div
                  class="sidebar-icon flex-none flex items-center justify-center"
                >
                  {#if $protractorLockToRobot}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="sidebar-icon-small flex-none"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"
                      ></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  {:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="sidebar-icon-small flex-none"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"
                      ></rect>
                      <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                    </svg>
                  {/if}
                </div>
                {#if sidebarExpanded}
                  <span class="ml-3 text-xs truncate">Lock to Robot</span>
                {/if}
              </button>
            {/if}
          </div>
        {:else if item.id === "grid"}
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex flex-col items-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title={`Toggle Grid${getShortcutFromSettings(settings, "toggle-grid")}`}
              aria-label="Toggle Grid"
              aria-pressed={$showGrid}
              on:click={() => showGrid.update((v) => !v)}
              class="p-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} {$showGrid
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="sidebar-icon-small flex-none"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="3" y1="15" x2="21" y2="15"></line>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                  <line x1="15" y1="3" x2="15" y2="21"></line>
                </svg>
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
            {#if $showGrid}
              <button
                title={`Toggle Snap${getShortcutFromSettings(settings, "toggle-snap")}`}
                aria-label={$snapToGrid ? "Disable Snap" : "Enable Snap"}
                aria-pressed={$snapToGrid}
                on:click={() => snapToGrid.update((v) => !v)}
                class="p-1 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                  ? 'w-[calc(100%-1.1rem)] px-3'
                  : 'justify-center'} {$snapToGrid
                  ? 'text-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
              >
                <div
                  class="sidebar-icon flex-none flex items-center justify-center"
                >
                  <MagnetIcon className="sidebar-icon-small flex-none" />
                </div>
                {#if sidebarExpanded}
                  <span class="ml-3 text-xs truncate">Snap to Grid</span>
                {/if}
              </button>
              <div
                class="flex items-center {sidebarExpanded
                  ? 'w-[calc(100%-1.1rem)] px-3'
                  : 'justify-center'}"
              >
                <div
                  class="sidebar-icon flex-none flex items-center justify-center"
                >
                  <select
                    class="w-10 text-xs bg-transparent text-center text-neutral-600 dark:text-neutral-300 focus:outline-none cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-md transition-colors appearance-none"
                    bind:value={$gridSize}
                    title="Grid Size"
                    aria-label="Grid Size"
                  >
                    <option value={1}>1"</option>
                    <option value={3}>3"</option>
                    <option value={6}>6"</option>
                    <option value={12}>12"</option>
                    <option value={24}>24"</option>
                  </select>
                </div>
                {#if sidebarExpanded}
                  <span
                    class="ml-3 text-[10px] text-neutral-400 uppercase tracking-tight"
                    >Grid Size</span
                  >
                {/if}
              </div>
            {/if}
          </div>
        {:else if item.id === "onionSkin"}
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex flex-col items-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title={`Toggle Onion Skin${getShortcutFromSettings(settings, "toggle-onion")}`}
              aria-label="Toggle Onion Skin"
              aria-pressed={settings.showOnionLayers}
              on:click={() => {
                settings.showOnionLayers = !settings.showOnionLayers;
                settingsStore.update((s) => ({
                  ...s,
                  showOnionLayers: settings.showOnionLayers,
                }));
              }}
              class="p-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} {settings.showOnionLayers
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="sidebar-icon-small flex-none"
                >
                  <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                  <polyline points="2 12 12 17 22 12"></polyline>
                  <polyline points="2 17 12 22 22 17"></polyline>
                </svg>
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
            {#if settings.showOnionLayers}
              <button
                title={`Toggle Current Path Only${getShortcutFromSettings(settings, "toggle-onion-current-path")}`}
                aria-label={settings.onionSkinCurrentPathOnly
                  ? "Show All Paths"
                  : "Show Current Path Only"}
                aria-pressed={settings.onionSkinCurrentPathOnly}
                on:click={() => {
                  settings.onionSkinCurrentPathOnly =
                    !settings.onionSkinCurrentPathOnly;
                  settingsStore.update((s) => ({
                    ...s,
                    onionSkinCurrentPathOnly: settings.onionSkinCurrentPathOnly,
                  }));
                }}
                class="p-1 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                  ? 'w-[calc(100%-1.1rem)] px-3'
                  : 'justify-center'} {settings.onionSkinCurrentPathOnly
                  ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
              >
                <div
                  class="sidebar-icon flex-none flex items-center justify-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="sidebar-icon-small flex-none"
                  >
                    {#if settings.onionSkinCurrentPathOnly}
                      <!-- Show a single highlighted layer -->
                      <rect
                        x="4"
                        y="6"
                        width="16"
                        height="4"
                        rx="1"
                        fill="currentColor"
                      />
                      <rect
                        x="4"
                        y="11"
                        width="16"
                        height="4"
                        rx="1"
                        stroke="currentColor"
                        fill="none"
                      />
                      <rect
                        x="4"
                        y="16"
                        width="16"
                        height="4"
                        rx="1"
                        stroke="currentColor"
                        fill="none"
                      />
                    {:else}
                      <!-- Show multiple layers equally -->
                      <rect
                        x="4"
                        y="6"
                        width="16"
                        height="4"
                        rx="1"
                        stroke="currentColor"
                        fill="none"
                      />
                      <rect
                        x="4"
                        y="11"
                        width="16"
                        height="4"
                        rx="1"
                        stroke="currentColor"
                        fill="none"
                      />
                      <rect
                        x="4"
                        y="16"
                        width="16"
                        height="4"
                        rx="1"
                        stroke="currentColor"
                        fill="none"
                      />
                    {/if}
                  </svg>
                </div>
                {#if sidebarExpanded}
                  <span class="ml-3 text-xs truncate">Current Path Only</span>
                {/if}
              </button>
            {/if}
          </div>
        {:else if item.id === "velocityHeatmap"}
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title={`Toggle Velocity Heatmap`}
              aria-label="Toggle Velocity Heatmap"
              aria-pressed={settings.showVelocityHeatmap}
              on:click={() => {
                settings.showVelocityHeatmap = !settings.showVelocityHeatmap;
                settingsStore.update((s) => ({
                  ...s,
                  showVelocityHeatmap: settings.showVelocityHeatmap,
                }));
              }}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} {settings.showVelocityHeatmap
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="sidebar-icon-small flex-none"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                </svg>
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "newPath"}
          <!-- New Path -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              id="sidebar-new-path-btn"
              title={`New Path${getShortcutFromSettings(settings, "new-file")}`}
              aria-label="New Path"
              on:click={() => resetProject()}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                  stroke="currentColor"
                  class="sidebar-icon flex-none"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "settings"}
          <!-- Settings -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              id="sidebar-settings-btn"
              title={`Settings${getShortcutFromSettings(settings, "open-settings")}`}
              aria-label="Settings"
              on:click={() => showSettings.set(true)}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                  stroke="currentColor"
                  class="sidebar-icon-small flex-none"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                </svg>
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "feedback"}
          <!-- Feedback / Report Bug Button -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              id="sidebar-feedback-btn"
              title="Report Issue / Rating"
              aria-label="Report Issue / Rating"
              on:click={() => showFeedbackDialog.set(true)}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="2"
                  stroke="currentColor"
                  class="sidebar-icon-small flex-none text-purple-600 dark:text-purple-400"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z"
                  />
                </svg>
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "github"}
          <!-- GitHub Repo Link -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <a
              target="_blank"
              rel="noreferrer"
              title="GitHub Repo"
              aria-label="GitHub Repository"
              href="https://github.com/Mallen220/TurtleTracer"
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 30 30"
                  class="sidebar-icon-small flex-none dark:fill-white"
                >
                  <path
                    d="M15,3C8.373,3,3,8.373,3,15c0,5.623,3.872,10.328,9.092,11.63C12.036,26.468,12,26.28,12,26.047v-2.051 c-0.487,0-1.303,0-1.508,0c-0.821,0-1.551-0.353-1.905-1.009c-0.393-0.729-0.461-1.844-1.435-2.526 c-0.289-0.227-0.069-0.486,0.264-0.451c0.615,0.174,1.125,0.596,1.605,1.222c0.478,0.627,0.703,0.769,1.596,0.769 c0.433,0,1.081-0.025,1.691-0.121c0.328-0.833,0.895-1.6,1.588-1.962c-3.996-0.411-5.903-2.399-5.903-5.098 c0-1.162,0.495-2.286,1.336-3.233C9.053,10.647,8.706,8.73,9.435,8c1.798,0,2.885,1.166,3.146,1.481C13.477,9.174,14.461,9,15.495,9 c1.036,0,2.024,0.174,2.922,0.483C18.675,9.17,19.763,8,21.565,8c0.732,0.731,0.381,2.656,0.102,3.594 c0.836,0.945,1.328,2.066,1.328,3.226c0,2.697-1.904,4.684-5.894,5.097C18.199,20.49,19,22.1,19,23.313v2.734 c0,0.104-0.023,0.179-0.035,0.268C23.641,24.676,27,20.236,27,15C27,8.373,21.627,3,15,3z"
                  ></path>
                </svg>
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </a>
          </div>
        {:else if item.id === "presentationMode"}
          <!-- Presentation Mode -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="Presentation Mode"
              aria-label="Presentation Mode"
              on:click={() => isPresentationMode.set(!$isPresentationMode)}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} {$isPresentationMode
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                {#if item.iconComponent}
                  <svelte:component
                    this={item.iconComponent}
                    className="sidebar-icon-small flex-none"
                  />
                {:else}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="sidebar-icon-small flex-none"
                    ><path d="M2 3h20" /><path
                      d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"
                    /><path d="m7 21 5-5 5 5" /></svg
                  >
                {/if}
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "pluginManager"}
          <!-- Plugin Manager -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="Plugin Manager"
              aria-label="Plugin Manager"
              on:click={() => showPluginManager.set(true)}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                {#if item.iconComponent}
                  <svelte:component
                    this={item.iconComponent}
                    className="sidebar-icon-small flex-none"
                  />
                {:else}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="sidebar-icon-small flex-none"
                    ><path d="M12 2L2 7l10 5 10-5-10-5Z" /><path
                      d="m2 17 10 5 10-5"
                    /><path d="m2 12 10 5 10-5" /></svg
                  >
                {/if}
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "whatsNew"}
          <!-- What's New & Docs -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="What's New & Docs"
              aria-label="What's New & Docs"
              on:click={() => showWhatsNew.set(true)}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                {#if item.iconComponent}
                  <svelte:component
                    this={item.iconComponent}
                    className="sidebar-icon-small flex-none"
                  />
                {:else}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="sidebar-icon-small flex-none"
                    ><path
                      d="M12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"
                    /></svg
                  >
                {/if}
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "onboarding"}
          <!-- Restart Tutorial -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="Restart Tutorial"
              aria-label="Restart Tutorial"
              on:click={() => startTutorial.set(true)}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="sidebar-icon-small flex-none"
                  ><circle cx="12" cy="12" r="10" /><path
                    d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
                  /><line x1="12" y1="17" x2="12.01" y2="17" /></svg
                >
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "exportImage"}
          <!-- Export Image -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="Export as Image"
              aria-label="Export as Image"
              on:click={() => showExportImage.set(true)}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="sidebar-icon-small flex-none"
                  ><rect
                    width="18"
                    height="18"
                    x="3"
                    y="3"
                    rx="2"
                    ry="2"
                  /><circle cx="9" cy="9" r="2" /><path
                    d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
                  /></svg
                >
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {:else if item.id === "exportGif"}
          <!-- Export GIF -->
          <div
            draggable={sidebarExpanded}
            on:dragstart={(e) => handleDragStart(e, idx)}
            on:dragover={(e) => handleDragOver(e, idx)}
            on:dragleave={() => handleDragLeave(idx)}
            on:drop={(e) => handleDrop(e, idx)}
            on:dragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="Export as GIF"
              aria-label="Export as GIF"
              on:click={() => showExportGif.set(true)}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="sidebar-icon-small flex-none"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6.5v11" />
                  <path d="M6.5 12h11" />
                </svg>
              </div>
              {#if sidebarExpanded}
                <span class="ml-3 text-sm font-medium truncate"
                  >{item.label}</span
                >
              {/if}
            </button>
          </div>
        {/if}
      {/if}
    {/each}
  </div>

  <!-- Expansion Toggle & Bottom Actions -->
  <div
    class="w-full flex-none border-t border-neutral-200 dark:border-neutral-800 flex flex-col items-center gap-1.5 bg-neutral-50 dark:bg-neutral-900 py-2"
  >
    <div class="w-full flex justify-center">
      <button
        title={sidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
        aria-label={sidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
        aria-expanded={sidebarExpanded}
        aria-controls="sidebar-toolbar"
        on:click={toggleSidebar}
        class="p-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
          ? 'w-[calc(100%-1.1rem)] px-3'
          : 'justify-center'} text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
      >
        <div class="sidebar-icon flex-none flex items-center justify-center">
          <div
            class="sidebar-icon flex items-center justify-center transition-transform duration-300 {sidebarExpanded
              ? 'rotate-180'
              : ''}"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="sidebar-icon"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5"
              />
            </svg>
          </div>
        </div>
        {#if sidebarExpanded}
          <span class="ml-3 text-sm font-medium">Collapse</span>
        {/if}
      </button>
    </div>
  </div>

  {#if sidebarExpanded}
    <!-- Dragger -->
    <button
      type="button"
      role="slider"
      aria-label="Resize sidebar"
      aria-valuenow={sidebarWidth}
      aria-valuemin={160}
      aria-valuemax={450}
      aria-valuetext="{sidebarWidth} pixels"
      aria-orientation="vertical"
      class="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-purple-500/20 transition-colors z-[60] group focus:outline-none focus:bg-purple-500/30 appearance-none border-none bg-transparent"
      on:mousedown={startResizing}
      on:keydown={(e) => {
        if (e.key === "ArrowLeft") {
          sidebarWidth = Math.max(160, sidebarWidth - 10);
          settingsStore.update((s) => ({ ...s, sidebarWidth }));
        } else if (e.key === "ArrowRight") {
          sidebarWidth = Math.min(450, sidebarWidth + 10);
          settingsStore.update((s) => ({ ...s, sidebarWidth }));
        }
      }}
    >
      <div
        class="absolute right-0 top-0 w-px h-full bg-neutral-200 dark:border-neutral-800 group-hover:bg-purple-500/50 group-focus:bg-purple-500/50"
        role="presentation"
        aria-hidden="true"
      ></div>
    </button>
  {/if}
</aside>

<style>
  .sidebar-icon {
    width: var(--sidebar-icon-size, 1.25rem);
    height: var(--sidebar-icon-size, 1.25rem);
  }
  .sidebar-icon-small {
    width: calc(var(--sidebar-icon-size, 20px) * 0.8);
    height: calc(var(--sidebar-icon-size, 20px) * 0.8);
  }
</style>
