<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { transformAngle } from "../../utils/math";
  import HeadingIndicator from "./common/HeadingIndicator.svelte";
  import {
    ArrowCircleIcon,
    TriangleWarningIcon,
    ArrowRightIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    EllipsisVerticalIcon,
    TrashIcon,
  } from "./icons";
  import HeadingControls from "./HeadingControls.svelte";
  import {
    reorderSequence,
    getClosestTarget,
    type DragPosition,
  } from "../../utils/dragDrop";
  import { stopPropagation } from "svelte/legacy";

  interface Props {
    endPoint: any;
    locked?: boolean;
    tabindex?: number | undefined;
    nested?: boolean;
  }

  let {
    endPoint = $bindable(),
    locked = false,
    tabindex = undefined,
    nested = false,
  }: Props = $props();
  const dispatch = createEventDispatcher();

  // Helper to handle constant heading input safely
  function handleConstantInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = Number.parseFloat(target.value);
    if (!Number.isNaN(value)) {
      endPoint.degrees = value;
    }
    dispatch("change");
  }

  function handleConstantBlur(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.value === "" || Number.isNaN(Number.parseFloat(target.value))) {
      endPoint.degrees = 0;
      target.value = "0";
    }
    dispatch("commit");
  }

  let constantInput: HTMLInputElement | undefined = $state();
  let startInput: HTMLInputElement | undefined = $state();
  let endInput: HTMLInputElement | undefined = $state();
  let reverseInput: HTMLInputElement | undefined = $state();

  export function focus() {
    if (endPoint.heading === "constant" && constantInput) constantInput.focus();
    else if (endPoint.heading === "linear" && startInput) startInput.focus();
    else if (endPoint.heading === "tangential" && reverseInput)
      reverseInput.focus();
  }

  let isStartOutOfBounds = $derived(
    endPoint.heading === "linear" &&
      (endPoint.startDeg > 180 || endPoint.startDeg <= -180),
  );
  let isEndOutOfBounds = $derived(
    endPoint.heading === "linear" &&
      (endPoint.endDeg > 180 || endPoint.endDeg <= -180),
  );
  let isConstantOutOfBounds = $derived(
    endPoint.heading === "constant" &&
      (endPoint.degrees > 180 || endPoint.degrees <= -180),
  );

  function normalizeStart() {
    endPoint.startDeg = transformAngle(endPoint.startDeg);
    dispatch("change");
    dispatch("commit");
  }

  function normalizeEnd() {
    endPoint.endDeg = transformAngle(endPoint.endDeg);
    dispatch("change");
    dispatch("commit");
  }

  function normalizeConstant() {
    endPoint.degrees = transformAngle(endPoint.degrees);
    dispatch("change");
    dispatch("commit");
  }

  function updateTransition(i: number, valStr: string) {
    const val = Number.parseFloat(valStr);
    if (!Number.isNaN(val)) {
      endPoint.segments[i].tStart = val;
      endPoint.segments[i - 1].tEnd = val;
      dispatch("change");
    }
  }

  function removeTransition(i: number) {
    endPoint.segments[i - 1].tEnd = endPoint.segments[i].tEnd;
    endPoint.segments.splice(i, 1);
    dispatch("change");
    dispatch("commit");
  }

  function addSegment() {
    const lastSeg = endPoint.segments[endPoint.segments.length - 1];
    const midp = (lastSeg.tStart + lastSeg.tEnd) / 2;
    const originalEnd = lastSeg.tEnd;
    lastSeg.tEnd = midp;

    endPoint.segments.push({
      ...$state.snapshot(lastSeg),
      tStart: midp,
      tEnd: originalEnd,
    });
    endPoint.segments = [...endPoint.segments];
    dispatch("change");
    dispatch("commit");
  }

  let collapsedSegments: boolean[] = $state([]);
  let isPiecewiseCollapsed = $state(false);

  // Drag and drop state
  let draggingIndex: number | null = $state(null);
  let dragOverIndex: number | null = $state(null);
  let dragPosition: DragPosition | null = $state(null);
  let containerRef: HTMLElement | undefined = $state();

  function handleDragStart(e: DragEvent, index: number) {
    if (locked) {
      e.preventDefault();
      return;
    }
    draggingIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  }

  function handleWindowDragOver(e: DragEvent) {
    if (draggingIndex === null) return;
    if (!containerRef) return;
    e.preventDefault();

    const target = getClosestTarget(e, "div[data-seg-index]", containerRef);
    if (!target) return;

    const index = Number.parseInt(target.element.getAttribute("data-seg-index") || "");
    if (Number.isNaN(index)) return;

    if (dragOverIndex !== index || dragPosition !== target.position) {
      dragOverIndex = index;
      dragPosition = target.position;
    }
  }

  function handleWindowDrop(e: DragEvent) {
    if (draggingIndex === null) return;
    e.preventDefault();

    if (
      dragOverIndex === null ||
      dragPosition === null ||
      draggingIndex === dragOverIndex
    ) {
      handleDragEnd();
      return;
    }

    // Preserve the original tStart/tEnd bounds
    const oldBounds = endPoint.segments.map((s: any) => ({
      tStart: s.tStart,
      tEnd: s.tEnd,
    }));

    endPoint.segments = reorderSequence(
      endPoint.segments,
      draggingIndex,
      dragOverIndex,
      dragPosition,
    );

    // Reapply bounds purely temporally top-to-bottom
    endPoint.segments.forEach((seg: any, i: number) => {
      seg.tStart = oldBounds[i].tStart;
      seg.tEnd = oldBounds[i].tEnd;
    });

    dispatch("change");
    dispatch("commit");
    handleDragEnd();
  }

  function handleDragEnd() {
    draggingIndex = null;
    dragOverIndex = null;
    dragPosition = null;
  }

  function moveSegment(index: number, delta: number) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= endPoint.segments.length) return;

    const oldBounds = endPoint.segments.map((s: any) => ({
      tStart: s.tStart,
      tEnd: s.tEnd,
    }));

    const newSegments = [...endPoint.segments];
    const temp = newSegments[index];
    newSegments[index] = newSegments[targetIndex];
    newSegments[targetIndex] = temp;

    newSegments.forEach((seg: any, i: number) => {
      seg.tStart = oldBounds[i].tStart;
      seg.tEnd = oldBounds[i].tEnd;
    });

    endPoint.segments = newSegments;
    dispatch("change");
    dispatch("commit");
  }
</script>

<svelte:window ondragover={handleWindowDragOver} ondrop={handleWindowDrop} />

<div class="flex gap-2 w-full">
  <select
    aria-label="Heading style"
    value={endPoint.heading}
    onchange={(e) => {
      // Notify parent that a change occurred and commit it so timeline and
      // playback recalculate immediately.
      // Also ensure required numeric fields exist when switching types so
      // calculateRobotState doesn't encounter undefined values.
      const val = e.currentTarget.value;
      endPoint.heading = val;
      if (val === "linear") {
        // Initialize linear-specific fields if missing
        if (typeof endPoint.startDeg !== "number")
          endPoint.startDeg = endPoint.degrees ?? 0;
        if (typeof endPoint.endDeg !== "number")
          endPoint.endDeg = endPoint.degrees ?? 0;
      } else if (val === "constant") {
        // Ensure constant degree exists (prefer endDeg/startDeg if present)
        if (typeof endPoint.degrees !== "number") {
          endPoint.degrees = endPoint.endDeg ?? endPoint.startDeg ?? 0;
        }
      } else if (val === "facingPoint") {
        // Initialize facingPoint coordinates
        if (typeof endPoint.targetX !== "number") endPoint.targetX = 72;
        if (typeof endPoint.targetY !== "number") endPoint.targetY = 72;
      } else if (val === "piecewise") {
        if (!endPoint.segments || endPoint.segments.length === 0) {
          endPoint.segments = [
            {
              tStart: 0,
              tEnd: 1,
              heading: "tangential",
              reverse: endPoint.reverse ?? false,
            },
          ];
        }
      }

      dispatch("change");
      dispatch("commit");
    }}
    class="w-full pl-3 pr-8 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all flex-1"
    title="The heading style of the robot.
  With constant heading, the robot maintains the same heading throughout the line.
  With linear heading, heading changes linearly between given start and end angles.
  With tangential heading, the heading follows the direction of the line."
    disabled={locked}
    {tabindex}
  >
    <option value="constant">Constant</option>
    <option value="linear">Linear</option>
    <option value="tangential">Tangential</option>
    <option value="facingPoint">Facing Point</option>
    {#if !nested}
      <option value="piecewise">Piecewise</option>
    {/if}
  </select>

  <label
    class="flex items-center justify-center px-2 py-1.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0 {endPoint.heading ===
    'piecewise'
      ? 'hidden'
      : ''}"
    title="Reverse the direction of the heading interpolation"
  >
    <input
      bind:this={reverseInput}
      type="checkbox"
      checked={endPoint.reverse}
      onchange={(e) => {
        endPoint.reverse = e.currentTarget.checked;
        dispatch("change");
        dispatch("commit");
      }}
      disabled={locked}
      {tabindex}
      class="sr-only"
    />
    <ArrowCircleIcon
      className={`size-4 ${endPoint.reverse ? "text-purple-500" : "text-neutral-400"}`}
    />
  </label>

  {#if endPoint.heading === "linear"}
    <div class="flex items-center gap-2 flex-[2]">
      <div class="relative flex-1">
        <HeadingIndicator
          degrees={endPoint.startDeg}
          size={16}
          className="absolute -top-7 left-1/2 -translate-x-1/2 text-neutral-400 dark:text-neutral-500"
        />
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400 select-none uppercase tracking-wider"
          >Start</span
        >
        <input
          bind:this={startInput}
          class="w-full pl-12 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          class:pr-6={isStartOutOfBounds}
          class:pr-1={!isStartOutOfBounds}
          class:border-yellow-500={isStartOutOfBounds}
          class:dark:border-yellow-500={isStartOutOfBounds}
          step="1"
          type="number"
          value={endPoint.startDeg}
          oninput={(e) => {
            const val = Number.parseFloat(e.currentTarget.value);
            if (!Number.isNaN(val)) endPoint.startDeg = val;
            dispatch("change");
          }}
          onblur={() => dispatch("commit")}
          title="The heading the robot starts this line at (in degrees)"
          aria-label="Start Heading"
          disabled={locked}
          {tabindex}
        />
        {#if isStartOutOfBounds && !locked}
          <button
            onclick={normalizeStart}
            title="Angle is out of bounds. Click to normalize to [-180, 180]."
            aria-label="Normalize angle to between -180 and 180 degrees"
            class="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 transition-colors"
          >
            <TriangleWarningIcon className="size-3" />
          </button>
        {/if}
      </div>
      <div class="relative flex-1">
        <HeadingIndicator
          degrees={endPoint.endDeg}
          size={16}
          className="absolute -top-7 left-1/2 -translate-x-1/2 text-neutral-400 dark:text-neutral-500"
        />
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400 select-none uppercase tracking-wider"
          >End</span
        >
        <input
          bind:this={endInput}
          class="w-full pl-8 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          class:pr-6={isEndOutOfBounds}
          class:pr-1={!isEndOutOfBounds}
          class:border-yellow-500={isEndOutOfBounds}
          class:dark:border-yellow-500={isEndOutOfBounds}
          step="1"
          type="number"
          value={endPoint.endDeg}
          oninput={(e) => {
            const val = Number.parseFloat(e.currentTarget.value);
            if (!Number.isNaN(val)) endPoint.endDeg = val;
            dispatch("change");
          }}
          onblur={() => dispatch("commit")}
          title="The heading the robot ends this line at (in degrees)"
          aria-label="End Heading"
          disabled={locked}
          {tabindex}
        />
        {#if isEndOutOfBounds && !locked}
          <button
            onclick={normalizeEnd}
            title="Angle is out of bounds. Click to normalize to [-180, 180]."
            aria-label="Normalize angle to between -180 and 180 degrees"
            class="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 transition-colors"
          >
            <TriangleWarningIcon className="size-3" />
          </button>
        {/if}
      </div>
    </div>
  {:else if endPoint.heading === "constant"}
    <div class="flex items-center gap-2 flex-[2]">
      <div class="relative flex-1">
        <HeadingIndicator
          degrees={(endPoint.degrees || 0) + (endPoint.reverse ? 180 : 0)}
          size={16}
          className="absolute -top-7 left-1/2 -translate-x-1/2 text-neutral-400 dark:text-neutral-500"
        />
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400 select-none"
          >°</span
        >
        <input
          bind:this={constantInput}
          class="w-full pl-6 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
          class:pr-6={isConstantOutOfBounds}
          class:pr-2={!isConstantOutOfBounds}
          class:border-yellow-500={isConstantOutOfBounds}
          class:dark:border-yellow-500={isConstantOutOfBounds}
          step="1"
          type="number"
          value={endPoint.degrees || 0}
          oninput={handleConstantInput}
          onblur={handleConstantBlur}
          title="The constant heading the robot maintains throughout this line (in degrees)"
          aria-label="Constant Heading"
          disabled={locked}
          {tabindex}
        />
        {#if isConstantOutOfBounds && !locked}
          <button
            onclick={normalizeConstant}
            title="Angle is out of bounds. Click to normalize to [-180, 180]."
            aria-label="Normalize angle to between -180 and 180 degrees"
            class="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 transition-colors"
          >
            <TriangleWarningIcon className="size-3" />
          </button>
        {/if}
      </div>
    </div>
  {:else if endPoint.heading === "tangential"}
    <div
      class="flex items-center justify-center gap-2 flex-[2] bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 min-w-0"
    >
      <ArrowRightIcon
        className="size-4 text-neutral-400 dark:text-neutral-500 shrink-0 {endPoint.reverse
          ? 'scale-x-[-1]'
          : ''}"
      />
      <span
        class="text-sm text-neutral-500 dark:text-neutral-400 select-none truncate"
        >{endPoint.reverse ? "Facing Backward" : "Facing Forward"}</span
      >
    </div>
  {:else if endPoint.heading === "facingPoint"}
    <div class="flex items-center gap-2 flex-[2]">
      <div class="relative flex-1">
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400 select-none uppercase tracking-wider"
          >X</span
        >
        <input
          class="w-full pl-6 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all pr-1"
          step="0.1"
          type="number"
          value={endPoint.targetX}
          oninput={(e) => {
            const val = Number.parseFloat(e.currentTarget.value);
            if (!Number.isNaN(val)) endPoint.targetX = val;
            dispatch("change");
          }}
          onblur={() => dispatch("commit")}
          title="The X coordinate of the point to face"
          aria-label="Target X"
          disabled={locked}
          {tabindex}
        />
      </div>
      <div class="relative flex-1">
        <span
          class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400 select-none uppercase tracking-wider"
          >Y</span
        >
        <input
          class="w-full pl-6 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all pr-1"
          step="0.1"
          type="number"
          value={endPoint.targetY}
          oninput={(e) => {
            const val = Number.parseFloat(e.currentTarget.value);
            if (!Number.isNaN(val)) endPoint.targetY = val;
            dispatch("change");
          }}
          onblur={() => dispatch("commit")}
          title="The Y coordinate of the point to face"
          aria-label="Target Y"
          disabled={locked}
          {tabindex}
        />
      </div>
    </div>
  {/if}
</div>

{#if endPoint.heading === "piecewise"}
  <div class="flex items-center mt-3 pl-1 mb-1">
    <button
      onclick={() => {
        isPiecewiseCollapsed = !isPiecewiseCollapsed;
      }}
      class="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 uppercase tracking-wide transition-colors"
    >
      <ChevronDownIcon
        className="size-3.5 transition-transform duration-200 {isPiecewiseCollapsed
          ? '-rotate-90'
          : 'rotate-0'}"
        strokeWidth={2.5}
      />
      Piecewise Segments ({endPoint.segments?.length || 0})
    </button>
  </div>

  {#if !isPiecewiseCollapsed}
    <div bind:this={containerRef} class="flex flex-col gap-0 w-full mt-1 pl-3">
      {#each endPoint.segments || [] as segment, i}
        <div class="flex items-center -ml-[13px]">
          <div
            class="w-2.5 h-2.5 rounded-full bg-purple-500 mr-2 z-10 shrink-0"
          ></div>
          {#if i === 0}
            <span
              class="text-[10px] text-neutral-400 font-bold bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 select-none"
            >
              t = 0.00
            </span>
          {:else}
            <div
              class="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700"
            >
              <span class="text-[10px] text-neutral-500 font-bold select-none"
                >t =</span
              >
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={segment.tStart}
                oninput={(e) => updateTransition(i, e.currentTarget.value)}
                onblur={() => dispatch("commit")}
                disabled={locked}
                class="w-14 px-1 py-0.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-600 rounded focus:ring-1 focus:ring-purple-500 outline-none"
              />
              {#if !locked}
                <button
                  onclick={() => removeTransition(i)}
                  class="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-500/10 transition-colors"
                  title="Remove Transition"
                >
                  <TrashIcon className="size-3" />
                </button>
              {/if}
            </div>
          {/if}
        </div>

        <div
          class="border-l-2 border-purple-500/30 ml-[-7px] pl-4 py-2 relative"
          data-seg-index={i}
          role="listitem"
          draggable={!locked}
          ondragstart={(e) => handleDragStart(e, i)}
          ondragend={handleDragEnd}
        >
          <div
            class="relative transition-all duration-200 flex items-center gap-2 group"
            class:border-t-4={dragOverIndex === i && dragPosition === "top"}
            class:border-b-4={dragOverIndex === i && dragPosition === "bottom"}
            class:border-purple-500={dragOverIndex === i}
            class:dark:border-purple-400={dragOverIndex === i}
            class:opacity-50={draggingIndex === i}
            class:cursor-move={!locked}
          >
            <!-- Drag Handle Column -->
            {#if !locked}
              <div
                class="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 shrink-0"
              >
                <EllipsisVerticalIcon className="size-4" />
              </div>
            {/if}

            <div
              class="flex flex-col items-center bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0"
            >
              <button
                title={locked ? "Locked" : "Move up"}
                onclick={stopPropagation(() => moveSegment(i, -1))}
                class="p-0.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 rounded-t focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={i === 0 || locked}
              >
                <ChevronUpIcon className="size-3" />
              </button>
              <div
                class="w-full h-px bg-neutral-200 dark:bg-neutral-700"
                role="presentation"
              ></div>
              <button
                title={locked ? "Locked" : "Move down"}
                onclick={stopPropagation(() => moveSegment(i, 1))}
                class="p-0.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 rounded-b focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={i === endPoint.segments.length - 1 || locked}
              >
                <ChevronDownIcon className="size-3" />
              </button>
            </div>

            <!-- Segment Body -->
            <div class="flex-1 min-w-0 pr-1 py-1">
              <HeadingControls
                bind:endPoint={endPoint.segments[i]}
                {locked}
                nested={true}
                on:change={() => dispatch("change")}
                on:commit={() => dispatch("commit")}
              />
            </div>
          </div>
        </div>
      {/each}

      <div class="flex items-center -ml-[13px] pb-1 mt-1">
        <div
          class="w-2.5 h-2.5 rounded-full bg-purple-500 mr-2 z-10 shrink-0"
        ></div>
        <span
          class="text-[10px] text-neutral-400 font-bold bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 select-none"
        >
          t = 1.00
        </span>
      </div>

      {#if !locked}
        <div class="ml-4 mt-2">
          <button
            class="text-[11px] bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 px-3 py-1 rounded-full transition-colors font-semibold shadow-sm border border-neutral-200 dark:border-neutral-700 flex items-center gap-1 w-fit"
            onclick={addSegment}
          >
            <svg
              class="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M12 4v16m8-8H4"
              ></path></svg
            >
            Add Transition
          </button>
        </div>
      {/if}
    </div>
  {/if}
{/if}
