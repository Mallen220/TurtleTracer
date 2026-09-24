<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { tick } from "svelte";
  import { makeId } from "../../utils/nameGenerator";
  import type {
    Line,
    SequenceItem,
    EventMarker,
    TimePrediction,
    TimelineEvent,
  } from "../../types";
  import TrashIcon from "./icons/TrashIcon.svelte";
  import ZapIcon from "./icons/ZapIcon.svelte";
  import SectionHeader from "./common/SectionHeader.svelte";
  import EmptyState from "./common/EmptyState.svelte";
  import { hoveredMarkerId, diskEventNamesStore } from "../../stores";
  import { DotIcon } from "./icons";
  import SearchableDropdown from "./common/SearchableDropdown.svelte";
  import {
    findClosestT,
    getCurvePoint,
    interpolateTFromProfile,
  } from "../../utils/math";
  import { startPointStore } from "../projectStore";

  interface Props {
    sequence: SequenceItem[];
    lines: Line[];
    collapsedMarkers: boolean;
    timePrediction?: TimePrediction | null;
  }

  let {
    sequence = $bindable(),
    lines = $bindable(),
    collapsedMarkers = $bindable(),
    timePrediction,
  }: Props = $props();

  // Waits and rotates both own markers the same way.
  type Step = SequenceItem & { id: string; eventMarkers?: EventMarker[] };

  /**
   * A marker as listed here: every marker in the project, in the order it
   * fires. Its position is "step index + position within that step".
   */
  interface GlobalMarker {
    id: string;
    originalId: string;
    name: string;
    globalPosition: number;
    globalTime: number; // ms
    parentType: "path" | "wait" | "rotate";
    parentId: string;
    parentIndex: number;
    parentName: string;
    ref: EventMarker;
    segmentStartTime?: number; // ms
    segmentEndTime?: number; // ms
  }

  const roundToHundredth = (v: number) => Math.round(v * 100) / 100;

  const lineStart = (idx: number) =>
    idx === 0 ? $startPointStore : lines[idx - 1].endPoint;

  const curveOf = (idx: number) => [
    lineStart(idx),
    ...(lines[idx].controlPoints || []),
    lines[idx].endPoint,
  ];

  /** Sequence indexes of the items markers can be attached to (not macros). */
  function markerOwnerIndexes(seq: SequenceItem[]): number[] {
    return seq.flatMap((item, index) => (item.kind === "macro" ? [] : [index]));
  }

  /** Adds a marker to a line, pointing it at that line. */
  function attachToLine(line: Line, marker: EventMarker) {
    const { waitId: _w, rotateId: _r, ...rest } = marker;
    line.eventMarkers = [
      ...(line.eventMarkers ?? []),
      { ...rest, lineIndex: lines.findIndex((l) => l.id === line.id) },
    ];
    lines = [...lines];
  }

  /** Adds a marker to a wait or rotate step, pointing it at that step. */
  function attachToStep(step: Step, marker: EventMarker) {
    const { waitId: _w, rotateId: _r, lineIndex: _l, ...rest } = marker;
    const owner =
      step.kind === "wait" ? { waitId: step.id } : { rotateId: step.id };
    step.eventMarkers = [...(step.eventMarkers ?? []), { ...rest, ...owner }];
    sequence = [...sequence];
  }

  function attachToItem(item: SequenceItem, marker: EventMarker) {
    if (item.kind === "path") {
      const line = lines.find((l) => l.id === item.lineId);
      if (line) attachToLine(line, marker);
    } else if (item.kind === "wait" || item.kind === "rotate") {
      attachToStep(item, marker);
    }
  }

  function removeMarkerById(markerId: string): boolean {
    for (const owner of [...lines, ...(sequence as Step[])]) {
      const markers = owner.eventMarkers;
      if (!markers?.some((m) => m.id === markerId)) continue;
      owner.eventMarkers = markers.filter((m) => m.id !== markerId);
      if ("endPoint" in owner) lines = [...lines];
      else sequence = [...sequence];
      return true;
    }
    return false;
  }

  function removeMarker(marker: GlobalMarker) {
    return removeMarkerById(marker.originalId);
  }

  function notifyChanged(marker: GlobalMarker) {
    if (marker.parentType === "path") lines = [...lines];
    else sequence = [...sequence];
  }

  // --- Pose markers: position on the path ---

  /** How far along its line (0..1) a pose marker's point is closest to. */
  function getAutoPoseGuess(marker: GlobalMarker) {
    if (marker.parentType !== "path") return 0.5;
    const idx = lines.findIndex((l) => l.id === marker.parentId);
    if (idx === -1) return 0.5;
    return findClosestT(
      { x: marker.ref.poseX ?? 0, y: marker.ref.poseY ?? 0 },
      curveOf(idx),
    );
  }

  /** The pose marker's position as a fraction of its whole chain. */
  function getGlobalPoseGuess(marker: GlobalMarker) {
    const localT = marker.ref.poseGuess ?? getAutoPoseGuess(marker);
    if (marker.parentType !== "path") return localT;
    const idx = lines.findIndex((l) => l.id === marker.parentId);
    if (idx === -1) return localT;

    let root = idx;
    while (root > 0 && lines[root].isChain) root--;
    let end = root + 1;
    while (end < lines.length && lines[end].isChain) end++;
    return (idx - root + localT) / (end - root);
  }

  /** "Line index + t" for a pose marker, e.g. 2.5 is halfway along line 3. */
  function getParametricIndexDisplay(marker: GlobalMarker) {
    if (marker.parentType !== "path") return 0;
    const localT = marker.ref.poseGuess ?? getAutoPoseGuess(marker);
    const idx = lines.findIndex((l) => l.id === marker.parentId);
    return (idx === -1 ? marker.parentIndex : idx) + localT;
  }

  /** Moves a pose marker to "line index + t", possibly onto another line. */
  function updateMarkerFromParametricIndex(
    marker: GlobalMarker,
    value: number,
  ) {
    if (marker.parentType !== "path") return;

    const idx = Math.max(0, Math.min(lines.length - 1, Math.floor(value)));
    const t = Math.max(0, Math.min(1, value - Math.floor(value)));
    const pt = getCurvePoint(t, curveOf(idx));
    marker.ref.poseGuess = t;
    marker.ref.poseX = roundToHundredth(pt.x);
    marker.ref.poseY = roundToHundredth(pt.y);

    const newLine = lines[idx];
    if (newLine.id !== marker.parentId && removeMarker(marker)) {
      newLine.eventMarkers = [...(newLine.eventMarkers ?? []), marker.ref];
    }
    lines = [...lines];
  }

  // --- The combined marker list ---

  // Start and end time (ms) of every path, wait and rotate, by id. Rotates
  // appear in the timeline as "wait" events.
  let segmentTimesMap = $derived.by(() => {
    const map = new Map<string, { start: number; end: number }>();
    for (const ev of timePrediction?.timeline ?? []) {
      const id =
        ev.type === "travel"
          ? ev.line?.id
          : ev.type === "wait"
            ? ev.waitId
            : undefined;
      if (id)
        map.set(id, { start: ev.startTime * 1000, end: ev.endTime * 1000 });
    }
    return map;
  });

  // While a slider is being dragged, keep the list in the order it had when
  // the drag started so rows don't jump around under the mouse.
  let draggingMarkerId: string | null = $state(null);
  let cachedSortedMarkers: GlobalMarker[] = [];

  function getAllMarkers(
    seq: SequenceItem[],
    linesList: Line[],
    draggingId: string | null,
    timesMap: Map<string, { start: number; end: number }>,
  ): GlobalMarker[] {
    const markers: GlobalMarker[] = [];
    let ownerIndex = 0;

    seq.forEach((item, index) => {
      if (item.kind === "macro") return;

      let owner: { id?: string; eventMarkers?: EventMarker[] } | undefined;
      let parentType: GlobalMarker["parentType"];
      let parentName: string;
      if (item.kind === "path") {
        const line = linesList.find((l) => l.id === item.lineId);
        owner = line;
        parentType = "path";
        parentName = line?.name || `Path ${index + 1}`;
      } else {
        owner = item;
        parentType = item.kind;
        parentName =
          item.name ||
          `${item.kind === "wait" ? "Wait" : "Rotate"} ${index + 1}`;
      }

      const times = owner?.id ? timesMap.get(owner.id) : undefined;
      for (const m of owner?.eventMarkers ?? []) {
        markers.push({
          id: m.id,
          originalId: m.id,
          name: m.name,
          globalPosition: ownerIndex + m.position,
          globalTime:
            m.type === "temporal"
              ? (m.endTime ?? m.time ?? 0)
              : times
                ? times.start + m.position * (times.end - times.start)
                : 0,
          parentType,
          parentId: owner!.id!,
          parentIndex: index,
          parentName,
          ref: m,
          segmentStartTime: times?.start,
          segmentEndTime: times?.end,
        });
      }
      ownerIndex++;
    });

    markers.sort((a, b) => a.globalPosition - b.globalPosition);
    if (!draggingId || cachedSortedMarkers.length === 0) return markers;

    const order = new Map(cachedSortedMarkers.map((m, i) => [m.id, i]));
    const rank = (m: GlobalMarker) => order.get(m.id) ?? Infinity;
    return markers.sort((a, b) => rank(a) - rank(b));
  }

  function addMarker() {
    // New markers go on the last step that can have markers.
    const target = sequence[markerOwnerIndexes(sequence).at(-1) ?? -1];
    if (!target) return;
    attachToItem(target, {
      id: makeId("event"),
      name: "",
      type: "parametric",
      position: 0.5,
      time: 500,
      endTime: 500,
      poseX: 72,
      poseY: 72,
      poseHeading: 0,
      poseGuess: undefined,
    });
  }

  /**
   * Moves a marker to a global position (step index + position within the
   * step), which may move it to a different step.
   */
  function updateMarkerPosition(
    marker: GlobalMarker,
    value: number,
    clampLocal: boolean,
  ) {
    const owners = markerOwnerIndexes(sequence);
    const clamped = Math.max(0, Math.min(owners.length, value));
    let ownerIdx = Math.floor(clamped);
    let localPos = clamped - ownerIdx;
    if (ownerIdx >= owners.length) {
      ownerIdx = owners.length - 1;
      localPos = 1;
    }

    const seqIndex = owners[ownerIdx];
    if (seqIndex === marker.parentIndex) {
      marker.ref.position = clampLocal
        ? Math.max(0, Math.min(1, localPos))
        : localPos;
      notifyChanged(marker);
    } else {
      removeMarker(marker);
      attachToItem(sequence[seqIndex], { ...marker.ref, position: localPos });
    }
  }

  /**
   * The timeline event a time (in seconds) falls in. Markers belong on paths
   * where possible, so the nearest path is preferred when the time lands on
   * something else.
   */
  function findEventForTime(timeline: TimelineEvent[], seconds: number) {
    let event = timeline.find(
      (ev) => seconds >= ev.startTime && seconds <= ev.endTime,
    );
    if (event?.type !== "travel") {
      const travel = timeline.filter((e) => e.type === "travel");
      const distance = (e: TimelineEvent) =>
        Math.min(
          Math.abs(seconds - e.startTime),
          Math.abs(seconds - e.endTime),
        );
      const nearest = travel.reduce<TimelineEvent | undefined>(
        (best, e) => (!best || distance(e) < distance(best) ? e : best),
        undefined,
      );
      event = nearest ?? event;
    }
    return event ?? (seconds < 0 ? timeline[0] : timeline.at(-1));
  }

  /** Moves a marker to a time (ms), which may move it to a different step. */
  function updateMarkerTime(marker: GlobalMarker, newTimeMs: number) {
    const timeline = timePrediction?.timeline;
    if (!timeline || !timePrediction || timePrediction.totalTime <= 0) {
      marker.ref.endTime = marker.ref.time = newTimeMs;
      notifyChanged(marker);
      return;
    }

    const seconds = newTimeMs / 1000;
    const event = findEventForTime(timeline, seconds);
    if (!event) return;

    const targetLine =
      event.type === "travel"
        ? (event.line ?? lines[event.lineIndex ?? -1])
        : undefined;
    const targetStep =
      event.type === "wait"
        ? (sequence.find((s) => (s as Step).id === event.waitId) as
            | Step
            | undefined)
        : undefined;

    let localPos = 0;
    if (event.duration > 0) {
      const relative = seconds - event.startTime;
      localPos =
        targetLine && event.motionProfile
          ? interpolateTFromProfile(relative, event.motionProfile)
          : relative / event.duration;
    }
    localPos = Math.max(0, Math.min(1, localPos));

    const sameParent =
      (targetLine &&
        marker.parentType === "path" &&
        targetLine.id === marker.parentId) ||
      (targetStep &&
        marker.parentType !== "path" &&
        targetStep.id === marker.parentId);

    if (sameParent) {
      marker.ref.endTime = marker.ref.time = newTimeMs;
      marker.ref.position = localPos;
      notifyChanged(marker);
      return;
    }

    const moved = {
      ...marker.ref,
      endTime: newTimeMs,
      time: newTimeMs,
      position: localPos,
    };
    removeMarker(marker);
    if (targetLine) attachToLine(targetLine, moved);
    else if (targetStep) attachToStep(targetStep, moved);
  }

  // Sliders call *Input while dragging and *Commit when released.
  function startDragging(marker: GlobalMarker) {
    if (draggingMarkerId) return;
    draggingMarkerId = marker.id;
    cachedSortedMarkers = [...allMarkers];
  }

  function stopDragging() {
    draggingMarkerId = null;
    cachedSortedMarkers = [];
  }

  const latest = (marker: GlobalMarker) =>
    allMarkers.find((m) => m.id === marker.id) ?? marker;

  function handleGlobalPositionInput(marker: GlobalMarker, value: number) {
    startDragging(marker);
    updateMarkerPosition(latest(marker), value, false);
  }

  function handleGlobalPositionCommit(marker: GlobalMarker, value: number) {
    stopDragging();
    updateMarkerPosition(latest(marker), value, true);
  }

  function handleGlobalTimeInput(marker: GlobalMarker, value: number) {
    startDragging(marker);
    updateMarkerTime(latest(marker), value);
  }

  function handleGlobalTimeCommit(marker: GlobalMarker, value: number) {
    stopDragging();
    updateMarkerTime(latest(marker), value);
  }

  export async function scrollToMarker(markerId: string) {
    if (collapsedMarkers) {
      collapsedMarkers = false;
      await tick();
    }
    document
      .getElementById(`global-marker-${markerId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  let allMarkers = $derived(
    getAllMarkers(sequence, lines, draggingMarkerId, segmentTimesMap),
  );

  // Event names used here or in other project files, for autocomplete.
  let availableEvents = $derived(
    [
      ...new Set(
        [...$diskEventNamesStore, ...allMarkers.map((m) => m.name)].filter(
          (n) => n?.trim(),
        ),
      ),
    ].sort(),
  );
  let nonMacroCount = $derived(
    sequence.filter((s) => s.kind !== "macro").length,
  );
</script>

<div
  class="flex flex-col w-full border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800"
>
  <SectionHeader
    title="Event Markers"
    bind:collapsed={collapsedMarkers}
    count={allMarkers.length}
    onAdd={addMarker}
  />

  {#if !collapsedMarkers}
    <div class="p-2 flex flex-col gap-2">
      {#if allMarkers.length === 0}
        <EmptyState
          title="No event markers"
          description="Click + to add an event marker at the end of the sequence."
          compact={true}
        >
          {#snippet icon()}
            <div>
              <ZapIcon className="size-6 text-neutral-400" strokeWidth={1.5} />
            </div>
          {/snippet}
        </EmptyState>
      {:else}
        {#each allMarkers as marker (marker.id)}
          <div
            role="group"
            id={`global-marker-${marker.id}`}
            class="flex flex-col p-2 border border-purple-200 dark:border-purple-800 rounded-md bg-purple-50/50 dark:bg-purple-900/10 gap-2"
            onmouseenter={() => hoveredMarkerId.set(marker.id)}
            onmouseleave={() => hoveredMarkerId.set(null)}
          >
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 flex-1">
                  <div
                    class="w-2 h-2 rounded-full bg-purple-500 shrink-0"
                  ></div>
                  <SearchableDropdown
                    value={marker.ref.name}
                    options={availableEvents}
                    placeholder="Search or add new..."
                    onchange={(val) => {
                      marker.ref.name = val;
                      if (marker.parentType === "path") lines = [...lines];
                      else sequence = [...sequence];
                    }}
                  />
                </div>
                <button
                  class="text-neutral-400 hover:text-red-500 transition-colors"
                  onclick={() => removeMarker(marker)}
                  title="Remove Marker"
                  aria-label="Remove Marker"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>

              <div class="flex items-center gap-2">
                <span class="text-xs text-neutral-500">Type:</span>
                <select
                  class="rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs py-1 px-2 flex-1"
                  value={marker.ref.type || "parametric"}
                  onchange={(e) => {
                    marker.ref.type = e.currentTarget.value as any;
                    if (marker.parentType === "path") lines = [...lines];
                    else sequence = [...sequence];
                  }}
                >
                  <option value="parametric">Parametric</option>
                  <option value="temporal">Temporal</option>
                  <option value="pose">Pose</option>
                </select>
              </div>
            </div>

            <div
              class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400"
            >
              <span
                class="truncate max-w-[100px] font-mono"
                title={marker.parentName}>{marker.parentName}</span
              >
              <DotIcon className="-mx-1 opacity-40 shrink-0" />
              {#if marker.ref.type === "temporal"}
                <span>Global Time: {Math.round(marker.globalTime)}ms</span>
              {:else if marker.ref.type === "pose"}
                <span
                  >Global Index: {getParametricIndexDisplay(marker).toFixed(
                    3,
                  )}</span
                >
              {:else}
                <span>Global Index: {marker.globalPosition.toFixed(2)}</span>
              {/if}
            </div>

            {#if !marker.ref.type || marker.ref.type === "parametric"}
              <div class="flex items-center gap-2">
                <input
                  type="range"
                  aria-label="Position for {marker.ref.name}"
                  min="0"
                  max={nonMacroCount}
                  step="0.01"
                  value={marker.globalPosition}
                  class="flex-1 slider accent-purple-500"
                  oninput={(e) =>
                    handleGlobalPositionInput(
                      marker,
                      Number.parseFloat(e.currentTarget.value),
                    )}
                  onchange={(e) =>
                    handleGlobalPositionCommit(
                      marker,
                      Number.parseFloat(e.currentTarget.value),
                    )}
                />
                <input
                  type="number"
                  aria-label="Position value for {marker.ref.name}"
                  min="0"
                  max={nonMacroCount}
                  step="0.01"
                  value={Number.parseFloat(marker.globalPosition.toFixed(2))}
                  class="w-16 px-1 py-0.5 text-xs rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-center"
                  onchange={(e) =>
                    handleGlobalPositionCommit(
                      marker,
                      Number.parseFloat(e.currentTarget.value),
                    )}
                />
              </div>
            {:else if marker.ref.type === "temporal"}
              <div class="flex flex-col gap-1 mt-1">
                {#if marker.segmentStartTime !== undefined}
                  <div
                    class="flex justify-between items-center text-[10px] text-neutral-400 px-1"
                  >
                    <span
                      >Time after Start: {Math.round(
                        marker.globalTime - marker.segmentStartTime,
                      )}ms</span
                    >
                    <span
                      >Segment End: {Math.round(
                        marker.segmentEndTime ?? 0,
                      )}ms</span
                    >
                  </div>
                {/if}
                <div class="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={(timePrediction?.totalTime ?? 10) * 1000}
                    step="1"
                    value={marker.ref.endTime ?? marker.ref.time ?? 500}
                    class="flex-1 slider accent-purple-500"
                    oninput={(e) =>
                      handleGlobalTimeInput(
                        marker,
                        Number.parseFloat(e.currentTarget.value),
                      )}
                    onchange={(e) =>
                      handleGlobalTimeCommit(
                        marker,
                        Number.parseFloat(e.currentTarget.value),
                      )}
                  />
                  <input
                    type="number"
                    value={marker.ref.endTime ?? marker.ref.time ?? 500}
                    aria-label="Event time in milliseconds"
                    min="0"
                    step="1"
                    class="w-20 px-1 py-0.5 text-xs rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-center"
                    onchange={(e) =>
                      handleGlobalTimeCommit(
                        marker,
                        Number.parseFloat(e.currentTarget.value),
                      )}
                  />
                </div>
              </div>
            {:else if marker.ref.type === "pose"}
              <div class="grid grid-cols-2 gap-2 mt-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-neutral-500 w-3">X:</span>
                  <input
                    type="number"
                    value={(marker.ref.poseX ?? 0).toFixed(2)}
                    step="0.01"
                    class="flex-1 px-1 py-0.5 text-xs rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700"
                    onchange={(e) => {
                      const val = Number.parseFloat(e.currentTarget.value);
                      marker.ref.poseX = Math.round(val * 100) / 100;
                      if (marker.parentType === "path") lines = [...lines];
                      else sequence = [...sequence];
                    }}
                  />
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-neutral-500 w-3">Y:</span>
                  <input
                    type="number"
                    value={(marker.ref.poseY ?? 0).toFixed(2)}
                    step="0.01"
                    class="flex-1 px-1 py-0.5 text-xs rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700"
                    onchange={(e) => {
                      const val = Number.parseFloat(e.currentTarget.value);
                      marker.ref.poseY = Math.round(val * 100) / 100;
                      if (marker.parentType === "path") lines = [...lines];
                      else sequence = [...sequence];
                    }}
                  />
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class="text-xs text-neutral-500 w-3 shrink-0"
                    title="Parametric Guess (Local: {(
                      marker.ref.poseGuess ?? getAutoPoseGuess(marker)
                    ).toFixed(3)}, Global: {getGlobalPoseGuess(marker).toFixed(
                      3,
                    )})"
                  >
                    G:
                  </span>
                  <input
                    type="number"
                    value={marker.ref.poseGuess === undefined
                      ? ""
                      : getParametricIndexDisplay(marker).toFixed(3)}
                    placeholder={getParametricIndexDisplay(marker).toFixed(3)}
                    min="0"
                    max={lines.length.toString()}
                    step="0.001"
                    class="flex-1 px-1 py-0.5 text-xs rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700"
                    oninput={(e) => {
                      const val = e.currentTarget.value;
                      if (val === "") {
                        marker.ref.poseGuess = undefined;
                      } else {
                        updateMarkerFromParametricIndex(
                          marker,
                          Number.parseFloat(val),
                        );
                      }
                      if (marker.parentType === "path") lines = [...lines];
                      else sequence = [...sequence];
                    }}
                  />
                </div>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
