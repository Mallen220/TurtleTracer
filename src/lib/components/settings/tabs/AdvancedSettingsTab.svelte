<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import { DEFAULT_SETTINGS } from "../../../../config/defaults";
  import type { Settings } from "../../../../types/index";

  interface Props {
    settings: Settings;
    searchQuery: string;
  }

  let { settings = $bindable(), searchQuery }: Props = $props();

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
  function handleToleranceInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "drawToolTolerance",
      1,
      60,
      true,
    );
  }
  function handleTensionInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "drawToolTension",
      0,
      1,
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

  <div class="mt-6 space-y-4">
    <SettingsItem
      label="Draw Tool Tolerance"
      isModified={settings.drawToolTolerance !== DEFAULT_SETTINGS.drawToolTolerance}
      onReset={() => {
        settings.drawToolTolerance = DEFAULT_SETTINGS.drawToolTolerance;
        settings = { ...settings };
      }}
      description="Path simplification aggressiveness"
      {searchQuery}
      layout="col"
    >
      <div class="flex items-center gap-2">
        <input
          type="number"
          min="1"
          max="60"
          step="1"
          bind:value={settings.drawToolTolerance}
          onchange={handleToleranceInput}
          class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-teal-700 dark:text-teal-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-teal-500"
        />
      </div>
    </SettingsItem>

    <SettingsItem
      label="Draw Tool Tension"
      isModified={settings.drawToolTension !== DEFAULT_SETTINGS.drawToolTension}
      onReset={() => {
        settings.drawToolTension = DEFAULT_SETTINGS.drawToolTension;
        settings = { ...settings };
      }}
      description="Curve tightness for drawn paths"
      {searchQuery}
      layout="col"
    >
      <div class="flex items-center gap-2">
        <input
          type="number"
          min="0"
          max="1"
          step="0.01"
          bind:value={settings.drawToolTension}
          onchange={handleTensionInput}
          class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-cyan-700 dark:text-cyan-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-cyan-500"
        />
      </div>
    </SettingsItem>

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
          onchange={handleIterationsInput}
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
          onchange={handlePopulationInput}
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
          onchange={handleMutationRateInput}
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
          onchange={handleMutationStrengthInput}
          class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-orange-700 dark:text-orange-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-orange-500"
        />
      </div>
    </SettingsItem>
  </div>
</div>
