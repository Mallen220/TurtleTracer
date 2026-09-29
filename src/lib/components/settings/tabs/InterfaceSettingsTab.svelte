<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { settingsEditor } from "../settingsEditor";
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import {
    DEFAULT_SETTINGS,
    AVAILABLE_FIELD_MAPS,
  } from "../../../../config/defaults";
  import type { Settings, CustomFieldConfig } from "../../../../types/index";
  import { themesStore } from "../../../pluginsStore";
  import { followRobotStore, shapesStore } from "../../../projectStore";
  import { fieldZoom, fieldPan } from "../../../../stores";
  import * as ICONS from "../../icons";
  import CustomFieldWizard from "../../settings/CustomFieldWizard.svelte";

  interface Props {
    settings: Settings;
    searchQuery: string;
  }

  let { settings = $bindable(), searchQuery }: Props = $props();

  const { set, resettable } = settingsEditor(
    () => settings,
    (next) => (settings = next),
  );

  let availableMaps = $derived([
    ...AVAILABLE_FIELD_MAPS,
    ...(settings.customMaps || []).map((m) => ({
      value: m.id,
      label: m.name || "Custom Field",
    })),
  ]);

  /** Changes the field size, stretching obstacles to match (except on custom maps). */
  function resizeField(width: number, height: number) {
    const oldWidth = settings.fieldWidth ?? 144;
    const oldHeight = settings.fieldHeight ?? 144;
    const isCustomMap = settings.customMaps?.some(
      (m) => m.id === settings.fieldMap,
    );
    if (!isCustomMap && oldWidth !== 0 && oldHeight !== 0) {
      const scaleX = width / oldWidth;
      const scaleY = height / oldHeight;
      shapesStore.update((shapes) =>
        shapes.map((shape) => ({
          ...shape,
          vertices: shape.vertices.map((v) => ({
            ...v,
            x: v.x * scaleX,
            y: v.y * scaleY,
          })),
        })),
      );
    }
    settings = { ...settings, fieldWidth: width, fieldHeight: height };
  }

  let isCustomFieldWizardOpen = $state(false);
  let editingCustomConfig: CustomFieldConfig | undefined = $state(undefined);

  function handleAddCustomMap() {
    editingCustomConfig = undefined;
    isCustomFieldWizardOpen = true;
  }

  function handleEditCustomMap(id: string) {
    editingCustomConfig = settings.customMaps?.find((m) => m.id === id);
    isCustomFieldWizardOpen = true;
  }

  function handleDeleteCustomMap(id: string) {
    if (!confirm("Are you sure you want to delete this custom field map?")) {
      return;
    }
    settings = {
      ...settings,
      customMaps: settings.customMaps?.filter((m) => m.id !== id) ?? [],
      fieldMap:
        settings.fieldMap === id ? "centerstage.webp" : settings.fieldMap,
    };
  }

  function resetFieldViewToDefault() {
    fieldZoom.set(1);
    fieldPan.set({ x: 0, y: 0 });
  }

  function handleCustomFieldSave(newConfig: CustomFieldConfig) {
    const maps = settings.customMaps ?? [];
    const index = maps.findIndex((m) => m.id === newConfig.id);
    const customMaps =
      index === -1 ? [...maps, newConfig] : maps.with(index, newConfig);
    settings = { ...settings, customMaps, fieldMap: newConfig.id };
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
    {...resettable("theme")}
    description="Interface color scheme"
    {searchQuery}
    forId="theme-select"
  >
    <select
      id="theme-select"
      value={settings.theme}
      onchange={(e) => set("theme", e.currentTarget.value as any)}
      class="w-full px-3 py-2  border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        Current: {globalThis.matchMedia &&
        globalThis.matchMedia("(prefers-color-scheme: dark)").matches
          ? "Dark"
          : "Light"} (System)
      {:else}
        Current: {settings.theme}
      {/if}
    </div>
  </SettingsItem>

  <SettingsItem
    label="Program Font Size"
    {...resettable("programFontSize")}
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
        value={settings.programFontSize}
        oninput={(e) =>
          set("programFontSize", Number.parseInt(e.currentTarget.value))}
        class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700  appearance-none cursor-pointer accent-blue-500"
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
    {...resettable("fieldMap")}
    description="Select the competition field"
    {searchQuery}
    forId="field-map-select"
  >
    <div class="flex gap-2">
      <select
        id="field-map-select"
        value={settings.fieldMap}
        onchange={(e) => set("fieldMap", e.currentTarget.value as any)}
        class="w-full px-3 py-2  border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {#each availableMaps as field}
          <option value={field.value}>{field.label}</option>
        {/each}
      </select>
      {#if settings.customMaps?.some((m) => m.id === settings.fieldMap)}
        <button
          title="Delete Custom Map"
          aria-label="Delete Custom Map"
          class="p-2 text-neutral-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
          onclick={() => handleDeleteCustomMap(settings.fieldMap)}
        >
          <ICONS.TrashIcon className="size-5" />
        </button>
      {/if}
    </div>
    {#if settings.customMaps?.some((m) => m.id === settings.fieldMap)}
      <button
        class="mt-2 w-full px-3 py-2 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
        onclick={() => handleEditCustomMap(settings.fieldMap)}
      >
        Edit Custom Map
      </button>
    {/if}
    <button
      class="mt-2 w-full px-3 py-2 text-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors border border-neutral-200 dark:border-neutral-700 border-dashed"
      onclick={handleAddCustomMap}
    >
      + Add Custom Field Map
    </button>
  </SettingsItem>

  <SettingsItem
    label="Field Dimensions (inches)"
    isModified={settings.fieldWidth !== DEFAULT_SETTINGS.fieldWidth ||
      settings.fieldHeight !== DEFAULT_SETTINGS.fieldHeight}
    onReset={() =>
      resizeField(
        DEFAULT_SETTINGS.fieldWidth ?? 144,
        DEFAULT_SETTINGS.fieldHeight ?? 144,
      )}
    description="Set the physical dimensions of the field"
    {searchQuery}
    forId="field-dimensions"
  >
    <div class="flex items-center gap-2">
      <div class="flex flex-col flex-1">
        <label for="field-width" class="text-xs text-neutral-500 mb-1"
          >Width (X)</label
        >
        <input
          id="field-width"
          type="number"
          min="12"
          max="500"
          value={settings.fieldWidth ?? 144}
          oninput={(e) => {
            const val = Number.parseFloat(e.currentTarget.value);
            if (!Number.isNaN(val))
              resizeField(val, settings.fieldHeight ?? 144);
          }}
          class="w-full px-3 py-2  border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <span class="text-neutral-500 mt-4">×</span>
      <div class="flex flex-col flex-1">
        <label for="field-height" class="text-xs text-neutral-500 mb-1"
          >Height (Y)</label
        >
        <input
          id="field-height"
          type="number"
          min="12"
          max="500"
          value={settings.fieldHeight ?? 144}
          oninput={(e) => {
            const val = Number.parseFloat(e.currentTarget.value);
            if (!Number.isNaN(val))
              resizeField(settings.fieldWidth ?? 144, val);
          }}
          class="w-full px-3 py-2  border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  </SettingsItem>

  <SettingsItem
    label="Field Orientation"
    {...resettable("fieldRotation")}
    description="Rotate the view of the field"
    {searchQuery}
  >
    <div class="grid grid-cols-4 gap-2">
      {#each [0, 90, 180, 270] as rotation}
        <button
          class="px-3 py-2 text-sm  border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 {settings.fieldRotation ===
          rotation
            ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
            : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'}"
          onclick={() => set("fieldRotation", rotation)}
        >
          {rotation}°
        </button>
      {/each}
    </div>
  </SettingsItem>

  <SettingsItem
    label="Coordinate System"
    {...resettable("coordinateSystem")}
    description="Choose between standard Pedro Pathing (0-144) or FTC Center (±72)"
    {searchQuery}
    forId="coordinate-system-select"
  >
    <select
      id="coordinate-system-select"
      value={settings.coordinateSystem}
      onchange={(e) => set("coordinateSystem", e.currentTarget.value as any)}
      class="w-full px-3 py-2  border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="Pedro">Pedro Pathing (0-144)</option>
      <option value="FTC">FTC Center (±72)</option>
    </select>
  </SettingsItem>

  <SettingsItem
    label="Visualizer Units"
    {...resettable("visualizerUnits")}
    description="Choose between Imperial (Inches) and Metric (cm) for the user interface"
    {searchQuery}
    forId="visualizer-units-select"
  >
    <select
      id="visualizer-units-select"
      value={settings.visualizerUnits}
      onchange={(e) => set("visualizerUnits", e.currentTarget.value as any)}
      class="w-full px-3 py-2  border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="imperial">Imperial (Inches)</option>
      <option value="metric">Metric (cm)</option>
    </select>
  </SettingsItem>

  <SettingsItem
    label="Robot Onion Layers"
    {...resettable("showOnionLayers")}
    description="Show robot body at intervals along the path"
    {searchQuery}
    layout="row"
  >
    <input
      type="checkbox"
      checked={settings.showOnionLayers}
      onchange={(e) => set("showOnionLayers", e.currentTarget.checked)}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-indigo-500 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
    />
  </SettingsItem>

  {#if settings.showOnionLayers}
    <div
      class="pl-4 border-l-2 border-neutral-100 dark:border-neutral-800 ml-2 mt-2 mb-4"
    >
      <SettingsItem
        label="Show Only on Current Path"
        {...resettable("onionSkinCurrentPathOnly")}
        description="Only show onion layers for the selected path"
        {searchQuery}
        layout="row"
      >
        <input
          type="checkbox"
          checked={settings.onionSkinCurrentPathOnly}
          onchange={(e) =>
            set("onionSkinCurrentPathOnly", e.currentTarget.checked)}
          class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-indigo-500 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
        />
      </SettingsItem>

      <SettingsItem
        label="Onion Layer Spacing"
        {...resettable("onionLayerSpacing")}
        description="Distance in inches between each robot body trace"
        {searchQuery}
      >
        <div class="flex items-center gap-2">
          <input
            type="range"
            min="2"
            max="20"
            step="1"
            value={settings.onionLayerSpacing}
            oninput={(e) =>
              set(
                "onionLayerSpacing",
                Number.parseFloat(e.currentTarget.value) || 0,
              )}
            class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700  appearance-none cursor-pointer accent-indigo-500"
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

  <SettingsItem
    label="Smart Object Snapping"
    {...resettable("smartSnapping")}
    description="Snap points to align with other waypoints (Hold Alt/Option to invert)"
    {searchQuery}
    layout="row"
  >
    <input
      type="checkbox"
      checked={settings.smartSnapping}
      onchange={(e) => set("smartSnapping", e.currentTarget.checked)}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
    />
  </SettingsItem>

  <SettingsItem
    label="Velocity Heatmap"
    {...resettable("showVelocityHeatmap")}
    description="Visualize robot speed along path (Green to Red)"
    {searchQuery}
    layout="row"
  >
    <input
      type="checkbox"
      checked={settings.showVelocityHeatmap}
      onchange={(e) => set("showVelocityHeatmap", e.currentTarget.checked)}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-emerald-500 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
    />
  </SettingsItem>

  <SettingsItem
    label="Velocity Tooltips"
    {...resettable("showVelocityTooltip")}
    description="Show velocity and elapsed time on hover"
    {searchQuery}
    layout="row"
  >
    <input
      type="checkbox"
      checked={settings.showVelocityTooltip}
      onchange={(e) => set("showVelocityTooltip", e.currentTarget.checked)}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-emerald-500 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
    />
  </SettingsItem>

  <SettingsItem
    label="Lock Field View"
    isModified={settings.lockFieldView !== DEFAULT_SETTINGS.lockFieldView}
    onReset={() => {
      set("lockFieldView", DEFAULT_SETTINGS.lockFieldView);
      resetFieldViewToDefault();
    }}
    description="Lock the field view to prevent panning and zooming"
    {searchQuery}
    layout="row"
    forId="lock-field-view"
  >
    <input
      type="checkbox"
      id="lock-field-view"
      checked={settings.lockFieldView}
      onchange={(e) => {
        set("lockFieldView", e.currentTarget.checked);
        resetFieldViewToDefault();
      }}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-emerald-500 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
    />
  </SettingsItem>

  <SettingsItem
    label="Follow Robot"
    {...resettable("followRobot")}
    description="Automatically pan to keep robot centered during playback"
    {searchQuery}
    layout="row"
    forId="follow-robot"
  >
    <input
      id="follow-robot"
      type="checkbox"
      checked={settings.followRobot}
      onchange={(e) => {
        set("followRobot", e.currentTarget.checked);
        followRobotStore.set(e.currentTarget.checked);
      }}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
    />
  </SettingsItem>
</div>
<CustomFieldWizard
  bind:isOpen={isCustomFieldWizardOpen}
  currentConfig={editingCustomConfig}
  onsave={handleCustomFieldSave}
  onclose={() => (isCustomFieldWizardOpen = false)}
/>
