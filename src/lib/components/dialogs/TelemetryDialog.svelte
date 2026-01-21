<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import {
    telemetryData,
    showTelemetry,
    showTelemetryGhost,
    telemetryOffset,
    type TelemetryPoint,
  } from "../../telemetryStore";
  import { tick } from "svelte";

  export let isOpen = false;

  let fileInput: HTMLInputElement;
  let errorMsg = "";
  let summary = "";

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
        telemetryData.set(null);
        summary = "";
      }
    };
    reader.readAsText(file);
  }

  function parseJSON(content: string) {
    const data = JSON.parse(content);
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
    telemetryData.set(points);
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

      if (!isNaN(t) && !isNaN(x) && !isNaN(y)) {
        points.push({ time: t, x, y, heading: h });
      }
    }

    if (points.length === 0) throw new Error("No valid points found");

    points.sort((a, b) => a.time - b.time);
    telemetryData.set(points);
    generateSummary(points);
  }

  function generateSummary(points: TelemetryPoint[]) {
    const duration = points[points.length - 1].time - points[0].time;
    summary = `Loaded ${points.length} points. Duration: ${duration.toFixed(2)}s.`;
    errorMsg = "";
    showTelemetry.set(true);
  }

  function handleClear() {
    telemetryData.set(null);
    summary = "";
    errorMsg = "";
    if (fileInput) fileInput.value = "";
  }
</script>

{#if isOpen}
  <!-- Dialog UI similar to ExportCodeDialog -->
  <div
    transition:fade={{ duration: 200 }}
    class="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
    role="presentation"
    on:click|self={() => (isOpen = false)}
  >
    <div
      transition:fly={{ y: 20, duration: 300 }}
      class="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-lg flex flex-col border border-neutral-200 dark:border-neutral-800 outline-none"
    >
      <div
        class="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800"
      >
        <h2 class="text-lg font-semibold text-neutral-900 dark:text-white">
          Telemetry Import
        </h2>
      </div>

      <div class="p-6 space-y-4">
        <div>
          <label
            for="telemetry-file-upload"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >Upload Log File (CSV or JSON)</label
          >
          <input
            id="telemetry-file-upload"
            type="file"
            accept=".csv,.json,.txt"
            bind:this={fileInput}
            on:change={handleFileSelect}
            class="block w-full text-sm text-neutral-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-300
                "
          />
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            CSV format: time, x, y, heading
          </p>
        </div>

        {#if errorMsg}
          <div
            class="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm"
          >
            {errorMsg}
          </div>
        {/if}

        {#if summary}
          <div
            class="p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm flex justify-between items-center"
          >
            <span>{summary}</span>
            <button
              on:click={handleClear}
              class="text-xs px-2 py-1 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-100 rounded hover:bg-green-300 dark:hover:bg-green-700 transition-colors"
            >
              Clear Data
            </button>
          </div>
        {/if}

        <div class="flex items-center justify-between pt-2">
          <label
            class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer"
          >
            <input
              type="checkbox"
              bind:checked={$showTelemetry}
              class="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
            />
            Show Telemetry Path
          </label>

          <label
            class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 cursor-pointer"
          >
            <input
              type="checkbox"
              bind:checked={$showTelemetryGhost}
              class="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
            />
            Show Ghost Robot
          </label>
        </div>

        <div>
          <label
            for="telemetry-offset"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
            >Time Offset (s)</label
          >
          <div class="flex items-center gap-2">
            <input
              id="telemetry-offset"
              type="number"
              step="0.1"
              bind:value={$telemetryOffset}
              class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <button
              on:click={() => ($telemetryOffset = 0)}
              class="text-xs px-2 py-1 bg-neutral-200 dark:bg-neutral-700 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600"
              >Reset</button
            >
          </div>
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Adjust to sync telemetry with simulation
          </p>
        </div>
      </div>

      <div
        class="px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 flex justify-end"
      >
        <button
          on:click={() => (isOpen = false)}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  </div>
{/if}
