<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import {
    importedTelemetryData,
    showTelemetry,
    showTelemetryGhost,
    telemetryOffset,
    type TelemetryPoint,
  } from "../../telemetryStore";
  import { ui } from "../../ui";
  import {
    isTelemetryExport,
    pointsFromExport,
  } from "../../../utils/telemetryRecording";

  interface Props {
    isOpen?: boolean;
  }

  let { isOpen = $bindable(false) }: Props = $props();

  let fileInput: HTMLInputElement | undefined = $state();
  let errorMsg = $state("");
  let summary = $state("");

  function handleFileSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (file.name.endsWith(".json")) {
          parseJSON(content);
        } else {
          // Assume CSV
          parseCSV(content);
        }
      } catch (err) {
        errorMsg = "Failed to parse file: " + (err as Error).message;
        importedTelemetryData.set(null);
        summary = "";
      }
    };
    reader.readAsText(file);
  }

  function parseJSON(content: string) {
    const data = JSON.parse(content);
    if (isTelemetryExport(data)) {
      const points = pointsFromExport(data);
      if (points.length === 0) throw new Error("The recording has no poses");
      importedTelemetryData.set(points);
      generateSummary(points);
      if (data.runStarts.length > 0) {
        summary += " Starts where the robot started its first path.";
      }
      return;
    }
    // Validate structure. Assume array of objects.
    if (!Array.isArray(data))
      throw new Error("JSON must be an array of points");

    const points: TelemetryPoint[] = data.map((d: any) => ({
      time: Number(d.time ?? d.timestamp ?? 0),
      x: Number(d.x ?? 0),
      y: Number(d.y ?? 0),
      heading: Number(d.heading ?? d.h ?? 0),
      velocity: d.velocity ? Number(d.velocity) : undefined,
    }));

    points.sort((a, b) => a.time - b.time);
    importedTelemetryData.set(points);
    generateSummary(points);
  }

  function parseCSV(content: string) {
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    const points: TelemetryPoint[] = [];

    // Try to detect header
    let header = lines[0].toLowerCase();
    let hasHeader =
      header.includes("time") ||
      header.includes("x") ||
      header.includes("heading");
    let startIdx = hasHeader ? 1 : 0;

    // Detect column indices based on header if present, otherwise assume standard order: time, x, y, heading
    let timeIdx = 0,
      xIdx = 1,
      yIdx = 2,
      hIdx = 3;

    if (hasHeader) {
      const headers = header.split(",").map((h) => h.trim());
      timeIdx = headers.findIndex(
        (h) => h.includes("time") || h.includes("timestamp"),
      );
      xIdx = headers.findIndex((h) => h === "x" || h === "xpos");
      yIdx = headers.findIndex((h) => h === "y" || h === "ypos");
      hIdx = headers.findIndex(
        (h) =>
          h.includes("heading") || h === "h" || h === "theta" || h === "angle",
      );
    }

    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(",").map((p) => p.trim());
      if (parts.length < 3) continue; // Skip invalid lines

      const t = Number(parts[timeIdx]);
      const x = Number(parts[xIdx]);
      const y = Number(parts[yIdx]);
      // Optional heading
      const h = hIdx >= 0 && parts[hIdx] ? Number(parts[hIdx]) : 0;

      if (!Number.isNaN(t) && !Number.isNaN(x) && !Number.isNaN(y)) {
        points.push({ time: t, x, y, heading: h });
      }
    }

    if (points.length === 0) throw new Error("No valid points found");

    points.sort((a, b) => a.time - b.time);
    importedTelemetryData.set(points);
    generateSummary(points);
  }

  function generateSummary(points: TelemetryPoint[]) {
    const duration = points.at(-1)!.time - points[0].time;
    summary = `Loaded ${points.length} imported points. Duration: ${duration.toFixed(2)}s.`;
    errorMsg = "";
  }

  function handleClear() {
    importedTelemetryData.set(null);
    summary = "";
    errorMsg = "";
    if (fileInput) fileInput.value = "";
  }
</script>

{#if isOpen}
  <!-- Dialog UI similar to ExportCodeDialog -->
  <div
    transition:fade={{ duration: 200 }}
    class="{ui.overlay} z-[1000]"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) isOpen = false;
    }}
  >
    <div
      transition:fly={{ y: 20, duration: 300 }}
      class="{ui.dialog} w-full max-w-lg flex flex-col outline-none"
    >
      <div
        class="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700"
      >
        <h2
          class="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
        >
          Telemetry Import
        </h2>
      </div>

      <div class="p-6 space-y-4">
        <div>
          <span
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >Upload Log File (CSV or JSON)</span
          >
          <div class="flex items-center gap-3">
            <button
              type="button"
              onclick={() => fileInput?.click()}
              class={ui.btn.secondary}
            >
              Choose File
            </button>
            <span
              class="text-sm text-neutral-500 dark:text-neutral-400 truncate max-w-[200px]"
            >
              {fileInput?.files?.[0]?.name || "No file chosen"}
            </span>
          </div>
          <input
            id="telemetry-file-upload"
            type="file"
            accept=".csv,.json,.txt"
            bind:this={fileInput}
            onchange={handleFileSelect}
            class="hidden"
            tabindex="-1"
          />
          <p class="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            CSV format: time, x, y, heading. Recordings exported from the
            Telemetry tab work too.
          </p>
        </div>

        {#if errorMsg}
          <div class={ui.alert.danger}>
            {errorMsg}
          </div>
        {/if}

        {#if summary}
          <div class="{ui.alert.success} flex justify-between items-center">
            <span>{summary}</span>
            <button onclick={handleClear} class={ui.btnSm.secondary}>
              Clear Data
            </button>
          </div>
        {/if}

        <div class="flex items-center justify-between pt-2">
          <label class={ui.checkLabel}>
            <input
              type="checkbox"
              bind:checked={$showTelemetry}
              class={ui.checkbox}
            />
            Show Live Telemetry Overlay
          </label>

          <label class={ui.checkLabel}>
            <input
              type="checkbox"
              bind:checked={$showTelemetryGhost}
              class={ui.checkbox}
            />
            Show Imported Ghost Robot
          </label>
        </div>

        <div>
          <label for="telemetry-offset" class="{ui.label} block mb-1"
            >Time Offset (s)</label
          >
          <div class="flex items-center gap-2">
            <input
              id="telemetry-offset"
              type="number"
              step="0.1"
              bind:value={$telemetryOffset}
              class="{ui.input} w-full"
            />
            <button
              onclick={() => ($telemetryOffset = 0)}
              class={ui.btnSm.secondary}>Reset</button
            >
          </div>
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Adjust to sync telemetry with simulation
          </p>
        </div>
      </div>

      <div class="{ui.dialogFooter} justify-end">
        <button onclick={() => (isOpen = false)} class={ui.btn.primary}>
          Done
        </button>
      </div>
    </div>
  </div>
{/if}
