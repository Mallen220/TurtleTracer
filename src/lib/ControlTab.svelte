<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script context="module" lang="ts">
  import { tabRegistry as tabRegistryModule } from "./registries";
  import PathTab from "./components/tabs/PathTab.svelte";
  import FieldTab from "./components/tabs/FieldTab.svelte";
  import TableTab from "./components/tabs/TableTab.svelte";
  import DiffTab from "./components/tabs/DiffTab.svelte";

  // Register default tabs; callable so plugin reloads can restore baseline tabs
  export const registerDefaultControlTabs = () => {
    tabRegistryModule.register({
      id: "path",
      label: "Paths",
      component: PathTab,
      order: 0,
      icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="size-4" aria-hidden="true"><path d="M4 15c3-6 9-6 14-3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4" cy="15" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="9" r="1.8" fill="currentColor" stroke="none"/><circle cx="20" cy="12" r="1.8" fill="currentColor" stroke="none"/></svg>`,
    });
    tabRegistryModule.register({
      id: "field",
      label: "Field",
      component: FieldTab,
      order: 1,
      icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="size-4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" stroke-width="2"/><path d="M3 4 L21 4 L12 12 Z" fill="currentColor" opacity="0.08" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M3 4 L12 12 M21 4 L12 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    });
    tabRegistryModule.register({
      id: "table",
      label: "Table",
      component: TableTab,
      order: 2,
      icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" class="size-4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" stroke-width="2"/><rect x="3" y="4" width="18" height="5" rx="1.5" fill="currentColor" opacity="0.06" stroke="none"/><line x1="3" y1="10" x2="21" y2="10" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="10" x2="9" y2="20" stroke-width="1.5" stroke-linecap="round"/><line x1="15" y1="10" x2="15" y2="20" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    });
  };

  // Ensure defaults are present for initial render
  registerDefaultControlTabs();
</script>

<script lang="ts">
  import type {
    Point,
    Line,
    BasePoint,
    Settings,
    Shape,
    SequenceItem,
  } from "../types/index";
  import { tick } from "svelte";
  import PlaybackControls from "./components/PlaybackControls.svelte";
  import { calculatePathTime } from "../utils";
  import { tabRegistry, timelineTransformerRegistry } from "./registries";
  import { diffMode } from "./diffStore";

  export let percent: number;
  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export const robotLength: number = 16; // Can be removed?
  export const robotWidth: number = 16; // Can be removed?
  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let settings: Settings;
  export let handleSeek: (percent: number) => void;
  export let loopAnimation: boolean;
  export let playbackSpeed: number = 1.0;
  export const resetPlaybackSpeed = undefined as unknown as () => void;
  export let setPlaybackSpeed: (factor: number, autoPlay?: boolean) => void;

  export const resetAnimation = undefined as unknown as () => void;

  export let shapes: Shape[];
  export let recordChange: () => void;
  export let onPreviewChange: ((lines: Line[] | null) => void) | null = null;
  export let statsOpen = false;
  export let activeTab: string = "path";

  // Optimization Interface
  let tabInstances: Record<string, any> = {};

  $: activeTabInstance = tabInstances[activeTab];

  export async function openAndStartOptimization() {
    if (activeTabInstance && activeTabInstance.openAndStartOptimization) {
      return await activeTabInstance.openAndStartOptimization();
    }
  }

  export function stopOptimization() {
    if (activeTabInstance && activeTabInstance.stopOptimization) {
      activeTabInstance.stopOptimization();
    }
  }

  export function applyOptimization() {
    if (activeTabInstance && activeTabInstance.applyOptimization) {
      activeTabInstance.applyOptimization();
    }
  }

  export function discardOptimization() {
    if (activeTabInstance && activeTabInstance.discardOptimization) {
      activeTabInstance.discardOptimization();
    }
  }

  export function retryOptimization() {
    if (activeTabInstance && activeTabInstance.retryOptimization) {
      activeTabInstance.retryOptimization();
    }
  }

  export function getOptimizationStatus() {
    if (activeTabInstance && activeTabInstance.getOptimizationStatus) {
      return activeTabInstance.getOptimizationStatus();
    }
    return {
      isOpen: false,
      isRunning: false,
      optimizedLines: null,
      optimizationFailed: false,
    };
  }

  // --- Methods delegating to PathTab ---
  export function addPathAtStart() {
    if (tabInstances["path"] && tabInstances["path"].addPathAtStart) {
      tabInstances["path"].addPathAtStart();
    }
  }

  export function addWaitAtStart() {
    if (tabInstances["path"] && tabInstances["path"].addWaitAtStart) {
      tabInstances["path"].addWaitAtStart();
    }
  }

  export function addRotateAtStart() {
    if (tabInstances["path"] && tabInstances["path"].addRotateAtStart) {
      tabInstances["path"].addRotateAtStart();
    }
  }

  export function moveSequenceItem(seqIndex: number, delta: number) {
    if (tabInstances["path"] && tabInstances["path"].moveSequenceItem) {
      tabInstances["path"].moveSequenceItem(seqIndex, delta);
    }
  }

  export function toggleCollapseSelected() {
    if (activeTabInstance && activeTabInstance.toggleCollapseSelected) {
      activeTabInstance.toggleCollapseSelected();
    }
  }

  export async function scrollToItem(type: string, id: string) {
    if (type === "path" || type === "wait" || type === "rotate") {
      activeTab = "path";
      await tick();
      if (tabInstances["path"] && tabInstances["path"].scrollToItem) {
        tabInstances["path"].scrollToItem(id);
      }
    } else if (type === "event") {
      activeTab = "field";
      await tick();
      if (tabInstances["field"] && tabInstances["field"].scrollToMarker) {
        tabInstances["field"].scrollToMarker(id);
      }
    }
  }

  // Compute timeline markers for the UI (passed to PlaybackControls)
  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);

  $: timelineItems = (() => {
    const items: {
      type: "marker" | "wait" | "rotate" | "dot" | "macro";
      percent: number;
      durationPercent?: number;
      color?: string;
      name: string;
      explicit?: boolean;
      fromWait?: boolean;
    }[] = [];

    if (
      !timePrediction ||
      !timePrediction.timeline ||
      timePrediction.totalTime <= 0
    )
      return items;

    const totalTime = timePrediction.totalTime;
    const timeline = timePrediction.timeline;
    const toPct = (t: number) => (t / totalTime) * 100;

    timeline.forEach((ev) => {
      if (ev.type === "travel") {
        const startPct = toPct(ev.startTime);
        const lineIndex = ev.lineIndex as number;
        const line = (ev as any).line || lines[lineIndex]; // Use timeline line if available
        const color = line?.color || "#ffffff";
        const name =
          line?.name ||
          (lineIndex >= 0 ? `Path ${lineIndex + 1}` : "Macro/Bridge Path");
        items.push({ type: "dot", percent: startPct, color, name });
      } else if (ev.type === "wait") {
        const startPct = toPct(ev.startTime);
        const durPct = toPct(ev.duration);
        let isRotate = false;
        let explicit = undefined as boolean | undefined;
        if (ev.waitId) {
          const seqItem = sequence.find((s) => (s as any).id === ev.waitId);
          if (seqItem) {
            if (seqItem.kind === "rotate") {
              isRotate = true;
              explicit = true;
            } else if (seqItem.kind === "wait") {
              isRotate = false;
              explicit = true;
            }
          }
        }
        if (
          !isRotate &&
          Math.abs((ev.startHeading || 0) - (ev.targetHeading || 0)) > 1.0
        ) {
          isRotate = true;
          explicit = false;
        }

        items.push({
          type: isRotate ? "rotate" : "wait",
          percent: startPct,
          durationPercent: durPct,
          name: ev.name || (isRotate ? "Rotate" : "Wait"),
          explicit: isRotate ? explicit : explicit,
        });
      } else if (ev.type === "macro") {
        const startPct = toPct(ev.startTime);
        const durPct = toPct(ev.duration);
        items.push({
          type: "macro",
          percent: startPct,
          durationPercent: durPct,
          name: ev.name || "Macro",
        });
      }
    });

    timeline.forEach((ev) => {
      if (ev.type === "travel") {
        const line = (ev as any).line || lines[ev.lineIndex as number];
        if (line && line.eventMarkers) {
          line.eventMarkers.forEach((m: any) => {
            let timeOffset = 0;
            if (ev.motionProfile) {
              const steps = ev.motionProfile.length - 1;
              if (steps > 0) {
                const idx = Math.min(Math.floor(m.position * steps), steps);
                timeOffset = ev.motionProfile[idx];
              }
            } else {
              timeOffset = ev.duration * m.position;
            }
            const absTime = ev.startTime + timeOffset;
            items.push({
              type: "marker",
              percent: toPct(absTime),
              color: line.color,
              name: m.name,
            });
          });
        }
      }
    });

    timeline.forEach((ev) => {
      if (ev.type === "wait" && ev.waitId) {
        const seqItem = sequence.find((s) => (s as any).id === ev.waitId);
        if (
          seqItem &&
          (seqItem.kind === "wait" || seqItem.kind === "rotate") &&
          seqItem.eventMarkers
        ) {
          seqItem.eventMarkers.forEach((m) => {
            const timeOffset = ev.duration * m.position;
            const absTime = ev.startTime + timeOffset;
            items.push({
              type: "marker",
              percent: toPct(absTime),
              fromWait: true,
              name: m.name,
            });
          });
        }
      }
    });

    // Apply transformers
    let transformedItems = items;
    $timelineTransformerRegistry.forEach((entry) => {
      try {
        transformedItems = entry.fn(transformedItems, {
          timePrediction,
          sequence,
          lines,
          settings,
        });
      } catch (e) {
        console.error(`Error in timeline transformer ${entry.id}:`, e);
      }
    });

    return transformedItems;
  })();

  // Use the registry for tabs
  $: currentTab =
    $tabRegistry.find((t) => t.id === activeTab) || $tabRegistry[0];
</script>

<div
  class="flex-1 flex flex-col justify-start items-center gap-2 h-full relative"
>
  {#if $diffMode}
    <div class="w-full px-4 pt-4 flex-none z-10">
      <div
        class="bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200 px-4 py-3 rounded-xl border border-purple-200 dark:border-purple-800 flex items-center justify-between"
      >
        <span class="font-semibold flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            class="size-5"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          Diff View
        </span>
      </div>
    </div>
    <div class="flex-1 w-full overflow-y-auto overflow-x-hidden relative">
      <DiffTab />
    </div>
  {:else}
    <!-- Tab Switcher -->
    <div class="w-full px-4 pt-4 flex-none z-10 flex gap-3">
      <div
        id="tab-switcher"
        class="flex-1 flex flex-row bg-neutral-200/60 dark:bg-neutral-800/60 p-1.5 gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 backdrop-blur-sm overflow-x-auto"
        role="tablist"
        aria-label="Editor View Selection"
      >
        {#each $tabRegistry as tab (tab.id)}
          <button
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="{tab.id}-panel"
            id="{tab.id}-tab"
            class="flex-1 min-w-[80px] px-3 py-2 text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 flex items-center justify-center gap-2 {activeTab ===
            tab.id
              ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-white ring-1 ring-black/5 dark:ring-white/5'
              : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-50/50 dark:hover:bg-neutral-700/50'}"
            on:click={() => (activeTab = tab.id)}
          >
            {#if tab.icon}
              {@html tab.icon}
            {/if}
            {tab.label}
          </button>
        {/each}
      </div>
      <button
        id="stats-btn"
        on:click={() => (statsOpen = !statsOpen)}
        class="flex-none flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-200 gap-2 shadow-sm"
        title="Path Statistics"
        aria-label="View path statistics"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          class="size-4"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        Stats
      </button>
    </div>

    <div
      class="flex flex-col justify-start items-start w-full overflow-y-auto overflow-x-hidden flex-1 min-h-0 relative scroll-smooth pb-20"
      role="tabpanel"
      id="{activeTab}-panel"
      aria-labelledby="{activeTab}-tab"
    >
      {#each $tabRegistry as tab (tab.id)}
        <div class:hidden={activeTab !== tab.id} class="w-full">
          <svelte:component
            this={tab.component}
            bind:this={tabInstances[tab.id]}
            bind:startPoint
            bind:lines
            bind:sequence
            bind:shapes
            bind:settings
            bind:robotXY
            bind:robotHeading
            {recordChange}
            {onPreviewChange}
            isActive={activeTab === tab.id}
          />
        </div>
      {/each}
    </div>
  {/if}

  <div
    class="flex-none w-full bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
  >
    <PlaybackControls
      bind:playing
      {play}
      {pause}
      bind:percent
      {handleSeek}
      bind:loopAnimation
      {timelineItems}
      {playbackSpeed}
      {setPlaybackSpeed}
    />
  </div>
</div>
