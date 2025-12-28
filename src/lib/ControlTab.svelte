<script lang="ts">
  import type {
    Point,
    Line,
    BasePoint,
    Settings,
    Shape,
    SequenceItem,
  } from "../types";
  import _ from "lodash";
  import { getRandomColor } from "../utils";
  import ObstaclesSection from "./components/ObstaclesSection.svelte";
  import RobotPositionDisplay from "./components/RobotPositionDisplay.svelte";
  import StartingPointSection from "./components/StartingPointSection.svelte";
  import PathLineSection from "./components/PathLineSection.svelte";
  import PlaybackControls from "./components/PlaybackControls.svelte";
  import WaitRow from "./components/WaitRow.svelte";
  import WaitMarkersSection from "./components/WaitMarkersSection.svelte";
  import WaypointTable from "./components/WaypointTable.svelte";
  import { calculatePathTime } from "../utils";
  import { selectedLineId, selectedPointId } from "../stores";

  export let percent: number;
  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let robotWidth: number = 16;
  export let robotHeight: number = 16;
  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
  export let settings: Settings;
  export let handleSeek: (percent: number) => void;
  export let loopAnimation: boolean;
  export let playbackSpeed: number = 1.0;
  export let changePlaybackSpeedBy: (delta: number) => void;
  export let resetPlaybackSpeed: () => void;
  export let setPlaybackSpeed: (factor: number, autoPlay?: boolean) => void;

  export let shapes: Shape[];
  export let recordChange: () => void;
  export let onPreviewChange: ((lines: Line[] | null) => void) | null = null;

  let optimizationOpen = false;
  let waypointTableRef: any = null;

  export function openAndStartOptimization() {
    if (waypointTableRef && waypointTableRef.openAndStartOptimization) {
      return waypointTableRef.openAndStartOptimization();
    }
    optimizationOpen = true;
    return;
  }

  export function stopOptimization() {
    if (waypointTableRef && waypointTableRef.stopOptimization) {
      waypointTableRef.stopOptimization();
    }
  }

  export function applyOptimization() {
    if (waypointTableRef && waypointTableRef.applyOptimization) {
      waypointTableRef.applyOptimization();
    }
  }

  export function discardOptimization() {
    if (waypointTableRef && waypointTableRef.discardOptimization) {
      waypointTableRef.discardOptimization();
    }
  }

  export function retryOptimization() {
    if (waypointTableRef && waypointTableRef.retryOptimization) {
      waypointTableRef.retryOptimization();
    }
  }

  export function getOptimizationStatus() {
    if (waypointTableRef && waypointTableRef.getOptimizationStatus) {
      return waypointTableRef.getOptimizationStatus();
    }
    return {
      isOpen: optimizationOpen,
      isRunning: false,
      optimizedLines: null,
      optimizationFailed: false,
    };
  }

  export let activeTab: "path" | "field" | "table" = "path";

  // Reference exported but unused props to silence Svelte unused-export warnings
  $: robotWidth;
  $: robotHeight;

  // Compute timeline markers for the UI (start of each travel segment)
  $: timePrediction = calculatePathTime(startPoint, lines, settings, sequence);
  $: markers = (() => {
    const _markers: { percent: number; color: string; name: string }[] = [];
    if (
      !timePrediction ||
      !timePrediction.timeline ||
      timePrediction.totalTime <= 0
    )
      return _markers;

    timePrediction.timeline.forEach((ev) => {
      if ((ev as any).type === "travel") {
        const start = (ev as any).startTime as number;
        const pct = (start / timePrediction.totalTime) * 100;
        const lineIndex = (ev as any).lineIndex as number;
        const line = lines[lineIndex];
        const color = line?.color || "#ffffff";
        const name = line?.name || `Path ${lineIndex + 1}`;
        _markers.push({ percent: pct, color, name });
      }
    });

    return _markers;
  })();

  let collapsedEventMarkers: boolean[] = lines.map(() => false);

  // State for collapsed sections
  let collapsedSections = {
    obstacles: shapes.map(() => true),
    lines: lines.map(() => false),
    controlPoints: lines.map(() => true), // Start with control points collapsed
  };

  // Debug helpers (kept simple so template expressions stay small)
  $: debugLinesIds = Array.isArray(lines) ? lines.map((l) => l.id) : [];
  $: debugSequenceIds = Array.isArray(sequence)
    ? sequence.filter((s) => s.kind === "path").map((s: any) => s.lineId)
    : [];
  $: debugMissing = debugLinesIds.filter(
    (id) => !debugSequenceIds.includes(id),
  );
  $: debugInvalidRefs = debugSequenceIds.filter(
    (id) => !debugLinesIds.includes(id),
  );

  // One-time repair flag in case sequence misses lines (keeps Paths view consistent)
  let repairedSequenceOnce = false;

  // If any sequence entries reference unknown lines or lines are missing from sequence,
  // fix the sequence once to keep UI consistent. This removes invalid path refs and
  // appends any real lines that are missing.
  $: if (
    Array.isArray(lines) &&
    Array.isArray(sequence) &&
    !repairedSequenceOnce
  ) {
    const lineIds = new Set(lines.map((l) => l.id));

    // Remove sequence entries that reference non-existent lines
    const pruned = sequence.filter(
      (s) => s.kind !== "path" || lineIds.has((s as any).lineId),
    );

    // Find any existing lines not present in sequence (append them)
    const presentIds = new Set(
      pruned.filter((s) => s.kind === "path").map((s) => (s as any).lineId),
    );
    const missing = lines.filter((l) => !presentIds.has(l.id));

    if (missing.length || pruned.length !== sequence.length) {
      if (missing.length) {
        console.warn(
          "[ControlTab] appending missing sequence items:",
          missing.map((m) => m.id),
        );
      }
      if (pruned.length !== sequence.length) {
        console.warn("[ControlTab] removing invalid sequence items");
      }

      sequence = [
        ...pruned,
        ...missing.map((l) => ({ kind: "path", lineId: l.id })),
      ];
      repairedSequenceOnce = true;
      recordChange?.();
    }
  }

  // Reactive statements to update UI state when lines or shapes change from file load
  $: if (lines.length !== collapsedSections.lines.length) {
    collapsedEventMarkers = lines.map(() => false);
    // Determine whether current sections are all collapsed (without referencing reactive `allCollapsed` to avoid cycles)
    const wasAllCollapsed =
      collapsedSections &&
      collapsedSections.lines &&
      collapsedSections.lines.length > 0 &&
      collapsedSections.lines.every((v) => v === true);
    collapsedSections = {
      obstacles: shapes.map(() => true),
      // If sections were all collapsed, new lines should start collapsed
      lines: lines.map(() => (wasAllCollapsed ? true : false)),
      controlPoints: lines.map(() => true),
    };
  }

  // Respond to global toggle collapse all trigger from hotkey
  import { toggleCollapseAllTrigger } from "../stores";
  let _lastToggleCollapse = $toggleCollapseAllTrigger;
  $: if ($toggleCollapseAllTrigger !== _lastToggleCollapse) {
    _lastToggleCollapse = $toggleCollapseAllTrigger;
    toggleCollapseAll();
  }

  $: if (shapes.length !== collapsedSections.obstacles.length) {
    collapsedSections.obstacles = shapes.map(() => true);
  }

  const makeId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Ensure default named paths are renumbered to match the displayed order when
  // new paths are inserted at the beginning/middle/end of the list.
  function renumberDefaultPathNames() {
    const renamed = lines.map((l, idx) => {
      if (!l.name || /^Path \d+$/.test(l.name)) {
        return { ...l, name: `Path ${idx + 1}` };
      }
      return l;
    });
    lines = renamed;
  }

  function getWait(i: any) {
    return i as any;
  }

  function insertLineAfter(seqIndex: number) {
    const seqItem = sequence[seqIndex];
    if (!seqItem || seqItem.kind !== "path") return;
    const lineIndex = lines.findIndex((l) => l.id === seqItem.lineId);
    const currentLine = lines[lineIndex];

    // Calculate a new point offset from the current line's end point
    let newPoint: Point;
    if (currentLine.endPoint.heading === "linear") {
      newPoint = {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "linear",
        startDeg: currentLine.endPoint.startDeg,
        endDeg: currentLine.endPoint.endDeg,
      };
    } else if (currentLine.endPoint.heading === "constant") {
      newPoint = {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "constant",
        degrees: currentLine.endPoint.degrees,
      };
    } else {
      newPoint = {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "tangential",
        reverse: currentLine.endPoint.reverse,
      };
    }

    // Create a new line that starts where the current line ends
    const newLine = {
      id: makeId(),
      endPoint: newPoint,
      controlPoints: [],
      color: getRandomColor(),
      name: `Path ${lines.length + 1}`,
      eventMarkers: [],
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Insert the new line after the current one and a sequence item after current seq index
    const newLines = [...lines];
    newLines.splice(lineIndex + 1, 0, newLine);
    lines = newLines;

    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;

    collapsedSections.lines.splice(
      lineIndex + 1,
      0,
      allCollapsed ? true : false,
    );
    collapsedSections.controlPoints.splice(lineIndex + 1, 0, true);
    collapsedEventMarkers.splice(lineIndex + 1, 0, false);

    // Force reactivity
    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
  }

  function removeLine(idx: number) {
    // Protect against deleting the last remaining path
    if (lines.length <= 1) return;

    const removedId = lines[idx]?.id;
    // Remove the line from lines array
    const newLines = [...lines];
    newLines.splice(idx, 1);
    lines = newLines;

    // If we removed a line, remove its path entry but preserve waits that follow it
    if (removedId) {
      sequence = sequence.filter(
        (item) => !(item.kind === "path" && item.lineId === removedId),
      );

      // Clear selection if the removed line was selected
      if ($selectedLineId === removedId) selectedLineId.set(null);
    }

    collapsedSections.lines.splice(idx, 1);
    collapsedSections.controlPoints.splice(idx, 1);
    collapsedEventMarkers.splice(idx, 1);
    recordChange();
  }

  function addLine() {
    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: {
        x: _.random(0, 144),
        y: _.random(0, 144),
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };
    lines = [...lines, newLine];
    sequence = [...sequence, { kind: "path", lineId: newLine.id! }];
    collapsedSections.lines.push(allCollapsed ? true : false);
    collapsedSections.controlPoints.push(true);
    // Select the newly created line and its endpoint
    selectedLineId.set(newLine.id!);
    const newIndex = lines.findIndex((l) => l.id === newLine.id!);
    selectedPointId.set(`point-${newIndex + 1}-0`);
    recordChange();
  }

  // Collapse all UI sections (lines, control points, event markers, obstacles)
  function collapseAll() {
    collapsedSections.lines = lines.map(() => true);
    collapsedSections.controlPoints = lines.map(() => true);
    collapsedEventMarkers = lines.map(() => true);
    collapsedSections.obstacles = shapes.map(() => true);
    // Force reactivity
    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
  }

  // Expand all UI sections
  function expandAll() {
    collapsedSections.lines = lines.map(() => false);
    collapsedSections.controlPoints = lines.map(() => false);
    collapsedEventMarkers = lines.map(() => false);
    collapsedSections.obstacles = shapes.map(() => false);
    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
  }

  // Toggle collapse/expand all depending on current state
  $: allCollapsed =
    collapsedSections.lines.length > 0 &&
    collapsedSections.lines.every((v) => v) &&
    collapsedSections.controlPoints.every((v) => v) &&
    collapsedEventMarkers.every((v) => v) &&
    collapsedSections.obstacles.every((v) => v);

  function toggleCollapseAll() {
    if (allCollapsed) expandAll();
    else collapseAll();
  }

  function addWait() {
    const wait = {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 1000,
      locked: false,
    } as SequenceItem;
    sequence = [...sequence, wait];

    // Select newly created wait
    selectedPointId.set(`wait-${wait.id}`);
    selectedLineId.set(null);
    recordChange();
  }

  function addWaitAtStart() {
    const wait = {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 1000,
      locked: false,
    } as SequenceItem;
    sequence = [wait, ...sequence];

    // Select newly created wait
    selectedPointId.set(`wait-${wait.id}`);
    selectedLineId.set(null);
    recordChange();
  }

  function addPathAtStart() {
    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: {
        x: _.random(0, 144),
        y: _.random(0, 144),
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      eventMarkers: [],
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };
    lines = [newLine, ...lines];
    // Renumber default path names to match new ordering
    renumberDefaultPathNames();
    sequence = [{ kind: "path", lineId: newLine.id! }, ...sequence];
    collapsedSections.lines = [
      allCollapsed ? true : false,
      ...collapsedSections.lines,
    ];
    collapsedSections.controlPoints = [
      true,
      ...collapsedSections.controlPoints,
    ];
    collapsedEventMarkers = [
      allCollapsed ? true : false,
      ...collapsedEventMarkers,
    ];
    // Select the new starting path
    selectedLineId.set(newLine.id!);
    recordChange();
  }

  function handleOptimizationApply(newLines: Line[]) {
    lines = newLines;
    recordChange?.();
  }

  function insertWaitAfter(seqIndex: number) {
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, {
      kind: "wait",
      id: makeId(),
      name: "Wait",
      durationMs: 0,
      locked: false,
    });
    sequence = newSeq;
  }

  function insertPathAfter(seqIndex: number) {
    // Create a new line with default settings
    const newLine: Line = {
      id: makeId(),
      name: `Path ${lines.length + 1}`,
      endPoint: {
        x: _.random(36, 108),
        y: _.random(36, 108),
        heading: "tangential",
        reverse: false,
      },
      controlPoints: [],
      color: getRandomColor(),
      eventMarkers: [],
      waitBeforeMs: 0,
      waitAfterMs: 0,
      waitBeforeName: "",
      waitAfterName: "",
    };

    // Add the new line to the lines array
    lines = [...lines, newLine];
    // Renumber default path names now that the order will be reflected by sequence
    renumberDefaultPathNames();

    // Insert the new path in the sequence after the wait
    const newSeq = [...sequence];
    newSeq.splice(seqIndex + 1, 0, { kind: "path", lineId: newLine.id! });
    sequence = newSeq;

    // Add UI state for the new line (respect collapse-all)
    collapsedSections.lines.push(allCollapsed ? true : false);
    collapsedSections.controlPoints.push(true);
    collapsedEventMarkers.push(false);

    // Force reactivity
    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
    recordChange();
  }

  function syncLinesToSequence(newSeq: SequenceItem[]) {
    const pathOrder = newSeq
      .filter((item) => item.kind === "path")
      .map((item) => item.lineId);

    const indexedLines = lines.map((line, idx) => ({
      line,
      collapsed: collapsedSections.lines[idx],
      control: collapsedSections.controlPoints[idx],
      markers: collapsedEventMarkers[idx],
    }));

    const byId = new Map(indexedLines.map((entry) => [entry.line.id, entry]));
    const reordered: typeof indexedLines = [];

    pathOrder.forEach((id) => {
      const entry = byId.get(id);
      if (entry) {
        reordered.push(entry);
        byId.delete(id);
      }
    });

    // Append any lines that are not currently in the sequence to preserve data
    reordered.push(...byId.values());

    lines = reordered.map((entry) => entry.line);
    // Re-number default names after reordering so Path 1..N matches current order
    const renamed = lines.map((l, idx) => {
      if (!l.name || /^Path \d+$/.test(l.name))
        return { ...l, name: `Path ${idx + 1}` };
      return l;
    });
    lines = renamed;

    collapsedSections = {
      ...collapsedSections,
      lines: reordered.map((entry) => entry.collapsed ?? false),
      controlPoints: reordered.map((entry) => entry.control ?? true),
    };
    collapsedEventMarkers = reordered.map((entry) => entry.markers ?? false);
  }

  function moveSequenceItem(seqIndex: number, delta: number) {
    const targetIndex = seqIndex + delta;
    if (targetIndex < 0 || targetIndex >= sequence.length) return;

    // Prevent moving if either the source or target is a locked path or a locked wait
    const isLockedSequenceItem = (index: number) => {
      const it = sequence[index];
      if (!it) return false;
      if (it.kind === "path") {
        const ln = lines.find((l) => l.id === it.lineId);
        return ln?.locked ?? false;
      }
      // wait
      if (it.kind === "wait") {
        return (it as any).locked ?? false;
      }
      return false;
    };

    if (isLockedSequenceItem(seqIndex) || isLockedSequenceItem(targetIndex))
      return;

    const newSeq = [...sequence];
    const [item] = newSeq.splice(seqIndex, 1);
    newSeq.splice(targetIndex, 0, item);
    sequence = newSeq;

    syncLinesToSequence(newSeq);
    recordChange?.();
  }
</script>

<div class="flex-1 flex flex-col justify-start items-center gap-2 h-full">
  <!-- Tab Switcher -->
  <div class="w-full px-4 pt-2">
    <div
      class="flex flex-row w-full bg-neutral-200 dark:bg-neutral-800 rounded-lg p-1 gap-1"
      role="tablist"
      aria-label="Editor View Selection"
    >
      <button
        role="tab"
        aria-selected={activeTab === "path"}
        aria-controls="path-panel"
        id="path-tab"
        class="flex-1 px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 {activeTab ===
        'path'
          ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-white'
          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
        on:click={() => (activeTab = "path")}
      >
        Paths
      </button>
      <button
        role="tab"
        aria-selected={activeTab === "field"}
        aria-controls="field-panel"
        id="field-tab"
        class="flex-1 px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 {activeTab ===
        'field'
          ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-white'
          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
        on:click={() => (activeTab = "field")}
      >
        Field & Tools
      </button>
      <button
        role="tab"
        aria-selected={activeTab === "table"}
        aria-controls="table-panel"
        id="table-tab"
        class="flex-1 px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 {activeTab ===
        'table'
          ? 'bg-white dark:bg-neutral-700 shadow-sm text-neutral-900 dark:text-white'
          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
        on:click={() => (activeTab = "table")}
      >
        Table
      </button>
    </div>
  </div>

  <div
    class="flex flex-col justify-start items-start w-full rounded-lg bg-neutral-50 dark:bg-neutral-900 shadow-md p-4 overflow-y-auto overflow-x-hidden h-full gap-6"
    role="tabpanel"
    id={activeTab === "path"
      ? "path-panel"
      : activeTab === "field"
        ? "field-panel"
        : "table-panel"}
    aria-labelledby={activeTab === "path"
      ? "path-tab"
      : activeTab === "field"
        ? "field-tab"
        : "table-tab"}
  >
    {#if activeTab === "table"}
      <WaypointTable
        bind:this={waypointTableRef}
        bind:startPoint
        bind:lines
        bind:sequence
        {recordChange}
        onToggleOptimization={() => (optimizationOpen = !optimizationOpen)}
        {optimizationOpen}
        {handleOptimizationApply}
        {onPreviewChange}
        bind:shapes
        bind:collapsedObstacles={collapsedSections.obstacles}
        {settings}
      />
    {/if}

    {#if activeTab === "field"}
      <RobotPositionDisplay
        {robotXY}
        {robotHeading}
        {x}
        {y}
        onToggleOptimization={() => (optimizationOpen = !optimizationOpen)}
      />

      <ObstaclesSection
        bind:shapes
        bind:collapsedObstacles={collapsedSections.obstacles}
      />
    {/if}

    {#if activeTab === "path"}
      <div class="flex items-center justify-between gap-4 w-full mb-2">
        <StartingPointSection
          bind:startPoint
          {addPathAtStart}
          {addWaitAtStart}
          {toggleCollapseAll}
          {allCollapsed}
        />
      </div>

      {#if settings?.showDebugSequence}
        <div class="p-2 text-xs text-neutral-500">
          <div>
            <strong>DEBUG (ControlTab)</strong> — lines: {lines.length},
            sequence: {(sequence || []).length}
          </div>
          <div>
            Missing: {JSON.stringify(debugMissing)}
          </div>
          <div>
            Invalid refs: {JSON.stringify(debugInvalidRefs)}
          </div>
        </div>
      {/if}

      <!-- Unified sequence render: paths and waits -->
      {#each sequence as item, sIdx}
        <div class="w-full">
          {#if item.kind === "path"}
            {#each lines.filter((l) => l.id === item.lineId) as ln (ln.id)}
              <PathLineSection
                bind:line={ln}
                idx={lines.findIndex((l) => l.id === ln.id)}
                bind:lines
                bind:collapsed={
                  collapsedSections.lines[
                    lines.findIndex((l) => l.id === ln.id)
                  ]
                }
                bind:collapsedEventMarkers={
                  collapsedEventMarkers[lines.findIndex((l) => l.id === ln.id)]
                }
                bind:collapsedControlPoints={
                  collapsedSections.controlPoints[
                    lines.findIndex((l) => l.id === ln.id)
                  ]
                }
                onRemove={() =>
                  removeLine(lines.findIndex((l) => l.id === ln.id))}
                onInsertAfter={() => insertLineAfter(sIdx)}
                onAddWaitAfter={() => insertWaitAfter(sIdx)}
                onMoveUp={() => moveSequenceItem(sIdx, -1)}
                onMoveDown={() => moveSequenceItem(sIdx, 1)}
                canMoveUp={sIdx !== 0}
                canMoveDown={sIdx !== sequence.length - 1}
                {recordChange}
              />
            {/each}
          {:else}
            <WaitRow
              id={getWait(item).id}
              name={getWait(item).name}
              durationMs={getWait(item).durationMs}
              locked={getWait(item).locked ?? false}
              onToggleLock={() => {
                const newSeq = [...sequence];
                newSeq[sIdx] = {
                  ...getWait(item),
                  locked: !(getWait(item).locked ?? false),
                };
                sequence = newSeq;
                recordChange?.();
              }}
              onChange={(newName, newDuration) => {
                const newSeq = [...sequence];
                newSeq[sIdx] = {
                  ...getWait(item),
                  name: newName,
                  durationMs: Math.max(0, Number(newDuration) || 0),
                };
                sequence = newSeq;
              }}
              onRemove={() => {
                const newSeq = [...sequence];
                newSeq.splice(sIdx, 1);
                sequence = newSeq;
              }}
              onInsertAfter={() => {
                const newSeq = [...sequence];
                newSeq.splice(sIdx + 1, 0, {
                  kind: "wait",
                  id: makeId(),
                  name: "Wait",
                  durationMs: 0,
                  locked: false,
                });
                sequence = newSeq;
              }}
              onAddPathAfter={() => insertPathAfter(sIdx)}
              onMoveUp={() => moveSequenceItem(sIdx, -1)}
              onMoveDown={() => moveSequenceItem(sIdx, 1)}
              canMoveUp={sIdx !== 0}
              canMoveDown={sIdx !== sequence.length - 1}
            />
            <WaitMarkersSection wait={getWait(item)} />
          {/if}
        </div>
      {/each}

      <!-- Add Line Button -->
      <div class="flex flex-row items-center gap-4">
        <button
          on:click={addLine}
          class="font-semibold text-green-500 text-sm flex flex-row justify-start items-center gap-1 hover:text-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 rounded px-1"
          aria-label="Add new path segment"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          <p>Add Path</p>
        </button>

        <button
          on:click={addWait}
          class="font-semibold text-amber-500 text-sm flex flex-row justify-start items-center gap-1 hover:text-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 rounded px-1"
          aria-label="Add wait command"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-5"
          >
            <circle cx="12" cy="12" r="9" />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 7v5l3 2"
            />
          </svg>
          <p>Add Wait</p>
        </button>
      </div>
    {/if}
  </div>

  <PlaybackControls
    bind:playing
    {play}
    {pause}
    bind:percent
    {handleSeek}
    bind:loopAnimation
    {markers}
    {playbackSpeed}
    {changePlaybackSpeedBy}
    {resetPlaybackSpeed}
    {setPlaybackSpeed}
  />
</div>
