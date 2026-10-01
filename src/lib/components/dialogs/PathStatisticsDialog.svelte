<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { formatTime } from "../../../utils/timeCalculator";
  import {
    computePathStatistics,
    type PathStats,
  } from "../../../utils/pathStatistics";
  import type {
    Point,
    Line,
    SequenceItem,
    Settings,
  } from "../../../types/index";
  import { slide } from "svelte/transition";
  import {
    CloseIcon,
    SuccessIcon,
    ErrorIcon,
    WarningIcon,
    InfoIcon,
    ClipboardIcon,
    DotIcon,
  } from "../icons";
  import { notification } from "../../../stores";
  import { formatDisplayDistance } from "../../../utils/coordinates";
  import SimpleChart from "../tools/SimpleChart.svelte";

  interface Props {
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    settings: Settings;
    percent?: number;
    isOpen?: boolean;
    onClose: () => void;
    // If provided, position/size will match this rect (from the Control Tab container)
    controlRect?: {
      top: number;
      left: number;
      width: number;
      height: number;
      right: number;
      bottom: number;
    } | null;
  }

  let {
    startPoint,
    lines,
    sequence,
    settings,
    percent = 0,
    isOpen = $bindable(false),
    onClose,
    controlRect = null,
  }: Props = $props();

  let pathStats: PathStats | null = $state(null);
  /** The number an insight carries, with what it is: "Swing: 7.7 in", or "Max Value: 40.0". */
  function insightValue(insight: { value?: number; valueLabel?: string }) {
    if (insight.valueLabel) return insight.valueLabel;
    return insight.value ? `Max Value: ${insight.value.toFixed(1)}` : "-";
  }

  let activeTab: "summary" | "graphs" | "insights" = $state("summary");
  let currentTime = $state(0);

  function calculateStats() {
    pathStats = computePathStatistics(startPoint, lines, sequence, settings);
  }

  function handleCopy() {
    if (activeTab === "summary" || activeTab === "insights") {
      copyToMarkdown();
    } else {
      copyGraphs();
    }
  }

  function copyToMarkdown() {
    if (!pathStats) return;

    if (activeTab === "insights") {
      let md = `| Time Range | Type | Message | Value |\n|---:|---|---|---:|\n`;
      pathStats.insights.forEach((ins) => {
        const timeStr = ins.endTime
          ? `${ins.startTime.toFixed(2)}s - ${ins.endTime.toFixed(2)}s`
          : `${ins.startTime.toFixed(2)}s`;
        md += `| ${timeStr} | ${ins.type.toUpperCase()} | ${ins.message} | ${insightValue(ins)} |\n`;
      });
      navigator.clipboard.writeText(md).then(() => {
        notification.set({
          message: "Copied insights to clipboard!",
          type: "success",
        });
      });
    } else {
      let md = `| Segment | Length | Time | Max V | Max ω | Degrees |\n|---|---:|---:|---:|---:|---:|\n`;
      pathStats.segments.forEach((seg) => {
        md += `| ${seg.name} | ${seg.length.toFixed(1)}" | ${seg.time.toFixed(2)}s | ${seg.maxVel.toFixed(1)} in/s | ${seg.maxAngVel.toFixed(1)} rad/s | ${seg.degrees.toFixed(1)}° |\n`;
      });

      navigator.clipboard.writeText(md).then(() => {
        notification.set({
          message: "Copied stats to clipboard!",
          type: "success",
        });
      });
    }
  }

  function copyGraphs() {
    // Select the graph containers
    const graphs = document.querySelectorAll(".simple-chart-container svg");
    if (graphs.length === 0) return;

    let svgContent = "";
    graphs.forEach((svg) => {
      svgContent += svg.outerHTML + "\n";
    });

    navigator.clipboard.writeText(svgContent).then(() => {
      notification.set({
        message: "Copied graph SVGs to clipboard!",
        type: "success",
      });
    });
  }
  // Compute style for panel: inset slightly from controlRect so it behaves like a dialog; use a small gap and min sizes
  let panelStyle = $derived(
    controlRect && controlRect.width > 0
      ? (() => {
          const gap = 36; // pixels inset from control rect
          const top = controlRect.top + gap;
          const left = controlRect.left + gap;
          const width = Math.max(220, controlRect.width - gap * 2);
          const height = Math.max(120, controlRect.height - gap * 2);
          return `position:fixed; top:${top}px; left:${left}px; width:${width}px; height:${height}px; z-index:50;`;
        })()
      : `position:fixed; left:36px; right:36px; bottom:36px; height:calc(50vh - 72px); z-index:50;`,
  );
  $effect(() => {
    if (isOpen && lines && sequence && settings) {
      calculateStats();
    }
  });
  $effect(() => {
    if (pathStats) {
      currentTime = (percent / 100) * pathStats.totalTime;
    }
  });
</script>

{#if isOpen && pathStats}
  <!-- Non-modal floating panel to allow field to remain visible -->

  <div
    class="z-50 flex flex-col overflow-hidden bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700"
    style={panelStyle}
    transition:slide={{ duration: 200 }}
    role="dialog"
    aria-modal="false"
    aria-labelledby="stats-title"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 flex-shrink-0"
    >
      <div class="flex items-center gap-4">
        <h2
          id="stats-title"
          class="text-lg font-semibold text-neutral-900 dark:text-white"
        >
          Path Statistics
        </h2>

        <!-- Tabs -->
        <div
          class="flex bg-neutral-200 dark:bg-neutral-700 rounded-lg p-1 text-xs font-medium"
        >
          <button
            class={`px-3 py-1 rounded-md transition-all ${activeTab === "summary" ? "bg-white dark:bg-neutral-600 shadow-sm text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"}`}
            onclick={() => (activeTab = "summary")}
            aria-label="Summary view"
          >
            Summary
          </button>
          <button
            class={`px-3 py-1 rounded-md transition-all ${activeTab === "graphs" ? "bg-white dark:bg-neutral-600 shadow-sm text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"}`}
            onclick={() => (activeTab = "graphs")}
            aria-label="Graphs view"
          >
            Graphs
          </button>
          <button
            class={`px-3 py-1 rounded-md transition-all ${activeTab === "insights" ? "bg-white dark:bg-neutral-600 shadow-sm text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"}`}
            onclick={() => (activeTab = "insights")}
            aria-label="Insights view"
          >
            Insights
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          onclick={handleCopy}
          class="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          title={activeTab === "graphs"
            ? "Copy SVG to Clipboard"
            : "Copy as Markdown"}
          aria-label={activeTab === "graphs"
            ? "Copy SVG to Clipboard"
            : "Copy as Markdown"}
        >
          <ClipboardIcon className="size-5" />
        </button>
        <button
          title="Close"
          onclick={onClose}
          class="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          aria-label="Close"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden flex flex-col min-h-0">
      <!-- Summary Tab -->
      {#if activeTab === "summary"}
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 flex-shrink-0">
          <div
            class="bg-neutral-100 dark:bg-neutral-700/50 p-3 rounded-lg flex flex-col items-center justify-center text-center"
          >
            <span
              class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide"
              >Total Time</span
            >
            <span
              class="text-xl font-bold text-neutral-900 dark:text-white mt-1"
            >
              {formatTime(pathStats.totalTime)}
            </span>
          </div>
          <div
            class="bg-neutral-100 dark:bg-neutral-700/50 p-3 rounded-lg flex flex-col items-center justify-center text-center"
          >
            <span
              class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide"
              >Distance</span
            >
            <span
              class="text-xl font-bold text-neutral-900 dark:text-white mt-1"
            >
              {formatDisplayDistance(pathStats.totalDistance, settings, 1)}
            </span>
          </div>
          <div
            class="bg-neutral-100 dark:bg-neutral-700/50 p-3 rounded-lg flex flex-col items-center justify-center text-center"
          >
            <span
              class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide"
              >Max Vel</span
            >
            <span
              class="text-xl font-bold text-neutral-900 dark:text-white mt-1"
            >
              {pathStats.maxLinearVelocity.toFixed(1)} in/s
            </span>
          </div>
          <div
            class="bg-neutral-100 dark:bg-neutral-700/50 p-3 rounded-lg flex flex-col items-center justify-center text-center"
          >
            <span
              class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide"
              >Max Ang Vel</span
            >
            <span
              class="text-xl font-bold text-neutral-900 dark:text-white mt-1"
            >
              {pathStats.maxAngularVelocity.toFixed(1)} rad/s
            </span>
          </div>
        </div>

        <!-- Table Header (desktop only) -->
        <div
          class="hidden sm:grid grid-cols-12 gap-2 px-6 py-2 bg-neutral-100 dark:bg-neutral-900/30 border-y border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider flex-shrink-0"
        >
          <div class="col-span-3">Segment</div>
          <div class="col-span-2 text-right">Length</div>
          <div class="col-span-2 text-right">Time</div>
          <div class="col-span-2 text-right">Max V</div>
          <div class="col-span-2 text-right">Max ω</div>
          <div class="col-span-1 text-right">Deg</div>
        </div>

        <!-- Scrollable List -->
        <div class="overflow-y-auto flex-1 p-2 min-h-0">
          <div class="flex flex-col gap-1">
            {#each pathStats.segments as seg}
              <div
                class="grid grid-cols-1 sm:grid-cols-12 gap-2 px-4 py-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors items-start text-sm"
              >
                <div
                  class="col-span-1 sm:col-span-3 flex items-center gap-2 truncate"
                >
                  <div
                    class="w-3 h-3 rounded-full flex-none"
                    style="background-color: {seg.color}"
                  ></div>
                  <span
                    class="font-medium text-neutral-900 dark:text-neutral-200 truncate"
                    >{seg.name}</span
                  >
                </div>

                <!-- Compact metrics for small screens -->
                <div
                  class="sm:hidden mt-2 w-full text-sm text-neutral-600 dark:text-neutral-400 flex flex-wrap gap-2"
                >
                  <div class="flex-1">Len: {seg.length.toFixed(1)}"</div>
                  <div class="flex-1">Time: {seg.time.toFixed(2)}s</div>
                  <div class="flex-1">Max V: {seg.maxVel.toFixed(1)}</div>
                  <div class="flex-1">ω: {seg.maxAngVel.toFixed(1)}</div>
                  <div class="flex-1">Deg: {seg.degrees.toFixed(1)}°</div>
                </div>

                <!-- Desktop metrics -->
                <div
                  class="hidden sm:block sm:col-span-2 text-right text-neutral-600 dark:text-neutral-400"
                >
                  {seg.length.toFixed(1)}"
                </div>
                <div
                  class="hidden sm:block sm:col-span-2 text-right text-neutral-600 dark:text-neutral-400"
                >
                  {seg.time.toFixed(2)}s
                </div>
                <div
                  class="hidden sm:block sm:col-span-2 text-right text-neutral-600 dark:text-neutral-400"
                >
                  {seg.maxVel.toFixed(1)}
                </div>
                <div
                  class="hidden sm:block sm:col-span-2 text-right text-neutral-600 dark:text-neutral-400"
                >
                  {seg.maxAngVel.toFixed(1)}
                </div>
                <div
                  class="hidden sm:block sm:col-span-1 text-right text-neutral-600 dark:text-neutral-400"
                >
                  {seg.degrees.toFixed(1)}°
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Graphs Tab -->
      {:else if activeTab === "graphs"}
        <div class="overflow-y-auto flex-1 p-4 min-h-0 space-y-6">
          <div
            class="simple-chart-container bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4"
          >
            <h3
              class="text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-300"
            >
              Velocity Profile (in/s)
            </h3>
            <SimpleChart
              data={pathStats.velocityData}
              color="#3b82f6"
              label="Velocity"
              unit="in/s"
              height={150}
              {currentTime}
            />
          </div>

          <div
            class="simple-chart-container bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4"
          >
            <h3
              class="text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-300"
            >
              Linear Acceleration (in/s²)
            </h3>
            <SimpleChart
              data={pathStats.accelerationData}
              color="#ef4444"
              label="Acceleration"
              unit="in/s²"
              height={150}
              {currentTime}
            />
          </div>

          <div
            class="simple-chart-container bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4"
          >
            <h3
              class="text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-300"
            >
              Centripetal Acceleration (in/s²)
            </h3>
            <SimpleChart
              data={pathStats.centripetalData}
              color="#f97316"
              label="Centripetal Accel"
              unit="in/s²"
              height={150}
              {currentTime}
            />
          </div>

          <div
            class="simple-chart-container bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4"
          >
            <h3
              class="text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-300"
            >
              Angular Velocity Profile (rad/s)
            </h3>
            <SimpleChart
              data={pathStats.angularVelocityData}
              color="#d946ef"
              label="Angular Velocity"
              unit="rad/s"
              height={150}
              {currentTime}
            />
          </div>

          <div
            class="text-xs text-neutral-500 dark:text-neutral-400 text-center italic mt-4"
          >
            Graph resolution depends on optimization settings and simulation
            step size.
          </div>
        </div>

        <!-- Insights Tab -->
      {:else if activeTab === "insights"}
        <div class="overflow-y-auto flex-1 p-4 min-h-0">
          {#if pathStats.insights.length === 0}
            <div
              class="flex flex-col items-center justify-center h-full text-neutral-500"
            >
              <SuccessIcon className="size-12 mb-2 opacity-50" />
              <p>No warnings or insights detected.</p>
            </div>
          {:else}
            <div class="flex flex-col gap-2">
              {#each pathStats.insights as insight}
                <div
                  class={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                    insight.type === "error"
                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
                      : insight.type === "warning"
                        ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
                        : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200"
                  }`}
                >
                  <div class="mt-0.5">
                    {#if insight.type === "error"}
                      <ErrorIcon className="size-5" />
                    {:else if insight.type === "warning"}
                      <WarningIcon className="size-5" />
                    {:else}
                      <InfoIcon className="size-5" />
                    {/if}
                  </div>
                  <div class="flex-1">
                    <div class="font-semibold">
                      {insight.message}
                    </div>
                    <div class="mt-1 opacity-80">
                      {#if insight.endTime && insight.endTime - insight.startTime > 0.05}
                        At {formatTime(insight.startTime)} - {formatTime(
                          insight.endTime,
                        )}
                      {:else}
                        At {formatTime(insight.startTime)}
                      {/if}
                      {#if insight.value}
                        <div class="flex items-center gap-1.5">
                          <DotIcon className="-mx-0.5 opacity-50" />
                          <span>{insightValue(insight)}</span>
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<svelte:window onkeydown={(e) => isOpen && e.key === "Escape" && onClose()} />
