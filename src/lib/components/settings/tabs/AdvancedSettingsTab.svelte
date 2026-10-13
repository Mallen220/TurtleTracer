<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { settingsEditor } from "../settingsEditor";
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import type { Settings } from "../../../../types/index";
  import { ui } from "../../../ui";

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
    <h4 class="{ui.heading} mb-4 border-b pb-1">Advanced</h4>
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
      class={ui.checkbox}
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
          class="{ui.inputSm} w-32"
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
          class="{ui.inputSm} w-32"
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
          class="{ui.inputSm} w-32"
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
          class="{ui.inputSm} w-32"
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
          class="{ui.inputSm} w-32"
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
          class="{ui.inputSm} w-32"
        />
      </div>
    </SettingsItem>
  </div>
</div>
