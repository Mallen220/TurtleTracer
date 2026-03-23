<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import { DEFAULT_SETTINGS } from "../../../../config/defaults";
  import type { Settings } from "../../../../types/index";
  import {
    showPluginManager,
    showShortcuts,
    startTutorial,
    notification,
  } from "../../../../stores";
  import {
    saveSettings,
    mergeSettings,
  } from "../../../../utils/settingsPersistence";

  export let settings: Settings;
  export let searchQuery: string;
  export let isOpen: boolean;

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
            notification.set({
              message: "Update available — opening installer...",
              type: "info",
              timeout: 4000,
            });
          } else {
            if (result.reason === "store") {
              notification.set({
                message: "Updates are managed by the Microsoft Store.",
                type: "info",
              });
            } else {
              notification.set({
                message: "You are on the newest version.",
                type: "success",
              });
            }
          }
        } else {
          notification.set({
            message:
              "Failed to check for updates: " +
              (result.message || "Unknown error"),
            type: "error",
          });
        }
      } catch (e) {
        notification.set({
          message: "Failed to check for updates: " + (e as Error).message,
          type: "error",
        });
      } finally {
        isCheckingForUpdates = false;
      }
    } else {
      notification.set({
        message: "Update check not supported in this environment.",
        type: "warning",
      });
    }
  }

  async function handleExport() {
    try {
      const dataStr = JSON.stringify(settings, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", url);
      downloadAnchorNode.setAttribute(
        "download",
        "turtle-tracer-settings.json",
      );
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      notification.set({
        message: "Settings exported",
        type: "success",
        timeout: 3000,
      });
      downloadAnchorNode.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      notification.set({
        message: "Failed to export settings: " + (e as Error).message,
        type: "error",
      });
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
          const rawSettings = json.settings || json;
          const merged = mergeSettings(rawSettings);
          settings = merged;
          await saveSettings(settings);
          notification.set({
            message: "Settings imported",
            type: "success",
            timeout: 3000,
          });
        }
      } catch (err) {
        notification.set({
          message: "Error importing settings: " + (err as Error).message,
          type: "error",
        });
      }
      target.value = "";
    };
    reader.readAsText(file);
  }
</script>

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
    isModified={settings.autosaveMode !== DEFAULT_SETTINGS.autosaveMode}
    onReset={() => {
      settings.autosaveMode = DEFAULT_SETTINGS.autosaveMode;
      settings = { ...settings };
    }}
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
        isModified={settings.autosaveInterval !==
          DEFAULT_SETTINGS.autosaveInterval}
        onReset={() => {
          settings.autosaveInterval = DEFAULT_SETTINGS.autosaveInterval;
          settings = { ...settings };
        }}
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
    label="Show Telemetry Tab"
    description="Toggle visibility of the telemetry control tab"
    {searchQuery}
    layout="row"
  >
    <input
      type="checkbox"
      bind:checked={settings.showTelemetryTab}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
    />
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
    isModified={settings.gitIntegration !== DEFAULT_SETTINGS.gitIntegration}
    onReset={() => {
      settings.gitIntegration = DEFAULT_SETTINGS.gitIntegration;
      settings = { ...settings };
    }}
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
          document.getElementById("settings-import-input")?.click()}
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
