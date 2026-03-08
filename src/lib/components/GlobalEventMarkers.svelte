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
  import SectionHeader from "./common/SectionHeader.svelte";
  import EmptyState from "./common/EmptyState.svelte";
  import {
    selectedLineId,
    selectedPointId,
    hoveredMarkerId,
    diskEventNamesStore,
  } from "../../stores";
  import SearchableDropdown from "./common/SearchableDropdown.svelte";
  import { actionRegistry } from "../actionRegistry";

  export let sequence: SequenceItem[];
  export let lines: Line[];
  export let collapsedMarkers: boolean;

  interface GlobalMarker {
    id: string;
    originalId: string;
    name: string;
    globalPosition: number;
    parentType: "path" | "wait" | "rotate";
    parentId: string;
    parentIndex: number;
    parentName: string;
    ref: EventMarker;
  }

  // Keep track of dragging marker to prevent re-sorting while dragging
  let draggingMarkerId: string | null = null;
  let cachedSortedMarkers: GlobalMarker[] = [];

  // Reactive list of all markers with global position
  $: allMarkers = getAllMarkers(sequence, lines, draggingMarkerId);

  // Compute available events from disk and current project
  $: currentProjectEvents = Array.from(new Set(allMarkers.map((m) => m.name)));
  $: availableEvents = Array.from(
    new Set(
      [...$diskEventNamesStore, ...currentProjectEvents].filter(
        (n) => n && n.trim() !== "",
      ),
    ),
  ).sort();

  $: nonMacroCount = sequence.filter((s) => s.kind !== "macro").length;

  // Helper to build a mapping of marker index to sequence index
  function getSequenceMapping(seq: SequenceItem[]): {
    map: number[];
    count: number;
  } {
    const map: number[] = [];
    seq.forEach((item, index) => {
      if (item.kind !== "macro") {
        map.push(index);
      }
    });
    return { map, count: map.length };
  }

  function getAllMarkers(
    seq: SequenceItem[],
    linesList: Line[],
    draggingId: string | null,
  ): GlobalMarker[] {
    const markers: GlobalMarker[] = [];
    let markerIndex = 0;

    seq.forEach((item, index) => {
      const def = actionRegistry.get(item.kind);
      if (def?.isMacro) return; // Skip macros

      if (def?.isPath) {
        const line = linesList.find((l) => l.id === (item as any).lineId);
        if (line && line.eventMarkers) {
          line.eventMarkers.forEach((m) => {
            markers.push({
              id: m.id,
              originalId: m.id,
              name: m.name,
              globalPosition: markerIndex + m.position,
              parentType: "path",
              parentId: line.id!,
              parentIndex: index,
              parentName: line.name || `Path ${index + 1}`,
              ref: m,
            });
          });
        }
      } else if (def?.isWait) {
        const wait = item as SequenceWaitItem;
        if (wait.eventMarkers) {
          wait.eventMarkers.forEach((m) => {
            markers.push({
              id: m.id,
              originalId: m.id,
              name: m.name,
              globalPosition: markerIndex + m.position,
              parentType: "wait",
              parentId: wait.id,
              parentIndex: index,
              parentName: wait.name || `Wait ${index + 1}`,
              ref: m,
            });
          });
        }
      } else if (def?.isRotate) {
        const rotate = item as any;
        const rotateMarkers = rotate.eventMarkers as EventMarker[] | undefined;
        if (rotateMarkers && rotateMarkers.length) {
          rotateMarkers.forEach((m) => {
            markers.push({
              id: m.id,
              originalId: m.id,
              name: m.name,
              globalPosition: markerIndex + m.position,
              parentType: "rotate",
              parentId: rotate.id,
              parentIndex: index,
              parentName: rotate.name || `Rotate ${index + 1}`,
              ref: m,
            });
          });
        }
      }

      markerIndex++;
    });

    // Sort by global position
    const sorted = markers.sort((a, b) => a.globalPosition - b.globalPosition);

    if (draggingId) {
      // If dragging, we want to maintain the list order from before the drag started,
      // but update the values of the dragging marker.
      // We use cachedSortedMarkers as the base order.
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
    // Default to adding to the first item, or the last added one?
    // Let's add to the first item for now, or the currently selected one if possible.
    // If we have a selection, try to add there.
    let targetIndex = 0;

    // Check selection
    /*
        If needed, we can try to infer from selection:
        $selectedLineId -> find index in sequence
        $selectedPointId -> could be wait id
    */

    const { map, count } = getSequenceMapping(sequence);
    if (count === 0) return;

    // Default: Add to the last non-macro item in the sequence
    targetIndex = map[count - 1];

    const item = sequence[targetIndex];
    const def = actionRegistry.get(item.kind);

    const newMarker: EventMarker = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: "",
      position: 0.5,
    };

    if (def?.isPath) {
      const line = lines.find((l) => l.id === (item as any).lineId);
      if (line) {
        if (!line.eventMarkers) line.eventMarkers = [];
        // Correctly identify line index within lines array for consistency
        newMarker.lineIndex = lines.findIndex((l) => l.id === line.id);
        line.eventMarkers = [...line.eventMarkers, newMarker];
        lines = [...lines]; // Trigger reactivity
      }
    } else if (def?.isWait) {
      const wait = item as SequenceWaitItem;
      if (!wait.eventMarkers) wait.eventMarkers = [];
      newMarker.waitId = wait.id;
      wait.eventMarkers = [...wait.eventMarkers, newMarker];
      sequence = [...sequence]; // Trigger reactivity
    } else if (def?.isRotate) {
      const rotate = item as any;
      if (!rotate.eventMarkers) rotate.eventMarkers = [];
      newMarker.rotateId = rotate.id;
      rotate.eventMarkers = [...rotate.eventMarkers, newMarker];
      sequence = [...sequence];
    }
  }

  function removeMarker(marker: GlobalMarker) {
    if (marker.parentType === "path") {
      const line = lines.find((l) => l.id === marker.parentId);
      if (line && line.eventMarkers) {
        line.eventMarkers = line.eventMarkers.filter(
          (m) => m.id !== marker.originalId,
        );
        lines = [...lines];
      }
    } else if (marker.parentType === "wait") {
      const wait = sequence.find(
        (s) => s.kind === "wait" && s.id === marker.parentId,
      ) as SequenceWaitItem | undefined;
      if (wait && wait.eventMarkers) {
        wait.eventMarkers = wait.eventMarkers.filter(
          (m) => m.id !== marker.originalId,
        );
        sequence = [...sequence];
      }
    } else if (marker.parentType === "rotate") {
      const rotate = sequence.find(
        (s) => s.kind === "rotate" && s.id === marker.parentId,
      ) as any | undefined;
      if (rotate && rotate.eventMarkers) {
        rotate.eventMarkers = rotate.eventMarkers.filter(
          (m: EventMarker) => m.id !== marker.originalId,
        );
        sequence = [...sequence];
      }
    }
  }

  function updateMarkerPosition(
    marker: GlobalMarker,
    newVal: number,
    clampLocal: boolean,
  ) {
    // Get valid indices
    const { map, count } = getSequenceMapping(sequence);
    const max = count;

    // Clamp to valid range
    if (newVal < 0) newVal = 0;
    if (newVal > max) newVal = max;

    // Determine new parent index (in mapped space) and local position
    let newMarkerIdx = Math.floor(newVal);
    let newLocalPos = newVal - newMarkerIdx;

    if (newMarkerIdx >= count) {
      newMarkerIdx = count - 1;
      newLocalPos = 1.0;
    }

    const newIndex = map[newMarkerIdx];

    // Check if parent changed
    if (newIndex !== marker.parentIndex) {
      // Remove from old parent
      removeMarker(marker);

      // Add to new parent
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
          // Update context fields if needed by types (though largely unused or implicit)
          if (newMarkerData.waitId) delete newMarkerData.waitId;
          if (newMarkerData.rotateId) delete newMarkerData.rotateId;
          newMarkerData.lineIndex = lines.findIndex((l) => l.id === line.id);

          line.eventMarkers = [...line.eventMarkers, newMarkerData];
          lines = [...lines];
        }
      } else if (def?.isWait) {
        const wait = newItem as SequenceWaitItem;
        if (!wait.eventMarkers) wait.eventMarkers = [];
        if (newMarkerData.lineIndex !== undefined)
          delete newMarkerData.lineIndex;
        if (newMarkerData.rotateId) delete newMarkerData.rotateId;
        newMarkerData.waitId = wait.id;

        wait.eventMarkers = [...wait.eventMarkers, newMarkerData];
        sequence = [...sequence];
      } else if (def?.isRotate) {
        const rotate = newItem as any;
        if (!rotate.eventMarkers) rotate.eventMarkers = [];
        if (newMarkerData.lineIndex !== undefined)
          delete newMarkerData.lineIndex;
        if (newMarkerData.waitId) delete newMarkerData.waitId;
        newMarkerData.rotateId = rotate.id;

        rotate.eventMarkers = [...rotate.eventMarkers, newMarkerData];
        sequence = [...sequence];
      }
    } else {
      // Parent is same, just update local position
      if (clampLocal) {
        if (newLocalPos < 0) newLocalPos = 0;
        if (newLocalPos > 1) newLocalPos = 1;
      }

      marker.ref.position = newLocalPos;
      // Trigger reactivity
      if (marker.parentType === "path") lines = [...lines];
      else sequence = [...sequence];
    }
  }

  function handleGlobalPositionInput(marker: GlobalMarker, newVal: number) {
    // Start drag session if not already
    if (!draggingMarkerId) {
      draggingMarkerId = marker.id;
      // Snapshot current order
      cachedSortedMarkers = [...allMarkers];
    }

    // Update marker position immediately (switching parents if needed)
    // but without clamping to allow smooth dragging?
    // Actually, updateMarkerPosition handles parent switching.
    // If we switch parents, newLocalPos will be within 0-1 (by math definition: newVal - floor(newVal)).
    // So we can always clampLocal=true?
    // Wait, updateMarkerPosition logic:
    // newLocalPos = newVal - newIndex.
    // This is always [0, 1) unless newVal == max.
    // So "clamping" is implicit in the parent switch logic.
    // The only case where we might want non-clamped is if we stayed on same parent but went < 0 or > 1.
    // But here we switch parents aggressively.

    updateMarkerPosition(marker, newVal, false);
  }

  function handleGlobalPositionCommit(marker: GlobalMarker, newVal: number) {
    // End drag session
    draggingMarkerId = null;
    cachedSortedMarkers = [];

    updateMarkerPosition(marker, newVal, true);
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
          <div slot="icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-6 text-neutral-400"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"
              />
            </svg>
          </div>
        </EmptyState>
      {:else}
        {#each allMarkers as marker (marker.id)}
          <div
            role="group"
            id={`global-marker-${marker.id}`}
            class="flex flex-col p-2 border border-purple-200 dark:border-purple-800 rounded-md bg-purple-50/50 dark:bg-purple-900/10 gap-2"
            on:mouseenter={() => hoveredMarkerId.set(marker.id)}
            on:mouseleave={() => hoveredMarkerId.set(null)}
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 flex-1">
                <div class="w-2 h-2 rounded-full bg-purple-500 shrink-0"></div>
                <SearchableDropdown
                  bind:value={marker.ref.name}
                  options={availableEvents}
                  placeholder="Search or add new..."
                  on:change={() => {
                    if (marker.parentType === "path") lines = [...lines];
                    else sequence = [...sequence];
                  }}
                />
              </div>
              <button
                class="text-neutral-400 hover:text-red-500 transition-colors"
                on:click={() => removeMarker(marker)}
                title="Remove Marker"
                aria-label="Remove Marker"
              >
                <TrashIcon className="size-4" />
              </button>
            </div>

            <div
              class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400"
            >
              <span
                class="truncate max-w-[100px] font-mono"
                title={marker.parentName}>{marker.parentName}</span
              >
              <span>•</span>
              <span>Global: {marker.globalPosition.toFixed(2)}</span>
            </div>

            <div class="flex items-center gap-2">
              <input
                type="range"
                aria-label="Position for {marker.ref.name}"
                min="0"
                max={nonMacroCount}
                step="0.01"
                value={marker.globalPosition}
                class="flex-1 slider accent-purple-500"
                on:input={(e) =>
                  handleGlobalPositionInput(
                    marker,
                    parseFloat(e.currentTarget.value),
                  )}
                on:change={(e) =>
                  handleGlobalPositionCommit(
                    marker,
                    parseFloat(e.currentTarget.value),
                  )}
              />
              <input
                type="number"
                aria-label="Position value for {marker.ref.name}"
                min="0"
                max={nonMacroCount}
                step="0.01"
                value={parseFloat(marker.globalPosition.toFixed(2))}
                class="w-16 px-1 py-0.5 text-xs rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-center"
                on:change={(e) =>
                  handleGlobalPositionCommit(
                    marker,
                    parseFloat(e.currentTarget.value),
                  )}
              />
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
