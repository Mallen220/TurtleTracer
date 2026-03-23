<script lang="ts">
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import { DEFAULT_SETTINGS } from "../../../../config/defaults";
  import type { Settings } from "../../../../types/index";

  export let settings: Settings;
  export let searchQuery: string;

  let angularVelocityUnit: "rad" | "deg" = "rad";

  $: angularVelocityDisplay = settings
    ? angularVelocityUnit === "rad"
      ? settings.aVelocity / Math.PI
      : (settings.aVelocity * 180) / Math.PI
    : 1;

  $: maxAngularAccelerationDisplay = settings
    ? angularVelocityUnit === "rad"
      ? (settings.maxAngularAcceleration ?? 0)
      : ((settings.maxAngularAcceleration ?? 0) * 180) / Math.PI
    : 0;

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

  function handleXVelocityInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "xVelocity",
      0,
      undefined,
      true,
    );
  }
  function handleYVelocityInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "yVelocity",
      0,
      undefined,
      true,
    );
  }
  function handleMaxVelocityInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "maxVelocity",
      0,
      undefined,
      true,
    );
  }
  function handleMaxAccelerationInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "maxAcceleration",
      0,
      undefined,
      true,
    );
  }
  function handleMaxDecelerationInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "maxDeceleration",
      0,
      undefined,
      true,
    );
  }
  function handleFrictionInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "kFriction",
      0,
      undefined,
      true,
    );
  }

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
      isModified={settings.xVelocity !== DEFAULT_SETTINGS.xVelocity}
      onReset={() => {
        settings.xVelocity = DEFAULT_SETTINGS.xVelocity;
        settings = { ...settings };
      }}
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
      isModified={settings.yVelocity !== DEFAULT_SETTINGS.yVelocity}
      onReset={() => {
        settings.yVelocity = DEFAULT_SETTINGS.yVelocity;
        settings = { ...settings };
      }}
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
      value={Number((maxAngularAccelerationDisplay ?? 0).toFixed(2))}
      min="0"
      step={angularVelocityUnit === "rad" ? 0.1 : 10}
      on:input={handleMaxAngularAccelerationInput}
      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </SettingsItem>

  <SettingsItem
    label="Angular Velocity"
    isModified={settings.aVelocity !== DEFAULT_SETTINGS.aVelocity}
    onReset={() => {
      settings.aVelocity = DEFAULT_SETTINGS.aVelocity;
      settings = { ...settings };
    }}
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
          on:click={() => (angularVelocityUnit = "rad")}>π rad/s</button
        >
        <div class="w-px h-full bg-neutral-300 dark:bg-neutral-600"></div>
        <button
          class="px-2 py-0.5 {angularVelocityUnit === 'deg'
            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
            : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'}"
          on:click={() => (angularVelocityUnit = "deg")}>deg/s</button
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
    isModified={settings.maxVelocity !== DEFAULT_SETTINGS.maxVelocity}
    onReset={() => {
      settings.maxVelocity = DEFAULT_SETTINGS.maxVelocity;
      settings = { ...settings };
    }}
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
      isModified={settings.maxAcceleration !== DEFAULT_SETTINGS.maxAcceleration}
      onReset={() => {
        settings.maxAcceleration = DEFAULT_SETTINGS.maxAcceleration;
        settings = { ...settings };
      }}
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
      isModified={settings.maxDeceleration !== DEFAULT_SETTINGS.maxDeceleration}
      onReset={() => {
        settings.maxDeceleration = DEFAULT_SETTINGS.maxDeceleration;
        settings = { ...settings };
      }}
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
    isModified={settings.kFriction !== DEFAULT_SETTINGS.kFriction}
    onReset={() => {
      settings.kFriction = DEFAULT_SETTINGS.kFriction;
      settings = { ...settings };
    }}
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
