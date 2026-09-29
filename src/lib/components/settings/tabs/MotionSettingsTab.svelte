<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { settingsEditor } from "../settingsEditor";
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import { DEFAULT_SETTINGS } from "../../../../config/defaults";
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

  let angularVelocityUnit: "rad" | "deg" = $state("rad");

  let angularVelocityDisplay = $derived(
    settings
      ? angularVelocityUnit === "rad"
        ? settings.aVelocity / Math.PI
        : (settings.aVelocity * 180) / Math.PI
      : 1,
  );

  let maxAngularAccelerationDisplay = $derived(
    settings
      ? angularVelocityUnit === "rad"
        ? (settings.maxAngularAcceleration ?? 0)
        : ((settings.maxAngularAcceleration ?? 0) * 180) / Math.PI
      : 0,
  );

  const toRadians = (deg: number) => (deg * Math.PI) / 180;

  // In "rad" mode the angular velocity is shown in multiples of π.
  function handleAngularVelocityInput(e: Event) {
    const val = Number.parseFloat((e.target as HTMLInputElement).value);
    if (Number.isNaN(val)) return;
    set(
      "aVelocity",
      angularVelocityUnit === "rad" ? val * Math.PI : toRadians(val),
    );
  }

  function handleAngularVelocityChange(e: Event) {
    if ((e.target as HTMLInputElement).value === "") {
      set("aVelocity", DEFAULT_SETTINGS.aVelocity);
    } else {
      handleAngularVelocityInput(e);
    }
  }

  function handleMaxAngularAccelerationInput(e: Event) {
    const parsed = Number.parseFloat((e.target as HTMLInputElement).value);
    const val = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    set(
      "maxAngularAcceleration",
      angularVelocityUnit === "rad" ? val : toRadians(val),
    );
  }
</script>

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
      {...resettable("xVelocity")}
      {searchQuery}
      forId="x-velocity"
    >
      <input
        id="x-velocity"
        type="number"
        value={settings.xVelocity}
        oninput={(e) =>
          set("xVelocity", Number.parseFloat(e.currentTarget.value) || 0)}
        min="0"
        step="1"
        onchange={(e) => setNumber("xVelocity", e.currentTarget.value, 0)}
        class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </SettingsItem>
    <SettingsItem
      label="Y Velocity (in/s)"
      {...resettable("yVelocity")}
      {searchQuery}
      forId="y-velocity"
    >
      <input
        id="y-velocity"
        type="number"
        value={settings.yVelocity}
        oninput={(e) =>
          set("yVelocity", Number.parseFloat(e.currentTarget.value) || 0)}
        min="0"
        step="1"
        onchange={(e) => setNumber("yVelocity", e.currentTarget.value, 0)}
        class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
      value={Number((maxAngularAccelerationDisplay ?? 0).toFixed(2))}
      min="0"
      step={angularVelocityUnit === "rad" ? 0.1 : 10}
      oninput={handleMaxAngularAccelerationInput}
      class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </SettingsItem>

  <SettingsItem
    label="Angular Velocity"
    {...resettable("aVelocity")}
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
          onclick={() => (angularVelocityUnit = "rad")}>π rad/s</button
        >
        <div
          class="w-px h-full bg-neutral-300 dark:bg-neutral-600"
          role="presentation"
          aria-hidden="true"
        ></div>
        <button
          class="px-2 py-0.5 {angularVelocityUnit === 'deg'
            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
            : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'}"
          onclick={() => (angularVelocityUnit = "deg")}>deg/s</button
        >
      </div>
    </div>
    <input
      id="angular-velocity"
      type="number"
      value={angularVelocityDisplay}
      min="0"
      step={angularVelocityUnit === "rad" ? 0.1 : 10}
      oninput={handleAngularVelocityInput}
      onchange={handleAngularVelocityChange}
      class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </SettingsItem>

  <SettingsItem
    label="Max Velocity (in/s)"
    {...resettable("maxVelocity")}
    {searchQuery}
    forId="max-velocity"
  >
    <input
      id="max-velocity"
      type="number"
      value={settings.maxVelocity}
      oninput={(e) =>
        set("maxVelocity", Number.parseFloat(e.currentTarget.value) || 0)}
      min="0"
      step="1"
      onchange={(e) => setNumber("maxVelocity", e.currentTarget.value, 0)}
      class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </SettingsItem>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <SettingsItem
      label="Max Acceleration (in/s²)"
      {...resettable("maxAcceleration")}
      {searchQuery}
      forId="max-acceleration"
    >
      <input
        id="max-acceleration"
        type="number"
        value={settings.maxAcceleration}
        oninput={(e) =>
          set("maxAcceleration", Number.parseFloat(e.currentTarget.value) || 0)}
        min="0"
        step="1"
        onchange={(e) => setNumber("maxAcceleration", e.currentTarget.value, 0)}
        class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </SettingsItem>
    <SettingsItem
      label="Max Deceleration (in/s²)"
      {...resettable("maxDeceleration")}
      {searchQuery}
      forId="max-deceleration"
    >
      <input
        id="max-deceleration"
        type="number"
        value={settings.maxDeceleration}
        oninput={(e) =>
          set("maxDeceleration", Number.parseFloat(e.currentTarget.value) || 0)}
        min="0"
        step="1"
        onchange={(e) => setNumber("maxDeceleration", e.currentTarget.value, 0)}
        class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </SettingsItem>
  </div>

  <SettingsItem
    label="Friction Coefficient"
    {...resettable("kFriction")}
    description="Higher values = more resistance"
    {searchQuery}
    forId="friction-coefficient"
  >
    <input
      id="friction-coefficient"
      type="number"
      value={settings.kFriction}
      oninput={(e) =>
        set("kFriction", Number.parseFloat(e.currentTarget.value) || 0)}
      min="0"
      step="0.1"
      onchange={(e) => setNumber("kFriction", e.currentTarget.value, 0)}
      class="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </SettingsItem>
</div>
