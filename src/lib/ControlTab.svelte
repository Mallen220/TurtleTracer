<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script module lang="ts">
  import { tabRegistry as tabRegistryModule } from "./registries";
  import PathTab from "./components/tabs/PathTab.svelte";
  import FieldTab from "./components/tabs/FieldTab.svelte";
  import TableTab from "./components/tabs/TableTab.svelte";
  import DiffTab from "./components/tabs/DiffTab.svelte";
  import TelemetryTab from "./components/tabs/TelemetryTab.svelte";
  import CodeTab from "./components/tabs/CodeTab.svelte";
  import {
    PathTabIcon,
    FieldTabIcon,
    TableTabIcon,
    ZapIcon,
    CodeIcon,
    DocumentIcon,
    StatsIcon,
    LockIcon,
  } from "./components/icons";

  // Register default tabs; callable so plugin reloads can restore baseline tabs
  export const registerDefaultControlTabs = () => {
    tabRegistryModule.register({
      id: "path",
      label: "Paths",
      component: PathTab,
      order: 0,
      iconComponent: PathTabIcon,
    });
    tabRegistryModule.register({
      id: "field",
      label: "Field",
      component: FieldTab,
      order: 1,
      iconComponent: FieldTabIcon,
    });
    tabRegistryModule.register({
      id: "table",
      label: "Table",
      component: TableTab,
      order: 2,
      iconComponent: TableTabIcon,
    });
    tabRegistryModule.register({
      id: "telemetry",
      label: "Telemetry",
      component: TelemetryTab,
      order: 3,
      iconComponent: ZapIcon,
    });
    tabRegistryModule.register({
      id: "code",
      label: "Code",
      component: CodeTab,
      order: 3,
      iconComponent: CodeIcon,
    });
  };

  // Ensure defaults are present for initial render
  registerDefaultControlTabs();
</script>

<script lang="ts">
  import { run } from "svelte/legacy";

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
  import { calculatePathTime, getShortcutFromSettings } from "../utils";
  import { tabRegistry, timelineTransformerRegistry } from "./registries";
  import { diffMode } from "./diffStore";
  import { actionRegistry } from "./actionRegistry";

  export const robotLength: number = 16; // Can be removed?
  export const robotWidth: number = 16; // Can be removed?
  export const resetPlaybackSpeed = undefined as unknown as () => void;

  export const resetAnimation = undefined as unknown as () => void;

  // Optimization Interface
  let tabInstances: Record<string, any> = $state({});

  function getOptimizationController() {
    return tabInstances["field"] || activeTabInstance;
  }

  function focusOptimizationTab() {
    activeTab = "field";
  }

  export async function openAndStartOptimization() {
    focusOptimizationTab();
    const optimizerController = getOptimizationController();
    if (optimizerController && optimizerController.openAndStartOptimization) {
      return await optimizerController.openAndStartOptimization();
    }
  }

  export function stopOptimization() {
    focusOptimizationTab();
    const optimizerController = getOptimizationController();
    if (optimizerController && optimizerController.stopOptimization) {
      optimizerController.stopOptimization();
    }
  }

  export function applyOptimization() {
    focusOptimizationTab();
    const optimizerController = getOptimizationController();
    if (optimizerController && optimizerController.applyOptimization) {
      optimizerController.applyOptimization();
    }
  }

  export function discardOptimization() {
    focusOptimizationTab();
    const optimizerController = getOptimizationController();
    if (optimizerController && optimizerController.discardOptimization) {
      optimizerController.discardOptimization();
    }
  }

  export function retryOptimization() {
    focusOptimizationTab();
    const optimizerController = getOptimizationController();
    if (optimizerController && optimizerController.retryOptimization) {
      optimizerController.retryOptimization();
    }
  }

  export function copyCode() {
    if (activeTabInstance && activeTabInstance.copyCode) {
      activeTabInstance.copyCode();
    }
  }

  export function downloadJava() {
    if (activeTabInstance && activeTabInstance.downloadJava) {
      activeTabInstance.downloadJava();
    }
  }

  export function copyTable() {
    if (activeTabInstance && activeTabInstance.copyTable) {
      activeTabInstance.copyTable();
    }
  }

  export function getOptimizationStatus() {
    const optimizerController = getOptimizationController();
    if (optimizerController && optimizerController.getOptimizationStatus) {
      return optimizerController.getOptimizationStatus();
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

  function handleMarkerChange(e: CustomEvent) {
    const { id, percent } = e.detail;
    if (!timePrediction || timePrediction.totalTime <= 0) return;

    const globalTime = (percent / 100) * timePrediction.totalTime;

    // Find segment in timeline
    const timeline = timePrediction.timeline;
    let targetEvent: any = null;

    for (let i = 0; i < timeline.length; i++) {
      const ev = timeline[i];
      if (globalTime >= ev.startTime && globalTime <= ev.endTime) {
        targetEvent = ev;
        break;
      }
    }

    if (!targetEvent) {
      // Clamping logic: if < 0, first event; if > total, last event
      if (globalTime < 0 && timeline.length > 0) targetEvent = timeline[0];
      else if (globalTime > timePrediction.totalTime && timeline.length > 0)
        targetEvent = timeline[timeline.length - 1];
    }

    if (!targetEvent) return;

    // Determine target segment (line or wait)
    let targetLine: Line | null = null;
    let targetWait: any | null = null; // wait or rotate

    if (targetEvent.type === "travel") {
      targetLine =
        (targetEvent as any).line ||
        lines[(targetEvent as any).lineIndex as number];
    } else if (targetEvent.type === "wait") {
      // Find wait/rotate in sequence
      const waitId = (targetEvent as any).waitId;
      if (waitId) {
        const item = sequence.find((s) => (s as any).id === waitId);
        if (item) targetWait = item;
      }
    }

    // Determine local position (0-1)
    let localPos = 0;
    if (targetEvent.duration > 0) {
      if (targetLine && targetEvent.motionProfile) {
        const profile = targetEvent.motionProfile as number[];
        const steps = profile.length - 1;
        const relTime = globalTime - targetEvent.startTime;

        // Find i such that profile[i] <= relTime < profile[i+1]
        let stepIndex = -1;
        for (let i = 0; i < steps; i++) {
          if (relTime >= profile[i] && relTime <= profile[i + 1]) {
            stepIndex = i;
            // Interpolate
            const t0 = profile[i];
            const t1 = profile[i + 1];
            const ratio = (relTime - t0) / (t1 - t0);
            localPos = (i + ratio) / steps;
            break;
          }
        }
        if (stepIndex === -1) {
          if (relTime <= 0) localPos = 0;
          else localPos = 1;
        }
      } else {
        // Fallback: linear mapping
        localPos = (globalTime - targetEvent.startTime) / targetEvent.duration;
      }
    }
    localPos = Math.max(0, Math.min(1, localPos));

    // Now update the marker
    // 1. Find the marker in the old location
    let found = false;
    let oldMarker: any = null;

    // Check lines
    for (const l of lines) {
      if (l.eventMarkers) {
        const idx = l.eventMarkers.findIndex((m) => m.id === id);
        if (idx !== -1) {
          oldMarker = l.eventMarkers[idx];
          l.eventMarkers.splice(idx, 1);
          found = true;
          lines = [...lines]; // Reactivity
          break;
        }
      }
    }

    // Check sequence (waits/rotates)
    if (!found) {
      for (const s of sequence) {
        if ((s.kind === "wait" || s.kind === "rotate") && s.eventMarkers) {
          const idx = s.eventMarkers.findIndex((m: any) => m.id === id);
          if (idx !== -1) {
            oldMarker = s.eventMarkers[idx];
            s.eventMarkers.splice(idx, 1);
            found = true;
            sequence = [...sequence]; // Reactivity
            break;
          }
        }
      }
    }

    if (found && oldMarker) {
      // Update properties
      oldMarker.position = localPos;
      // Remove old association fields
      delete oldMarker.lineIndex;
      delete oldMarker.waitId;
      delete oldMarker.rotateId;

      // Add to new parent
      if (targetLine) {
        if (!targetLine.eventMarkers) targetLine.eventMarkers = [];
        targetLine.eventMarkers.push(oldMarker);
        // lineIndex is optional but good for internal consistency if used
        oldMarker.lineIndex = lines.findIndex((l) => l.id === targetLine!.id);
        lines = [...lines];
      } else if (targetWait) {
        if (!targetWait.eventMarkers) targetWait.eventMarkers = [];
        targetWait.eventMarkers.push(oldMarker);
        if (targetWait.kind === "wait") oldMarker.waitId = targetWait.id;
        if (targetWait.kind === "rotate") oldMarker.rotateId = targetWait.id;
        sequence = [...sequence];
      }

      recordChange();
    }
  }

  function handleMarkerAction(e: CustomEvent) {
    const { id, action } = e.detail;
    if (action === "delete") {
      let found = false;

      // Check lines
      for (const l of lines) {
        if (l.eventMarkers) {
          const idx = l.eventMarkers.findIndex((m) => m.id === id);
          if (idx !== -1) {
            l.eventMarkers.splice(idx, 1);
            found = true;
            lines = [...lines]; // Reactivity
            break;
          }
        }
      }

      // Check sequence (waits/rotates)
      if (!found) {
        for (const s of sequence) {
          if ((s.kind === "wait" || s.kind === "rotate") && s.eventMarkers) {
            const idx = s.eventMarkers.findIndex((m: any) => m.id === id);
            if (idx !== -1) {
              s.eventMarkers.splice(idx, 1);
              found = true;
              sequence = [...sequence]; // Reactivity
              break;
            }
          }
        }
      }

      if (found) {
        recordChange("Delete Marker");
      }
    }
  }

  import { isBrowser } from "../utils/platform";
  interface Props {
    percent: number;
    playing: boolean;
    play: () => any;
    pause: () => any;
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    robotXY: BasePoint;
    robotHeading: number;
    settings: Settings;
    handleSeek: (percent: number) => void;
    loopAnimation: boolean;
    playbackSpeed?: number;
    splitPath?: () => void;
    setPlaybackSpeed: (factor: number, autoPlay?: boolean) => void;
    totalSeconds?: number;
    shapes: Shape[];
    recordChange: (action?: string) => void;
    onPreviewChange?: ((lines: Line[] | null) => void) | null;
    statsOpen?: boolean;
    activeTab?: string;
  }

  let {
    percent = $bindable(),
    playing = $bindable(),
    play,
    pause,
    startPoint = $bindable(),
    lines = $bindable(),
    sequence = $bindable(),
    robotXY = $bindable(),
    robotHeading = $bindable(),
    settings = $bindable(),
    handleSeek,
    loopAnimation = $bindable(),
    playbackSpeed = 1.0,
    splitPath = () => {},
    setPlaybackSpeed,
    totalSeconds = 0,
    shapes = $bindable(),
    recordChange,
    onPreviewChange = null,
    statsOpen = $bindable(false),
    activeTab = $bindable("path"),
  }: Props = $props();
  let isOnline = $state(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  // If code tab is active but setting is disabled, switch to path
  run(() => {
    if (activeTab === "code" && settings && settings.autoExportCode === false) {
      activeTab = "path";
    }
  });
  // collapse telemetry tab if user disabled it
  run(() => {
    if (
      activeTab === "telemetry" &&
      settings &&
      settings.showTelemetryTab === false
    ) {
      activeTab = "path";
    }
  });
  let activeTabInstance = $derived(tabInstances[activeTab]);
  // Compute timeline markers for the UI (passed to PlaybackControls)
  let timePrediction = $derived(
    calculatePathTime(startPoint, lines, settings, sequence),
  );
  let timelineItems = $derived(
    (() => {
      const items: {
        type: "marker" | "wait" | "rotate" | "dot" | "macro";
        percent: number;
        durationPercent?: number;
        color?: string;
        name: string;
        explicit?: boolean;
        fromWait?: boolean;
        id?: string;
        parentId?: string;
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
          let itemName = ev.name || "Wait";

          if (ev.waitId) {
            const seqItem = sequence.find((s) => (s as any).id === ev.waitId);
            if (seqItem) {
              const def = actionRegistry.get(seqItem.kind);
              if (def?.isRotate) {
                isRotate = true;
                explicit = true;
                itemName = "Rotate";
              } else if (def?.isWait) {
                isRotate = false;
                explicit = true;
                itemName = "Wait";
              }
            }
          }
          if (
            !isRotate &&
            Math.abs((ev.startHeading || 0) - (ev.targetHeading || 0)) > 1.0
          ) {
            isRotate = true;
            explicit = false;
            itemName = "Rotate";
          }

          items.push({
            type: isRotate ? "rotate" : "wait",
            percent: startPct,
            durationPercent: durPct,
            name: ev.name || itemName,
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
                id: m.id,
                parentId: line.id,
              });
            });
          }
        }
      });

      timeline.forEach((ev) => {
        if (ev.type === "wait" && ev.waitId) {
          const seqItem = sequence.find((s) => (s as any).id === ev.waitId);
          const def = seqItem ? actionRegistry.get(seqItem.kind) : null;
          if (
            seqItem &&
            (seqItem.kind === "wait" || seqItem.kind === "rotate") &&
            seqItem.eventMarkers
          ) {
            seqItem.eventMarkers.forEach((m: any) => {
              const timeOffset = ev.duration * m.position;
              const absTime = ev.startTime + timeOffset;
              items.push({
                type: "marker",
                percent: toPct(absTime),
                fromWait: true,
                name: m.name,
                id: m.id,
                parentId: seqItem.id,
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
    })(),
  );
  // Use the registry for tabs
  let currentTab = $derived(
    $tabRegistry.find((t) => t.id === activeTab) || $tabRegistry[0],
  );
  let shouldShowTelemetry = $derived(
    settings?.showTelemetryTab && !(isBrowser && isOnline),
  );
</script>

<svelte:window
  ononline={() => (isOnline = true)}
  onoffline={() => (isOnline = false)}
/>

<div
  class="flex-1 flex flex-col justify-start items-center gap-2 h-full relative"
>
  {#if $diffMode}
    <div class="w-full px-4 pt-4 flex-none z-10">
      <div
        class="bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200 px-4 py-3 rounded-xl border border-purple-200 dark:border-purple-800 flex items-center justify-between"
      >
        <span class="font-semibold flex items-center gap-2">
          <DocumentIcon className="size-5" />
          Diff View
        </span>
      </div>
    </div>
    <div class="flex-1 w-full overflow-y-auto overflow-x-hidden relative">
      <DiffTab {settings} />
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
          {#if (tab.id !== "code" || (!isBrowser && settings?.autoExportCode)) && (tab.id !== "telemetry" || shouldShowTelemetry)}
            <button
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="{tab.id}-panel"
              id="{tab.id}-tab"
              class="flex-1 min-w-[80px] px-3 py-2 text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 flex items-center justify-center gap-2 {activeTab ===
              tab.id
                ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-white ring-1 ring-black/5 dark:ring-white/5'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-50/50 dark:hover:bg-neutral-700/50'}"
              onclick={() => (activeTab = tab.id)}
            >
              {#if tab.icon}
                {@html tab.icon}
              {:else if tab.iconComponent}
                <tab.iconComponent className="size-4" />
              {/if}
              {tab.label}
            </button>
          {/if}
        {/each}
      </div>
      <button
        id="stats-btn"
        onclick={() => (statsOpen = !statsOpen)}
        class="flex-none flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-200 gap-2 shadow-sm"
        title={`Path Statistics${getShortcutFromSettings(settings, "toggle-stats")}`}
        aria-label="View path statistics"
      >
        <StatsIcon className="size-4" />
        Stats
      </button>
      <button
        id="lock-btn"
        onclick={() => {
          settings.lockFieldView = !settings.lockFieldView;
          settings = { ...settings };
          if (settings.lockFieldView) {
            import("../stores").then(({ fieldZoom, fieldPan }) => {
              fieldZoom.set(1.0);
              fieldPan.set({ x: 0, y: 0 });
            });
          }
        }}
        class="flex-none flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 gap-2 shadow-sm {settings.lockFieldView ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800' : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-200'}"
        title={settings.lockFieldView ? "Unlock Field View" : "Lock Field View"}
        aria-label={settings.lockFieldView ? "Unlock Field View" : "Lock Field View"}
      >
        <LockIcon className="size-4 {settings.lockFieldView ? '' : 'opacity-50'}" />
        Lock
      </button>
    </div>

    <div
      class="flex flex-col justify-start items-start w-full overflow-y-auto overflow-x-hidden flex-1 min-h-0 relative scroll-smooth"
      class:pb-20={activeTab !== "code"}
      class:pb-0={activeTab === "code"}
      role="tabpanel"
      id="{activeTab}-panel"
      aria-labelledby="{activeTab}-tab"
    >
      {#each $tabRegistry as tab (tab.id)}
        {#if (tab.id !== "code" || (!isBrowser && settings?.autoExportCode)) && (tab.id !== "telemetry" || shouldShowTelemetry)}
          <div class:hidden={activeTab !== tab.id} class="w-full h-full">
            <tab.component
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
        {/if}
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
      {totalSeconds}
      {settings}
      {splitPath}
      on:markerChange={handleMarkerChange}
      on:markerAction={handleMarkerAction}
    />
  </div>
</div>
