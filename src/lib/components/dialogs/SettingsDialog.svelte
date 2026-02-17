<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";
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

  export let isOpen = false;
  export let settings: Settings = { ...DEFAULT_SETTINGS };

  type TabId =
    | "general"
    | "robot"
    | "motion"
    | "interface"
    | "code-export"
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
    // We don't reset the store here to avoid loops, but we reset local state if needed
    searchQuery = "";
  }

  let isCustomFieldWizardOpen = false;
  let editingCustomConfig: CustomFieldConfig | undefined = undefined;

  // Get version from package. json
  import packageJson from "../../../../package.json";
  let appVersion = packageJson.version;

  let downloadCount: number | null = null;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen && !isCustomFieldWizardOpen) {
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
          `https://api.github.com/repos/Mallen220/PedroPathingPlusVisualizer/releases?per_page=100&page=${page}`,
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
          // Non-OK response (rate-limited or network issue). Abort and mark incomplete so we don't display a partial value.
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
  let angularVelocityUnit: "rad" | "deg" = "rad";

  // Display value for angular velocity
  $: angularVelocityDisplay = settings
    ? angularVelocityUnit === "rad"
      ? settings.aVelocity / Math.PI
      : (settings.aVelocity * 180) / Math.PI
    : 1;

  // Display value for max angular acceleration
  $: maxAngularAccelerationDisplay = settings
    ? angularVelocityUnit === "rad"
      ? (settings.maxAngularAcceleration ?? 0)
      : ((settings.maxAngularAcceleration ?? 0) * 180) / Math.PI
    : 0;

  function handleAngularVelocityInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseFloat(target.value);
    if (isNaN(val)) return;

    if (angularVelocityUnit === "rad") {
      settings.aVelocity = val * Math.PI;
    } else {
      settings.aVelocity = (val * Math.PI) / 180;
    }
    settings = { ...settings };
  }

  function handleAngularVelocityChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.value === "") {
      settings.aVelocity = DEFAULT_SETTINGS.aVelocity;
      settings = { ...settings };
    } else {
      handleAngularVelocityInput(e);
    }
  }

  function handleMaxAngularAccelerationInput(e: Event) {
    const target = e.target as HTMLInputElement;
    let val = parseFloat(target.value);
    if (isNaN(val)) val = 0;
    if (val < 0) val = 0;

    if (angularVelocityUnit === "rad") {
      settings.maxAngularAcceleration = val;
    } else {
      settings.maxAngularAcceleration = (val * Math.PI) / 180;
    }
    settings = { ...settings };
  }

  import { saveSettings } from "../../../utils/settingsPersistence";

  async function handleSave() {
    await saveSettings(settings);
    isOpen = false;
  }

  async function handleExport() {
    try {
      const dataStr = JSON.stringify(settings, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", url);
      downloadAnchorNode.setAttribute("download", "pedro-settings.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      notification.set({ message: "Settings exported", type: "success", timeout: 3000 });
      downloadAnchorNode.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      notification.set({ message: "Failed to export settings: " + (e as Error).message, type: "error" });
    }
  }

  async function handleImport(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        if (typeof event.target?.result === "string") {
          const json = JSON.parse(event.target.result);
          // Handle if it's wrapped in StoredSettings or raw Settings
          // StoredSettings has a 'settings' property
          const rawSettings = json.settings || json;
          const merged = mergeSettings(rawSettings);

          // Update local state
          settings = merged;

          // Persist
          await saveSettings(settings);
          notification.set({ message: "Settings imported", type: "success", timeout: 3000 });
        }
      } catch (err) {
        notification.set({ message: "Error importing settings: " + (err as Error).message, type: "error" });
      }
      // Reset input
      target.value = "";
    };
    reader.readAsText(file);
  }

  let isCheckingForUpdates = false;

  async function handleCheckForUpdates() {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && electronAPI.checkForUpdates) {
      isCheckingForUpdates = true;
      try {
        const result = await electronAPI.checkForUpdates();
        if (result.success) {
          if (result.updateAvailable) {
            isOpen = false;
            // The global listener in App.svelte will handle opening the update dialog
            notification.set({ message: "Update available — opening installer...", type: "info", timeout: 4000 });
          } else {
            if (result.reason === "store") {
              notification.set({ message: "Updates are managed by the Microsoft Store.", type: "info" });
            } else {
              notification.set({ message: "You are on the newest version.", type: "success" });
            }
          }
        } else {
          // Fallback if success is false but no error thrown
          notification.set({ message: "Failed to check for updates: " + (result.message || "Unknown error"), type: "error" });
        }
      } catch (e) {
        notification.set({ message: "Failed to check for updates: " + (e as Error).message, type: "error" });
      } finally {
        isCheckingForUpdates = false;
      }
    } else {
      notification.set({ message: "Update check not supported in this environment.", type: "warning" });
    }
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

  function imageToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to convert image"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function handleLengthInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(target.value, "rLength", 1, 36, true);
  }

  function handleWidthInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(target.value, "rWidth", 1, 36, true);
  }

  function handleImageError(e: Event) {
    const target = e.target as HTMLImageElement;
    target.src = "/robot.png";
  }

  function handleSafetyMarginInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(target.value, "safetyMargin", 0, 24, true);
  }

  function handleXVelocityInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(target.value, "xVelocity", 0, undefined, true);
  }

  function handleYVelocityInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(target.value, "yVelocity", 0, undefined, true);
  }

  function handleMaxVelocityInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(target.value, "maxVelocity", 0, undefined, true);
  }

  function handleMaxAccelerationInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(target.value, "maxAcceleration", 0, undefined, true);
  }

  function handleMaxDecelerationInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(target.value, "maxDeceleration", 0, undefined, true);
  }

  function handleFrictionInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(target.value, "kFriction", 0, undefined, true);
  }

  function handleIterationsInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(target.value, "optimizationIterations", 10, 3000, true);
  }

  function handlePopulationInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(
      target.value,
      "optimizationPopulationSize",
      10,
      200,
      true,
    );
  }

  function handleMutationRateInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(target.value, "optimizationMutationRate", 0.01, 1, true);
  }

  function handleMutationStrengthInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleNumberInput(
      target.value,
      "optimizationMutationStrength",
      0.1,
      20,
      true,
    );
  }

  async function handleImageUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      try {
        const base64 = await imageToBase64(file);
        settings.robotImage = base64;
        settings = { ...settings };

        notification.set({ message: "Robot image updated!", type: "success", timeout: 3000 });
      } catch (error) {
        notification.set({ message: "Error loading image: " + (error as Error).message, type: "error" });
      }
    }
  }

  function handleCustomFieldSave(e: CustomEvent<CustomFieldConfig>) {
    const newConfig = e.detail;
    if (!settings.customMaps) settings.customMaps = [];

    const index = settings.customMaps.findIndex((m) => m.id === newConfig.id);
    if (index >= 0) {
      settings.customMaps[index] = newConfig;
    } else {
      settings.customMaps.push(newConfig);
    }

    settings.fieldMap = newConfig.id;
    settings = { ...settings };
  }

  function handleAddCustomMap() {
    editingCustomConfig = undefined;
    isCustomFieldWizardOpen = true;
  }

  function handleEditCustomMap(id: string) {
    editingCustomConfig = settings.customMaps?.find((m) => m.id === id);
    isCustomFieldWizardOpen = true;
  }

  function handleDeleteCustomMap(id: string) {
    if (confirm("Are you sure you want to delete this custom field map?")) {
      settings.customMaps =
        settings.customMaps?.filter((m) => m.id !== id) || [];
      if (settings.fieldMap === id) {
        settings.fieldMap = "centerstage.webp";
      }
      settings = { ...settings };
    }
  }

  function getBasePath(): string | null {
    if ($currentFilePath) return $currentFilePath;
    if ($currentDirectoryStore)
      return $currentDirectoryStore + "/placeholder.pp";
    return null;
  }

  async function handleBrowse() {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || !electronAPI.selectDirectory) return;

    const path = await electronAPI.selectDirectory();
    if (path) {
      const base = getBasePath();
      if (settings.autoExportPathMode === "relative" && base) {
        settings.autoExportPath = await electronAPI.makeRelativePath(
          base,
          path,
        );
      } else {
        settings.autoExportPath = path;
      }
    }
  }

  async function handleModeChange(newMode: "relative" | "absolute") {
    const electronAPI = (window as any).electronAPI;
    // Current mode defaults to 'relative' if undefined
    const currentMode = settings.autoExportPathMode || "relative";

    if (currentMode === newMode) return;

    const base = getBasePath();

    if (
      electronAPI &&
      base &&
      settings.autoExportPath &&
      settings.autoExportPath.trim() !== ""
    ) {
      if (newMode === "absolute") {
        // Convert relative to absolute
        settings.autoExportPath = await electronAPI.resolvePath(
          base,
          settings.autoExportPath,
        );
      } else if (newMode === "relative") {
        // Convert absolute to relative
        settings.autoExportPath = await electronAPI.makeRelativePath(
          base,
          settings.autoExportPath,
        );
      }
    }

    settings.autoExportPathMode = newMode;
  }

  $: availableMaps = [
    ...AVAILABLE_FIELD_MAPS,
    ...(settings.customMaps || []).map((m) => ({
      value: m.id,
      label: m.name || "Custom Field",
    })),
  ];
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen && !isCustomFieldWizardOpen}
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={1.5}
                stroke="currentColor"
                class="size-4 absolute left-3 top-2.5 text-neutral-400"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={1.5}
                stroke="currentColor"
                class="size-4"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
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
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={1.5}
                stroke="currentColor"
                class="size-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
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
              <div class="section-container mb-8">
                {#if searchQuery}
                  <h4
                    class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
                  >
                    General
                  </h4>
                {/if}

                <SettingsItem
                  label="Autosave Mode"
                  description="Choose when to automatically save the project"
                  {searchQuery}
                  layout="col"
                  forId="autosave-mode"
                >
                  <select
                    id="autosave-mode"
                    bind:value={settings.autosaveMode}
                    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="never">Never</option>
                    <option value="time">Time Based</option>
                    <option value="change">On Change</option>
                    <option value="close">On Close</option>
                  </select>
                </SettingsItem>

                {#if settings.autosaveMode === "time"}
                  <div transition:fade>
                    <SettingsItem
                      label="Autosave Interval"
                      description={`Save every ${settings.autosaveInterval} minutes`}
                      {searchQuery}
                      layout="col"
                      forId="autosave-interval"
                    >
                      <select
                        id="autosave-interval"
                        bind:value={settings.autosaveInterval}
                        class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {#each [1, 5, 10, 15, 20, 40, 60] as interval}
                          <option value={interval}>{interval} minutes</option>
                        {/each}
                      </select>
                    </SettingsItem>
                  </div>
                {/if}

                <SettingsItem
                  label="Welcome Tutorial"
                  description="Learn how to use the application"
                  {searchQuery}
                  layout="row"
                >
                  <button
                    on:click={() => {
                      isOpen = false;
                      startTutorial.set(true);
                    }}
                    class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Start Tutorial
                  </button>
                </SettingsItem>

                <SettingsItem
                  label="Software Update"
                  description="Check for new versions of the application"
                  {searchQuery}
                  layout="row"
                >
                  <button
                    on:click={handleCheckForUpdates}
                    disabled={isCheckingForUpdates}
                    class="px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-md transition-colors disabled:opacity-50"
                  >
                    {isCheckingForUpdates ? "Checking..." : "Check for Updates"}
                  </button>
                </SettingsItem>

                <SettingsItem
                  label="Keyboard Shortcuts"
                  description="View and customize keyboard shortcuts"
                  {searchQuery}
                  layout="row"
                >
                  <button
                    on:click={() => showShortcuts.set(true)}
                    class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Open Editor
                  </button>
                </SettingsItem>

                <SettingsItem
                  label="Plugin Manager"
                  description="Manage installed plugins"
                  {searchQuery}
                  layout="row"
                >
                  <button
                    on:click={() => {
                      isOpen = false;
                      showPluginManager.set(true);
                    }}
                    class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Open Manager
                  </button>
                </SettingsItem>

                <SettingsItem
                  label="Git Integration"
                  description="Show git status indicators for files"
                  {searchQuery}
                  layout="row"
                >
                  <input
                    type="checkbox"
                    bind:checked={settings.gitIntegration}
                    class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                </SettingsItem>

                <SettingsItem
                  label="Transfer Settings"
                  description="Export or import your settings configuration"
                  {searchQuery}
                  layout="row"
                >
                  <div class="flex gap-2">
                    <button
                      on:click={handleExport}
                      title="Export Settings"
                      class="px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-md transition-colors"
                    >
                      Export
                    </button>
                    <button
                      on:click={() =>
                        document
                          .getElementById("settings-import-input")
                          ?.click()}
                      title="Import Settings"
                      class="px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 rounded-md transition-colors"
                    >
                      Import
                    </button>
                    <input
                      type="file"
                      id="settings-import-input"
                      class="hidden"
                      accept=".json"
                      on:change={handleImport}
                    />
                  </div>
                </SettingsItem>

              </div>
            {/if}

            <!-- Robot Section -->
            {#if activeTab === "robot" || searchQuery}
              <div class="section-container mb-8">
                {#if searchQuery}
                  <h4
                    class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
                  >
                    Robot
                  </h4>
                {/if}

                <SettingsItem
                  label="Robot Profiles"
                  description="Save and load robot configurations"
                  {searchQuery}
                  section
                >
                  <RobotProfileManager
                    {settings}
                    onSettingsChange={() => (settings = { ...settings })}
                  />
                </SettingsItem>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SettingsItem
                    label="Robot Length (in)"
                    description="Length of the robot base"
                    {searchQuery}
                    forId="robot-length"
                  >
                    <input
                      id="robot-length"
                      type="number"
                      bind:value={settings.rLength}
                      min="1"
                      max="36"
                      step="0.5"
                      on:change={handleLengthInput}
                      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </SettingsItem>
                  <SettingsItem
                    label="Robot Width (in)"
                    description="Width of the robot base"
                    {searchQuery}
                    forId="robot-width"
                  >
                    <input
                      id="robot-width"
                      type="number"
                      bind:value={settings.rWidth}
                      min="1"
                      max="36"
                      step="0.5"
                      on:change={handleWidthInput}
                      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </SettingsItem>
                </div>

                <SettingsItem
                  label="Safety Margin (in)"
                  description="Buffer around obstacles and field boundaries"
                  {searchQuery}
                  forId="safety-margin"
                >
                  <input
                    id="safety-margin"
                    type="number"
                    bind:value={settings.safetyMargin}
                    min="0"
                    max="24"
                    step="0.5"
                    on:change={handleSafetyMarginInput}
                    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </SettingsItem>

                <SettingsItem
                  label="Validate Field Boundaries"
                  description="Warn if robot exits the field"
                  {searchQuery}
                  layout="row"
                >
                  <input
                    type="checkbox"
                    bind:checked={settings.validateFieldBoundaries}
                    class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                </SettingsItem>

                <SettingsItem
                  label="Restrict Dragging"
                  description="Keep points inside field bounds"
                  {searchQuery}
                  layout="row"
                >
                  <input
                    type="checkbox"
                    bind:checked={settings.restrictDraggingToField}
                    class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                </SettingsItem>

                <SettingsItem
                  label="Continuous Validation"
                  description="Show validation issues as you work"
                  {searchQuery}
                  layout="row"
                >
                  <input
                    type="checkbox"
                    bind:checked={settings.continuousValidation}
                    class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                </SettingsItem>

                <SettingsItem
                  label="Robot Image"
                  description="Upload a custom image for your robot"
                  {searchQuery}
                  section
                >
                  <div
                    class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                  >
                    Robot Image
                    <div
                      class="text-xs text-neutral-500 dark:text-neutral-400 font-normal mt-0.5"
                    >
                      Upload a custom image for your robot
                    </div>
                  </div>
                  <div
                    class="flex flex-col items-center gap-3 p-4 border border-neutral-300 dark:border-neutral-700 rounded-md bg-neutral-50 dark:bg-neutral-800/50"
                  >
                    <!-- Image Preview & Controls (Same as original) -->
                    <div
                      class="relative w-24 h-24 border-2 border-neutral-300 dark:border-neutral-600 rounded-md overflow-hidden bg-white dark:bg-neutral-900"
                    >
                      <img
                        src={settings.robotImage || "/robot.png"}
                        alt="Robot Preview"
                        class="w-full h-full object-contain"
                        on:error={(e) => {
                          console.error(
                            "Failed to load robot image:",
                            settings.robotImage,
                          );
                          handleImageError(e);
                        }}
                      />
                      {#if settings.robotImage && settings.robotImage !== "/robot.png"}
                        <button
                          on:click={() => {
                            settings.robotImage = "/robot.png";
                            settings = { ...settings };
                          }}
                          class="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="size-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="3"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      {/if}
                    </div>
                    <div
                      class="text-center text-xs text-neutral-600 dark:text-neutral-400"
                    >
                      {#if settings.robotImage && settings.robotImage !== "/robot.png"}
                        <p class="font-medium">
                          {#if settings.robotImage === "/JefferyThePotato.png"}
                            🥔 Jeffery the Potato Active! 🥔
                          {:else}
                            Custom Image Loaded
                          {/if}
                        </p>
                      {:else}
                        <p>Using default robot image</p>
                      {/if}
                    </div>
                    <div class="flex flex-wrap justify-center gap-2 w-full">
                      <input
                        id="robot-image-input"
                        type="file"
                        accept="image/*"
                        class="hidden"
                        on:change={handleImageUpload}
                      />
                      <button
                        on:click={() =>
                          document.getElementById("robot-image-input")?.click()}
                        class="px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
                      >
                        Upload Robot Image
                      </button>
                      <button
                        on:click={() => {
                          settings.robotImage = "/robot.png";
                          settings = { ...settings };
                        }}
                        class="px-3 py-1.5 text-xs bg-neutral-500 hover:bg-neutral-600 text-white rounded-md transition-colors"
                        disabled={!settings.robotImage ||
                          settings.robotImage === "/robot.png"}
                      >
                        Use Default Image
                      </button>
                      <button
                        on:click={() => {
                          settings.robotImage = "/JefferyThePotato.png";
                          settings = { ...settings };
                        }}
                        class="potato-tooltip px-3 py-1.5 text-xs bg-amber-700 hover:bg-amber-800 text-white rounded-md transition-colors flex items-center gap-1 overflow-hidden relative"
                        style="background-image: linear-gradient(45deg, #a16207 25%, #ca8a04 25%, #ca8a04 50%, #a16207 50%, #a16207 75%, #ca8a04 75%, #ca8a04 100%); background-size: 20px 20px;"
                      >
                        <span>🥔</span> Use Potato Robot
                      </button>
                    </div>
                  </div>
                </SettingsItem>
              </div>
            {/if}

            <!-- Motion Section -->
            {#if activeTab === "motion" || searchQuery}
              <div class="section-container mb-8">
                {#if searchQuery}
                  <h4
                    class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
                  >
                    Motion
                  </h4>
                {/if}

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SettingsItem
                    label="X Velocity (in/s)"
                    {searchQuery}
                    forId="x-velocity"
                  >
                    <input
                      id="x-velocity"
                      type="number"
                      bind:value={settings.xVelocity}
                      min="0"
                      step="1"
                      on:change={handleXVelocityInput}
                      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </SettingsItem>
                  <SettingsItem
                    label="Y Velocity (in/s)"
                    {searchQuery}
                    forId="y-velocity"
                  >
                    <input
                      id="y-velocity"
                      type="number"
                      bind:value={settings.yVelocity}
                      min="0"
                      step="1"
                      on:change={handleYVelocityInput}
                      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </SettingsItem>
                </div>

                <SettingsItem
                  label={`Max Angular Acceleration (${angularVelocityUnit === "rad" ? "rad/s²" : "deg/s²"})`}
                  description="Set to 0 to auto-calculate from linear acceleration"
                  {searchQuery}
                  forId="max-angular-acceleration"
                >
                  <input
                    id="max-angular-acceleration"
                    type="number"
                    value={Number(
                      (maxAngularAccelerationDisplay ?? 0).toFixed(2),
                    )}
                    min="0"
                    step={angularVelocityUnit === "rad" ? 0.1 : 10}
                    on:input={handleMaxAngularAccelerationInput}
                    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </SettingsItem>

                <SettingsItem
                  label="Angular Velocity"
                  {searchQuery}
                  forId="angular-velocity"
                >
                  <div class="flex justify-between items-center mb-1">
                    <div class="text-xs text-neutral-500 dark:text-neutral-400">
                      {angularVelocityUnit === "rad"
                        ? "Multiplier of π radians per second"
                        : "Degrees per second"}
                    </div>
                    <div
                      class="flex items-center text-xs border border-neutral-300 dark:border-neutral-600 rounded overflow-hidden"
                    >
                      <button
                        class="px-2 py-0.5 {angularVelocityUnit === 'rad'
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
                          : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'}"
                        on:click={() => (angularVelocityUnit = "rad")}
                        >π rad/s</button
                      >
                      <div
                        class="w-px h-full bg-neutral-300 dark:bg-neutral-600"
                      ></div>
                      <button
                        class="px-2 py-0.5 {angularVelocityUnit === 'deg'
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
                          : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'}"
                        on:click={() => (angularVelocityUnit = "deg")}
                        >deg/s</button
                      >
                    </div>
                  </div>
                  <input
                    id="angular-velocity"
                    type="number"
                    value={angularVelocityDisplay}
                    min="0"
                    step={angularVelocityUnit === "rad" ? 0.1 : 10}
                    on:input={handleAngularVelocityInput}
                    on:change={handleAngularVelocityChange}
                    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </SettingsItem>

                <SettingsItem
                  label="Max Velocity (in/s)"
                  {searchQuery}
                  forId="max-velocity"
                >
                  <input
                    id="max-velocity"
                    type="number"
                    bind:value={settings.maxVelocity}
                    min="0"
                    step="1"
                    on:change={handleMaxVelocityInput}
                    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </SettingsItem>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SettingsItem
                    label="Max Acceleration (in/s²)"
                    {searchQuery}
                    forId="max-acceleration"
                  >
                    <input
                      id="max-acceleration"
                      type="number"
                      bind:value={settings.maxAcceleration}
                      min="0"
                      step="1"
                      on:change={handleMaxAccelerationInput}
                      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </SettingsItem>
                  <SettingsItem
                    label="Max Deceleration (in/s²)"
                    {searchQuery}
                    forId="max-deceleration"
                  >
                    <input
                      id="max-deceleration"
                      type="number"
                      bind:value={settings.maxDeceleration}
                      min="0"
                      step="1"
                      on:change={handleMaxDecelerationInput}
                      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </SettingsItem>
                </div>

                <SettingsItem
                  label="Friction Coefficient"
                  description="Higher values = more resistance"
                  {searchQuery}
                  forId="friction-coefficient"
                >
                  <input
                    id="friction-coefficient"
                    type="number"
                    bind:value={settings.kFriction}
                    min="0"
                    step="0.1"
                    on:change={handleFrictionInput}
                    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </SettingsItem>
              </div>
            {/if}

            <!-- Interface Section -->
            {#if activeTab === "interface" || searchQuery}
              <div class="section-container mb-8">
                {#if searchQuery}
                  <h4
                    class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
                  >
                    Interface
                  </h4>
                {/if}

                <SettingsItem
                  label="Theme"
                  description="Interface color scheme"
                  {searchQuery}
                  forId="theme-select"
                >
                  <select
                    id="theme-select"
                    bind:value={settings.theme}
                    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="auto">Auto (System Preference)</option>
                    <option value="light">Light Mode</option>
                    <option value="dark">Dark Mode</option>
                    {#each $themesStore as theme}
                      <option value={theme.name}>{theme.name}</option>
                    {/each}
                  </select>
                  <div
                    class="mt-1 text-xs text-neutral-500 dark:text-neutral-400"
                  >
                    {#if settings.theme === "auto"}
                      Current: {window.matchMedia &&
                      window.matchMedia("(prefers-color-scheme: dark)").matches
                        ? "Dark"
                        : "Light"} (System)
                    {:else}
                      Current: {settings.theme}
                    {/if}
                  </div>
                </SettingsItem>

                <SettingsItem
                  label="Program Font Size"
                  description="Adjust the scale of the user interface"
                  {searchQuery}
                  forId="program-font-size"
                >
                  <div class="flex items-center gap-2">
                    <input
                      id="program-font-size"
                      type="range"
                      min="75"
                      max="150"
                      step="5"
                      bind:value={settings.programFontSize}
                      class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <span
                      class="text-sm font-medium text-neutral-700 dark:text-neutral-300 min-w-[3rem] text-right"
                    >
                      {settings.programFontSize || 100}%
                    </span>
                  </div>
                </SettingsItem>

                <SettingsItem
                  label="Field Map"
                  description="Select the competition field"
                  {searchQuery}
                  forId="field-map-select"
                >
                  <div class="flex gap-2">
                    <select
                      id="field-map-select"
                      bind:value={settings.fieldMap}
                      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {#each availableMaps as field}
                        <option value={field.value}>{field.label}</option>
                      {/each}
                    </select>
                    {#if settings.customMaps?.some((m) => m.id === settings.fieldMap)}
                      <button
                        title="Delete Custom Map"
                        class="p-2 text-neutral-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                        on:click={() =>
                          handleDeleteCustomMap(settings.fieldMap)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    {/if}
                  </div>
                  {#if settings.customMaps?.some((m) => m.id === settings.fieldMap)}
                    <button
                      class="mt-2 w-full px-3 py-2 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                      on:click={() => handleEditCustomMap(settings.fieldMap)}
                    >
                      Edit Custom Map
                    </button>
                  {/if}
                  <button
                    class="mt-2 w-full px-3 py-2 text-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors border border-neutral-200 dark:border-neutral-700 border-dashed"
                    on:click={handleAddCustomMap}
                  >
                    + Add Custom Field Map
                  </button>
                </SettingsItem>

                <SettingsItem
                  label="Field Orientation"
                  description="Rotate the view of the field"
                  {searchQuery}
                >
                  <div class="grid grid-cols-4 gap-2">
                    {#each [0, 90, 180, 270] as rotation}
                      <button
                        class="px-3 py-2 text-sm rounded-md border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 {settings.fieldRotation ===
                        rotation
                          ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
                          : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'}"
                        on:click={() => {
                          settings.fieldRotation = rotation;
                          settings = { ...settings };
                        }}
                      >
                        {rotation}°
                      </button>
                    {/each}
                  </div>
                </SettingsItem>

                <SettingsItem
                  label="Smart Object Snapping"
                  description="Snap points to align with other waypoints (Hold Alt/Option to invert)"
                  {searchQuery}
                  layout="row"
                >
                  <input
                    type="checkbox"
                    bind:checked={settings.smartSnapping}
                    class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                </SettingsItem>

                <SettingsItem
                  label="Velocity Heatmap"
                  description="Visualize robot speed along path (Green to Red)"
                  {searchQuery}
                  layout="row"
                >
                  <input
                    type="checkbox"
                    bind:checked={settings.showVelocityHeatmap}
                    class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-emerald-500 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  />
                </SettingsItem>

                <SettingsItem
                  label="Follow Robot"
                  description="Automatically pan to keep robot centered during playback"
                  {searchQuery}
                  layout="row"
                  forId="follow-robot"
                >
                  <input
                    id="follow-robot"
                    type="checkbox"
                    bind:checked={settings.followRobot}
                    on:change={() =>
                      followRobotStore.set(!!settings.followRobot)}
                    class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                </SettingsItem>
              </div>
            {/if}

            <!-- Code Export Section -->
            {#if activeTab === "code-export" || searchQuery}
              <div class="section-container mb-8">
                {#if searchQuery}
                  <h4
                    class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
                  >
                    Code Export
                  </h4>
                {/if}

                <SettingsItem
                  label="Auto Export Code"
                  description="Automatically export code when project is saved"
                  {searchQuery}
                  layout="row"
                >
                  <input
                    type="checkbox"
                    bind:checked={settings.autoExportCode}
                    class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                </SettingsItem>

                {#if settings.autoExportCode}
                  <div transition:fade>
                    <SettingsItem
                      label="Export Path Mode"
                      description="How the path is stored relative to the project file"
                      {searchQuery}
                      layout="row"
                    >
                      <div
                        class="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg border border-neutral-200 dark:border-neutral-700"
                      >
                        <button
                          class="px-3 py-1 text-xs font-medium rounded-md transition-all {settings.autoExportPathMode ===
                            'relative' || !settings.autoExportPathMode
                            ? 'bg-white dark:bg-neutral-700 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}"
                          on:click={() => handleModeChange("relative")}
                        >
                          Relative
                        </button>
                        <button
                          class="px-3 py-1 text-xs font-medium rounded-md transition-all {settings.autoExportPathMode ===
                          'absolute'
                            ? 'bg-white dark:bg-neutral-700 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}"
                          on:click={() => handleModeChange("absolute")}
                        >
                          Absolute
                        </button>
                      </div>
                    </SettingsItem>

                    <SettingsItem
                      label="Export Path"
                      description="Directory to save exported code"
                      {searchQuery}
                      layout="col"
                    >
                      <div class="flex gap-2">
                        <input
                          type="text"
                          bind:value={settings.autoExportPath}
                          class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                          placeholder="GeneratedCode"
                        />
                        <button
                          on:click={handleBrowse}
                          class="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md text-neutral-700 dark:text-neutral-300 transition-colors"
                          title="Browse Directory"
                        >
                          <!-- Folder Icon -->
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
                              d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                            />
                          </svg>
                        </button>
                      </div>
                      <div
                        class="text-xs text-neutral-500 dark:text-neutral-400 mt-1"
                      >
                        {#if settings.autoExportPathMode === "absolute"}
                          Absolute path to the export directory.
                        {:else}
                          Relative to the project file location. Default:
                          'GeneratedCode'.
                        {/if}
                      </div>
                    </SettingsItem>

                    <SettingsItem
                      label="Export Format"
                      description="Format of the generated code"
                      {searchQuery}
                      layout="col"
                    >
                      <select
                        bind:value={settings.autoExportFormat}
                        class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="java">Java Class</option>
                        <option value="sequential">Sequential Command</option>
                        <option value="points">Points Array</option>
                        <option value="json">JSON Project Data</option>
                      </select>
                    </SettingsItem>

                    {#if settings.autoExportFormat === "java"}
                      <div transition:fade>
                        <SettingsItem
                          label="Generate Full Class"
                          description="Include class definition and imports"
                          {searchQuery}
                          layout="row"
                        >
                          <input
                            type="checkbox"
                            bind:checked={settings.autoExportFullClass}
                            class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                          />
                        </SettingsItem>

                        <SettingsItem
                          label="Telemetry Implementation"
                          description="Select telemetry backend for generated code"
                          {searchQuery}
                          layout="col"
                        >
                          <select
                            bind:value={settings.telemetryImplementation}
                            class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="Panels">Panels (Bylazar)</option>
                            <option value="Standard">Standard (FTC)</option>
                            <option value="Dashboard"
                              >FtcDashboard + Standard</option
                            >
                            <option value="None">None</option>
                          </select>
                        </SettingsItem>
                      </div>
                    {:else if settings.autoExportFormat === "sequential"}
                      <div transition:fade>
                        <SettingsItem
                          label="Target Library"
                          description="Command-based library to target"
                          {searchQuery}
                          layout="col"
                        >
                          <select
                            bind:value={settings.autoExportTargetLibrary}
                            class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="SolversLib">SolversLib</option>
                            <option value="NextFTC">NextFTC</option>
                          </select>
                        </SettingsItem>

                        <SettingsItem
                          label="Embed Pose Data"
                          description="Embed pose data directly in the code (no .pp file)"
                          {searchQuery}
                          layout="row"
                        >
                          <input
                            type="checkbox"
                            bind:checked={settings.autoExportEmbedPoseData}
                            class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                          />
                        </SettingsItem>
                      </div>
                    {/if}

                    {#if settings.autoExportFormat === "java" || settings.autoExportFormat === "sequential"}
                      <div transition:fade>
                        <SettingsItem
                          label="Package Name"
                          description="Java package for the generated class"
                          {searchQuery}
                          layout="col"
                        >
                          <input
                            type="text"
                            bind:value={settings.javaPackageName}
                            class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                            placeholder="org.firstinspires.ftc.teamcode.Commands.AutoCommands"
                          />
                        </SettingsItem>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Advanced Section -->
            {#if activeTab === "advanced" || searchQuery}
              <div class="section-container mb-8">
                {#if searchQuery}
                  <h4
                    class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
                  >
                    Advanced
                  </h4>
                {/if}

                <SettingsItem
                  label="Show Debug Sequence"
                  description="Display internal sequence execution order"
                  {searchQuery}
                  layout="row"
                >
                  <input
                    type="checkbox"
                    bind:checked={settings.showDebugSequence}
                    class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-pink-500 focus:ring-2 focus:ring-pink-500 cursor-pointer"
                  />
                </SettingsItem>

                <SettingsItem
                  label="Robot Onion Layers"
                  description="Show robot body at intervals along the path"
                  {searchQuery}
                  layout="row"
                >
                  <input
                    type="checkbox"
                    bind:checked={settings.showOnionLayers}
                    class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-indigo-500 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  />
                </SettingsItem>

                {#if settings.showOnionLayers}
                  <div
                    class="pl-4 border-l-2 border-neutral-100 dark:border-neutral-800 ml-2 mt-2"
                  >
                    <SettingsItem
                      label="Show Only on Current Path"
                      description="Only show onion layers for the selected path"
                      {searchQuery}
                      layout="row"
                    >
                      <input
                        type="checkbox"
                        bind:checked={settings.onionSkinCurrentPathOnly}
                        class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-indigo-500 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                      />
                    </SettingsItem>

                    <SettingsItem
                      label="Onion Layer Spacing"
                      description="Distance in inches between each robot body trace"
                      {searchQuery}
                    >
                      <div class="flex items-center gap-2">
                        <input
                          type="range"
                          min="2"
                          max="20"
                          step="1"
                          bind:value={settings.onionLayerSpacing}
                          class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <span
                          class="text-sm font-medium text-neutral-700 dark:text-neutral-300 min-w-[3rem] text-right"
                        >
                          {settings.onionLayerSpacing || 6}"
                        </span>
                      </div>
                    </SettingsItem>
                  </div>
                {/if}

                <div class="mt-6 space-y-4">
                  <SettingsItem
                    label="Optimization Iterations"
                    description="Generations for path optimization"
                    {searchQuery}
                    layout="col"
                  >
                    <div class="flex items-center gap-2">
                      <input
                        type="number"
                        min="10"
                        max="3000"
                        step="1"
                        bind:value={settings.optimizationIterations}
                        on:change={handleIterationsInput}
                        class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-purple-700 dark:text-purple-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </SettingsItem>
                  <SettingsItem
                    label="Population Size"
                    description="Candidate paths per generation"
                    {searchQuery}
                    layout="col"
                  >
                    <div class="flex items-center gap-2">
                      <input
                        type="number"
                        min="10"
                        max="200"
                        step="1"
                        bind:value={settings.optimizationPopulationSize}
                        on:change={handlePopulationInput}
                        class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-blue-700 dark:text-blue-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </SettingsItem>
                  <SettingsItem
                    label="Mutation Rate"
                    description="Fraction of control points mutated"
                    {searchQuery}
                    layout="col"
                  >
                    <div class="flex items-center gap-2">
                      <input
                        type="number"
                        min="0.01"
                        max="1"
                        step="0.01"
                        bind:value={settings.optimizationMutationRate}
                        on:change={handleMutationRateInput}
                        class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-green-700 dark:text-green-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </SettingsItem>
                  <SettingsItem
                    label="Mutation Strength"
                    description="Max mutation distance (inches)"
                    {searchQuery}
                    layout="col"
                  >
                    <div class="flex items-center gap-2">
                      <input
                        type="number"
                        min="0.1"
                        max="20"
                        step="0.1"
                        bind:value={settings.optimizationMutationStrength}
                        on:change={handleMutationStrengthInput}
                        class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-orange-700 dark:text-orange-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </SettingsItem>
                </div>
              </div>
            {/if}

            <!-- About Section -->
            {#if activeTab === "about" || searchQuery}
              <div class="section-container mb-8">
                {#if searchQuery}
                  <h4
                    class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
                  >
                    About
                  </h4>
                {/if}

                <SettingsItem
                  label="Pedro Pathing Plus Visualizer"
                  description={`Version ${appVersion}`}
                  {searchQuery}
                  section
                >
                  <div class="flex flex-col items-center py-6 text-center">
                    <img
                      src="/icon.png"
                      alt="App Icon"
                      class="w-20 h-20 mb-4 object-contain"
                    />
                    <h3
                      class="text-xl font-bold text-neutral-900 dark:text-white"
                    >
                      Pedro Pathing Plus Visualizer
                    </h3>
                    <p
                      class="text-sm text-neutral-500 dark:text-neutral-400 mb-6"
                    >
                      Version {appVersion}
                    </p>

                    <div class="text-sm space-y-1 mb-6">
                      <p>Copyright © 2026 Matthew Allen</p>
                      <p>Licensed under Apache License, Version 2.0</p>
                    </div>

                    <div class="flex gap-4 text-sm font-medium mb-8">
                      <a
                        href="https://mallen220.github.io/Portfolio/"
                        target="_blank"
                        class="text-blue-600 dark:text-blue-400 hover:underline"
                        >Portfolio</a
                      >
                      <span class="text-neutral-300 dark:text-neutral-600"
                        >•</span
                      >
                      <a
                        href="https://www.linkedin.com/in/allenmc220/"
                        target="_blank"
                        class="text-blue-600 dark:text-blue-400 hover:underline"
                        >LinkedIn</a
                      >
                      <span class="text-neutral-300 dark:text-neutral-600"
                        >•</span
                      >
                      <a
                        href="https://github.com/Mallen220/PedroPathingPlusVisualizer"
                        target="_blank"
                        class="text-blue-600 dark:text-blue-400 hover:underline"
                        >GitHub</a
                      >
                    </div>

                    <div
                      class="w-full max-w-sm bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 text-left text-sm space-y-4"
                    >
                      <div>
                        <h4 class="font-semibold mb-2">Acknowledgments</h4>
                        <ul
                          class="list-disc pl-4 space-y-1 text-neutral-600 dark:text-neutral-400 text-xs"
                        >
                          <li>#16166 Watt's Up - Inspiration</li>
                          <li>Pedro Pathing Developers</li>
                          <li>FIRST Community</li>
                        </ul>
                      </div>
                      <div>
                        <h4 class="font-semibold mb-2">Project Links</h4>
                        <div class="flex gap-3 text-xs">
                          <a
                            href="https://github.com/Mallen220/PedroPathingPlusVisualizer/issues"
                            target="_blank"
                            class="text-blue-600 dark:text-blue-400 hover:underline"
                            >Issues</a
                          >
                          <span class="text-neutral-300 dark:text-neutral-600"
                            >•</span
                          >
                          <a
                            href="https://github.com/Mallen220/PedroPathingPlusVisualizer/releases"
                            target="_blank"
                            class="text-blue-600 dark:text-blue-400 hover:underline"
                            >Releases</a
                          >
                        </div>
                      </div>
                    </div>
                  </div>
                </SettingsItem>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<CustomFieldWizard
  bind:isOpen={isCustomFieldWizardOpen}
  currentConfig={editingCustomConfig}
  on:save={handleCustomFieldSave}
  on:close={() => (isCustomFieldWizardOpen = false)}
/>

<style>
  .potato-tooltip {
    position: relative;
  }

  .potato-tooltip::after {
    content: "🥔 P O T A T O   P O W E R 🥔";
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%) translateY(-10px);
    background: linear-gradient(to right, #a16207, #ca8a04, #a16207);
    color: white;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: bold;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.3s,
      transform 0.3s;
    z-index: 1000;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    border: 2px solid #92400e;
  }

  .potato-tooltip:hover::after {
    opacity: 1;
    transform: translateX(-50%) translateY(-5px);
  }

  /* Search mode: Hide sections that don't have visible settings */
  /* Note: :has() is supported in Electron/Chromium */
  /* We use :global because SettingsItem is a child component, but the class is visible-setting */
  .is-searching .section-container:not(:has(.visible-setting)) {
    display: none;
  }
</style>
