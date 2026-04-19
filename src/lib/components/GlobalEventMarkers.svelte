<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    Line,
    SequenceItem,
    SequenceWaitItem,
    EventMarker,
  } from "../../types";
  import { tick } from "svelte";
  import TrashIcon from "./icons/TrashIcon.svelte";
  import ZapIcon from "./icons/ZapIcon.svelte";
  import SectionHeader from "./common/SectionHeader.svelte";
  import EmptyState from "./common/EmptyState.svelte";
  import { hoveredMarkerId, diskEventNamesStore } from "../../stores";
  import SearchableDropdown from "./common/SearchableDropdown.svelte";
  import { actionRegistry } from "../actionRegistry";
  import { findClosestT, getCurvePoint } from "../../utils/math";
  import { startPointStore } from "../projectStore";

  function getParametricIndexDisplay(marker: GlobalMarker) {
    if (marker.parentType !== "path") return 0;
    const localT = marker.ref.poseGuess ?? getAutoPoseGuess(marker);
    const lIdx = lines.findIndex((l) => l.id === marker.parentId);
    return (lIdx !== -1 ? lIdx : marker.parentIndex) + localT;
  }

  function updateMarkerFromParametricIndex(marker: GlobalMarker, value: number) {
    if (marker.parentType !== "path") return;

    const finalIdx = Math.max(0, Math.min(lines.length - 1, Math.floor(value)));
    const finalT = Math.max(0, Math.min(1, value - Math.floor(value)));

    marker.ref.poseGuess = finalT;

    // Update X, Y position to match parametric index
    const prevPt =
      finalIdx === 0 ? $startPointStore : lines[finalIdx - 1].endPoint;
    const cps = [
      prevPt,
      ...(lines[finalIdx].controlPoints || []),
      lines[finalIdx].endPoint,
    ];
    const pt = getCurvePoint(finalT, cps);
    marker.ref.poseX = pt.x;
    marker.ref.poseY = pt.y;

    if (lines[finalIdx].id !== marker.parentId) {
      // Move marker to new parent line
      const oldLine = lines.find((l) => l.id === marker.parentId);
      const newLine = lines[finalIdx];

      if (oldLine) {
        const mIdx = oldLine.eventMarkers.findIndex(
          (ev) => ev.id === marker.originalId,
        );
        if (mIdx !== -1) {
          const m = oldLine.eventMarkers.splice(mIdx, 1)[0];
          oldLine.eventMarkers = [...oldLine.eventMarkers];

          if (!newLine.eventMarkers) newLine.eventMarkers = [];
          newLine.eventMarkers.push(m);
          newLine.eventMarkers = [...newLine.eventMarkers];
        }
      }
    }
    lines = [...lines];
  }

  function getAutoPoseGuess(marker: GlobalMarker) {
    if (marker.parentType !== "path") return 0.5;
    const lIdx = lines.findIndex((l) => l.id === marker.parentId);
    if (lIdx === -1) return 0.5;
    const line = lines[lIdx];

    // Find previous point for Bezier
    let prevPoint: any = $startPointStore;
    if (lIdx > 0) {
      prevPoint = lines[lIdx - 1].endPoint;
    }

    const cps = [prevPoint, ...line.controlPoints, line.endPoint];
    return findClosestT(
      { x: marker.ref.poseX ?? 0, y: marker.ref.poseY ?? 0 },
      cps,
    );
  }

  function getGlobalPoseGuess(marker: GlobalMarker) {
    const localT = marker.ref.poseGuess ?? getAutoPoseGuess(marker);
    if (marker.parentType !== "path") return localT;

    const lIdx = lines.findIndex((l) => l.id === marker.parentId);
    if (lIdx === -1) return localT;

    // Find chain root and count
    let rootIdx = lIdx;
    while (rootIdx > 0 && lines[rootIdx].isChain) {
      rootIdx--;
    }

    let totalInChain = 1;
    for (let i = rootIdx + 1; i < lines.length; i++) {
      if (lines[i].isChain) totalInChain++;
      else break;
    }

    const localIdx = lIdx - rootIdx;
    return (localIdx + localT) / totalInChain;
  }

  interface Props {
    sequence: SequenceItem[];
    lines: Line[];
    collapsedMarkers: boolean;
    timePrediction?: any;
  }

  let {
    sequence = $bindable(),
    lines = $bindable(),
    collapsedMarkers = $bindable(),
    timePrediction,
  }: Props = $props();

  interface GlobalMarker {
    id: string;
    originalId: string;
    name: string;
    globalPosition: number;
    globalTime: number; // in ms
    parentType: "path" | "wait" | "rotate";
    parentId: string;
    parentIndex: number;
    parentName: string;
    ref: EventMarker;
    segmentStartTime?: number; // in ms
    segmentEndTime?: number; // in ms
  }

  // Keep track of dragging marker to prevent re-sorting while dragging
  let draggingMarkerId: string | null = $state(null);
  let cachedSortedMarkers: GlobalMarker[] = [];

  // Helper to build a mapping of marker index to sequence index
  function getSequenceMapping(seq: SequenceItem[]): {
    map: number[];
    count: number;
  } {
    const map: number[] = [];
    seq.forEach((item, index) => {
      const def = actionRegistry.get(item.kind);
      if (!def?.isMacro) {
        map.push(index);
      }
    });
    return { map, count: map.length };
  }
 
  let segmentTimesMap = $derived.by(() => {
    const map = new Map<string, { start: number; end: number }>();
    if (timePrediction?.timeline) {
      timePrediction.timeline.forEach((ev: any) => {
        let id: string | undefined;
        if (ev.type === "travel") id = ev.line?.id;
        else if (ev.type === "wait") id = ev.waitId;
        else if (ev.type === "rotate") id = ev.rotateId;

        if (id) {
          map.set(id, {
            start: ev.startTime * 1000,
            end: ev.endTime * 1000,
          });
        }
      });
    }
    return map;
  });

  function getAllMarkers(
    seq: SequenceItem[],
    linesList: Line[],
    draggingId: string | null,
    timesMap: Map<string, { start: number; end: number }>,
  ): GlobalMarker[] {
    const markers: GlobalMarker[] = [];
    let markerIndex = 0;

    seq.forEach((item, index) => {
      const def = actionRegistry.get(item.kind);
      if (def?.isMacro) return; // Skip macros

      if (def?.isPath) {
        const line = linesList.find((l) => l.id === (item as any).lineId);
        if (line && line.eventMarkers) {
          const times = timesMap.get(line.id!);
          line.eventMarkers.forEach((m) => {
            const mTime = m.endTime ?? m.time ?? 0;
            markers.push({
              id: m.id,
              originalId: m.id,
              name: m.name,
              globalPosition: markerIndex + m.position,
              globalTime: m.type === "temporal" ? mTime : (times ? times.start + (m.position * (times.end - times.start)) : 0),
              parentType: "path",
              parentId: line.id!,
              parentIndex: index,
              parentName: line.name || `Path ${index + 1}`,
              ref: m,
              segmentStartTime: times?.start,
              segmentEndTime: times?.end,
            });
          });
        }
      } else if (def?.isWait || def?.isRotate) {
        const wait = item as any;
        if (wait.eventMarkers) {
          const times = timesMap.get(wait.id);
          wait.eventMarkers.forEach((m: EventMarker) => {
            const mTime = m.endTime ?? m.time ?? 0;
            markers.push({
              id: m.id,
              originalId: m.id,
              name: m.name,
              globalPosition: markerIndex + m.position,
              globalTime: m.type === "temporal" ? mTime : (times ? times.start + (m.position * (times.end - times.start)) : 0),
              parentType: def.isWait ? "wait" : "rotate",
              parentId: wait.id,
              parentIndex: index,
              parentName: wait.name || `${def.isWait ? "Wait" : "Rotate"} ${index + 1}`,
              ref: m,
              segmentStartTime: times?.start,
              segmentEndTime: times?.end,
            });
          });
        }
      }

      markerIndex++;
    });

    // Sort by global position
    const sorted = markers.sort((a, b) => a.globalPosition - b.globalPosition);

    if (draggingId) {
      if (cachedSortedMarkers.length === 0) return sorted; // Fallback

      // Map cached ID order to current marker data
      const idMap = new Map(sorted.map((m) => [m.id, m]));
      const result: GlobalMarker[] = [];

      // Use cached order
      cachedSortedMarkers.forEach((cached) => {
        const current = idMap.get(cached.id);
        if (current) {
          result.push(current);
          idMap.delete(cached.id);
        }
      });

      // Append any new markers that weren't in cache
      idMap.forEach((m) => result.push(m));

      return result;
    }

    return sorted;
  }

  function addMarker() {
    let targetIndex = 0;

    const { map, count } = getSequenceMapping(sequence);
    if (count === 0) return;

    // Default: Add to the last non-macro item in the sequence
    targetIndex = map[count - 1];

    const item = sequence[targetIndex];
    const def = actionRegistry.get(item.kind);

    const newMarker: EventMarker = {
      id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      name: "",
      type: "parametric",
      position: 0.5,
      time: 500,
      endTime: 500,
      poseX: 0,
      poseY: 0,
      poseHeading: 0,
      poseGuess: undefined,
    };

    if (def?.isPath) {
      const line = lines.find((l) => l.id === (item as any).lineId);
      if (line) {
        if (!line.eventMarkers) line.eventMarkers = [];
        newMarker.lineIndex = lines.findIndex((l) => l.id === line.id);
        line.eventMarkers = [...line.eventMarkers, newMarker];
        lines = [...lines];
      }
    } else if (def?.isWait) {
      const wait = item as SequenceWaitItem;
      if (!wait.eventMarkers) wait.eventMarkers = [];
      newMarker.waitId = wait.id;
      wait.eventMarkers = [...wait.eventMarkers, newMarker];
      sequence = [...sequence];
    } else if (def?.isRotate) {
      const rotate = item as any;
      if (!rotate.eventMarkers) rotate.eventMarkers = [];
      newMarker.rotateId = rotate.id;
      rotate.eventMarkers = [...rotate.eventMarkers, newMarker];
      sequence = [...sequence];
    }
  }

  function removeMarkerById(markerId: string) {
    // Search in lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.eventMarkers) {
        const initialLen = line.eventMarkers.length;
        line.eventMarkers = line.eventMarkers.filter((m) => m.id !== markerId);
        if (line.eventMarkers.length !== initialLen) {
          lines = [...lines];
          return true;
        }
      }
    }
    // Search in sequence
    for (let i = 0; i < sequence.length; i++) {
      const item = sequence[i] as any;
      if (item.eventMarkers) {
        const initialLen = item.eventMarkers.length;
        item.eventMarkers = item.eventMarkers.filter(
          (m: EventMarker) => m.id !== markerId,
        );
        if (item.eventMarkers.length !== initialLen) {
          sequence = [...sequence];
          return true;
        }
      }
    }
    return false;
  }

  function removeMarker(marker: GlobalMarker) {
    return removeMarkerById(marker.originalId);
  }

  function updateMarkerPosition(
    marker: GlobalMarker,
    newVal: number,
    clampLocal: boolean,
  ) {
    const { map, count } = getSequenceMapping(sequence);
    const max = count;

    if (newVal < 0) newVal = 0;
    if (newVal > max) newVal = max;

    let newMarkerIdx = Math.floor(newVal);
    let newLocalPos = newVal - newMarkerIdx;

    if (newMarkerIdx >= count) {
      newMarkerIdx = count - 1;
      newLocalPos = 1;
    }

    const newIndex = map[newMarkerIdx];

    if (newIndex === marker.parentIndex) {
      if (clampLocal) {
        if (newLocalPos < 0) newLocalPos = 0;
        if (newLocalPos > 1) newLocalPos = 1;
      }

      marker.ref.position = newLocalPos;
      if (marker.parentType === "path") lines = [...lines];
      else sequence = [...sequence];
    } else {
      removeMarker(marker);

      const newItem = sequence[newIndex];
      const newMarkerData = {
        ...marker.ref,
        position: newLocalPos,
      };

      const def = actionRegistry.get(newItem.kind);

      if (def?.isPath) {
        const line = lines.find((l) => l.id === (newItem as any).lineId);
        if (line) {
          if (!line.eventMarkers) line.eventMarkers = [];
          if (newMarkerData.waitId) delete newMarkerData.waitId;
          if (newMarkerData.rotateId) delete newMarkerData.rotateId;
          newMarkerData.lineIndex = lines.findIndex((l) => l.id === line.id);

          line.eventMarkers = [...line.eventMarkers, newMarkerData];
          lines = [...lines];
        }
      } else if (def?.isWait || def?.isRotate) {
        const item = newItem as any;
        if (!item.eventMarkers) item.eventMarkers = [];
        if (newMarkerData.lineIndex !== undefined) delete newMarkerData.lineIndex;
        if (def.isWait) {
          newMarkerData.waitId = item.id;
          delete newMarkerData.rotateId;
        } else {
          newMarkerData.rotateId = item.id;
          delete newMarkerData.waitId;
        }

        item.eventMarkers = [...item.eventMarkers, newMarkerData];
        sequence = [...sequence];
      }
    }
  }

  function updateMarkerTime(
    marker: GlobalMarker,
    newTimeMs: number,
    commit: boolean,
  ) {
    if (!timePrediction || timePrediction.totalTime <= 0) {
      marker.ref.endTime = newTimeMs;
      marker.ref.time = newTimeMs;
      if (marker.parentType === "path") lines = [...lines];
      else sequence = [...sequence];
      return;
    }

    const globalTime = newTimeMs / 1000;
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
      if (globalTime < 0 && timeline.length > 0) targetEvent = timeline[0];
      else if (globalTime > timePrediction.totalTime && timeline.length > 0)
        targetEvent = timeline[timeline.length - 1];
    }

    if (!targetEvent) return;

    let targetLine: Line | null = null;
    let targetWait: any | null = null;

    if (targetEvent.type === "travel") {
      targetLine = targetEvent.line || lines[targetEvent.lineIndex];
    } else if (targetEvent.type === "wait") {
      const waitId = targetEvent.waitId;
      if (waitId) {
        targetWait = sequence.find((s) => (s as any).id === waitId);
      }
    } else if (targetEvent.type === "rotate") {
      const rotateId = targetEvent.rotateId;
      if (rotateId) {
        targetWait = sequence.find((s) => (s as any).id === rotateId);
      }
    }

    let localPos = 0;
    if (targetEvent.duration > 0) {
      if (targetLine && targetEvent.motionProfile) {
        const profile = targetEvent.motionProfile;
        const steps = profile.length - 1;
        const relTime = globalTime - targetEvent.startTime;
        let stepIndex = -1;
        for (let i = 0; i < steps; i++) {
          if (relTime >= profile[i] && relTime <= profile[i + 1]) {
            stepIndex = i;
            const t0 = profile[i];
            const t1 = profile[i + 1];
            const ratio = (relTime - t0) / (t1 - t0);
            localPos = (i + ratio) / steps;
            break;
          }
        }
        if (stepIndex === -1) {
          localPos = relTime <= 0 ? 0 : 1;
        }
      } else {
        localPos = (globalTime - targetEvent.startTime) / targetEvent.duration;
      }
    }
    localPos = Math.max(0, Math.min(1, localPos));

    const isSameParent = 
      (targetLine && marker.parentType === "path" && targetLine.id === marker.parentId) ||
      (targetWait && (marker.parentType === "wait" || marker.parentType === "rotate") && targetWait.id === marker.parentId);

    if (isSameParent) {
      marker.ref.endTime = newTimeMs;
      marker.ref.time = newTimeMs;
      marker.ref.position = localPos;
      if (marker.parentType === "path") lines = [...lines];
      else sequence = [...sequence];
    } else {
      removeMarker(marker);
      const newMarkerData = {
        ...marker.ref,
        endTime: newTimeMs,
        time: newTimeMs,
        position: localPos,
      };

      if (targetLine) {
        if (!targetLine.eventMarkers) targetLine.eventMarkers = [];
        delete newMarkerData.waitId;
        delete newMarkerData.rotateId;
        newMarkerData.lineIndex = lines.findIndex((l) => l.id === targetLine!.id);
        targetLine.eventMarkers = [...targetLine.eventMarkers, newMarkerData];
        lines = [...lines];
      } else if (targetWait) {
        if (!targetWait.eventMarkers) targetWait.eventMarkers = [];
        if (newMarkerData.lineIndex !== undefined) delete newMarkerData.lineIndex;
        if (targetWait.kind === "wait") {
          newMarkerData.waitId = targetWait.id;
          delete newMarkerData.rotateId;
        } else {
          newMarkerData.rotateId = targetWait.id;
          delete newMarkerData.waitId;
        }
        targetWait.eventMarkers = [...targetWait.eventMarkers, newMarkerData];
        sequence = [...sequence];
      }
    }
  }

  function handleGlobalPositionInput(marker: GlobalMarker, newVal: number) {
    if (!draggingMarkerId) {
      draggingMarkerId = marker.id;
      cachedSortedMarkers = [...allMarkers];
    }
    const latestMarker = allMarkers.find((m) => m.id === marker.id) || marker;
    updateMarkerPosition(latestMarker, newVal, false);
  }

  function handleGlobalPositionCommit(marker: GlobalMarker, newVal: number) {
    draggingMarkerId = null;
    cachedSortedMarkers = [];
    const latestMarker = allMarkers.find((m) => m.id === marker.id) || marker;
    updateMarkerPosition(latestMarker, newVal, true);
  }

  function handleGlobalTimeInput(marker: GlobalMarker, newVal: number) {
    if (!draggingMarkerId) {
      draggingMarkerId = marker.id;
      cachedSortedMarkers = [...allMarkers];
    }
    const latestMarker = allMarkers.find((m) => m.id === marker.id) || marker;
    updateMarkerTime(latestMarker, newVal, false);
  }

  function handleGlobalTimeCommit(marker: GlobalMarker, newVal: number) {
    draggingMarkerId = null;
    cachedSortedMarkers = [];
    const latestMarker = allMarkers.find((m) => m.id === marker.id) || marker;
    updateMarkerTime(latestMarker, newVal, true);
  }

  export async function scrollToMarker(markerId: string) {
    if (collapsedMarkers) {
      collapsedMarkers = false;
      await tick();
    }
    const el = document.getElementById(`global-marker-${markerId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  let allMarkers = $derived(getAllMarkers(sequence, lines, draggingMarkerId, segmentTimesMap));
  
  let currentProjectEvents = $derived(
    Array.from(new Set(allMarkers.map((m) => m.name))),
  );
  let availableEvents = $derived(
    Array.from(
      new Set(
        [...$diskEventNamesStore, ...currentProjectEvents].filter(
          (n) => n && n.trim() !== "",
        ),
      ),
    ).sort(),
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
                  <div class="w-2 h-2 rounded-full bg-purple-500 shrink-0"></div>
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
              <span>•</span>
              {#if marker.ref.type === "temporal"}
                <span>Global Time: {Math.round(marker.globalTime)}ms</span>
              {:else if marker.ref.type === "pose"}
                <span>Global Index: {getParametricIndexDisplay(marker).toFixed(3)}</span>
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
                  <div class="flex justify-between items-center text-[10px] text-neutral-400 px-1">
                    <span>Time after Start: {Math.round(marker.globalTime - marker.segmentStartTime)}ms</span>
                    <span>Segment End: {Math.round(marker.segmentEndTime ?? 0)}ms</span>
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
                    value={marker.ref.poseX ?? 0}
                    step="0.1"
                    class="flex-1 px-1 py-0.5 text-xs rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700"
                    onchange={(e) => {
                      marker.ref.poseX = Number.parseFloat(e.currentTarget.value);
                      if (marker.parentType === "path") lines = [...lines];
                      else sequence = [...sequence];
                    }}
                  />
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-neutral-500 w-3">Y:</span>
                  <input
                    type="number"
                    value={marker.ref.poseY ?? 0}
                    step="0.1"
                    class="flex-1 px-1 py-0.5 text-xs rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700"
                    onchange={(e) => {
                      marker.ref.poseY = Number.parseFloat(e.currentTarget.value);
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
                    value={marker.ref.poseGuess !== undefined
                      ? getParametricIndexDisplay(marker).toFixed(3)
                      : ""}
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
