<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { run } from "svelte/legacy";

  import type { Component } from "svelte";
  import {
    UndoIcon,
    ClockIcon,
    ProtractorIcon,
    RedoIcon,
    RulerIcon,
    GridIcon,
    OnionSkinIcon,
    VelocityHeatmapIcon,
    LockIcon,
    UnlockIcon,
    OnionSkinCurrentPathIcon,
    DocumentPlusIcon,
    CogIcon,
    FeedbackIcon,
    GithubIcon,
    SidebarCollapseIcon,
  } from "./icons";

  import {
    showFileManager,
    showFeedbackDialog,
    showSettings,
    showHistory,
    isDrawingMode,
    showRuler,
    showProtractor,
    showGrid,
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
  import { isBrowser } from "../../utils/platform";
  import {
    MagnetIcon,
    FolderIcon,
    ListIcon,
    ArrowRightIcon,
    CodeIcon,
    TerminalIcon,
    StarIcon,
    WrenchIcon,
    PlayIcon,
    PlusIcon,
    SaveIcon,
    TrashIcon,
    EyeIcon,
    ZapIcon,
    BoxIcon,
    CompassIcon,
    PresentationModeIcon,
    RocketIcon,
    QuestionMarkIcon,
    PhotoIcon,
    ExportGifIcon,
    PuzzleIcon,
  } from "./icons";
  import * as ICONS from "./icons";
  import {
    SIDEBAR_ITEMS,
    type SidebarItemConfig,
  } from "../../config/sidebarItems";
  import type { CustomSidebarItem } from "../../types";

  type SidebarEntry = {
    id: string;
    label: string;
    type?: SidebarItemConfig["type"];
    settingKey?: string;
    shortcutKey?: string;
    commandId?: string;
    iconSvg?: string;
    iconComponent?: Component;
  };

  const ICON_COMPONENT_MAP: Record<string, any> = {
    ...ICONS,
    List: ListIcon,
    Play: PlayIcon,
    Arrow: ArrowRightIcon,
    Code: CodeIcon,
    Terminal: TerminalIcon,
    Star: StarIcon,
    Bolt: ZapIcon,
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

  let activeSidebarItems: SidebarEntry[] = $state([]);

  function toggleSetting(key: string) {
    (settings as any)[key] = !(settings as any)[key];
    settingsStore.update((s) => ({ ...s, [key]: (settings as any)[key] }));
  }

  function checkSettingActive(key?: string): boolean {
    return key ? !!(settings as any)[key] : false;
  }

  let historyButtonRef: HTMLElement | undefined = $state();
  let historyDropdownRef: HTMLElement | undefined = $state();

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
  interface Props {
    undoAction: () => any;
    redoAction: () => any;
    canUndo: boolean;
    canRedo: boolean;
    history: ReturnType<typeof createHistory>;
    resetProject: () => any;
    settings: Settings;
  }

  let {
    undoAction,
    redoAction,
    canUndo,
    canRedo,
    history,
    resetProject,
    settings = $bindable(),
  }: Props = $props();

  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener("click", handleClickOutside);
    document.removeEventListener("keydown", handleKeyDown);
  });

  let isResizing = $state(false);

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

  let dragSourceIndex: number | null = $state(null);
  let dragOverIndex: number | null = $state(null);

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
  let historyStore = $derived(history?.historyStore);
  let undoDescription = $derived(history?.undoDescriptionStore);
  let redoDescription = $derived(history?.redoDescriptionStore);
  run(() => {
    activeSidebarItems = (
      settings.sidebarItems || SIDEBAR_ITEMS.map((i) => i.id)
    )
      .map((id) => {
        let item: SidebarItemConfig | CustomSidebarItem | undefined =
          SIDEBAR_ITEMS.find((item) => item.id === id);
        if (!item && settings.customSidebarItems) {
          item = settings.customSidebarItems.find((i) => i.id === id);
        }
        return item as SidebarEntry | undefined;
      })
      .filter((item): item is SidebarEntry => item !== undefined)
      .filter((item) => {
        if (isBrowser) {
          if (item.id === "pluginManager") return false;
          if (item.id === "feedback") return false;
          if (item.id === "autoExportCode") return false;
        }
        return true;
      });
  });
  let undoTooltip = $derived(
    (() => {
      let title = canUndo ? "Undo" : "Nothing to Undo";
      if (canUndo && $undoDescription) {
        title = `Undo: ${$undoDescription}`;
      }
      const shortcut = getShortcutFromSettings(settings, "undo");
      return shortcut ? `${title}${shortcut}` : title;
    })(),
  );
  let redoTooltip = $derived(
    (() => {
      let title = canRedo ? "Redo" : "Nothing to Redo";
      if (canRedo && $redoDescription) {
        title = `Redo: ${$redoDescription}`;
      }
      const shortcut = getShortcutFromSettings(settings, "redo");
      return shortcut ? `${title}${shortcut}` : title;
    })(),
  );
  let sidebarWidth = $derived(settings.sidebarWidth || 240);
  let sidebarExpanded = $derived(settings.sidebarExpanded || false);
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
          ondragstart={(e) => handleDragStart(e, idx)}
          ondragover={(e) => handleDragOver(e, idx)}
          ondragleave={() => handleDragLeave(idx)}
          ondrop={(e) => handleDrop(e, idx)}
          ondragend={handleDragEnd}
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
          ondragstart={(e) => handleDragStart(e, idx)}
          ondragover={(e) => handleDragOver(e, idx)}
          ondragleave={() => handleDragLeave(idx)}
          ondrop={(e) => handleDrop(e, idx)}
          ondragend={handleDragEnd}
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
          ondragstart={(e) => handleDragStart(e, idx)}
          ondragover={(e) => handleDragOver(e, idx)}
          ondragleave={() => handleDragLeave(idx)}
          ondrop={(e) => handleDrop(e, idx)}
          ondragend={handleDragEnd}
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
            onclick={() => item.settingKey && toggleSetting(item.settingKey)}
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
                <item.iconComponent className="sidebar-icon flex-none" />
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
          ondragstart={(e) => handleDragStart(e, idx)}
          ondragover={(e) => handleDragOver(e, idx)}
          ondragleave={() => handleDragLeave(idx)}
          ondrop={(e) => handleDrop(e, idx)}
          ondragend={handleDragEnd}
          role="listitem"
          class="w-full flex justify-center transition-all {dragOverIndex ===
            idx && dragSourceIndex !== idx
            ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
        >
          <button
            title={item.label}
            aria-label={item.label}
            onclick={() => executeCommandBus.set(item.commandId ?? null)}
            class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
              ? 'w-[calc(100%-1.1rem)] px-3'
              : 'justify-center'} text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
          >
            <div
              class="sidebar-icon flex-none flex items-center justify-center"
            >
              {#if item.iconComponent}
                <item.iconComponent className="sidebar-icon flex-none" />
              {:else if item.iconSvg && ICON_COMPONENT_MAP[item.iconSvg]}
                {@const SvelteComponent = ICON_COMPONENT_MAP[item.iconSvg]}
                <SvelteComponent className="sidebar-icon flex-none" />
              {:else}
                <StarIcon className="sidebar-icon flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
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
              onclick={() => showFileManager.set(true)}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:text-purple-600 dark:hover:text-purple-400 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                {#if item.iconComponent}
                  <item.iconComponent className="sidebar-icon flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title={undoTooltip}
              aria-label={undoTooltip}
              onclick={undoAction}
              disabled={!canUndo}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                {#if item.iconComponent}
                  <item.iconComponent
                    className="sidebar-icon-small flex-none"
                  />
                {:else}
                  <UndoIcon className="sidebar-icon-small flex-none" />
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
              ondragstart={(e) => handleDragStart(e, idx)}
              ondragover={(e) => handleDragOver(e, idx)}
              ondragleave={() => handleDragLeave(idx)}
              ondrop={(e) => handleDrop(e, idx)}
              ondragend={handleDragEnd}
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
                onclick={() => showHistory.set(!$showHistory)}
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
                    <item.iconComponent
                      className="sidebar-icon-small flex-none"
                    />
                  {:else}
                    <ClockIcon className="sidebar-icon-small flex-none" />
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
                  onclose={() => showHistory.set(false)}
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
                        onclick={() => {
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title={redoTooltip}
              aria-label={redoTooltip}
              onclick={redoAction}
              disabled={!canRedo}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <RedoIcon className="sidebar-icon-small flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
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
              onclick={() => isDrawingMode.update((v) => !v)}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} {$isDrawingMode
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <item.iconComponent />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
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
              onclick={() => showRuler.update((v) => !v)}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} {$showRuler
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <RulerIcon className="sidebar-icon-small flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
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
              onclick={() => showProtractor.update((v) => !v)}
              class="p-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} {$showProtractor
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <ProtractorIcon className="sidebar-icon-small flex-none" />
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
                onclick={() => protractorLockToRobot.update((v) => !v)}
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
                    <LockIcon className="sidebar-icon-small flex-none" />
                  {:else}
                    <UnlockIcon className="sidebar-icon-small flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
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
              onclick={() => showGrid.update((v) => !v)}
              class="p-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} {$showGrid
                ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <GridIcon className="sidebar-icon-small flex-none" />
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
                onclick={() => snapToGrid.update((v) => !v)}
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
                    <option value={0.5}>0.5"</option>
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
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
              onclick={() => {
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
                <OnionSkinIcon className="sidebar-icon-small flex-none" />
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
                onclick={() => {
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
                  <OnionSkinCurrentPathIcon
                    isActive={settings.onionSkinCurrentPathOnly}
                    className="sidebar-icon-small flex-none"
                  />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
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
              onclick={() => {
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
                <VelocityHeatmapIcon className="sidebar-icon-small flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
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
              onclick={() => resetProject()}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <DocumentPlusIcon className="sidebar-icon flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
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
              onclick={() => showSettings.set(true)}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <CogIcon className="sidebar-icon-small flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
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
              onclick={() => showFeedbackDialog.set(true)}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <FeedbackIcon
                  className="sidebar-icon-small flex-none text-purple-600 dark:text-purple-400"
                />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
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
                <GithubIcon
                  className="sidebar-icon-small flex-none dark:fill-white"
                />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="Presentation Mode"
              aria-label="Presentation Mode"
              onclick={() => isPresentationMode.set(!$isPresentationMode)}
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
                  <item.iconComponent
                    className="sidebar-icon-small flex-none"
                  />
                {:else}
                  <PresentationModeIcon
                    className="sidebar-icon-small flex-none"
                  />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="Plugin Manager"
              aria-label="Plugin Manager"
              onclick={() => showPluginManager.set(true)}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                {#if item.iconComponent}
                  <item.iconComponent
                    className="sidebar-icon-small flex-none"
                  />
                {:else}
                  <PuzzleIcon className="sidebar-icon-small flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="What's New & Docs"
              aria-label="What's New & Docs"
              onclick={() => showWhatsNew.set(true)}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                {#if item.iconComponent}
                  <item.iconComponent
                    className="sidebar-icon-small flex-none"
                  />
                {:else}
                  <RocketIcon className="sidebar-icon-small flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="Restart Tutorial"
              aria-label="Restart Tutorial"
              onclick={() => startTutorial.set(true)}
              class="p-1.5 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'} text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <QuestionMarkIcon className="sidebar-icon-small flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="Export as Image"
              aria-label="Export as Image"
              onclick={() => showExportImage.set(true)}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <PhotoIcon className="sidebar-icon-small flex-none" />
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
            ondragstart={(e) => handleDragStart(e, idx)}
            ondragover={(e) => handleDragOver(e, idx)}
            ondragleave={() => handleDragLeave(idx)}
            ondrop={(e) => handleDrop(e, idx)}
            ondragend={handleDragEnd}
            role="listitem"
            class="w-full flex justify-center transition-all {dragOverIndex ===
              idx && dragSourceIndex !== idx
              ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : ''} {dragSourceIndex === idx ? 'opacity-30 scale-95' : ''}"
          >
            <button
              title="Export as GIF"
              aria-label="Export as GIF"
              onclick={() => showExportGif.set(true)}
              class="p-1.5 rounded-md text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center {sidebarExpanded
                ? 'w-[calc(100%-1.1rem)] px-3'
                : 'justify-center'}"
            >
              <div
                class="sidebar-icon flex-none flex items-center justify-center"
              >
                <ExportGifIcon className="sidebar-icon-small flex-none" />
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
        onclick={toggleSidebar}
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
            <SidebarCollapseIcon className="sidebar-icon" />
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
      onmousedown={startResizing}
      onkeydown={(e) => {
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
  :global(.sidebar-icon) {
    width: var(--sidebar-icon-size, 1.25rem);
    height: var(--sidebar-icon-size, 1.25rem);
  }
  :global(.sidebar-icon-small) {
    width: calc(var(--sidebar-icon-size, 20px) * 0.8);
    height: calc(var(--sidebar-icon-size, 20px) * 0.8);
  }
</style>
