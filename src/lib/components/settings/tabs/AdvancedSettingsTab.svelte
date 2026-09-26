<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { settingsEditor } from "../settingsEditor";
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import type { Settings } from "../../../../types/index";

  interface Props {
    settings: Settings;
    searchQuery: string;
  }

  let { settings = $bindable(), searchQuery }: Props = $props();

  const { set, setNumber, resettable } = settingsEditor(
    () => settings,
    (next) => (settings = next),
  );
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
    {...resettable("showDebugSequence")}
    description="Display internal sequence execution order"
    {searchQuery}
    layout="row"
  >
    <input
      type="checkbox"
      checked={settings.showDebugSequence}
      onchange={(e) => set("showDebugSequence", e.currentTarget.checked)}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-pink-500 focus:ring-2 focus:ring-pink-500 cursor-pointer"
    />
  </SettingsItem>

  <div class="mt-6 space-y-4">
    <SettingsItem
      label="Draw Tool Tolerance"
      {...resettable("drawToolTolerance")}
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
          value={settings.drawToolTolerance}
          oninput={(e) =>
            set(
              "drawToolTolerance",
              Number.parseFloat(e.currentTarget.value) || 0,
            )}
          onchange={(e) =>
            setNumber("drawToolTolerance", e.currentTarget.value, 1, 60)}
          class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-teal-700 dark:text-teal-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-teal-500"
        />
      </div>
    </SettingsItem>

    <SettingsItem
      label="Draw Tool Tension"
      {...resettable("drawToolTension")}
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
          value={settings.drawToolTension}
          oninput={(e) =>
            set(
              "drawToolTension",
              Number.parseFloat(e.currentTarget.value) || 0,
            )}
          onchange={(e) =>
            setNumber("drawToolTension", e.currentTarget.value, 0, 1)}
          class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-cyan-700 dark:text-cyan-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-cyan-500"
        />
      </div>
    </SettingsItem>

    <SettingsItem
      label="Optimization Iterations"
      {...resettable("optimizationIterations")}
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
          value={settings.optimizationIterations}
          oninput={(e) =>
            set(
              "optimizationIterations",
              Number.parseFloat(e.currentTarget.value) || 0,
            )}
          onchange={(e) =>
            setNumber(
              "optimizationIterations",
              e.currentTarget.value,
              10,
              3000,
            )}
          class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-purple-700 dark:text-purple-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-purple-500"
        />
      </div>
    </SettingsItem>
    <SettingsItem
      label="Population Size"
      {...resettable("optimizationPopulationSize")}
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
          value={settings.optimizationPopulationSize}
          oninput={(e) =>
            set(
              "optimizationPopulationSize",
              Number.parseFloat(e.currentTarget.value) || 0,
            )}
          onchange={(e) =>
            setNumber(
              "optimizationPopulationSize",
              e.currentTarget.value,
              10,
              200,
            )}
          class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-blue-700 dark:text-blue-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </SettingsItem>
    <SettingsItem
      label="Mutation Rate"
      {...resettable("optimizationMutationRate")}
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
          value={settings.optimizationMutationRate}
          oninput={(e) =>
            set(
              "optimizationMutationRate",
              Number.parseFloat(e.currentTarget.value) || 0,
            )}
          onchange={(e) =>
            setNumber(
              "optimizationMutationRate",
              e.currentTarget.value,
              0.01,
              1,
            )}
          class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-green-700 dark:text-green-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-green-500"
        />
      </div>
    </SettingsItem>
    <SettingsItem
      label="Mutation Strength"
      {...resettable("optimizationMutationStrength")}
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
          value={settings.optimizationMutationStrength}
          oninput={(e) =>
            set(
              "optimizationMutationStrength",
              Number.parseFloat(e.currentTarget.value) || 0,
            )}
          onchange={(e) =>
            setNumber(
              "optimizationMutationStrength",
              e.currentTarget.value,
              0.1,
              20,
            )}
          class="w-32 px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-600 text-orange-700 dark:text-orange-300 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-orange-500"
        />
      </div>
    </SettingsItem>
  </div>
</div>
