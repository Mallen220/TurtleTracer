<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { settingsEditor } from "../settingsEditor";
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import NumberSetting from "./NumberSetting.svelte";
  import { DEFAULT_SETTINGS } from "../../../../config/defaults";
  import { MIN_TRANSLATIONAL_P } from "../../../../utils/timeCalculator/chainRecovery";
  import TranslationalPPreview from "./TranslationalPPreview.svelte";
  import type { Settings } from "../../../../types/index";

  interface Props {
    settings: Settings;
    searchQuery: string;
  }

  let { settings = $bindable(), searchQuery }: Props = $props();

  const { set, resettable } = settingsEditor(
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

  {#if searchQuery === ""}
    <p
      class="mb-4 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 p-3 text-xs leading-snug text-neutral-600 dark:text-neutral-400"
      data-testid="where-to-find-numbers"
    >
      Not sure what to enter? If your robot runs Pedro Pathing, its Foresight
      AutoTune measures most of these and writes them into a
      <code>ForesightConfig</code>. See
      <a
        href="https://pedropathing.com/docs/pathing/tuning/foresight"
        target="_blank"
        rel="noopener noreferrer"
        class="text-blue-600 dark:text-blue-400 underline">Tuning Foresight</a
      >. Each setting below says which value to copy. Otherwise, time your robot
      over a measured distance, or start with the defaults.
    </p>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <NumberSetting
      bind:settings
      name="xVelocity"
      label="Forward Velocity (in/s)"
      description="Top speed driving the way the robot faces. With Strafe Velocity it sets how much slower the robot is sideways; Max Velocity stays the overall cap. In Pedro: maxAchievableForwardVelocity."
      {searchQuery}
      id="x-velocity"
    />
    <NumberSetting
      bind:settings
      name="yVelocity"
      label="Strafe Velocity (in/s)"
      description="Top speed driving sideways. Set it the same as Forward Velocity for a robot that is as fast in every direction. In Pedro: maxAchievableStrafeVelocity."
      {searchQuery}
      id="y-velocity"
    />
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
      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  </SettingsItem>

  <NumberSetting
    bind:settings
    name="maxVelocity"
    label="Max Velocity (in/s)"
    description="The fastest the robot goes along a path. A good start is your forward velocity, or your maxVelocityConstraint if you set one in Pedro."
    {searchQuery}
    id="max-velocity"
  />

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <NumberSetting
      bind:settings
      name="maxAcceleration"
      label="Max Acceleration (in/s²)"
      description="Pedro: maxAccelerationConstraint, if you set one. Otherwise time how long the robot takes to reach top speed."
      {searchQuery}
      id="max-acceleration"
    />
    <NumberSetting
      bind:settings
      name="maxDeceleration"
      label="Max Deceleration (in/s²)"
      description="Pedro: maxDecelerationConstraint, if set. Otherwise naturalForwardDeceleration is a starting point. If you enter braking coefficients below, those are used instead."
      {searchQuery}
      id="max-deceleration"
    />
  </div>

  <NumberSetting
    bind:settings
    name="kFriction"
    label="Friction Coefficient"
    description="Higher values = more grip. Used for the wheel slip warning in Path Statistics"
    {searchQuery}
    id="friction-coefficient"
    step={0.1}
  />

  <h4
    class="text-xs font-bold text-neutral-500 uppercase tracking-wider mt-8 mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
  >
    Path following
  </h4>

  <SettingsItem
    label="Pedro Pathing Version"
    {...resettable("pedroVersion")}
    description="v3 measures heading progress by distance along a path and hands chained paths over early. v2 (approximate) uses the curve parameter and hands over at the end."
    {searchQuery}
    layout="col"
    forId="pedro-version"
  >
    <select
      id="pedro-version"
      value={settings.pedroVersion}
      onchange={(e) =>
        set("pedroVersion", e.currentTarget.value as "v3" | "v2")}
      class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="v3">v3 (current)</option>
      <option value="v2">v2 (deprecated but still widely used)</option>
    </select>
  </SettingsItem>

  <NumberSetting
    bind:settings
    name="pathSettleTime"
    label="Path Settle Time (s)"
    description="Time the robot holds at the end of a path before the next step. Pedro waits until the robot settles or its timeout (timeoutConstraint, 0.1 s by default) passes."
    {searchQuery}
    id="path-settle-time"
    step={0.01}
  />

  <NumberSetting
    bind:settings
    name="translationalP"
    label="Translational P"
    description="The kP of your Pedro translational PID (power per inch of error); in a ForesightConfig it is the kP in forwardTranslational. It steers the robot back onto the path at chained corners. Minimum 0.01; values above 1 act like 1, since power is already full. Pedro's default is 0.1."
    {searchQuery}
    id="translational-p"
    min={MIN_TRANSLATIONAL_P}
    step={0.01}
  />

  {#if searchQuery === "" || "translational p".includes(searchQuery.toLowerCase())}
    <TranslationalPPreview {settings} />
  {/if}

  <SettingsItem
    label="Stop to Turn"
    {...resettable("stopToTurn")}
    description="Stop and turn in place before a path that starts at a different heading. Pedro itself turns while it drives, so this is off by default."
    {searchQuery}
    layout="row"
    forId="stop-to-turn"
  >
    <input
      id="stop-to-turn"
      type="checkbox"
      checked={settings.stopToTurn}
      onchange={(e) => set("stopToTurn", e.currentTarget.checked)}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-indigo-500 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
    />
  </SettingsItem>

  <details class="mt-4 group" open={searchQuery !== ""}>
    <summary
      class="cursor-pointer text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors mb-3 list-none [&::-webkit-details-marker]:hidden"
    >
      Advanced braking
    </summary>
    <NumberSetting
      bind:settings
      name="brakingQuadratic"
      label="Braking Distance, Quadratic"
      description="Pedro's braking model: distance to stop = quadratic × speed² + linear × speed. Leave both at 0 to brake at the max deceleration. In a ForesightConfig these come from quadraticBrakeCoefficients and linearBrakeCoefficients; use the forward values."
      {searchQuery}
      id="braking-quadratic"
      step={0.0001}
    />

    <NumberSetting
      bind:settings
      name="brakingLinear"
      label="Braking Distance, Linear"
      description="The linear part of the braking model above."
      {searchQuery}
      id="braking-linear"
      step={0.001}
    />
  </details>
</div>
