<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import { DEFAULT_SETTINGS } from "../../../../config/defaults";
  import type { Settings } from "../../../../types/index";

  export let settings: Settings;
  export let searchQuery: string;

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

  function handleIterationsInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "optimizationIterations",
      10,
      3000,
      true,
    );
  }
  function handlePopulationInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "optimizationPopulationSize",
      10,
      200,
      true,
    );
  }
  function handleMutationRateInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "optimizationMutationRate",
      0.01,
      1,
      true,
    );
  }
  function handleMutationStrengthInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "optimizationMutationStrength",
      0.1,
      20,
      true,
    );
  }
</script>

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
    isModified={settings.showDebugSequence !==
      DEFAULT_SETTINGS.showDebugSequence}
    onReset={() => {
      settings.showDebugSequence = DEFAULT_SETTINGS.showDebugSequence;
      settings = { ...settings };
    }}
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
    isModified={settings.showOnionLayers !== DEFAULT_SETTINGS.showOnionLayers}
    onReset={() => {
      settings.showOnionLayers = DEFAULT_SETTINGS.showOnionLayers;
      settings = { ...settings };
    }}
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
        isModified={settings.onionSkinCurrentPathOnly !==
          DEFAULT_SETTINGS.onionSkinCurrentPathOnly}
        onReset={() => {
          settings.onionSkinCurrentPathOnly =
            DEFAULT_SETTINGS.onionSkinCurrentPathOnly;
          settings = { ...settings };
        }}
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
        isModified={settings.onionLayerSpacing !==
          DEFAULT_SETTINGS.onionLayerSpacing}
        onReset={() => {
          settings.onionLayerSpacing = DEFAULT_SETTINGS.onionLayerSpacing;
          settings = { ...settings };
        }}
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
      isModified={settings.optimizationIterations !==
        DEFAULT_SETTINGS.optimizationIterations}
      onReset={() => {
        settings.optimizationIterations =
          DEFAULT_SETTINGS.optimizationIterations;
        settings = { ...settings };
      }}
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
      isModified={settings.optimizationPopulationSize !==
        DEFAULT_SETTINGS.optimizationPopulationSize}
      onReset={() => {
        settings.optimizationPopulationSize =
          DEFAULT_SETTINGS.optimizationPopulationSize;
        settings = { ...settings };
      }}
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
      isModified={settings.optimizationMutationRate !==
        DEFAULT_SETTINGS.optimizationMutationRate}
      onReset={() => {
        settings.optimizationMutationRate =
          DEFAULT_SETTINGS.optimizationMutationRate;
        settings = { ...settings };
      }}
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
      isModified={settings.optimizationMutationStrength !==
        DEFAULT_SETTINGS.optimizationMutationStrength}
      onReset={() => {
        settings.optimizationMutationStrength =
          DEFAULT_SETTINGS.optimizationMutationStrength;
        settings = { ...settings };
      }}
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
