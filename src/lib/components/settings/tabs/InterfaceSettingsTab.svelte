<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import {
    DEFAULT_SETTINGS,
    AVAILABLE_FIELD_MAPS,
  } from "../../../../config/defaults";
  import type { Settings, CustomFieldConfig } from "../../../../types/index";
  import { themesStore } from "../../../pluginsStore";
  import { followRobotStore } from "../../../projectStore";
  import CustomFieldWizard from "../../settings/CustomFieldWizard.svelte";

  export let settings: Settings;
  export let searchQuery: string;

  $: availableMaps = [
    ...AVAILABLE_FIELD_MAPS,
    ...(settings.customMaps || []).map((m) => ({
      value: m.id,
      label: m.name || "Custom Field",
    })),
  ];

  let isCustomFieldWizardOpen = false;
  let editingCustomConfig: CustomFieldConfig | undefined = undefined;

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
</script>

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
    isModified={settings.theme !== DEFAULT_SETTINGS.theme}
    onReset={() => {
      settings.theme = DEFAULT_SETTINGS.theme;
      settings = { ...settings };
    }}
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
    <div class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
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
    isModified={settings.programFontSize !== DEFAULT_SETTINGS.programFontSize}
    onReset={() => {
      settings.programFontSize = DEFAULT_SETTINGS.programFontSize;
      settings = { ...settings };
    }}
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
    isModified={settings.fieldMap !== DEFAULT_SETTINGS.fieldMap}
    onReset={() => {
      settings.fieldMap = DEFAULT_SETTINGS.fieldMap;
      settings = { ...settings };
    }}
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
          on:click={() => handleDeleteCustomMap(settings.fieldMap)}
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
    isModified={settings.fieldRotation !== DEFAULT_SETTINGS.fieldRotation}
    onReset={() => {
      settings.fieldRotation = DEFAULT_SETTINGS.fieldRotation;
      settings = { ...settings };
    }}
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
    label="Coordinate System"
    isModified={settings.coordinateSystem !== DEFAULT_SETTINGS.coordinateSystem}
    onReset={() => {
      settings.coordinateSystem = DEFAULT_SETTINGS.coordinateSystem;
      settings = { ...settings };
    }}
    description="Choose between standard Pedro Pathing (0-144) or FTC Center (±72)"
    {searchQuery}
    forId="coordinate-system-select"
  >
    <select
      id="coordinate-system-select"
      bind:value={settings.coordinateSystem}
      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="Pedro">Pedro Pathing (0-144)</option>
      <option value="FTC">FTC Center (±72)</option>
    </select>
  </SettingsItem>

  <SettingsItem
    label="Visualizer Units"
    isModified={settings.visualizerUnits !== DEFAULT_SETTINGS.visualizerUnits}
    onReset={() => {
      settings.visualizerUnits = DEFAULT_SETTINGS.visualizerUnits;
      settings = { ...settings };
    }}
    description="Choose between Imperial (Inches) and Metric (cm) for the user interface"
    {searchQuery}
    forId="visualizer-units-select"
  >
    <select
      id="visualizer-units-select"
      bind:value={settings.visualizerUnits}
      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="imperial">Imperial (Inches)</option>
      <option value="metric">Metric (cm)</option>
    </select>
  </SettingsItem>

  <SettingsItem
    label="Smart Object Snapping"
    isModified={settings.smartSnapping !== DEFAULT_SETTINGS.smartSnapping}
    onReset={() => {
      settings.smartSnapping = DEFAULT_SETTINGS.smartSnapping;
      settings = { ...settings };
    }}
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
    isModified={settings.showVelocityHeatmap !==
      DEFAULT_SETTINGS.showVelocityHeatmap}
    onReset={() => {
      settings.showVelocityHeatmap = DEFAULT_SETTINGS.showVelocityHeatmap;
      settings = { ...settings };
    }}
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
    isModified={settings.followRobot !== DEFAULT_SETTINGS.followRobot}
    onReset={() => {
      settings.followRobot = DEFAULT_SETTINGS.followRobot;
      settings = { ...settings };
    }}
    description="Automatically pan to keep robot centered during playback"
    {searchQuery}
    layout="row"
    forId="follow-robot"
  >
    <input
      id="follow-robot"
      type="checkbox"
      bind:checked={settings.followRobot}
      on:change={() => followRobotStore.set(!!settings.followRobot)}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
    />
  </SettingsItem>
</div>
<CustomFieldWizard
  bind:isOpen={isCustomFieldWizardOpen}
  currentConfig={editingCustomConfig}
  on:save={handleCustomFieldSave}
  on:close={() => (isCustomFieldWizardOpen = false)}
/>
