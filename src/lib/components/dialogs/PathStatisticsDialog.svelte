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
  import SpeedFixButtons from "../sections/SpeedFixButtons.svelte";
  import type { MotionFix } from "../../../utils/timeCalculator/fixSearch";
  import { ui } from "../../ui";

  interface Props {
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    settings: Settings;
    percent?: number;
    totalSeconds?: number;
    onSeek?: (percent: number) => void;
    /** Applies a fix a warning offers (a speed limit); without it the warning offers none. */
    onApplyFix?: (fix: MotionFix) => void;
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
    totalSeconds,
    onSeek,
    onApplyFix,
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
  let duration = $derived(
    totalSeconds ?? (pathStats as PathStats | null)?.totalTime ?? 0,
  );

  function seekToTime(seconds: number) {
    if (!onSeek || duration <= 0) return;
    onSeek(Math.max(0, Math.min(100, (seconds / duration) * 100)));
  }

  /** Makes a div that acts as a button respond to Enter and Space as well as clicks. */
  function activateOnKey(action: () => void) {
    return (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      action();
    };
  }

  /** Whether the timeline is currently inside a summary row. */
  function isPlayingSegment(seg: { startTime: number; time: number }) {
    return (
      currentTime >= seg.startTime - 1e-6 &&
      currentTime < seg.startTime + seg.time
    );
  }

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
      currentTime = (percent / 100) * duration;
    }
  });
</script>

{#if isOpen && pathStats}
  <!-- Non-modal floating panel to allow field to remain visible -->

  <div
    class="{ui.popover} z-50 flex flex-col overflow-hidden"
    style={panelStyle}
    transition:slide={{ duration: 200 }}
    role="dialog"
    aria-modal="false"
    aria-labelledby="stats-title"
  >
    <!-- Header -->
    <div class="{ui.dialogHeader} flex-shrink-0">
      <div class="flex items-center gap-4">
        <h2 id="stats-title" class={ui.title}>Path Statistics</h2>

        <!-- Tabs -->
        <div class={ui.tabList}>
          <button
            class={ui.tab(activeTab === "summary")}
            onclick={() => (activeTab = "summary")}
            aria-label="Summary view"
          >
            Summary
          </button>
          <button
            class={ui.tab(activeTab === "graphs")}
            onclick={() => (activeTab = "graphs")}
            aria-label="Graphs view"
          >
            Graphs
          </button>
          <button
            class={ui.tab(activeTab === "insights")}
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
          class={ui.iconBtn.neutral}
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
          class={ui.iconBtn.neutral}
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
            class="{ui.well} p-3 flex flex-col items-center justify-center text-center"
          >
            <span class={ui.heading}>Total Time</span>
            <span
              class="text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-1"
            >
              {formatTime(pathStats.totalTime)}
            </span>
          </div>
          <div
            class="{ui.well} p-3 flex flex-col items-center justify-center text-center"
          >
            <span class={ui.heading}>Distance</span>
            <span
              class="text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-1"
            >
              {formatDisplayDistance(pathStats.totalDistance, settings, 1)}
            </span>
          </div>
          <div
            class="{ui.well} p-3 flex flex-col items-center justify-center text-center"
          >
            <span class={ui.heading}>Max Vel</span>
            <span
              class="text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-1"
            >
              {pathStats.maxLinearVelocity.toFixed(1)} in/s
            </span>
          </div>
          <div
            class="{ui.well} p-3 flex flex-col items-center justify-center text-center"
          >
            <span class={ui.heading}>Max Ang Vel</span>
            <span
              class="text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-1"
            >
              {pathStats.maxAngularVelocity.toFixed(1)} rad/s
            </span>
          </div>
        </div>

        <!-- Table Header (desktop only) -->
        <div
          class="hidden sm:grid grid-cols-12 gap-2 px-6 py-2 bg-neutral-100 dark:bg-neutral-900/30 border-y border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider flex-shrink-0"
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
                role="button"
                tabindex="0"
                title="Go to {seg.name} at {formatTime(seg.startTime)}"
                onclick={() => seekToTime(seg.startTime)}
                onkeydown={activateOnKey(() => seekToTime(seg.startTime))}
                class="grid grid-cols-1 sm:grid-cols-12 gap-2 px-4 py-3 rounded-md border transition-colors items-start text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 {onSeek
                  ? 'cursor-pointer'
                  : ''} {isPlayingSegment(seg)
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                  : 'border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-700/30'}"
              >
                <div
                  class="col-span-1 sm:col-span-3 flex items-center gap-2 truncate"
                >
                  <div
                    class="w-3 h-3 rounded-full flex-none"
                    style="background-color: {seg.color}"
                  ></div>
                  <span
                    class="font-medium text-neutral-900 dark:text-neutral-100 truncate"
                    >{seg.name}</span
                  >
                </div>

                <!-- Compact metrics for small screens -->
                <div
                  class="sm:hidden mt-2 w-full text-sm text-neutral-500 dark:text-neutral-400 flex flex-wrap gap-2"
                >
                  <div class="flex-1">Len: {seg.length.toFixed(1)}"</div>
                  <div class="flex-1">Time: {seg.time.toFixed(2)}s</div>
                  <div class="flex-1">Max V: {seg.maxVel.toFixed(1)}</div>
                  <div class="flex-1">ω: {seg.maxAngVel.toFixed(1)}</div>
                  <div class="flex-1">Deg: {seg.degrees.toFixed(1)}°</div>
                </div>

                <!-- Desktop metrics -->
                <div
                  class="hidden sm:block sm:col-span-2 text-right text-neutral-500 dark:text-neutral-400"
                >
                  {seg.length.toFixed(1)}"
                </div>
                <div
                  class="hidden sm:block sm:col-span-2 text-right text-neutral-500 dark:text-neutral-400"
                >
                  {seg.time.toFixed(2)}s
                </div>
                <div
                  class="hidden sm:block sm:col-span-2 text-right text-neutral-500 dark:text-neutral-400"
                >
                  {seg.maxVel.toFixed(1)}
                </div>
                <div
                  class="hidden sm:block sm:col-span-2 text-right text-neutral-500 dark:text-neutral-400"
                >
                  {seg.maxAngVel.toFixed(1)}
                </div>
                <div
                  class="hidden sm:block sm:col-span-1 text-right text-neutral-500 dark:text-neutral-400"
                >
                  {seg.degrees.toFixed(1)}°
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Graphs Tab -->
      {:else if activeTab === "graphs"}
        <!-- Scrolls, so keyboard users need to be able to focus it. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          class="overflow-y-auto flex-1 p-4 min-h-0 space-y-6"
          role="region"
          aria-label="Graphs"
          tabindex="0"
        >
          <div class="{ui.card} simple-chart-container p-4">
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
              onSeek={onSeek ? seekToTime : undefined}
            />
          </div>

          <div class="{ui.card} simple-chart-container p-4">
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
              onSeek={onSeek ? seekToTime : undefined}
            />
          </div>

          <div class="{ui.card} simple-chart-container p-4">
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
              onSeek={onSeek ? seekToTime : undefined}
            />
          </div>

          <div class="{ui.card} simple-chart-container p-4">
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
              onSeek={onSeek ? seekToTime : undefined}
            />
          </div>

          <div
            class="text-xs text-neutral-500 dark:text-neutral-400 text-center italic mt-4"
          >
            {#if onSeek}Click or drag on a graph to move the timeline.{/if}
            Graph resolution depends on optimization settings and simulation step
            size.
          </div>
        </div>

        <!-- Insights Tab -->
      {:else if activeTab === "insights"}
        <div class="overflow-y-auto flex-1 p-4 min-h-0">
          {#if pathStats.insights.length === 0}
            <div
              class="flex flex-col items-center justify-center h-full text-neutral-500 dark:text-neutral-400"
            >
              <SuccessIcon className="size-12 mb-2 opacity-50" />
              <p>No warnings or insights detected.</p>
            </div>
          {:else}
            <div class="flex flex-col gap-2">
              {#each pathStats.insights as insight}
                <div
                  role="button"
                  tabindex="0"
                  title="Go to {formatTime(
                    insight.seekTime ?? insight.startTime,
                  )}"
                  onclick={() =>
                    seekToTime(insight.seekTime ?? insight.startTime)}
                  onkeydown={activateOnKey(() =>
                    seekToTime(insight.seekTime ?? insight.startTime),
                  )}
                  class="{ui.alert[
                    insight.type === 'error'
                      ? 'danger'
                      : insight.type === 'warning'
                        ? 'warning'
                        : 'info'
                  ]} flex items-start gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 {onSeek
                    ? 'cursor-pointer hover:brightness-95 dark:hover:brightness-125 transition'
                    : ''}"
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
                    {#if onApplyFix && insight.fixes?.length}
                      <div class="mt-2">
                        <SpeedFixButtons
                          fixes={insight.fixes}
                          onapply={onApplyFix}
                        />
                      </div>
                    {/if}
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
