<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import { DEFAULT_SETTINGS } from "../../../../config/defaults";
  import type { Settings } from "../../../../types/index";
  import { SIDEBAR_ITEMS } from "../../../../config/sidebarItems";
  import { availableCommands } from "../../../../stores";
  import * as ICONS from "../../icons";

  export let settings: Settings;
  export let searchQuery: string;

  const DEFAULT_SIDEBAR_LAYOUT =
    DEFAULT_SETTINGS.sidebarItems ?? SIDEBAR_ITEMS.map((i) => i.id);

  function arraysEqual<T>(a: T[] | undefined, b: T[]) {
    if (!a) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  $: isSidebarLayoutModified = !arraysEqual(
    settings.sidebarItems,
    DEFAULT_SIDEBAR_LAYOUT,
  );
  $: hasCustomSidebarTools = (settings.customSidebarItems?.length ?? 0) > 0;

  function resetSidebarSettings() {
    if (
      !confirm(
        "Reset sidebar layout and remove all custom tools? This cannot be undone.",
      )
    ) {
      return;
    }
    settings.sidebarItems = [...(DEFAULT_SETTINGS.sidebarItems || [])];
    settings.customSidebarItems = [];
    settings = { ...settings };
  }

  $: activeSidebarList = (() => {
    const ids = settings.sidebarItems || SIDEBAR_ITEMS.map((i) => i.id);
    return ids.map((id) => {
      let item: any = SIDEBAR_ITEMS.find((i) => i.id === id);
      const isCustom = !item && settings.customSidebarItems;
      if (isCustom && settings.customSidebarItems) {
        item = settings.customSidebarItems.find((i) => i.id === id);
      }
      return {
        id,
        label: item?.label ?? id,
        icon: item?.iconSvg ?? "",
        iconComponent: item?.iconComponent,
        isCustom: !!isCustom,
      };
    });
  })();

  let dragSourceIndex: number | null = null;
  let dragOverIndex: number | null = null;

  function handleDragStart(e: DragEvent, index: number) {
    dragSourceIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dragOverIndex = index;
  }

  function handleDrop(e: DragEvent, dropIndex: number) {
    e.preventDefault();
    if (dragSourceIndex === null || dragSourceIndex === dropIndex) {
      dragSourceIndex = null;
      dragOverIndex = null;
      return;
    }
    if (!settings.sidebarItems)
      settings.sidebarItems = SIDEBAR_ITEMS.map((i) => i.id);
    const arr = [...settings.sidebarItems];
    const [moved] = arr.splice(dragSourceIndex, 1);
    arr.splice(dropIndex, 0, moved);
    settings.sidebarItems = arr;
    settings = { ...settings };
    dragSourceIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    dragSourceIndex = null;
    dragOverIndex = null;
  }

  function moveSidebarItemUp(index: number) {
    if (!settings.sidebarItems)
      settings.sidebarItems = SIDEBAR_ITEMS.map((i) => i.id);
    if (index === 0) return;
    const arr = [...settings.sidebarItems];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    settings.sidebarItems = arr;
    settings = { ...settings };
  }

  function moveSidebarItemDown(index: number) {
    if (!settings.sidebarItems)
      settings.sidebarItems = SIDEBAR_ITEMS.map((i) => i.id);
    if (index >= settings.sidebarItems.length - 1) return;
    const arr = [...settings.sidebarItems];
    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    settings.sidebarItems = arr;
    settings = { ...settings };
  }

  function removeSidebarItem(index: number) {
    if (!settings.sidebarItems) return;
    const arr = [...settings.sidebarItems];
    arr.splice(index, 1);
    settings.sidebarItems = arr;
    settings = { ...settings };
  }

  function addSidebarItem(id: string) {
    if (!settings.sidebarItems)
      settings.sidebarItems = SIDEBAR_ITEMS.map((i) => i.id);
    settings.sidebarItems = [...settings.sidebarItems, id];
    settings = { ...settings };
  }

  $: unusedAvailableTools = (() => {
    const active = settings.sidebarItems || SIDEBAR_ITEMS.map((i) => i.id);
    const builtIn = SIDEBAR_ITEMS.filter(
      (i) =>
        i.type !== "separator" && i.type !== "spacer" && !active.includes(i.id),
    );
    const custom = (settings.customSidebarItems || []).filter(
      (i) => !active.includes(i.id),
    );
    return [...builtIn, ...custom];
  })();

  function deleteCustomItem(id: string) {
    if (!settings.customSidebarItems) return;
    settings.customSidebarItems = settings.customSidebarItems.filter(
      (i) => i.id !== id,
    );
    if (settings.sidebarItems) {
      settings.sidebarItems = settings.sidebarItems.filter((i) => i !== id);
    }
    settings = { ...settings };
  }

  let showCustomSidebarForm = false;
  let customActionSelection = "";
  let customActionLabel = "";
  let commandSearchQuery = "";

  const ICON_COMPONENT_MAP: Record<string, any> = {
    ...ICONS,
    Arrow: ICONS.ArrowRightIcon,
    Plus: ICONS.PlusIcon,
    Save: ICONS.SaveIcon,
    Trash: ICONS.TrashIcon,
    Folder: ICONS.FolderIcon,
    Wrench: ICONS.WrenchIcon,
  };

  const CUSTOM_ICONS = Object.entries(ICON_COMPONENT_MAP).map(
    ([name, component]) => ({ name, component }),
  );

  $: filteredSidebarCommands = (() => {
    if (!commandSearchQuery) return $availableCommands;
    const low = commandSearchQuery.toLowerCase();
    return $availableCommands.filter(
      (c) =>
        c.label.toLowerCase().includes(low) ||
        (c.id && c.id.toLowerCase().includes(low)),
    );
  })();

  function selectSidebarCommand(cmd: any) {
    customActionSelection = cmd.id;
    if (!customActionLabel) {
      customActionLabel = cmd.label;
    }
    commandSearchQuery = "";
  }

  $: selectedCommand = $availableCommands.find(
    (c) => c.id === customActionSelection,
  );

  let customActionIconKey = CUSTOM_ICONS.length ? CUSTOM_ICONS[0].name : "";
  let customIconSearch = "";

  $: filteredCustomIcons = customIconSearch
    ? CUSTOM_ICONS.filter((icon) =>
        icon.name.toLowerCase().includes(customIconSearch.toLowerCase()),
      )
    : CUSTOM_ICONS;

  function addNewCustomItem() {
    if (!customActionSelection || !customActionLabel) return;
    const newId = `custom_${Date.now()}`;
    const newItem = {
      id: newId,
      label: customActionLabel,
      commandId: customActionSelection,
      iconSvg: customActionIconKey,
    };
    if (!settings.customSidebarItems) settings.customSidebarItems = [];
    settings.customSidebarItems.push(newItem);
    if (!settings.sidebarItems)
      settings.sidebarItems = SIDEBAR_ITEMS.map((i) => i.id);
    settings.sidebarItems.push(newId);

    settings = { ...settings };
    showCustomSidebarForm = false;
    customActionSelection = "";
    customActionLabel = "";
  }

  function handleNumberInput(
    value: string,
    property: keyof Settings,
    min?: number,
    max?: number,
    restoreDefaultIfEmpty = false,
  ) {
    if (value === "" && restoreDefaultIfEmpty) {
      (settings as any)[property] = DEFAULT_SETTINGS[property];
      settings = { ...settings };
      return;
    }
    let num = parseFloat(value);
    if (isNaN(num)) num = 0;
    if (min !== undefined) num = Math.max(min, num);
    if (max !== undefined) num = Math.min(max, num);
    (settings as any)[property] = num;
    settings = { ...settings };
  }
</script>

<div class="section-container mb-8">
  {#if searchQuery}
    <h4
      class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
    >
      Sidebar
    </h4>
  {/if}

  <SettingsItem
    label="Sidebar Icon Size"
    description="Adjust the size of the icons in the sidebar (16px - 32px)."
    isModified={settings.sidebarIconSize !== DEFAULT_SETTINGS.sidebarIconSize}
    onReset={() => {
      settings.sidebarIconSize = DEFAULT_SETTINGS.sidebarIconSize;
      settings = { ...settings };
    }}
    layout="row"
    {searchQuery}
  >
    <div class="flex items-center gap-3">
      <input
        type="range"
        min="16"
        max="32"
        step="1"
        value={settings.sidebarIconSize || 20}
        on:input={(e) =>
          handleNumberInput(e.currentTarget.value, "sidebarIconSize", 16, 32)}
        class="w-32 accent-blue-500"
      />
      <span
        class="text-xs font-mono text-neutral-500 dark:text-neutral-400 w-8 text-right"
      >
        {settings.sidebarIconSize || 20}px
      </span>
    </div>
  </SettingsItem>

  <SettingsItem
    label="Active Sidebar Layout"
    isModified={isSidebarLayoutModified}
    onReset={() => {
      settings.sidebarItems = [...(DEFAULT_SETTINGS.sidebarItems || [])];
      settings = { ...settings };
    }}
    description="Drag rows to reorder, use arrows for precision, or click × to remove."
    {searchQuery}
  >
    <div class="mt-2 flex flex-col gap-1.5">
      {#each activeSidebarList as item, idx}
        <div
          role="listitem"
          aria-grabbed={dragSourceIndex === idx}
          draggable="true"
          on:dragstart={(e) => handleDragStart(e, idx)}
          on:dragover={(e) => handleDragOver(e, idx)}
          on:drop={(e) => handleDrop(e, idx)}
          on:dragend={handleDragEnd}
          on:dragleave={() => {
            if (dragOverIndex === idx) dragOverIndex = null;
          }}
          class="flex items-center gap-2 bg-white dark:bg-neutral-800 border p-2 rounded-lg shadow-sm transition-all {dragOverIndex ===
            idx && dragSourceIndex !== idx
            ? 'border-blue-400 dark:border-blue-500 ring-1 ring-blue-300 dark:ring-blue-700 bg-blue-50 dark:bg-blue-900/20'
            : 'border-neutral-200 dark:border-neutral-700'} {dragSourceIndex ===
          idx
            ? 'opacity-50'
            : 'opacity-100'}"
        >
          <!-- Drag handle -->
          <div
            class="flex-none text-neutral-300 dark:text-neutral-600 cursor-grab active:cursor-grabbing hover:text-neutral-500 dark:hover:text-neutral-400 transition-colors"
          >
            <ICONS.ListIcon className="size-4" />
          </div>
          <!-- Icon -->
          <div
            class="flex-none w-5 h-5 flex items-center justify-center text-neutral-500"
          >
            {#if item.iconComponent}
              <svelte:component this={item.iconComponent} className="size-5" />
            {:else if item.icon}
              {#if ICON_COMPONENT_MAP[item.icon]}
                <svelte:component
                  this={ICON_COMPONENT_MAP[item.icon]}
                  className="size-5"
                />
              {:else}
                {@html item.icon}
              {/if}
            {:else if item.id === "separator"}
              <ICONS.MinusCircleSolidIcon className="size-4" />
            {:else if item.id === "spacer"}
              <div
                class="h-4 w-4 border-2 border-dashed border-neutral-300 rounded-full"
              ></div>
            {:else}
              <ICONS.PlusIcon className="size-4" />
            {/if}
          </div>
          <!-- Label -->
          <div
            class="flex-grow text-sm font-medium text-neutral-700 dark:text-neutral-300 truncate"
            title={item.label}
          >
            {item.label}
          </div>
          <!-- Controls -->
          <div class="flex items-center gap-0.5">
            <button
              on:click={() => moveSidebarItemUp(idx)}
              disabled={idx === 0}
              class="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Move up"
            >
              <ICONS.ChevronUpIcon className="size-4" />
            </button>
            <button
              on:click={() => moveSidebarItemDown(idx)}
              disabled={idx === activeSidebarList.length - 1}
              class="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Move down"
            >
              <ICONS.ChevronDownIcon className="size-4" />
            </button>
            <button
              on:click={() => removeSidebarItem(idx)}
              class="p-1 hover:bg-red-100 dark:hover:bg-red-900/40 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
              title="Remove from sidebar"
            >
              <ICONS.CloseIcon className="size-4" />
            </button>
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700">
      <h5
        class="text-sm font-semibold mb-3 text-neutral-800 dark:text-neutral-200"
      >
        Available Built-in Tools
      </h5>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {#each unusedAvailableTools as available}
          <div
            class="flex items-center border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 rounded-md shadow-sm group overflow-hidden"
          >
            <button
              on:click={() => addSidebarItem(available.id)}
              class="flex-grow flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-white dark:hover:bg-neutral-700 transition-colors min-w-0"
            >
              <span
                class="w-5 h-5 flex-none flex items-center justify-center text-neutral-500"
              >
                {#if available.iconComponent}
                  <svelte:component
                    this={available.iconComponent}
                    className="size-4"
                  />
                {:else if available.iconSvg}
                  {#if ICON_COMPONENT_MAP[available.iconSvg]}
                    <svelte:component
                      this={ICON_COMPONENT_MAP[available.iconSvg]}
                      className="size-4"
                    />
                  {:else}
                    {@html available.iconSvg}
                  {/if}
                {:else}
                  <ICONS.PlusIcon className="size-4" />
                {/if}
              </span>
              <span class="truncate" title={available.label}
                >{available.label}</span
              >
              <span
                class="text-blue-500 font-bold ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pl-1"
                >+</span
              >
            </button>
            {#if available.id && available.id.startsWith("custom_")}
              <button
                on:click={() => deleteCustomItem(available.id)}
                class="px-3 py-2 text-neutral-400 hover:text-red-500 border-l border-neutral-200 dark:border-neutral-700 hover:bg-red-50 dark:hover:bg-red-900/40 transition-colors"
                title="Permanently Delete Custom Item"
              >
                ×
              </button>
            {/if}
          </div>
        {/each}
        {#if unusedAvailableTools.length === 0}
          <div class="text-xs text-neutral-500 italic py-1">
            All built-in tools are already in the sidebar.
          </div>
        {/if}
      </div>

      <div
        class="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700"
      >
        <div class="flex items-start justify-between gap-3">
          <h5
            class="text-sm font-semibold mb-3 text-neutral-800 dark:text-neutral-200"
          >
            Create Custom Tool
          </h5>
          <button
            on:click={resetSidebarSettings}
            class="inline-flex items-center gap-2 px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:text-red-300 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!isSidebarLayoutModified && !hasCustomSidebarTools}
          >
            <ICONS.ResetIcon className="size-4" />
            Reset Sidebar
          </button>
        </div>
        <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-0">
          Restores the default sidebar layout and deletes any custom sidebar
          tools.
        </p>

        {#if !showCustomSidebarForm}
          <button
            on:click={() => (showCustomSidebarForm = true)}
            class="w-full flex items-center justify-center gap-2 py-2 px-4 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 hover:border-blue-300 transition-colors"
          >
            <ICONS.PlusIcon className="size-4" />
            Create Custom Sidebar Tool
          </button>
        {:else}
          <div
            class="p-5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl mt-3 shadow-sm transition-all"
          >
            <div
              class="flex items-center justify-between mb-5 border-b border-neutral-200 dark:border-neutral-700 pb-3"
            >
              <h6
                class="text-sm font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2"
              >
                <!-- <span class="flex items-center justify-center size-5 bg-blue-600 text-white rounded-full text-[10px]">NEW</span> -->
                Create Custom Tool
              </h6>
              <button
                on:click={() => (showCustomSidebarForm = false)}
                class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
              >
                <ICONS.CloseIcon className="size-4" />
              </button>
            </div>

            <div class="space-y-6">
              <!-- Step 1: Action -->
              <div class="space-y-3">
                <div
                  class="block text-xs font-bold text-neutral-500 uppercase tracking-widest"
                >
                  1. Choose Action
                </div>

                {#if customActionSelection && selectedCommand}
                  <div
                    class="flex items-center justify-between p-3 bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-900/50 rounded-lg group"
                  >
                    <div class="flex flex-col">
                      <span
                        class="text-sm font-semibold text-neutral-900 dark:text-white"
                        >{selectedCommand.label}</span
                      >
                      <span
                        class="text-[10px] text-neutral-400 font-mono uppercase tracking-tighter"
                        >{selectedCommand.id}</span
                      >
                    </div>
                    <button
                      on:click={() => {
                        customActionSelection = "";
                        commandSearchQuery = "";
                      }}
                      class="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline px-2 py-1"
                    >
                      Change
                    </button>
                  </div>
                {:else}
                  <div class="relative">
                    <div
                      class="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-400"
                    >
                      <ICONS.SearchIcon className="size-4" strokeWidth={2} />
                    </div>
                    <input
                      type="text"
                      bind:value={commandSearchQuery}
                      placeholder="Search command palette..."
                      class="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                    />
                  </div>
                  <div
                    class="max-h-48 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 divide-y divide-neutral-100 dark:divide-neutral-800 empty:hidden"
                  >
                    {#each filteredSidebarCommands.slice(0, 10) as cmd}
                      <button
                        on:click={() => selectSidebarCommand(cmd)}
                        class="w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors flex items-center justify-between group"
                      >
                        <span
                          class="font-medium text-neutral-700 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                          >{cmd.label}</span
                        >
                        {#if cmd.shortcut}
                          <kbd
                            class="text-[10px] bg-neutral-100 dark:bg-neutral-700 px-1.5 py-0.5 rounded text-neutral-400"
                            >{cmd.shortcut}</kbd
                          >
                        {/if}
                      </button>
                    {/each}
                    {#if filteredSidebarCommands.length === 0}
                      <div class="px-4 py-3 text-xs text-neutral-500 italic">
                        No matching commands found.
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- Step 2: Appearance -->
              <div class="space-y-4 pt-2">
                <div
                  class="block text-xs font-bold text-neutral-500 uppercase tracking-widest"
                >
                  2. Customize Appearance
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <!-- Label -->
                  <div class="space-y-1.5">
                    <label
                      for="customActionLabel"
                      class="block text-xs font-medium text-neutral-500 ml-1"
                      >Button text</label
                    >
                    <input
                      id="customActionLabel"
                      bind:value={customActionLabel}
                      type="text"
                      placeholder="e.g. My Tool"
                      class="w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                    />
                  </div>

                  <!-- Icon Selection -->
                  <div class="space-y-1.5">
                    <div
                      class="block text-xs font-medium text-neutral-500 ml-1"
                    >
                      Icon
                    </div>
                    <div class="relative group">
                      <button
                        class="w-full flex items-center gap-2 px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm transition-all focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <svelte:component
                          this={ICON_COMPONENT_MAP[customActionIconKey]}
                          className="size-5 text-blue-500"
                        />
                        <span class="text-neutral-700 dark:text-neutral-300"
                          >{customActionIconKey}</span
                        >
                        <ICONS.ChevronDownIcon
                          className="size-3 ml-auto text-neutral-400 group-hover:translate-y-0.5 transition-transform"
                          strokeWidth={2}
                        />
                      </button>
                      <div
                        class="absolute z-10 top-full left-0 right-0 mt-2 p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all"
                      >
                        <div class="mb-2">
                          <input
                            type="text"
                            bind:value={customIconSearch}
                            placeholder="Filter icons..."
                            class="w-full px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div class="grid grid-cols-5 gap-2">
                          {#each filteredCustomIcons as iconDef}
                            <button
                              class="aspect-square flex items-center justify-center rounded-lg border transition-all {iconDef.name ===
                              customActionIconKey
                                ? 'bg-blue-50 border-blue-400 text-blue-600'
                                : 'bg-transparent border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500'}"
                              on:click={() =>
                                (customActionIconKey = iconDef.name)}
                              title={iconDef.name}
                            >
                              <svelte:component
                                this={iconDef.component}
                                className="size-5"
                              />
                            </button>
                          {/each}
                        </div>
                        {#if filteredCustomIcons.length === 0}
                          <div
                            class="mt-2 text-xs text-neutral-500 dark:text-neutral-400 italic"
                          >
                            No icons match your search.
                          </div>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Live Preview Card -->
                <div
                  class="p-4 bg-white dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-xl flex items-center gap-5"
                >
                  <div class="flex flex-col items-center gap-1">
                    <span
                      class="text-[10px] text-neutral-400 uppercase font-bold tracking-tighter"
                      >Preview</span
                    >
                    <div
                      class="size-12 flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-800 rounded-lg shadow-inner text-blue-600 dark:text-blue-400 border border-white dark:border-neutral-700"
                    >
                      <svelte:component
                        this={ICON_COMPONENT_MAP[customActionIconKey]}
                        className="size-6"
                      />
                    </div>
                  </div>
                  <div class="flex-1 space-y-1">
                    <div
                      class="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate"
                    >
                      {customActionLabel || "Tool Label"}
                    </div>
                    <div class="text-[10px] text-neutral-400 line-clamp-1">
                      Executes: <span class="text-blue-500 font-medium italic"
                        >{selectedCommand?.label || "None"}</span
                      >
                    </div>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex gap-3 pt-2">
                <button
                  on:click={addNewCustomItem}
                  disabled={!customActionSelection || !customActionLabel}
                  class="flex-1 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 active:scale-95 disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
                >
                  Create Tool
                </button>
                <button
                  on:click={() => (showCustomSidebarForm = false)}
                  class="px-4 py-2.5 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 text-sm font-bold rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 active:scale-95 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </SettingsItem>
</div>
