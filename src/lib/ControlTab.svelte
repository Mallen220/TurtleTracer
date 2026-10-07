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
  import type {
    Point,
    Line,
    BasePoint,
    EventMarker,
    Settings,
    Shape,
    SequenceItem,
  } from "../types/index";
  import { interpolateTFromProfile, timeAtProfileT } from "../utils/math";
  import { tick } from "svelte";
  import PlaybackControls from "./components/PlaybackControls.svelte";
  import { getShortcutFromSettings } from "../utils";
  import { timePredictionStore } from "./projectStore";
  import { tabRegistry, timelineTransformerRegistry } from "./registries";
  import { diffMode } from "./diffStore";

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
    return await optimizerController?.openAndStartOptimization?.();
  }

  export function stopOptimization() {
    focusOptimizationTab();
    const optimizerController = getOptimizationController();
    optimizerController?.stopOptimization?.();
  }

  export function applyOptimization() {
    focusOptimizationTab();
    const optimizerController = getOptimizationController();
    optimizerController?.applyOptimization?.();
  }

  export function discardOptimization() {
    focusOptimizationTab();
    const optimizerController = getOptimizationController();
    optimizerController?.discardOptimization?.();
  }

  export function retryOptimization() {
    focusOptimizationTab();
    const optimizerController = getOptimizationController();
    optimizerController?.retryOptimization?.();
  }

  export function copyCode() {
    activeTabInstance?.copyCode?.();
  }

  export function downloadJava() {
    activeTabInstance?.downloadJava?.();
  }

  export function copyTable() {
    activeTabInstance?.copyTable?.();
  }

  export function getOptimizationStatus() {
    const optimizerController = getOptimizationController();
    if (optimizerController?.getOptimizationStatus) {
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
    tabInstances["path"]?.addPathAtStart?.();
  }

  export function addWaitAtStart() {
    tabInstances["path"]?.addWaitAtStart?.();
  }

  export function addRotateAtStart() {
    tabInstances["path"]?.addRotateAtStart?.();
  }

  export function moveSequenceItem(seqIndex: number, delta: number) {
    tabInstances["path"]?.moveSequenceItem?.(seqIndex, delta);
  }

  export function toggleCollapseSelected() {
    activeTabInstance?.toggleCollapseSelected?.();
  }

  export async function scrollToItem(type: string, id: string) {
    if (type === "path" || type === "wait" || type === "rotate") {
      activeTab = "path";
      await tick();
      tabInstances["path"]?.scrollToItem?.(id);
    } else if (type === "event") {
      activeTab = "field";
      await tick();
      tabInstances["field"]?.scrollToMarker?.(id);
    }
  }

  type Step = Extract<SequenceItem, { kind: "wait" | "rotate" }>;

  const stepWithId = (id: string | undefined): Step | undefined =>
    id
      ? (sequence.find(
          (s) => (s.kind === "wait" || s.kind === "rotate") && s.id === id,
        ) as Step | undefined)
      : undefined;

  /** Removes the marker from whichever path or step has it, and returns it. */
  function takeMarker(id: string): EventMarker | null {
    for (const owner of [
      ...lines,
      ...sequence.filter(
        (s): s is Step => s.kind !== "path" && s.kind !== "macro",
      ),
    ]) {
      const idx = owner.eventMarkers?.findIndex((m) => m.id === id) ?? -1;
      if (idx !== -1) return owner.eventMarkers!.splice(idx, 1)[0];
    }
    return null;
  }

  /** Moves a marker dragged on the timeline to whatever runs at that time. */
  function handleMarkerChange({
    id,
    percent,
  }: {
    id: string;
    percent: number;
  }) {
    if (!timePrediction || timePrediction.totalTime <= 0) return;
    const { timeline, totalTime } = timePrediction;
    const time = (percent / 100) * totalTime;

    const event =
      timeline.find((ev) => time >= ev.startTime && time <= ev.endTime) ??
      (time < 0 ? timeline[0] : time > totalTime ? timeline.at(-1) : undefined);
    if (!event) return;

    const targetLine =
      event.type === "travel"
        ? (event.line ?? lines[event.lineIndex ?? -1])
        : undefined;
    const targetStep =
      event.type === "wait" ? stepWithId(event.waitId) : undefined;
    // Automatic turns have no sequence item to hold a marker.
    if (!targetLine && !targetStep) return;

    // Where along the path or step (0 to 1) the marker now sits.
    let position = 0;
    if (event.duration > 0) {
      const relativeTime = time - event.startTime;
      position =
        targetLine && event.motionProfile
          ? interpolateTFromProfile(relativeTime, event.motionProfile)
          : relativeTime / event.duration;
    }
    position = Math.max(0, Math.min(1, position));

    const marker = takeMarker(id);
    if (!marker) return;

    marker.position = position;
    if (marker.type === "temporal") {
      marker.endTime = time * 1000;
      marker.time = marker.endTime; // older files read `time`
    }
    delete marker.lineIndex;
    delete marker.waitId;
    delete marker.rotateId;

    if (targetLine) {
      targetLine.eventMarkers = [...(targetLine.eventMarkers ?? []), marker];
      marker.lineIndex = lines.findIndex((l) => l.id === targetLine.id);
    } else if (targetStep) {
      targetStep.eventMarkers = [...(targetStep.eventMarkers ?? []), marker];
      if (targetStep.kind === "wait") marker.waitId = targetStep.id;
      else marker.rotateId = targetStep.id;
    }
    lines = [...lines];
    sequence = [...sequence];
    recordChange();
  }

  function handleMarkerAction({ id, action }: { id: string; action: string }) {
    if (action !== "delete" || !takeMarker(id)) return;
    lines = [...lines];
    sequence = [...sequence];
    recordChange("Delete Marker");
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
    playbackSpeed = 1,
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
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  // If code tab is active but setting is disabled, switch to path
  $effect(() => {
    if (activeTab === "code" && settings?.autoExportCode === false) {
      activeTab = "path";
    }
  });
  // collapse telemetry tab if user disabled it
  $effect(() => {
    if (activeTab === "telemetry" && settings?.showTelemetryTab === false) {
      activeTab = "path";
    }
  });
  let activeTabInstance = $derived(tabInstances[activeTab]);
  // Compute timeline markers for the UI (passed to PlaybackControls)
  let timePrediction = $derived($timePredictionStore);
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
          const line = ev.line ?? lines[lineIndex];
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

          const step = stepWithId(ev.waitId);
          if (step) {
            isRotate = step.kind === "rotate";
            explicit = true;
            itemName = isRotate ? "Rotate" : "Wait";
          }
          if (
            !isRotate &&
            Math.abs((ev.startHeading || 0) - (ev.targetHeading || 0)) > 1
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
          const line = ev.line ?? lines[ev.lineIndex ?? -1];
          if (line?.eventMarkers) {
            line.eventMarkers.forEach((m) => {
              // A path handed over early (or joined part way along) has parts
              // the robot doesn't drive; markers there happen at the nearest end.
              const timeOffset = Math.max(
                0,
                Math.min(
                  ev.duration,
                  ev.motionProfile
                    ? timeAtProfileT(m.position, ev.motionProfile)
                    : ev.duration * m.position,
                ),
              );
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
        if (ev.type === "wait") {
          const seqItem = stepWithId(ev.waitId);
          if (seqItem?.eventMarkers) {
            seqItem.eventMarkers.forEach((m) => {
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
        class="flex-1 flex flex-row bg-neutral-200/60 dark:bg-neutral-800/60 p-1.5 gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-x-auto"
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
                : 'text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-50/50 dark:hover:bg-neutral-700/50'}"
              onclick={() => (activeTab = tab.id)}
            >
              {#if tab.icon}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
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
      >
        <StatsIcon className="size-4" />
        Stats
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
              {timePrediction}
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
      onmarkerChange={handleMarkerChange}
      onmarkerAction={handleMarkerAction}
    />
  </div>
</div>
