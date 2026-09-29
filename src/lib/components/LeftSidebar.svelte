<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Component } from "svelte";
  import type { Writable } from "svelte/store";
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
    DiscordIcon,
    SidebarCollapseIcon,
    MagnetIcon,
    FolderIcon,
    StarIcon,
    PresentationModeIcon,
    RocketIcon,
    QuestionMarkIcon,
    PhotoIcon,
    ExportGifIcon,
    PuzzleIcon,
    SearchIcon,
  } from "./icons";
  import SidebarButton from "./SidebarButton.svelte";
  import {
    showFileManager,
    showFeedbackDialog,
    showSettings,
    showHistory,
    showShortcuts,
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
  import type { Settings, CustomSidebarItem } from "../../types";
  import type { createHistory } from "../../utils/history";
  import { menuNavigation } from "../actions/menuNavigation";
  import { isBrowser } from "../../utils/platform";
  import {
    SIDEBAR_ITEMS,
    CUSTOM_ICON_MAP,
    type SidebarItemConfig,
  } from "../../config/sidebarItems";

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

  const MIN_WIDTH = 160;
  const MAX_WIDTH = 450;

  let sidebarWidth = $derived(settings.sidebarWidth || 240);
  let sidebarExpanded = $derived(settings.sidebarExpanded || false);

  // These items don't work in the browser build.
  const DESKTOP_ONLY = new Set(["pluginManager", "feedback", "autoExportCode"]);

  let activeSidebarItems = $derived(
    (settings.sidebarItems || SIDEBAR_ITEMS.map((i) => i.id))
      .map(
        (id) =>
          (SIDEBAR_ITEMS.find((item) => item.id === id) ??
            settings.customSidebarItems?.find(
              (item: CustomSidebarItem) => item.id === id,
            )) as SidebarEntry | undefined,
      )
      .filter((item): item is SidebarEntry => item !== undefined)
      .filter((item) => !(isBrowser && DESKTOP_ONLY.has(item.id))),
  );

  const shortcut = (actionId?: string) =>
    actionId ? getShortcutFromSettings(settings, actionId) : "";

  function setSetting(key: keyof Settings, value: unknown) {
    settingsStore.update((s) => ({ ...s, [key]: value }));
  }
  const toggleSetting = (key: string) =>
    setSetting(key as keyof Settings, !(settings as any)[key]);
  const toggle = (store: Writable<boolean>) => () => store.update((v) => !v);

  let historyStore = $derived(history?.historyStore);
  let undoDescription = $derived(history?.undoDescriptionStore);
  let redoDescription = $derived(history?.redoDescriptionStore);

  function historyTooltip(
    verb: "Undo" | "Redo",
    possible: boolean,
    description: string | null | undefined,
  ) {
    const title = possible
      ? description
        ? `${verb}: ${description}`
        : verb
      : `Nothing to ${verb}`;
    return `${title}${shortcut(verb.toLowerCase())}`;
  }
  let undoTooltip = $derived(historyTooltip("Undo", canUndo, $undoDescription));
  let redoTooltip = $derived(historyTooltip("Redo", canRedo, $redoDescription));

  type ButtonSpec = {
    icon?: Component<any>;
    iconClass?: string;
    title: string;
    "aria-label"?: string;
    onclick?: () => void;
    href?: string;
    active?: boolean;
    disabled?: boolean;
    id?: string;
    extraClass?: string;
  };

  /**
   * How to draw an item's main button. Items with extra controls (history,
   * protractor, grid, onion skin) add those in the template.
   */
  function buttonFor(item: SidebarEntry): ButtonSpec | null {
    const icon = item.iconComponent;
    const titled = (text: string, shortcutId?: string) =>
      `${text}${shortcut(shortcutId)}`;

    if (item.type === "setting" && item.settingKey) {
      return {
        icon,
        iconClass: "sidebar-icon flex-none",
        title: titled(item.label, item.shortcutKey),
        active: !!(settings as any)[item.settingKey],
        onclick: () => toggleSetting(item.settingKey!),
      };
    }
    if (item.commandId) {
      // A custom button that runs a command palette command.
      return {
        icon: icon ?? CUSTOM_ICON_MAP[item.iconSvg ?? ""] ?? StarIcon,
        iconClass: "sidebar-icon flex-none",
        title: item.label,
        onclick: () => executeCommandBus.set(item.commandId ?? null),
      };
    }

    switch (item.id) {
      case "fileManager":
        return {
          id: "sidebar-file-manager-btn",
          icon: icon ?? FolderIcon,
          iconClass: "sidebar-icon flex-none",
          title: titled("Open File Manager", "toggle-file-manager"),
          "aria-label": "Open File Manager",
          onclick: () => showFileManager.set(true),
          extraClass: "hover:text-purple-600 dark:hover:text-purple-400",
        };
      case "keyboardShortcuts":
        return {
          icon,
          title: titled(item.label, item.shortcutKey),
          onclick: () => showShortcuts.set(true),
        };
      case "commandPalette":
        return {
          icon: SearchIcon,
          title: item.label,
          onclick: () => executeCommandBus.set("toggle-command-palette"),
        };
      case "undo":
        return {
          icon: icon ?? UndoIcon,
          title: undoTooltip,
          "aria-label": undoTooltip,
          onclick: undoAction,
          disabled: !canUndo,
        };
      case "redo":
        return {
          icon: RedoIcon,
          title: redoTooltip,
          "aria-label": redoTooltip,
          onclick: redoAction,
          disabled: !canRedo,
        };
      case "drawPath":
        return {
          icon,
          title: titled("Draw Path", "toggle-draw"),
          "aria-label": "Draw Path",
          active: $isDrawingMode,
          onclick: toggle(isDrawingMode),
        };
      case "ruler":
        return {
          icon: RulerIcon,
          title: titled("Toggle Ruler", "toggle-ruler"),
          "aria-label": "Toggle Ruler",
          active: $showRuler,
          onclick: toggle(showRuler),
        };
      case "protractor":
        return {
          icon: ProtractorIcon,
          title: titled("Toggle Protractor", "toggle-protractor"),
          "aria-label": "Toggle Protractor",
          active: $showProtractor,
          onclick: toggle(showProtractor),
        };
      case "grid":
        return {
          icon: GridIcon,
          title: titled("Toggle Grid", "toggle-grid"),
          "aria-label": "Toggle Grid",
          active: $showGrid,
          onclick: toggle(showGrid),
        };
      case "onionSkin":
        return {
          icon: OnionSkinIcon,
          title: titled("Toggle Onion Skin", "toggle-onion"),
          "aria-label": "Toggle Onion Skin",
          active: !!settings.showOnionLayers,
          onclick: () => toggleSetting("showOnionLayers"),
        };
      case "velocityHeatmap":
        return {
          icon: VelocityHeatmapIcon,
          title: "Toggle Velocity Heatmap",
          "aria-label": "Toggle Velocity Heatmap",
          active: !!settings.showVelocityHeatmap,
          onclick: () => toggleSetting("showVelocityHeatmap"),
        };
      case "lockView":
        return {
          icon: settings.lockFieldView ? LockIcon : UnlockIcon,
          title: titled("Toggle Field View Lock", "toggle-lock-view"),
          "aria-label": "Toggle Field View Lock",
          active: !!settings.lockFieldView,
          onclick: () => toggleSetting("lockFieldView"),
        };
      case "newPath":
        return {
          id: "sidebar-new-path-btn",
          icon: DocumentPlusIcon,
          iconClass: "sidebar-icon flex-none",
          title: titled("New Path", "new-file"),
          "aria-label": "New Path",
          onclick: () => resetProject(),
        };
      case "settings":
        return {
          id: "sidebar-settings-btn",
          icon: CogIcon,
          title: titled("Settings", "open-settings"),
          "aria-label": "Settings",
          onclick: () => showSettings.set(true),
        };
      case "feedback":
        return {
          id: "sidebar-feedback-btn",
          icon: FeedbackIcon,
          iconClass:
            "sidebar-icon-small flex-none text-purple-600 dark:text-purple-400",
          title: "Report Issue / Rating",
          "aria-label": "Report Issue / Rating",
          onclick: () => showFeedbackDialog.set(true),
        };
      case "discord":
        return {
          icon: DiscordIcon,
          iconClass: "sidebar-icon-small flex-none dark:fill-white",
          title: "Discord Server",
          "aria-label": "Discord Server Invite",
          href: "https://discord.gg/chHSzS4ewF",
        };
      case "github":
        return {
          icon: GithubIcon,
          iconClass: "sidebar-icon-small flex-none dark:fill-white",
          title: "GitHub Repo",
          "aria-label": "GitHub Repository",
          href: "https://github.com/Mallen220/TurtleTracer",
        };
      case "presentationMode":
        return {
          icon: icon ?? PresentationModeIcon,
          title: "Presentation Mode",
          active: $isPresentationMode,
          onclick: toggle(isPresentationMode),
        };
      case "pluginManager":
        return {
          icon: icon ?? PuzzleIcon,
          title: "Plugin Manager",
          onclick: () => showPluginManager.set(true),
        };
      case "whatsNew":
        return {
          icon: icon ?? RocketIcon,
          title: "What's New & Docs",
          onclick: () => showWhatsNew.set(true),
        };
      case "onboarding":
        return {
          icon: QuestionMarkIcon,
          title: "Restart Tutorial",
          onclick: () => startTutorial.set(true),
        };
      case "exportImage":
        return {
          icon: PhotoIcon,
          title: "Export as Image",
          onclick: () => showExportImage.set(true),
        };
      case "exportGif":
        return {
          icon: ExportGifIcon,
          title: "Export as GIF",
          onclick: () => showExportGif.set(true),
        };
      default:
        return null;
    }
  }

  // Items that show extra controls underneath their button.
  const STACKED_ITEMS = new Set(["protractor", "grid", "onionSkin"]);

  // --- History dropdown ---
  let historyContainer: HTMLElement | undefined = $state();

  onMount(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if ($showHistory && !historyContainer?.contains(event.target as Node)) {
        showHistory.set(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if ($showHistory && event.key === "Escape") showHistory.set(false);
    };
    document.addEventListener("click", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  });

  // --- Resizing ---
  let isResizing = $state(false);

  function setWidth(width: number) {
    setSetting("sidebarWidth", Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)));
  }

  function startResizing(e: MouseEvent) {
    if (!sidebarExpanded) return;
    e.preventDefault();
    isResizing = true;
    document.body.style.cursor = "col-resize";

    const onMove = (ev: MouseEvent) => setWidth(ev.clientX);
    const onUp = () => {
      isResizing = false;
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // --- Reordering items by drag and drop (only when expanded) ---
  let dragSourceIndex: number | null = $state(null);
  let dragOverIndex: number | null = $state(null);

  function endDrag() {
    dragSourceIndex = null;
    dragOverIndex = null;
  }

  function moveItem(from: number, to: number) {
    const ids = [...(settings.sidebarItems || SIDEBAR_ITEMS.map((i) => i.id))];
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    setSetting("sidebarItems", ids);
  }

  /** Svelte action that makes a sidebar row draggable for reordering. */
  function reorderable(node: HTMLElement, index: number) {
    let idx = index;
    const handlers: Record<string, (e: DragEvent) => void> = {
      dragstart: (e) => {
        if (!sidebarExpanded) return;
        dragSourceIndex = idx;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(idx));
        }
      },
      dragover: (e) => {
        if (!sidebarExpanded) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        dragOverIndex = idx;
      },
      dragleave: () => {
        if (dragOverIndex === idx) dragOverIndex = null;
      },
      drop: (e) => {
        if (!sidebarExpanded) return;
        e.preventDefault();
        if (dragSourceIndex !== null && dragSourceIndex !== idx) {
          moveItem(dragSourceIndex, idx);
        }
        endDrag();
      },
      dragend: endDrag,
    };
    for (const [type, fn] of Object.entries(handlers)) {
      node.addEventListener(type, fn as EventListener);
    }
    return {
      update(newIndex: number) {
        idx = newIndex;
      },
      destroy() {
        for (const [type, fn] of Object.entries(handlers)) {
          node.removeEventListener(type, fn as EventListener);
        }
      },
    };
  }

  const isDropTarget = (idx: number) =>
    dragOverIndex === idx && dragSourceIndex !== idx;

  function rowClass(idx: number, stacked = false) {
    return [
      "w-full flex transition-all",
      stacked ? "flex-col items-center" : "justify-center",
      isDropTarget(idx)
        ? "ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20"
        : "",
      dragSourceIndex === idx ? "opacity-30 scale-95" : "",
    ].join(" ");
  }

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
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
      {#if item.type === "separator" || item.type === "spacer"}
        <div
          draggable={sidebarExpanded}
          use:reorderable={idx}
          role="presentation"
          aria-hidden="true"
          class="transition-all {item.type === 'separator'
            ? 'w-8 h-px bg-neutral-200 dark:bg-neutral-700 my-1'
            : 'flex-grow w-full'} {isDropTarget(idx)
            ? item.type === 'separator'
              ? 'scale-x-150 bg-blue-400 dark:bg-blue-500'
              : 'bg-blue-50/50 dark:bg-blue-900/10'
            : ''} {dragSourceIndex === idx ? 'opacity-30' : ''}"
        ></div>
      {:else if item.id === "history"}
        {#if history}
          <div
            bind:this={historyContainer}
            draggable={sidebarExpanded}
            use:reorderable={idx}
            role="listitem"
            class={rowClass(idx)}
          >
            <SidebarButton
              label={item.label}
              expanded={sidebarExpanded}
              icon={item.iconComponent ?? ClockIcon}
              title={`History Panel${shortcut("toggle-history")}`}
              aria-label="History Panel"
              aria-haspopup="menu"
              aria-expanded={$showHistory}
              aria-controls="history-menu"
              onclick={() => showHistory.set(!$showHistory)}
              extraClass={$showHistory
                ? "bg-neutral-200 dark:bg-neutral-800"
                : ""}
            />

            {#if $showHistory && $historyStore}
              {@const currentIndex = $historyStore.findIndex((e) => !e.future)}
              <div
                id="history-menu"
                role="menu"
                aria-label="History Menu"
                use:menuNavigation
                onclose={() => showHistory.set(false)}
                class="absolute left-full ml-2 mt-0 w-64 bg-white dark:bg-neutral-800 shadow-xl py-1 z-50 border border-neutral-200 dark:border-neutral-700 animate-in fade-in zoom-in-95 duration-100 max-h-[50vh] overflow-y-auto"
              >
                <div
                  class="px-4 py-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-700 mb-1"
                >
                  History
                </div>
                {#each $historyStore as entry, i}
                  <button
                    role="menuitem"
                    onclick={() => {
                      history.restore(entry.item.id);
                      showHistory.set(false);
                    }}
                    class="w-full text-left px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center justify-between group {entry.future
                      ? 'opacity-50 hover:opacity-100 text-neutral-600 dark:text-neutral-400'
                      : i === currentIndex
                        ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-medium'
                        : 'text-neutral-700 dark:text-neutral-200'}"
                  >
                    <span class="truncate">{entry.item.description}</span>
                    <span
                      class="text-xs text-neutral-400 dark:text-neutral-500 ml-2"
                    >
                      {formatTime(entry.item.timestamp)}
                    </span>
                  </button>
                {:else}
                  <div
                    class="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400 text-center italic"
                  >
                    No history yet
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {:else}
        {@const spec = buttonFor(item)}
        {#if spec}
          <div
            draggable={sidebarExpanded}
            use:reorderable={idx}
            role="listitem"
            class={rowClass(idx, STACKED_ITEMS.has(item.id))}
          >
            <SidebarButton
              {...spec}
              label={item.label}
              expanded={sidebarExpanded}
            />

            {#if item.id === "protractor" && $showProtractor}
              {@const lockLabel = $protractorLockToRobot
                ? "Unlock Protractor from Robot"
                : "Lock Protractor to Robot"}
              <SidebarButton
                secondary
                label="Lock to Robot"
                expanded={sidebarExpanded}
                icon={$protractorLockToRobot ? LockIcon : UnlockIcon}
                title={lockLabel}
                aria-label={lockLabel}
                active={$protractorLockToRobot}
                activeClass="text-amber-500 bg-amber-50 dark:bg-amber-900/20"
                onclick={toggle(protractorLockToRobot)}
              />
            {:else if item.id === "grid" && $showGrid}
              <SidebarButton
                secondary
                label="Snap to Grid"
                expanded={sidebarExpanded}
                icon={MagnetIcon}
                title={`Toggle Snap${shortcut("toggle-snap")}`}
                aria-label={$snapToGrid ? "Disable Snap" : "Enable Snap"}
                active={$snapToGrid}
                activeClass="text-green-500 bg-green-50 dark:bg-green-900/20"
                onclick={toggle(snapToGrid)}
              />
              <div
                class="flex items-center {sidebarExpanded
                  ? 'w-[calc(100%-1.1rem)] px-3'
                  : 'justify-center'}"
              >
                <div
                  class="sidebar-icon flex-none flex items-center justify-center"
                >
                  <select
                    class="w-10 text-xs bg-transparent text-center text-neutral-600 dark:text-neutral-300 focus:outline-none cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors appearance-none"
                    bind:value={$gridSize}
                    title="Grid Size"
                    aria-label="Grid Size"
                  >
                    {#each [0.5, 1, 3, 6, 12, 24] as size}
                      <option value={size}>{size}"</option>
                    {/each}
                  </select>
                </div>
                {#if sidebarExpanded}
                  <span
                    class="ml-3 text-[10px] text-neutral-400 uppercase tracking-tight"
                    >Grid Size</span
                  >
                {/if}
              </div>
            {:else if item.id === "onionSkin" && settings.showOnionLayers}
              <SidebarButton
                secondary
                label="Current Path Only"
                expanded={sidebarExpanded}
                title={`Toggle Current Path Only${shortcut("toggle-onion-current-path")}`}
                aria-label={settings.onionSkinCurrentPathOnly
                  ? "Show All Paths"
                  : "Show Current Path Only"}
                active={!!settings.onionSkinCurrentPathOnly}
                onclick={() => toggleSetting("onionSkinCurrentPathOnly")}
              >
                {#snippet iconContent()}
                  <OnionSkinCurrentPathIcon
                    isActive={settings.onionSkinCurrentPathOnly}
                    className="sidebar-icon-small flex-none"
                  />
                {/snippet}
              </SidebarButton>
            {/if}
          </div>
        {/if}
      {/if}
    {/each}
  </div>

  <div
    class="w-full flex-none border-t border-neutral-200 dark:border-neutral-800 flex flex-col items-center gap-1.5 bg-neutral-50 dark:bg-neutral-900 py-2"
  >
    <div class="w-full flex justify-center">
      <SidebarButton
        label="Collapse"
        expanded={sidebarExpanded}
        title={sidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
        aria-label={sidebarExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
        aria-expanded={sidebarExpanded}
        aria-controls="sidebar-toolbar"
        active={false}
        aria-pressed={undefined}
        onclick={() => setSetting("sidebarExpanded", !sidebarExpanded)}
      >
        {#snippet iconContent()}
          <div
            class="sidebar-icon flex items-center justify-center transition-transform duration-300 {sidebarExpanded
              ? 'rotate-180'
              : ''}"
          >
            <SidebarCollapseIcon className="sidebar-icon" />
          </div>
        {/snippet}
      </SidebarButton>
    </div>
  </div>

  {#if sidebarExpanded}
    <button
      type="button"
      role="slider"
      title="Resize sidebar"
      aria-label="Resize sidebar"
      aria-valuenow={sidebarWidth}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuetext="{sidebarWidth} pixels"
      aria-orientation="vertical"
      class="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-purple-500/20 transition-colors z-[60] group focus:outline-none focus:bg-purple-500/30 appearance-none border-none bg-transparent"
      onmousedown={startResizing}
      onkeydown={(e) => {
        if (e.key === "ArrowLeft") setWidth(sidebarWidth - 10);
        else if (e.key === "ArrowRight") setWidth(sidebarWidth + 10);
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
