<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import {
    CloseIcon,
    SearchIcon,
    ArrowPathIcon,
    TriangleWarningIcon,
  } from "../icons/index";
  import { fade, fly } from "svelte/transition";
  import {
    resetSettings,
    mergeSettings,
  } from "../../../utils/settingsPersistence";
  import {
    AVAILABLE_FIELD_MAPS,
    DEFAULT_SETTINGS,
  } from "../../../config/defaults";
  import type { Settings, CustomFieldConfig } from "../../../types/index";
  import RobotProfileManager from "../settings/RobotProfileManager.svelte";
  import CustomFieldWizard from "../settings/CustomFieldWizard.svelte";
  import SettingsItem from "./SettingsItem.svelte";
  import { themesStore } from "../../pluginsStore";
  import {
    showPluginManager,
    showShortcuts,
    startTutorial,
    currentFilePath,
    currentDirectoryStore,
    settingsActiveTab,
    notification,
  } from "../../../stores";
  import { followRobotStore } from "../../projectStore";
  import { SIDEBAR_ITEMS } from "../../../config/sidebarItems";
  import { availableCommands } from "../../../stores";
  import * as ICONS from "../icons";
  import GeneralSettingsTab from "../settings/tabs/GeneralSettingsTab.svelte";
  import RobotSettingsTab from "../settings/tabs/RobotSettingsTab.svelte";
  import MotionSettingsTab from "../settings/tabs/MotionSettingsTab.svelte";
  import InterfaceSettingsTab from "../settings/tabs/InterfaceSettingsTab.svelte";
  import SidebarSettingsTab from "../settings/tabs/SidebarSettingsTab.svelte";
  import CodeExportSettingsTab from "../settings/tabs/CodeExportSettingsTab.svelte";
  import AdvancedSettingsTab from "../settings/tabs/AdvancedSettingsTab.svelte";
  import AboutSettingsTab from "../settings/tabs/AboutSettingsTab.svelte";

  export let isOpen = false;
  export let settings: Settings = { ...DEFAULT_SETTINGS };

  type TabId =
    | "general"
    | "robot"
    | "motion"
    | "interface"
    | "code-export"
    | "sidebar"
    | "advanced"
    | "about";
  let activeTab: TabId = "general";
  let searchQuery = "";

  // Sync active tab from store when opening
  $: if (isOpen) {
    activeTab = $settingsActiveTab as TabId;
  }

  // Reset tab when closed so it's fresh on next open
  $: if (!isOpen) {
    searchQuery = "";
  }

  // Get version from package. json
  import packageJson from "../../../../package.json";
  let appVersion = packageJson.version;

  let downloadCount: number | null = null;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) {
      isOpen = false;
    }
  }

  const tabs = [
    {
      id: "general",
      label: "General",
      icon: "M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75",
    },
    {
      id: "robot",
      label: "Robot",
      icon: "M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z",
    },
    {
      id: "motion",
      label: "Motion",
      icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
    },
    {
      id: "interface",
      label: "Interface",
      icon: "M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42",
    },
    {
      id: "sidebar",
      label: "Sidebar",
      icon: "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v12a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18V6ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18V6Z",
    },
    {
      id: "code-export",
      label: "Code Export",
      icon: "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5",
    },
    {
      id: "advanced",
      label: "Advanced",
      icon: "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z",
    },
    {
      id: "about",
      label: "About",
      icon: "M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z",
    },
  ] as const;

  onMount(async () => {
    try {
      let page = 1;
      let count = 0;
      let hasMore = true;
      let completed = true; // will be false if any page fails to fetch fully

      while (hasMore) {
        const response = await fetch(
          `https://api.github.com/repos/Mallen220/TurtleTracer/releases?per_page=100&page=${page}`,
        );

        if (response.ok) {
          const releases = await response.json();
          if (releases.length === 0) {
            hasMore = false;
          } else {
            releases.forEach((release: any) => {
              release.assets.forEach((asset: any) => {
                const name = asset.name.toLowerCase();
                const releaseAssetRegex =
                  /\.(exe|dmg|deb|rpm|appimage|pkg|zip|tar\.gz)(?:\.|$)/;
                if (releaseAssetRegex.test(name)) {
                  count += asset.download_count || 0;
                }
              });
            });
            page++;
          }
        } else {
          completed = false;
          hasMore = false;
          break;
        }
      }

      if (completed) {
        downloadCount = count;
      } else {
        console.warn(
          "Incomplete fetch of releases — download count may be partial or unavailable",
        );
        downloadCount = null;
      }
    } catch (e) {
      console.error("Failed to fetch download count", e);
    }
  });
  // Display units state

  // Display value for angular velocity

  // Display value for max angular acceleration

  import { saveSettings } from "../../../utils/settingsPersistence";

  async function handleSave() {
    await saveSettings(settings);
    isOpen = false;
  }

  async function handleReset() {
    if (
      confirm(
        "Are you sure you want to reset all settings to defaults? This cannot be undone.",
      )
    ) {
      const defaultSettings = await resetSettings();
      // Update the bound settings object
      Object.keys(defaultSettings).forEach((key) => {
        (settings as any)[key] = (defaultSettings as any)[key];
      });

      // Prevent the UI from immediately triggering the onboarding tutorial
      (settings as any).hasSeenOnboarding = true;
      settings = { ...settings };
      try {
        await saveSettings(settings);
      } catch (e) {
        console.warn("Failed to persist settings after reset", e);
      }
    }
  }

  $: availableMaps = [
    ...AVAILABLE_FIELD_MAPS,
    ...(settings.customMaps || []).map((m) => ({
      value: m.id,
      label: m.name || "Custom Field",
    })),
  ];

  // ==== Sidebar Settings State ====

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

  // Native drag-and-drop reordering

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

  // Custom Item Form State

  // Map of icon name -> Svelte component, used both for the picker and for rendering persisted custom items
  // This includes all icons exported from the icons folder, plus a few friendly aliases.
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    transition:fade={{ duration: 300, easing: cubicInOut }}
    class="bg-black bg-opacity-40 flex flex-col justify-center items-center fixed top-0 left-0 w-full h-full z-[1005] backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
  >
    <div
      transition:fly={{ duration: 300, easing: cubicInOut, y: 20 }}
      class="flex flex-col bg-white dark:bg-neutral-900 rounded-xl w-full max-w-4xl h-[85vh] shadow-2xl overflow-hidden border border-neutral-200 dark:border-neutral-800"
    >
      <!-- Main Layout -->
      <div class="flex h-full">
        <!-- Sidebar -->
        <div
          class="w-64 bg-neutral-50 dark:bg-neutral-950 border-r border-neutral-200 dark:border-neutral-800 flex flex-col"
        >
          <!-- Sidebar Header & Search -->
          <div class="p-4 border-b border-neutral-200 dark:border-neutral-800">
            <h2
              id="settings-title"
              class="text-xl font-bold text-neutral-900 dark:text-white pl-1"
            >
              Settings
            </h2>
            <div
              class="flex items-center gap-2 mb-4 pl-1 text-xs font-medium text-neutral-500 dark:text-neutral-400"
            >
              <span>Version {appVersion}</span>
              {#if downloadCount}
                <span>• {downloadCount.toLocaleString()} Downloads</span>
              {/if}
            </div>

            <div class="relative">
              <input
                type="text"
                placeholder="Search settings..."
                bind:value={searchQuery}
                class="w-full pl-9 pr-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <SearchIcon
                strokeWidth={1.5}
                className="size-4 absolute left-3 top-2.5 text-neutral-400"
              />
            </div>
          </div>

          <!-- Navigation -->
          <nav class="flex-1 overflow-y-auto p-2 space-y-1">
            {#each tabs as tab}
              <button
                on:click={() => {
                  activeTab = tab.id;
                  searchQuery = "";
                }}
                class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors {activeTab ===
                  tab.id && !searchQuery
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'}"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width={1.5}
                  stroke="currentColor"
                  class="size-5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d={tab.icon}
                  />
                </svg>
                {tab.label}
              </button>
            {/each}
          </nav>

          <!-- Sidebar Footer (Reset) -->
          <div class="p-4 border-t border-neutral-200 dark:border-neutral-800">
            <button
              on:click={handleReset}
              class="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            >
              <ArrowPathIcon className="size-4" />
              Reset Defaults
            </button>
          </div>
        </div>

        <!-- Content Area -->
        <div
          class="flex-1 flex flex-col h-full min-w-0 bg-white dark:bg-neutral-900"
        >
          <!-- Header (with close button) -->
          <div
            class="p-4 border-b border-neutral-200 dark:border-neutral-800 flex justify-between items-center bg-white dark:bg-neutral-900 sticky top-0 z-10"
          >
            <h3 class="text-lg font-semibold text-neutral-900 dark:text-white">
              {#if searchQuery}
                Search Results
              {:else}
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              {/if}
            </h3>
            <div class="flex gap-2 items-center">
              <button
                on:click={handleSave}
                class="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm"
              >
                Save
              </button>
              <button
                on:click={() => (isOpen = false)}
                aria-label="Close settings"
                class="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-500"
              >
                <CloseIcon className="size-6" />
              </button>
            </div>
          </div>

          <!-- Scrollable Content -->
          <div
            class="flex-1 overflow-y-auto p-6 scroll-smooth"
            class:is-searching={!!searchQuery}
          >
            <!-- Warning Banner -->
            <div
              class="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg flex gap-3"
            >
              <TriangleWarningIcon
                className="size-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
              />
              <div class="text-sm text-amber-900 dark:text-amber-100">
                <span class="font-semibold block mb-0.5">UI Settings Only</span>
                <span class="opacity-90"
                  >These settings only affect the visualizer interface. Make
                  sure your robot code matches these values.</span
                >
              </div>
            </div>

            <!-- General Section -->
            {#if activeTab === "general" || searchQuery}
              <GeneralSettingsTab bind:settings {searchQuery} bind:isOpen />
            {/if}

            <!-- Robot Section -->
            {#if activeTab === "robot" || searchQuery}
              <RobotSettingsTab bind:settings {searchQuery} />
            {/if}

            <!-- Motion Section -->
            {#if activeTab === "motion" || searchQuery}
              <MotionSettingsTab bind:settings {searchQuery} />
            {/if}

            <!-- Interface Section -->
            {#if activeTab === "interface" || searchQuery}
              <InterfaceSettingsTab bind:settings {searchQuery} />
            {/if}

            <!-- Sidebar Tab -->
            {#if activeTab === "sidebar" || searchQuery}
              <SidebarSettingsTab bind:settings {searchQuery} />
            {/if}

            <!-- Code Export Section -->
            {#if activeTab === "code-export" || searchQuery}
              <CodeExportSettingsTab bind:settings {searchQuery} />
            {/if}

            <!-- Advanced Section -->
            {#if activeTab === "advanced" || searchQuery}
              <AdvancedSettingsTab bind:settings {searchQuery} />
            {/if}

            <!-- About Section -->
            {#if activeTab === "about" || searchQuery}
              <AboutSettingsTab {searchQuery} />
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .is-searching :global(.section-container:not(:has(.visible-setting))) {
    display: none;
  }
</style>
