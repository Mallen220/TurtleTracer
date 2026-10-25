<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  Compares the connected robot with the motion settings. Telemetry is
  measured as it arrives; each setting shows how far along its measurement
  is and, once steady, offers the measured value. Applying one goes in the
  undo history.
-->
<script module lang="ts">
  /** Suggestions already announced, so each pops up once. */
  const announced = new Set<string>();
</script>

<script lang="ts">
  import {
    calibrationState,
    resetCalibration,
    TRACE_SECONDS,
  } from "../../motionCalibration";
  import {
    estimateSettings,
    formatNumber,
    observedTopSpeed,
    type Estimate,
    type Suggestion,
  } from "../../../utils/calibration/estimates";
  import { calculatePathTime } from "../../../utils/timeCalculator";
  import { settingsStore } from "../../projectStore";
  import { notification } from "../../../stores";
  import { ui } from "../../ui";
  import type { Line, Point, SequenceItem, Settings } from "../../../types";

  interface Props {
    settings: Settings;
    startPoint?: Point;
    lines?: Line[];
    sequence?: SequenceItem[];
    recordChange?: (action?: string) => void;
    connected?: boolean;
  }

  let {
    settings,
    startPoint,
    lines = [],
    sequence = [],
    recordChange,
    connected = false,
  }: Props = $props();

  let snapshot = $derived($calibrationState);
  let estimates = $derived(
    estimateSettings(snapshot.events, settings, snapshot.timeSource ?? "robot"),
  );
  let topSpeed = $derived(observedTopSpeed(snapshot.events));
  let suggestions = $derived(
    estimates.flatMap((e) => (e.suggestion ? [e.suggestion] : [])),
  );

  function apply(list: Suggestion[]) {
    if (list.length === 0) return;
    settingsStore.update((s) =>
      Object.assign({ ...s }, ...list.map((x) => x.patch)),
    );
    const labels = list.map((x) => labelOf(x));
    recordChange?.(
      list.length === 1
        ? `Set ${labels[0]} from telemetry`
        : "Set motion settings from telemetry",
    );
  }

  const labelOf = (s: Suggestion) =>
    estimates.find((e) => e.key === s.key)?.label ?? s.key;

  function announcement(s: Suggestion): string {
    const e = estimates.find((x) => x.key === s.key);
    if (
      !e ||
      e.measured === null ||
      e.current === null ||
      s.key === "braking"
    ) {
      return `Measured the robot's braking. ${s.label}?`;
    }
    return `The robot's ${e.label} measures ${valueOf(e, e.measured)}; your setting is ${valueOf(e, e.current)}.`;
  }

  // Pop up suggestions that are new, all in one notice.
  $effect(() => {
    const fresh = suggestions.filter((s) => !announced.has(s.id));
    if (fresh.length === 0) return;
    for (const s of fresh) announced.add(s.id);
    if (settings.telemetrySuggestFixes === false) return;
    notification.set({
      message:
        fresh.length === 1
          ? announcement(fresh[0])
          : `The robot's ${fresh.map(labelOf).join(", ")} differ from your settings.`,
      type: "info",
      timeout: 15000,
      actionLabel: fresh.length === 1 ? "Apply" : "Apply all",
      action: () => apply(fresh),
    });
  });

  // Path time before and after a suggestion, worked out once per suggestion.
  let timeCache = new Map<string, number | null>();
  let cacheFor: unknown[] = [];
  function pathTime(patch: Partial<Settings>, id: string): number | null {
    const deps = [startPoint, lines, sequence, settings];
    if (deps.some((d, i) => d !== cacheFor[i])) {
      timeCache = new Map();
      cacheFor = deps;
    }
    if (!timeCache.has(id)) {
      let time: number | null = null;
      if (startPoint && lines.length > 0) {
        try {
          time = calculatePathTime(
            startPoint,
            lines,
            { ...settings, ...patch },
            sequence,
          ).totalTime;
        } catch {
          time = null;
        }
      }
      timeCache.set(id, time);
    }
    return timeCache.get(id) ?? null;
  }

  function timeChange(s: Suggestion): string | null {
    const before = pathTime({}, "current");
    const after = pathTime(s.patch, s.id);
    if (before === null || after === null) return null;
    return `Path time ${before.toFixed(1)} s → ${after.toFixed(1)} s`;
  }

  // Speeds are shown to 0.1 in/s, though suggested to 0.5.
  const stepFor = (e: Estimate) => (e.unit === "in/s" ? 0.1 : e.step);
  const valueOf = (e: Estimate, value: number) =>
    `${formatNumber(value, stepFor(e))}${e.unit ? ` ${e.unit}` : ""}`;

  function comparison(e: Estimate): string {
    if (e.difference === null) return "";
    const percent = Math.round(Math.abs(e.difference) * 100);
    if (percent < 5) return "Matches your setting";
    return `${percent}% ${e.difference > 0 ? "higher" : "lower"} than your setting`;
  }

  // ── Speed chart ──────────────────────────────────────────────────────
  const CHART_W = 300;
  const CHART_H = 64;
  let chartMax = $derived(
    Math.max(
      settings.maxVelocity * 1.15,
      ...snapshot.trace.map((p) => p.speed * 1.05),
      10,
    ),
  );
  let chartPoints = $derived.by(() => {
    const trace = snapshot.trace;
    if (trace.length < 2) return "";
    const end = trace.at(-1)!.t;
    return trace
      .map((p) => {
        const x = CHART_W * (1 - (end - p.t) / TRACE_SECONDS);
        const y = CHART_H * (1 - p.speed / chartMax);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  });
  let simLineY = $derived(CHART_H * (1 - settings.maxVelocity / chartMax));
  let currentSpeed = $derived(snapshot.trace.at(-1)?.speed ?? null);

  let status = $derived.by(() => {
    if (snapshot.sampleCount === 0) {
      return connected
        ? "Waiting for the robot's pose…"
        : "Connect, then drive: the robot is measured as it moves.";
    }
    const clock =
      snapshot.timeSource === "robot" ? "robot clock" : "arrival time";
    return `Measuring · ${snapshot.sampleCount.toLocaleString()} poses · ${clock}`;
  });
</script>

<div
  class="{ui.card} shrink-0 flex flex-col gap-3 p-4"
  data-testid="calibration-panel"
>
  <div class="flex items-center justify-between gap-2">
    <h3 class="font-semibold text-lg text-neutral-900 dark:text-neutral-100">
      Robot vs Simulation
    </h3>
    <button
      type="button"
      class={ui.btnSm.secondary}
      onclick={() => resetCalibration()}
      disabled={snapshot.sampleCount === 0}
      title="Forget everything measured so far"
    >
      Reset
    </button>
  </div>

  <p class="text-xs text-neutral-500 dark:text-neutral-400">{status}</p>

  {#if snapshot.timeSource === "arrival"}
    <p class="{ui.alert.info} text-xs">
      The robot isn't sending its clock, so readings take longer to settle.
      Update TurtleTracerLib on the robot for faster, more exact results.
    </p>
  {:else if snapshot.sampleCount > 0 && !snapshot.hasBusy}
    <p class="{ui.alert.neutral} text-xs">
      Link your follower with <code>setFollower(follower)</code> so stops in teleop
      aren't counted as path braking.
    </p>
  {/if}

  {#if chartPoints}
    <div>
      <div
        class="flex justify-between text-xs text-neutral-500 dark:text-neutral-400 mb-1"
      >
        <span>Speed, last {TRACE_SECONDS} s</span>
        {#if currentSpeed !== null}
          <span class="font-mono">{currentSpeed.toFixed(1)} in/s</span>
        {/if}
      </div>
      <svg
        viewBox="0 0 {CHART_W} {CHART_H}"
        preserveAspectRatio="none"
        class="w-full h-16 rounded-md bg-neutral-50 dark:bg-neutral-900/50"
        role="img"
        aria-label="Robot speed over the last {TRACE_SECONDS} seconds"
      >
        <line
          x1="0"
          x2={CHART_W}
          y1={simLineY}
          y2={simLineY}
          class="stroke-neutral-400 dark:stroke-neutral-500"
          stroke-dasharray="4 3"
          vector-effect="non-scaling-stroke"
        >
          <title>Max Velocity setting: {settings.maxVelocity} in/s</title>
        </line>
        <polyline
          points={chartPoints}
          fill="none"
          class="stroke-emerald-600 dark:stroke-emerald-400"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <p class="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
        Dashed: Max Velocity setting ({settings.maxVelocity} in/s)
      </p>
    </div>
  {/if}

  <ul class="flex flex-col gap-3">
    {#each estimates as e (e.key)}
      <li class="flex flex-col gap-1" data-testid="calibration-{e.key}">
        <div class="flex items-baseline justify-between gap-2 text-sm">
          <span class="font-medium text-neutral-800 dark:text-neutral-200">
            {e.key === "braking" && topSpeed > 0
              ? `Braking from ${formatNumber(topSpeed, 0.1)} in/s`
              : e.label}
          </span>
          <span
            class="font-mono text-xs text-neutral-600 dark:text-neutral-300 text-right"
          >
            {#if e.measured !== null}
              {formatNumber(e.measured, stepFor(e))}
            {:else}
              –
            {/if}
            {#if e.current !== null}
              <span class="text-neutral-400 dark:text-neutral-500">
                / {formatNumber(e.current, stepFor(e))}</span
              >
            {/if}
            {e.unit}
          </span>
        </div>
        <div
          class="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden"
          role="progressbar"
          aria-label="{e.label} measurement"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(e.progress * 100)}
        >
          <div
            class="h-full rounded-full transition-[width] duration-300 {e.ready
              ? 'bg-emerald-600 dark:bg-emerald-500'
              : 'bg-amber-500'}"
            style="width: {Math.round(e.progress * 100)}%"
          ></div>
        </div>
        <div
          class="flex justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400"
        >
          <span>{e.ready ? comparison(e) : e.hint}</span>
          <span>{e.count}/{e.needed}</span>
        </div>
        {#if e.ready && e.hint !== "Ready"}
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {e.hint}
          </p>
        {/if}
        {#if e.note && e.measured !== null}
          <p class="text-xs text-neutral-500 dark:text-neutral-400 italic">
            {e.note}
          </p>
        {/if}
        {#if e.suggestion}
          {@const change = timeChange(e.suggestion)}
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class={ui.btnSm.accentSoft}
              onclick={() => apply([e.suggestion!])}
            >
              {e.suggestion.label}
            </button>
            {#if change}
              <span class="text-xs text-neutral-500 dark:text-neutral-400"
                >{change}</span
              >
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  {#if suggestions.length > 1}
    <button
      type="button"
      class="{ui.btn.primary} w-full"
      onclick={() => apply(suggestions)}
    >
      Apply all {suggestions.length} suggestions
    </button>
  {/if}

  <label class={ui.checkLabel}>
    <input
      type="checkbox"
      class={ui.checkbox}
      checked={settings.telemetrySuggestFixes !== false}
      onchange={(e) =>
        settingsStore.update((s) => ({
          ...s,
          telemetrySuggestFixes: e.currentTarget.checked,
        }))}
    />
    Pop up suggestions when a measurement is ready
  </label>
</div>
