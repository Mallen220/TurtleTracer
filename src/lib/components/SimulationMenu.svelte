<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  Picks a simulator (from a plugin) and how to show it. Only shown when a
  plugin has added a simulator.
-->
<script lang="ts">
  import { get } from "svelte/store";
  import * as d3 from "d3";
  import { fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import { simulatorRegistry } from "../registries";
  import {
    selectSimulator,
    setSimulationMode,
    simulationStore,
  } from "../simulation";
  import { linesStore, startPointStore } from "../projectStore";
  import { calculateRobotState } from "../../utils/animation";
  import type { TimePrediction } from "../../types";
  import { formatDisplayDistance } from "../../utils/coordinates";
  import { ChevronDownIcon } from "./icons";
  import { ui } from "../ui";

  interface Props {
    /** Seconds the routine takes, to jump to a moment the simulation points out. */
    totalSeconds: number;
    onSeek: (percent: number) => void;
    settings: { visualizerUnits?: "imperial" | "metric" };
  }

  let { totalSeconds, onSeek, settings }: Props = $props();

  let open = $state(false);
  let current = $derived(
    $simulatorRegistry.find((s) => s.id === $simulationStore.simulatorId),
  );

  const identity = d3.scaleLinear();

  /** Where the plan has the robot at `time`, to compare with the simulation. */
  function plannedAt(prediction: TimePrediction, time: number) {
    const total = prediction.totalTime;
    const pose = calculateRobotState(
      total > 0 ? (time / total) * 100 : 0,
      prediction.timeline,
      get(linesStore),
      get(startPointStore),
      identity,
      identity,
    );
    return { x: pose.x, y: pose.y };
  }

  function choose(id: string | null) {
    selectSimulator(id, plannedAt);
    open = false;
  }

  function seek(time: number) {
    if (totalSeconds > 0) onSeek(Math.min(100, (time / totalSeconds) * 100));
  }
</script>

<div class="relative">
  <button
    class={ui.btn.secondary}
    aria-haspopup="menu"
    aria-expanded={open}
    title="Simulate how a real robot would drive the plan"
    onclick={(e) => {
      e.stopPropagation();
      open = !open;
    }}
  >
    <span class="font-medium">Sim: {current?.label ?? "Off"}</span>
    {#if $simulationStore.status === "running"}
      <span
        class="size-2 rounded-full bg-sky-500 animate-pulse"
        aria-label="Simulating"
      ></span>
    {/if}
    <ChevronDownIcon
      className="size-4 text-neutral-500 dark:text-neutral-400"
    />
  </button>

  {#if open}
    <div
      class="{ui.popover} absolute left-0 bottom-full mb-2 w-72 z-50 p-2 flex flex-col gap-2"
      role="menu"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") open = false;
      }}
      in:fly={{ y: 8, duration: 160, easing: cubicInOut }}
    >
      <button
        role="menuitemradio"
        aria-checked={!current}
        class={ui.menuItem}
        onclick={() => choose(null)}
      >
        Off
      </button>
      {#each $simulatorRegistry as simulator (simulator.id)}
        <button
          role="menuitemradio"
          aria-checked={current?.id === simulator.id}
          class={ui.menuItem}
          onclick={() => choose(simulator.id)}>{simulator.label}</button
        >
      {/each}

      {#if current}
        <div
          class="border-t border-neutral-200 dark:border-neutral-700 pt-2 flex flex-col gap-2 text-xs"
        >
          <div
            class={ui.tabList}
            role="radiogroup"
            aria-label="Show the simulation as"
          >
            <button
              role="radio"
              aria-checked={$simulationStore.mode === "ghost"}
              class="{ui.tab($simulationStore.mode === 'ghost')} flex-1"
              onclick={() => setSimulationMode("ghost")}>Ghost robot</button
            >
            <button
              role="radio"
              aria-checked={$simulationStore.mode === "drive"}
              class="{ui.tab($simulationStore.mode === 'drive')} flex-1"
              onclick={() => setSimulationMode("drive")}>Drive the robot</button
            >
          </div>
          {#if $simulationStore.status === "failed"}
            <p class={ui.alert.danger}>{$simulationStore.error}</p>
          {:else if $simulationStore.deviation}
            {@const d = $simulationStore.deviation}
            <p class="text-neutral-600 dark:text-neutral-300">
              Strays up to {formatDisplayDistance(d.max, settings, 1)} from the plan
              (on average {formatDisplayDistance(d.mean, settings, 1)}).
              <button class={ui.link} onclick={() => seek(d.worstTime)}>
                Show the worst moment
              </button>
            </p>
          {/if}
          {#each $simulationStore.result?.notes ?? [] as note, i (i)}
            <button
              class="text-left {note.level === 'warning'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-neutral-600 dark:text-neutral-300'} hover:underline"
              onclick={() => seek(note.time)}
            >
              {note.time.toFixed(1)} s: {note.text}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<svelte:window onclick={() => (open = false)} />
