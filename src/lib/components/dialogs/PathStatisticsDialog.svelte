<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import {
    analyzePathSegment,
    formatTime,
    calculatePathTime,
  } from "../../../utils/timeCalculator";
  import type {
    Point,
    Line,
    SequenceItem,
    Settings,
  } from "../../../types/index";
  import { slide } from "svelte/transition";
  import { onMount } from "svelte";
  import { getAngularDifference } from "../../../utils/math";
  import { notification } from "../../../stores";
  import SimpleChart from "../tools/SimpleChart.svelte";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let settings: Settings;
  export let percent: number = 0;
  export let isOpen: boolean = false;
  export let onClose: () => void;
  // If provided, position/size will match this rect (from the Control Tab container)
  export let controlRect: {
    top: number;
    left: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
  } | null = null;

  // Compute style for panel: inset slightly from controlRect so it behaves like a dialog; use a small gap and min sizes
  $: panelStyle =
    controlRect && controlRect.width > 0
      ? (() => {
          const gap = 36; // pixels inset from control rect
          const top = controlRect.top + gap;
          const left = controlRect.left + gap;
          const width = Math.max(220, controlRect.width - gap * 2);
          const height = Math.max(120, controlRect.height - gap * 2);
          return `position:fixed; top:${top}px; left:${left}px; width:${width}px; height:${height}px; z-index:50;`;
        })()
      : `position:fixed; left:36px; right:36px; bottom:36px; height:calc(50vh - 72px); z-index:50;`;

  interface SegmentStat {
    name: string;
    length: number;
    time: number;
    maxVel: number;
    maxAngVel: number;
    degrees: number;
    color: string;
  }

  interface Insight {
    startTime: number;
    endTime?: number;
    type: "warning" | "info" | "error";
    message: string;
    value?: number;
  }

  interface PathStats {
    totalTime: number;
    totalDistance: number;
    maxLinearVelocity: number;
    maxAngularVelocity: number;
    segments: SegmentStat[];
    velocityData: { time: number; value: number }[];
    angularVelocityData: { time: number; value: number }[];
    accelerationData: { time: number; value: number }[];
    centripetalData: { time: number; value: number }[];
    insights: Insight[];
  }

  let pathStats: PathStats | null = null;
  let activeTab: "summary" | "graphs" | "insights" = "summary";
  let currentTime = 0;

  $: if (isOpen && lines && sequence && settings) {
    calculateStats();
  }

  $: if (pathStats) {
    currentTime = (percent / 100) * pathStats.totalTime;
  }

  function calculateStats() {
    // Basic time and distance from standard calculator
    const timePred = calculatePathTime(startPoint, lines, settings, sequence);

    // Detailed segment analysis
    let segments: SegmentStat[] = [];
    let maxLinearVelocity = 0;
    let maxAngularVelocity = 0;

    // Data for charts
    let velocityData: { time: number; value: number }[] = [];
    let angularVelocityData: { time: number; value: number }[] = [];
    let accelerationData: { time: number; value: number }[] = [];
    let centripetalData: { time: number; value: number }[] = [];
    let insights: Insight[] = [];

    // Pre-calculate constants for insight thresholds
    const maxAccel = settings.maxAcceleration || 30;
    const maxVel = settings.maxVelocity || 100;
    const kFriction = settings.kFriction || 0;
    const gravity = 386.22; // in/s^2
    const frictionLimitAccel = kFriction * gravity;

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

    // Track active warnings for coalescing
    let activeVelocityWarning: Insight | null = null;
    let activeFrictionWarning: Insight | null = null;

    // Helper to add data point to charts
    // Avoid duplicate time points if possible, or just push
    const addDataPoint = (
      t: number,
      vLin: number,
      vAng: number,
      accLin: number,
      accCent: number,
    ) => {
      velocityData.push({ time: t, value: vLin });
      angularVelocityData.push({ time: t, value: vAng });
      accelerationData.push({ time: t, value: accLin });
      centripetalData.push({ time: t, value: accCent });

      // --- Insight Logic ---

      // 1. Max Velocity Warning (Info)
      if (vLin >= maxVel * 0.99) {
        if (!activeVelocityWarning) {
          activeVelocityWarning = {
            startTime: t,
            type: "info",
            message: "Max Velocity Reached",
            value: vLin,
          };
        } else {
          // Update value to max seen in this range
          if (vLin > (activeVelocityWarning.value || 0)) {
            activeVelocityWarning.value = vLin;
          }
        }
      } else {
        // Condition ended
        if (activeVelocityWarning) {
          activeVelocityWarning.endTime = t;
          insights.push(activeVelocityWarning);
          activeVelocityWarning = null;
        }
      }

      // 2. Centripetal Friction Warning (Error)
      if (kFriction > 0 && accCent > frictionLimitAccel) {
        if (!activeFrictionWarning) {
          activeFrictionWarning = {
            startTime: t,
            type: "error",
            message: "Risk of Wheel Slip (Centripetal)",
            value: accCent,
          };
        } else {
          // Update value to max seen in this range
          if (accCent > (activeFrictionWarning.value || 0)) {
            activeFrictionWarning.value = accCent;
          }
        }
      } else {
        // Condition ended
        if (activeFrictionWarning) {
          activeFrictionWarning.endTime = t;
          insights.push(activeFrictionWarning);
          activeFrictionWarning = null;
        }
      }
    };

    // Helper to process generic event for graph (implicit or explicit)
    const processEventForGraph = (ev: any) => {
      if (ev.type === "wait") {
        if (ev.duration <= 0) return;

        const startTime = ev.startTime;
        const endTime = ev.endTime;

        // Check for rotation
        const diff = Math.abs(
          getAngularDifference(ev.startHeading || 0, ev.targetHeading || 0),
        );

        if (diff > 0.1) {
          // Rotation
          const maxAngVel = (diff * (Math.PI / 180)) / ev.duration;
          // Trapezoid visualization
          addDataPoint(startTime, 0, 0, 0, 0);
          addDataPoint(startTime + ev.duration * 0.1, 0, maxAngVel, 0, 0);
          addDataPoint(endTime - ev.duration * 0.1, 0, maxAngVel, 0, 0);
          addDataPoint(endTime, 0, 0, 0, 0);
        } else {
          // Pure Wait
          addDataPoint(startTime, 0, 0, 0, 0);
          addDataPoint(endTime, 0, 0, 0, 0);
        }
      } else if (ev.type === "travel") {
        // This is handled by the main path logic usually, but if called separately:
        // We would need the full profile extraction logic here.
        // Since we inline it for the main path item, we won't use this helper for 'travel'
        // events linked to a sequence item unless we refactor fully.
      }
    };

    // Ensure start at 0
    addDataPoint(0, 0, 0, 0, 0);

    sequence.forEach((item) => {
      // Common logic to consume intermediate events
      // Find the target event for this sequence item
      let targetEventIndex = -1;

      for (let i = timelineIndex; i < timeline.length; i++) {
        const tEv = timeline[i];
        let isMatch = false;

        if (
          item.kind === "wait" &&
          tEv.type === "wait" &&
          (tEv as any).waitId === item.id
        ) {
          isMatch = true;
        } else if (
          item.kind === "rotate" &&
          tEv.type === "wait" &&
          (tEv as any).waitId === item.id
        ) {
          isMatch = true;
        } else if (item.kind === "path" && tEv.type === "travel") {
          const line = lineById.get(item.lineId);
          if (
            line &&
            tEv.lineIndex === lines.findIndex((l) => l.id === line.id)
          ) {
            isMatch = true;
          }
        }

        if (isMatch) {
          targetEventIndex = i;
          break;
        }
      }

      // If we found the target event, process everything before it as intermediate
      if (targetEventIndex !== -1) {
        for (let i = timelineIndex; i < targetEventIndex; i++) {
          processEventForGraph(timeline[i]);
        }
        timelineIndex = targetEventIndex; // Move cursor to target
      }

      // Now process the sequence item itself (which corresponds to timeline[timelineIndex] if found)
      // If not found (e.g. 0 duration wait dropped from timeline?), we handle graceful fallback in blocks below.

      // Handle Wait Item
      if (item.kind === "wait") {
        let event: any = null;
        if (targetEventIndex !== -1) {
          event = timeline[targetEventIndex];
          timelineIndex++;

          // Add data for explicit wait
          processEventForGraph(event);
        }

        const duration = event ? event.duration : item.durationMs / 1000;

        segments.push({
          name: item.name || "Wait",
          length: 0,
          time: duration,
          maxVel: 0,
          maxAngVel: 0,
          degrees: 0,
          color: "#f59e0b", // Amber for wait
        });
        return;
      }

      // Handle Rotate Item
      if (item.kind === "rotate") {
        let event: any = null;
        if (targetEventIndex !== -1) {
          event = timeline[targetEventIndex];
          timelineIndex++;

          // Add data for explicit rotate
          processEventForGraph(event);
        }

        const duration = event ? event.duration : 0;

        let maxAngVel = 0;
        let degrees = 0;
        if (event && event.duration > 0) {
          const diff = Math.abs(
            getAngularDifference(
              (event as any).startHeading,
              (event as any).targetHeading,
            ),
          );
          maxAngVel = (diff * (Math.PI / 180)) / event.duration;
          degrees = diff;
        }

        segments.push({
          name: item.name || "Rotate",
          length: 0,
          time: duration,
          maxVel: 0,
          maxAngVel: maxAngVel,
          degrees: degrees,
          color: "#d946ef", // Fuchsia-500 (matching pink/fuchsia theme of rotate)
        });
        return;
      }

      // Handle Path Item
      if (item.kind !== "path") return;
      const line = lineById.get(item.lineId);
      if (!line) return;

      let event: any = null;
      if (targetEventIndex !== -1) {
        event = timeline[targetEventIndex];
        timelineIndex++;
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
      let segDegrees = 0;

      if (event.motionProfile && analysis.steps.length > 0) {
        const profile = event.motionProfile;
        const headingProfile = event.headingProfile;
        const velocityProfile = event.velocityProfile; // Use this if available!

        // Limit loop to min of both
        const len = Math.min(profile.length - 1, analysis.steps.length);

        for (let i = 0; i < len; i++) {
          const t = event.startTime + profile[i];

          // Linear Velocity
          // Use velocityProfile if available (more accurate from motion profile gen)
          let vLin = 0;
          if (velocityProfile && velocityProfile.length > i) {
            vLin = velocityProfile[i];
          } else {
            // Fallback: derive from distance/time
            const dt = profile[i + 1] - profile[i];
            if (dt > 1e-6) {
              const step = analysis.steps[i];
              vLin = step.deltaLength / dt;
            }
          }
          if (vLin > segMaxLin) segMaxLin = vLin;

          // Angular Velocity
          let vAng = 0;
          const dt = profile[i + 1] - profile[i];

          if (dt > 1e-6) {
            if (headingProfile && headingProfile.length > i + 1) {
              const h1 = headingProfile[i];
              const h2 = headingProfile[i + 1];
              const diff = Math.abs(getAngularDifference(h1, h2)); // degrees
              vAng = (diff * (Math.PI / 180)) / dt; // rad/s
              segDegrees += diff;
            } else {
              const step = analysis.steps[i];
              vAng = (step.rotation * (Math.PI / 180)) / dt;
              segDegrees += step.rotation;
            }
          }

          if (vAng > segMaxAng) segMaxAng = vAng;

          // Calculate acceleration (finite difference)
          let accLin = 0;
          let accCent = 0;
          if (dt > 1e-6) {
            // Forward difference with next point's velocity would be better if available
            // But we iterate i.
            // Let's look at i+1 if possible, or use current dt from previous
            // profile[i+1] is t_next
            // v[i+1] is v_next
            // a = (v[i+1] - v[i]) / dt
            let vNext = 0;
            if (velocityProfile && velocityProfile.length > i + 1) {
              vNext = velocityProfile[i + 1];
            } else if (analysis.steps[i + 1]) {
              vNext = analysis.steps[i + 1].deltaLength / dt; // Approx
            }
            accLin = (vNext - vLin) / dt;
          }

          // Centripetal Acceleration: v^2 / r
          // We need radius at this step
          if (analysis.steps[i] && analysis.steps[i].radius > 0.001) {
            accCent = (vLin * vLin) / analysis.steps[i].radius;
          }

          addDataPoint(t, vLin, vAng, accLin, accCent);
        }
        // Add end point
        addDataPoint(event.endTime, 0, 0, 0, 0); // Assume stop at end
      } else {
        // Fallback if no profile
        const dt = event.duration;
        if (dt > 0) {
          segMaxLin = analysis.length / dt;
          segMaxAng = (analysis.netRotation * (Math.PI / 180)) / dt;

          // Flat line for fallback
          addDataPoint(event.startTime, segMaxLin, segMaxAng, 0, 0);
          addDataPoint(event.endTime, segMaxLin, segMaxAng, 0, 0);
        }

        // Approx degrees turned from analysis
        if (line.endPoint.heading === "tangential") {
          segDegrees = analysis.tangentRotation;
        } else {
          segDegrees = Math.abs(analysis.netRotation);
        }
      }

      segments.push({
        name:
          line.name || `Path ${lines.findIndex((l) => l.id === line.id) + 1}`,
        length: analysis.length,
        time: event.duration,
        maxVel: segMaxLin,
        maxAngVel: segMaxAng,
        degrees: segDegrees,
        color: line.color,
      });

      if (segMaxLin > _maxLin) _maxLin = segMaxLin;
      if (segMaxAng > _maxAng) _maxAng = segMaxAng;

      // Update simPoint and simHeading
      simPoint = line.endPoint as any;
      simHeading = analysis.startHeading + analysis.netRotation;
    });

    // Finalize any open warnings at end of timeline
    const totalT = timePred.totalTime;
    if (activeVelocityWarning) {
      activeVelocityWarning.endTime = totalT;
      insights.push(activeVelocityWarning);
    }
    if (activeFrictionWarning) {
      activeFrictionWarning.endTime = totalT;
      insights.push(activeFrictionWarning);
    }

    pathStats = {
      totalTime: timePred.totalTime,
      totalDistance: timePred.totalDistance,
      maxLinearVelocity: _maxLin,
      maxAngularVelocity: _maxAng,
      segments: segments,
      velocityData,
      angularVelocityData,
      accelerationData,
      centripetalData,
      insights,
    };
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
      let md = `| Time Range | Type | Message | Max Value |\n|---:|---|---|---:|\n`;
      pathStats.insights.forEach((ins) => {
        const timeStr = ins.endTime
          ? `${ins.startTime.toFixed(2)}s - ${ins.endTime.toFixed(2)}s`
          : `${ins.startTime.toFixed(2)}s`;
        md += `| ${timeStr} | ${ins.type.toUpperCase()} | ${ins.message} | ${ins.value ? ins.value.toFixed(1) : "-"} |\n`;
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
</script>

{#if isOpen && pathStats}
  <!-- Non-modal floating panel to allow field to remain visible -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
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
            on:click={() => (activeTab = "summary")}
          >
            Summary
          </button>
          <button
            class={`px-3 py-1 rounded-md transition-all ${activeTab === "graphs" ? "bg-white dark:bg-neutral-600 shadow-sm text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"}`}
            on:click={() => (activeTab = "graphs")}
          >
            Graphs
          </button>
          <button
            class={`px-3 py-1 rounded-md transition-all ${activeTab === "insights" ? "bg-white dark:bg-neutral-600 shadow-sm text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"}`}
            on:click={() => (activeTab = "insights")}
          >
            Insights
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          on:click={handleCopy}
          class="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          title={activeTab === "graphs"
            ? "Copy SVG to Clipboard"
            : "Copy as Markdown"}
          aria-label="Copy content"
        >
          {#if activeTab !== "graphs"}
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
          {:else}
            <!-- Copy Image/SVG Icon -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="size-5"
            >
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path
                d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
              />
            </svg>
          {/if}
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-12 mb-2 opacity-50"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
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
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="size-5"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    {:else if insight.type === "warning"}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="size-5"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    {:else}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="size-5"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
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
                        • Max Value: {insight.value.toFixed(1)}
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

<svelte:window on:keydown={(e) => isOpen && e.key === "Escape" && onClose()} />
