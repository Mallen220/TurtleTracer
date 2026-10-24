<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { getElectronAPI } from "../../../utils/platform";
  import { onMount } from "svelte";
  import {
    telemetryState,
    isConnected,
    telemetryLines,
    processTelemetryMessage,
    setStatus,
    liveTrail,
    clearLiveTrail,
    recording,
    recordingSummary,
    clearRecording,
  } from "../../telemetryStore";
  import { calibrationState } from "../../motionCalibration";
  import {
    settingsStore,
    startPointStore,
    linesStore,
    sequenceStore,
    shapesStore,
  } from "../../projectStore";
  import { notification, currentFilePath } from "../../../stores";
  import { get } from "svelte/store";
  import { saveBlob } from "../../../utils/file";
  import { recordingFileName } from "../../../utils/telemetryRecording";
  import packageJson from "../../../../package.json";
  import { ui } from "../../ui";
  import CalibrationPanel from "../telemetry/CalibrationPanel.svelte";
  import type { Line, Point, SequenceItem, Settings } from "../../../types";

  interface Props {
    settings: Settings;
    startPoint?: Point;
    lines?: Line[];
    sequence?: SequenceItem[];
    recordChange?: (action?: string) => void;
  }

  // `lines` here is the robot's telemetry, so the path's lines are renamed.
  let {
    settings,
    startPoint,
    lines: pathLines,
    sequence,
    recordChange,
  }: Props = $props();

  // Inputs
  let ip = $state("192.168.43.1");
  let protocol: "tcp" | "websocket" = $state("tcp");
  let port = $state(8888);
  let connecting = $state(false);

  // Update default port when protocol changes
  function updateDefaultPort() {
    if (protocol === "tcp") port = 8888;
    else port = 8082;
  }

  let status = $derived($telemetryState.status);
  let fps = $derived($telemetryState.fps);
  let lines = $derived($telemetryLines);

  // Sort keys alphabetically
  let sortedKeys = $derived(Object.keys(lines).sort());

  onMount(() => {
    const api = getElectronAPI();
    if (!api?.telemetry) return;

    // Removed again on unmount, or turning the tab off and on would
    // process every message twice.
    const offData = api.telemetry.onData((data: string) => {
      processTelemetryMessage(data);
    });

    const offStatus = api.telemetry.onStatus((s: any) => {
      setStatus(s);
      // Sync connecting state
      if (s === "CONNECTED" || s === "DISCONNECTED" || s === "ERROR") {
        connecting = false;
      }
    });

    return () => {
      offData?.();
      offStatus?.();
    };
  });

  let exporting = $state(false);

  function formatDuration(seconds: number) {
    if (seconds < 60) return `${seconds.toFixed(1)} s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min ${Math.round(seconds % 60)} s`;
  }

  async function exportRecording() {
    exporting = true;
    try {
      const file = get(currentFilePath);
      const data = recording.toExport({
        file: file?.split(/[\\/]/).pop() ?? null,
        startPoint: get(startPointStore),
        lines: get(linesStore),
        sequence: get(sequenceStore),
        shapes: get(shapesStore),
        settings: get(settingsStore),
        appVersion: packageJson.version,
      });
      const blob = new Blob([JSON.stringify(data)], {
        type: "application/json",
      });
      const result = await saveBlob(
        blob,
        recordingFileName(file),
        "Telemetry recording",
      );
      if (result === "cancelled") return;
      notification.set({
        message:
          result === "saved"
            ? "Telemetry recording saved."
            : "Telemetry recording downloaded.",
        type: "success",
      });
    } catch (e) {
      console.error(e);
      notification.set({
        message: "Couldn't save the telemetry recording.",
        type: "error",
      });
    } finally {
      exporting = false;
    }
  }

  async function toggleConnection() {
    const api = getElectronAPI();
    if (!api || !api.telemetry) {
      notification.set({
        message: "Telemetry API not available",
        type: "error",
      });
      return;
    }

    if ($isConnected) {
      await api.telemetry.disconnect();
    } else {
      if (connecting) return;
      connecting = true;
      try {
        await api.telemetry.connect(ip, port, protocol);
      } catch (e) {
        console.error(e);
        notification.set({
          message: "Connection request failed",
          type: "error",
        });
        connecting = false;
      }
    }
  }
</script>

<div class="p-4 w-full flex flex-col gap-4 h-full">
  <!-- Connection Controls -->
  <div class="{ui.card} flex flex-col gap-2 p-4">
    <h3 class="font-semibold text-lg text-neutral-900 dark:text-neutral-100">
      Connection
    </h3>

    <!-- Protocol Selection -->
    <div class="flex gap-4 text-sm">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          bind:group={protocol}
          value="tcp"
          onchange={updateDefaultPort}
          disabled={$isConnected}
          class={ui.checkbox}
        />
        <span class="text-neutral-700 dark:text-neutral-300"
          >TCP (TurtleTracerLib)</span
        >
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          bind:group={protocol}
          value="websocket"
          onchange={updateDefaultPort}
          disabled={$isConnected}
          class={ui.checkbox}
        />
        <span class="text-neutral-700 dark:text-neutral-300"
          >WebSocket (Panels)</span
        >
      </label>
    </div>

    <div class="flex gap-2 items-center">
      <input
        type="text"
        bind:value={ip}
        placeholder="IP Address"
        class="{ui.input} flex-1"
        disabled={$isConnected}
      />
      <input
        type="number"
        bind:value={port}
        placeholder="Port"
        class="{ui.input} w-24"
        disabled={$isConnected}
      />
    </div>
    <button
      onclick={toggleConnection}
      class="{$isConnected ? ui.btn.dangerSoft : ui.btn.primary} w-full"
      disabled={connecting}
    >
      {#if connecting}
        Connecting...
      {:else if $isConnected}
        Disconnect
      {:else}
        Connect
      {/if}
    </button>

    <!-- Status Indicator -->
    <div class="flex justify-between items-center text-xs mt-1">
      <div class="flex items-center gap-1.5">
        <div
          class="w-2 h-2 rounded-full {status === 'CONNECTED'
            ? 'bg-green-500'
            : status === 'CONNECTING'
              ? 'bg-yellow-500 animate-pulse'
              : status === 'ERROR'
                ? 'bg-red-500'
                : 'bg-neutral-400'}"
        ></div>
        <span class="font-medium text-neutral-500 dark:text-neutral-400"
          >{status}</span
        >
      </div>
      {#if $isConnected}
        <span class="text-neutral-500 dark:text-neutral-400">{fps} FPS</span>
      {/if}
    </div>

    <label class={ui.checkLabel}>
      <input
        type="checkbox"
        class={ui.checkbox}
        checked={settings.telemetrySyncPlayback !== false}
        onchange={(e) =>
          settingsStore.update((s) => ({
            ...s,
            telemetrySyncPlayback: e.currentTarget.checked,
          }))}
      />
      Play the simulation when the robot starts its first path
    </label>
    {#if $isConnected && $calibrationState.sampleCount > 0 && !$calibrationState.hasBusy}
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        This robot doesn't say when it's following a path, so the simulation
        can't start with it. Update TurtleTracerLib and link the follower with
        setFollower.
      </p>
    {/if}
    {#if $liveTrail.length > 0}
      <button
        type="button"
        class="{ui.btnSm.secondary} self-start"
        onclick={clearLiveTrail}
      >
        Clear the robot's trail
      </button>
    {/if}
  </div>

  <!-- Recording -->
  <div class="{ui.card} flex flex-col gap-2 p-4">
    <h3 class="font-semibold text-lg text-neutral-900 dark:text-neutral-100">
      Recording
    </h3>
    <p class="text-xs text-neutral-500 dark:text-neutral-400">
      {#if $recordingSummary.messages === 0}
        Everything the robot sends is recorded once it's connected, so you can
        save it to a file.
      {:else}
        {$recordingSummary.messages.toLocaleString()}
        {$recordingSummary.messages === 1 ? "message" : "messages"} over {formatDuration(
          $recordingSummary.seconds,
        )}{#if $recordingSummary.runs > 0}, {$recordingSummary.runs}
          {$recordingSummary.runs === 1 ? "run" : "runs"}{/if}.
        {#if $recordingSummary.trimmed}
          The oldest messages were dropped to keep it under an hour.
        {/if}
      {/if}
    </p>
    <div class="flex gap-2">
      <button
        type="button"
        class="{ui.btn.primary} flex-1"
        disabled={$recordingSummary.messages === 0 || exporting}
        onclick={exportRecording}
      >
        {exporting ? "Saving..." : "Export recording"}
      </button>
      <button
        type="button"
        class={ui.btn.secondary}
        disabled={$recordingSummary.messages === 0}
        onclick={clearRecording}
      >
        Clear
      </button>
    </div>
    <p class="text-xs text-neutral-500 dark:text-neutral-400">
      The file also holds this path and your motion settings, so the simulation
      can be run again exactly as it was.
    </p>
  </div>

  <CalibrationPanel
    {settings}
    {startPoint}
    lines={pathLines}
    {sequence}
    {recordChange}
    connected={$isConnected}
  />

  <!-- Data Table -->
  <div class="{ui.card} flex-1 min-h-48 overflow-hidden flex flex-col">
    <div
      class="p-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50"
    >
      <h3 class="font-semibold text-sm text-neutral-700 dark:text-neutral-300">
        Telemetry Data
      </h3>
    </div>
    <div class="flex-1 overflow-y-auto p-2">
      {#if sortedKeys.length === 0}
        <div
          class="h-full flex items-center justify-center text-neutral-500 dark:text-neutral-400 text-sm italic"
        >
          No data received
        </div>
      {:else}
        <table class="w-full text-sm">
          <tbody>
            {#each sortedKeys as key}
              <tr
                class="border-b border-neutral-200 dark:border-neutral-700 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors"
              >
                <td
                  class="py-1.5 px-2 font-medium text-neutral-500 dark:text-neutral-400 w-1/3 truncate"
                  title={key}>{key}</td
                >
                <td
                  class="py-1.5 px-2 text-neutral-900 dark:text-neutral-100 font-mono text-right truncate"
                >
                  {#if typeof lines[key] === "boolean"}
                    <span
                      class="inline-block w-2.5 h-2.5 rounded-full {lines[key]
                        ? 'bg-green-500'
                        : 'bg-red-500'}"
                    ></span>
                  {:else if typeof lines[key] === "number"}
                    {Number(lines[key]).toFixed(3)}
                  {:else}
                    {lines[key]}
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>
</div>
