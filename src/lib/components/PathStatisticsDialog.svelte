<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import {
    analyzePathSegment,
    formatTime,
    calculatePathTime,
  } from "../../utils/timeCalculator";
  import type { Point, Line, SequenceItem, Settings } from "../../types";
  import { slide } from "svelte/transition";
  import { getAngularDifference } from "../../utils/math";
  import { notification } from "../../stores";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let settings: Settings;
  export let isOpen: boolean = false;
  export let onClose: () => void;

  interface SegmentStat {
    name: string;
    length: number;
    time: number;
    maxVel: number;
    maxAngVel: number;
    color: string;
  }

  interface PathStats {
    totalTime: number;
    totalDistance: number;
    maxLinearVelocity: number;
    maxAngularVelocity: number;
    segments: SegmentStat[];
  }

  let pathStats: PathStats | null = null;

  $: if (isOpen && lines && sequence && settings) {
    calculateStats();
  }

  function calculateStats() {
    // Basic time and distance from standard calculator
    const timePred = calculatePathTime(startPoint, lines, settings, sequence);

    // Detailed segment analysis
    let segments: SegmentStat[] = [];
    let maxLinearVelocity = 0;
    let maxAngularVelocity = 0;

    let currentHeading =
      startPoint.heading === "linear"
        ? startPoint.startDeg
        : startPoint.heading === "constant"
          ? startPoint.degrees
          : 0; // Approx for tangential start

    let lastPoint = startPoint;

    // Map timePrediction segments to sequence items
    const timeline = timePred.timeline || [];

    // Filter to travel and wait events
    // Actually we iterate sequence items and find matching events.

    // Index cursor for timeline
    let timelineIndex = 0;

    // Re-simulation loop setup
    let simHeading =
      startPoint.heading === "linear"
        ? startPoint.startDeg
        : startPoint.heading === "constant"
          ? startPoint.degrees
          : 0;
    // Tangential start logic
    if (startPoint.heading === "tangential" && lines.length > 0) {
      const l = lines[0];
      const next = l.controlPoints.length > 0 ? l.controlPoints[0] : l.endPoint;
      simHeading =
        Math.atan2(next.y - startPoint.y, next.x - startPoint.x) *
        (180 / Math.PI);
      if (startPoint.reverse) simHeading += 180;
    }

    let simPoint = startPoint;
    const lineById = new Map(lines.map((l) => [l.id, l]));

    let _maxLin = 0;
    let _maxAng = 0;

    sequence.forEach((item) => {
      // Handle Wait Item
      if (item.kind === "wait") {
        // Find corresponding wait event
        let event: any = null;
        for (let i = timelineIndex; i < timeline.length; i++) {
          const tEv = timeline[i];
          if (tEv.type === "wait" && (tEv as any).waitId === item.id) {
            event = tEv;
            timelineIndex = i + 1; // Advance past this event
            break;
          }
        }

        // If not found (e.g. 0 duration), we still want to show the row if it exists in sequence
        const duration = event ? event.duration : item.durationMs / 1000; // Fallback to item duration

        segments.push({
          name: item.name || "Wait",
          length: 0,
          time: duration,
          maxVel: 0,
          maxAngVel: 0,
          color: "#f59e0b", // Amber for wait
        });
        return;
      }

      // Handle Path Item
      const line = lineById.get(item.lineId);
      if (!line) return;

      // Find corresponding travel event
      let event: any = null;
      for (let i = timelineIndex; i < timeline.length; i++) {
        const tEv = timeline[i];
        if (
          tEv.type === "travel" &&
          tEv.lineIndex === lines.findIndex((l) => l.id === line.id)
        ) {
          event = tEv;
          timelineIndex = i + 1;
          break;
        }
      }

      if (!event) return;

      const startH =
        event.headingProfile && event.headingProfile.length > 0
          ? event.headingProfile[0]
          : simHeading;

      const resolution =
        event.motionProfile && event.motionProfile.length > 0
          ? event.motionProfile.length - 1
          : (settings as any).resolution || 100;

      const analysis = analyzePathSegment(
        simPoint,
        line.controlPoints as any,
        line.endPoint as any,
        resolution,
        startH,
      );

      // Calculate velocities from profile
      let segMaxLin = 0;
      let segMaxAng = 0;

      if (event.motionProfile && analysis.steps.length > 0) {
        const profile = event.motionProfile;
        const headingProfile = event.headingProfile;

        // Limit loop to min of both
        const len = Math.min(profile.length - 1, analysis.steps.length);

        for (let i = 0; i < len; i++) {
          const dt = profile[i + 1] - profile[i];
          if (dt > 1e-6) {
            // Linear Velocity
            const step = analysis.steps[i];
            const vLin = step.deltaLength / dt;
            if (vLin > segMaxLin) segMaxLin = vLin;

            // Angular Velocity
            // Use headingProfile if available to capture linear interpolation rotation
            let vAng = 0;
            if (headingProfile && headingProfile.length > i + 1) {
              const h1 = headingProfile[i];
              const h2 = headingProfile[i + 1];
              const diff = Math.abs(getAngularDifference(h1, h2)); // degrees
              vAng = (diff * (Math.PI / 180)) / dt; // rad/s
            } else {
              // Fallback to geometric rotation only
              vAng = (step.rotation * (Math.PI / 180)) / dt;
            }
            if (vAng > segMaxAng) segMaxAng = vAng;
          }
        }
      } else {
        // Fallback if no profile
        const dt = event.duration;
        if (dt > 0) {
          segMaxLin = analysis.length / dt;
          segMaxAng = (analysis.netRotation * (Math.PI / 180)) / dt;
        }
      }

      segments.push({
        name:
          line.name || `Path ${lines.findIndex((l) => l.id === line.id) + 1}`,
        length: analysis.length,
        time: event.duration,
        maxVel: segMaxLin,
        maxAngVel: segMaxAng,
        color: line.color,
      });

      if (segMaxLin > _maxLin) _maxLin = segMaxLin;
      if (segMaxAng > _maxAng) _maxAng = segMaxAng;

      // Update simPoint and simHeading
      simPoint = line.endPoint as any;
      simHeading = analysis.startHeading + analysis.netRotation;
    });

    pathStats = {
      totalTime: timePred.totalTime,
      totalDistance: timePred.totalDistance,
      maxLinearVelocity: _maxLin,
      maxAngularVelocity: _maxAng,
      segments: segments,
    };
  }

  function copyToMarkdown() {
    if (!pathStats) return;

    let md = `| Segment | Length | Time | Max V | Max ω |\n|---|---:|---:|---:|---:|\n`;
    pathStats.segments.forEach((seg) => {
      md += `| ${seg.name} | ${seg.length.toFixed(1)}" | ${seg.time.toFixed(2)}s | ${seg.maxVel.toFixed(1)} in/s | ${seg.maxAngVel.toFixed(1)} rad/s |\n`;
    });

    navigator.clipboard.writeText(md).then(() => {
      notification.set({
        message: "Copied stats to clipboard!",
        type: "success",
      });
    });
  }
</script>

{#if isOpen && pathStats}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    transition:slide={{ duration: 200 }}
    on:click|self={onClose}
    role="dialog"
    aria-modal="true"
    aria-labelledby="stats-title"
  >
    <div
      class="bg-white dark:bg-neutral-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-neutral-200 dark:border-neutral-700"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50"
      >
        <h2
          id="stats-title"
          class="text-lg font-semibold text-neutral-900 dark:text-white"
        >
          Path Statistics
        </h2>
        <div class="flex items-center gap-2">
          <button
            on:click={copyToMarkdown}
            class="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            title="Copy as Markdown"
            aria-label="Copy statistics table as Markdown"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              class="size-5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
              />
            </svg>
          </button>
          <button
            on:click={onClose}
            class="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              class="size-5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
        <div
          class="bg-neutral-100 dark:bg-neutral-700/50 p-3 rounded-lg flex flex-col items-center justify-center text-center"
        >
          <span
            class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide"
            >Total Time</span
          >
          <span class="text-xl font-bold text-neutral-900 dark:text-white mt-1">
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
          <span class="text-xl font-bold text-neutral-900 dark:text-white mt-1">
            {pathStats.totalDistance.toFixed(1)}"
          </span>
        </div>
        <div
          class="bg-neutral-100 dark:bg-neutral-700/50 p-3 rounded-lg flex flex-col items-center justify-center text-center"
        >
          <span
            class="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide"
            >Max Vel</span
          >
          <span class="text-xl font-bold text-neutral-900 dark:text-white mt-1">
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
          <span class="text-xl font-bold text-neutral-900 dark:text-white mt-1">
            {pathStats.maxAngularVelocity.toFixed(1)} rad/s
          </span>
        </div>
      </div>

      <!-- Table Header -->
      <div
        class="grid grid-cols-12 gap-2 px-6 py-2 bg-neutral-100 dark:bg-neutral-900/30 border-y border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider"
      >
        <div class="col-span-4">Segment</div>
        <div class="col-span-2 text-right">Length</div>
        <div class="col-span-2 text-right">Time</div>
        <div class="col-span-2 text-right">Max V</div>
        <div class="col-span-2 text-right">Max ω</div>
      </div>

      <!-- Scrollable List -->
      <div class="overflow-y-auto flex-1 p-2">
        <div class="flex flex-col gap-1">
          {#each pathStats.segments as seg}
            <div
              class="grid grid-cols-12 gap-2 px-4 py-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors items-center text-sm"
            >
              <div class="col-span-4 flex items-center gap-2 truncate">
                <div
                  class="w-3 h-3 rounded-full flex-none"
                  style="background-color: {seg.color}"
                ></div>
                <span
                  class="font-medium text-neutral-900 dark:text-neutral-200 truncate"
                  >{seg.name}</span
                >
              </div>
              <div
                class="col-span-2 text-right text-neutral-600 dark:text-neutral-400"
              >
                {seg.length.toFixed(1)}"
              </div>
              <div
                class="col-span-2 text-right text-neutral-600 dark:text-neutral-400"
              >
                {seg.time.toFixed(2)}s
              </div>
              <div
                class="col-span-2 text-right text-neutral-600 dark:text-neutral-400"
              >
                {seg.maxVel.toFixed(1)}
              </div>
              <div
                class="col-span-2 text-right text-neutral-600 dark:text-neutral-400"
              >
                {seg.maxAngVel.toFixed(1)}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}

<svelte:window on:keydown={(e) => isOpen && e.key === "Escape" && onClose()} />
