<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { settingsEditor, type SettingsTabProps } from "../settingsEditor";
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import NumberSetting from "./NumberSetting.svelte";
  import { DEFAULT_SETTINGS } from "../../../../config/defaults";
  import { MIN_TRANSLATIONAL_P } from "../../../../utils/timeCalculator/chainRecovery";
  import TranslationalPPreview from "./TranslationalPPreview.svelte";
  import PedroConstantsPaste from "./PedroConstantsPaste.svelte";
  import { ui } from "../../../ui";

  type Props = SettingsTabProps;

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
    <h4 class="{ui.heading} mb-4 border-b pb-1">Motion</h4>
  {/if}

  {#if searchQuery === ""}
    <p
      class="{ui.well} mb-4 p-3 text-xs leading-snug text-neutral-500 dark:text-neutral-400"
      data-testid="where-to-find-numbers"
    >
      Not sure what to enter? If your robot runs Pedro Pathing, its Foresight
      AutoTune measures most of these and writes them into a
      <code>ForesightConfig</code>. See
      <a
        href="https://pedropathing.com/docs/pathing/tuning/foresight"
        target="_blank"
        rel="noopener noreferrer"
        class="{ui.link} underline">Tuning Foresight</a
      >. You can paste your whole constants file below to fill them in, or copy
      each value yourself: every setting says which one. Otherwise, time your
      robot over a measured distance, or start with the defaults.
    </p>
  {/if}

  {#if searchQuery === "" || "paste import constants file pedro".includes(searchQuery.toLowerCase())}
    <PedroConstantsPaste bind:settings />
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
      class="{ui.input} w-full"
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
      <div class={ui.tabList}>
        <button
          class={ui.tab(angularVelocityUnit === "rad")}
          onclick={() => (angularVelocityUnit = "rad")}>π rad/s</button
        >
        <button
          class={ui.tab(angularVelocityUnit === "deg")}
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
      class="{ui.input} w-full"
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
      description="Pedro: maxDecelerationConstraint, if set. Otherwise measure it: the Telemetry tab does it from your robot's stops. Don't use naturalForwardDeceleration, which is how fast the robot slows with no power, far slower than it brakes. If you enter braking coefficients below, those are used instead."
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

  <h4 class="{ui.heading} mt-8 mb-4 border-b pb-1">Path following</h4>

  {#if searchQuery === "" || "handover brake pedro code coefficients".includes(searchQuery.toLowerCase())}
    <div class="mb-3 text-xs text-neutral-600 dark:text-neutral-400 space-y-2">
      <p>
        <span class="font-semibold">From your robot's code.</span> In a chain, Pedro
        moves on to the next path once its own brake model says the robot could stop
        before the corner. Copy the numbers from your Pedro constants:
      </p>
      <pre
        class="overflow-x-auto rounded bg-neutral-100 dark:bg-neutral-900 p-2 font-mono text-[11px] text-neutral-800 dark:text-neutral-200">c.quadraticBrakeCoefficients.set(Matrix.diag(<span
          class="font-semibold">forward</span
        >, <span class="font-semibold">strafe</span>));
c.linearBrakeCoefficients.set(Matrix.diag(<span class="font-semibold"
          >forward</span
        >, <span class="font-semibold">strafe</span>));</pre>
      <p>
        These only decide where chained paths hand over (Pedro v3). How the
        robot really stops is the Braking setting below. Left at 0, the Braking
        setting is used for both.
      </p>
    </div>
  {/if}

  <NumberSetting
    bind:settings
    name="pedroQuadraticBrakeForward"
    label="Handover Brake, Quadratic (forward)"
    description="From your code: the first number in quadraticBrakeCoefficients (Matrix.diag(forward, strafe)) in your ForesightConfig."
    {searchQuery}
    id="pedro-quadratic-brake-forward"
    step={0.0001}
  />

  <NumberSetting
    bind:settings
    name="pedroQuadraticBrakeStrafe"
    label="Handover Brake, Quadratic (strafe)"
    description="From your code: the second number in quadraticBrakeCoefficients. Left at 0, the forward values are used."
    {searchQuery}
    id="pedro-quadratic-brake-strafe"
    step={0.0001}
  />

  <NumberSetting
    bind:settings
    name="pedroLinearBrakeForward"
    label="Handover Brake, Linear (forward)"
    description="From your code: the first number in linearBrakeCoefficients."
    {searchQuery}
    id="pedro-linear-brake-forward"
    step={0.001}
  />

  <NumberSetting
    bind:settings
    name="pedroLinearBrakeStrafe"
    label="Handover Brake, Linear (strafe)"
    description="From your code: the second number in linearBrakeCoefficients. Left at 0, the forward values are used."
    {searchQuery}
    id="pedro-linear-brake-strafe"
    step={0.001}
  />

  <NumberSetting
    bind:settings
    name="pathSettleTime"
    label="Path Settle Time (s)"
    description="Pedro counts a path as done 97.5% of the way along it, then holds the end until the robot settles there or this long passes (its timeoutConstraint, 0.1 s by default). The robot can still be moving when the next step starts."
    {searchQuery}
    id="path-settle-time"
    step={0.01}
  />

  <NumberSetting
    bind:settings
    name="translationalP"
    label="Translational P"
    description="How hard the simulation pulls the robot back onto the path at chained corners (power per inch of error). It is not your Pedro kP: Pedro has separate forward and strafe gains and caps braking power, so the value that makes the simulation swing like your robot is usually lower. The Telemetry tab can fit it from real corners. Minimum 0.01; values above 1 act like 1, since power is already full. Pedro's default kP is 0.1."
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
      class={ui.checkbox}
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
      description="How far the robot really takes to stop: distance = quadratic × speed² + linear × speed. The Telemetry tab can measure it from your robot. Leave both at 0 to brake at the max deceleration. Pedro's own estimate, from your code, goes in the Handover Brake settings."
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
