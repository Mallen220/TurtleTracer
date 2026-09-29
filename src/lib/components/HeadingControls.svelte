<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  Edits how the robot turns along a path: the heading style and its angles,
  or for piecewise headings, a list of segments each with its own style.
-->
<script lang="ts" module>
  import type { PiecewiseSegment, Point } from "../../types";

  /**
   * The heading fields of a point or piecewise segment. They're edited in
   * place while switching styles, so every style's fields are optional here.
   */
  export interface HeadingFields {
    heading: Point["heading"];
    degrees?: number;
    startDeg?: number;
    endDeg?: number;
    targetX?: number;
    targetY?: number;
    reverse?: boolean;
    segments?: PiecewiseSegment[];
  }
</script>

<script lang="ts">
  import InsetNumberInput from "./common/InsetNumberInput.svelte";
  import {
    ArrowCircleIcon,
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

  interface Props {
    endPoint: HeadingFields;
    locked?: boolean;
    tabindex?: number | undefined;
    /** Inside a piecewise segment, where piecewise isn't offered. */
    nested?: boolean;
    onchange?: () => void;
    oncommit?: () => void;
  }

  let {
    endPoint = $bindable(),
    locked = false,
    tabindex = undefined,
    nested = false,
    onchange,
    oncommit,
  }: Props = $props();

  let fieldsRow: HTMLElement | undefined = $state();
  let reverseInput: HTMLInputElement | undefined = $state();

  function changed() {
    onchange?.();
    oncommit?.();
  }

  export function focus() {
    if (endPoint.heading === "tangential") reverseInput?.focus();
    else
      fieldsRow
        ?.querySelector<HTMLInputElement>("input[data-primary]")
        ?.focus();
  }

  /** Switches style, filling in any fields the new style needs. */
  function setStyle(heading: HeadingFields["heading"]) {
    endPoint.heading = heading;
    if (heading === "linear") {
      endPoint.startDeg ??= endPoint.degrees ?? 0;
      endPoint.endDeg ??= endPoint.degrees ?? 0;
    } else if (heading === "constant") {
      endPoint.degrees ??= endPoint.endDeg ?? endPoint.startDeg ?? 0;
    } else if (heading === "facingPoint") {
      endPoint.targetX ??= 72;
      endPoint.targetY ??= 72;
    } else if (heading === "piecewise" && !endPoint.segments?.length) {
      endPoint.segments = [
        {
          tStart: 0,
          tEnd: 1,
          heading: "tangential",
          reverse: endPoint.reverse ?? false,
        },
      ];
    }
    changed();
  }

  // ---- Piecewise segments ----
  // Segments cover t = 0 to 1 in order; each one's tEnd is the next one's
  // tStart. Reordering swaps headings but leaves the transition points put.

  let segments = $derived(endPoint.segments ?? []);
  let isPiecewiseCollapsed = $state(false);

  function setTransition(i: number, text: string) {
    const t = Number.parseFloat(text);
    if (Number.isNaN(t)) return;
    segments[i].tStart = t;
    segments[i - 1].tEnd = t;
    onchange?.();
  }

  function removeTransition(i: number) {
    segments[i - 1].tEnd = segments[i].tEnd;
    endPoint.segments = segments.toSpliced(i, 1);
    changed();
  }

  function addTransition() {
    const last = segments.at(-1)!;
    const mid = (last.tStart + last.tEnd) / 2;
    endPoint.segments = [
      ...segments.slice(0, -1),
      { ...$state.snapshot(last), tEnd: mid },
      { ...$state.snapshot(last), tStart: mid },
    ];
    changed();
  }

  function reorder(reordered: PiecewiseSegment[]) {
    endPoint.segments = reordered.map((seg, i) => ({
      ...seg,
      tStart: segments[i].tStart,
      tEnd: segments[i].tEnd,
    }));
    changed();
  }

  function moveSegment(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= segments.length) return;
    const next = [...segments];
    [next[index], next[target]] = [next[target], next[index]];
    reorder(next);
  }

  // Dragging segments by their handles
  let draggingIndex: number | null = $state(null);
  let dragOverIndex: number | null = $state(null);
  let dragPosition: DragPosition | null = $state(null);
  let segmentList: HTMLElement | undefined = $state();

  function handleDragStart(e: DragEvent, index: number) {
    if (locked) {
      e.preventDefault();
      return;
    }
    draggingIndex = index;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  }

  function handleWindowDragOver(e: DragEvent) {
    if (draggingIndex === null || !segmentList) return;
    e.preventDefault();

    const target = getClosestTarget(e, "div[data-seg-index]", segmentList);
    if (!target) return;
    const index = Number.parseInt(
      target.element.getAttribute("data-seg-index") || "",
    );
    if (Number.isNaN(index)) return;
    dragOverIndex = index;
    dragPosition = target.position;
  }

  function handleWindowDrop(e: DragEvent) {
    if (draggingIndex === null) return;
    e.preventDefault();
    if (
      dragOverIndex !== null &&
      dragPosition !== null &&
      draggingIndex !== dragOverIndex
    ) {
      reorder(
        reorderSequence(segments, draggingIndex, dragOverIndex, dragPosition),
      );
    }
    handleDragEnd();
  }

  function handleDragEnd() {
    draggingIndex = null;
    dragOverIndex = null;
    dragPosition = null;
  }
</script>

<svelte:window ondragover={handleWindowDragOver} ondrop={handleWindowDrop} />

<div bind:this={fieldsRow} class="flex gap-2 w-full">
  <select
    aria-label="Heading style"
    value={endPoint.heading}
    onchange={(e) =>
      setStyle(e.currentTarget.value as HeadingFields["heading"])}
    class="w-full pl-3 pr-8 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700  focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all flex-1"
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
    class="flex items-center justify-center px-2 py-1.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700  cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0 {endPoint.heading ===
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
        changed();
      }}
      disabled={locked}
      {tabindex}
      aria-label="Reverse heading direction"
      class="sr-only"
    />
    <ArrowCircleIcon
      className={`size-4 ${endPoint.reverse ? "text-purple-500" : "text-neutral-400"}`}
    />
  </label>

  {#if endPoint.heading === "linear"}
    <div class="flex items-center gap-2 flex-[2]">
      <InsetNumberInput
        bind:value={endPoint.startDeg}
        label="Start"
        inset="pl-12"
        ariaLabel="Start Heading"
        title="The heading the robot starts this line at (in degrees)"
        indicator={endPoint.startDeg ?? 0}
        isAngle
        primary
        disabled={locked}
        {tabindex}
        {onchange}
        {oncommit}
      />
      <InsetNumberInput
        bind:value={endPoint.endDeg}
        label="End"
        inset="pl-8"
        ariaLabel="End Heading"
        title="The heading the robot ends this line at (in degrees)"
        indicator={endPoint.endDeg ?? 0}
        isAngle
        disabled={locked}
        {tabindex}
        {onchange}
        {oncommit}
      />
    </div>
  {:else if endPoint.heading === "constant"}
    <div class="flex items-center gap-2 flex-[2]">
      <InsetNumberInput
        bind:value={endPoint.degrees}
        label="°"
        labelClass="text-xs"
        inset="pl-6"
        ariaLabel="Constant Heading"
        title="The constant heading the robot maintains throughout this line (in degrees)"
        indicator={(endPoint.degrees || 0) + (endPoint.reverse ? 180 : 0)}
        isAngle
        primary
        disabled={locked}
        {tabindex}
        {onchange}
        {oncommit}
      />
    </div>
  {:else if endPoint.heading === "tangential"}
    <div
      class="flex items-center justify-center gap-2 flex-[2] bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700  px-3 min-w-0"
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
      <InsetNumberInput
        bind:value={endPoint.targetX}
        label="X"
        inset="pl-6"
        step={0.1}
        ariaLabel="Target X"
        title="The X coordinate of the point to face"
        primary
        disabled={locked}
        {tabindex}
        {onchange}
        {oncommit}
      />
      <InsetNumberInput
        bind:value={endPoint.targetY}
        label="Y"
        inset="pl-6"
        step={0.1}
        ariaLabel="Target Y"
        title="The Y coordinate of the point to face"
        disabled={locked}
        {tabindex}
        {onchange}
        {oncommit}
      />
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
      Piecewise Segments ({segments.length})
    </button>
  </div>

  {#if !isPiecewiseCollapsed}
    <div bind:this={segmentList} class="flex flex-col gap-0 w-full mt-1 pl-3">
      {#each segments as segment, i}
        <div class="flex items-center -ml-[13px]">
          <div
            class="w-2.5 h-2.5  bg-purple-500 mr-2 z-10 shrink-0"
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
                oninput={(e) => setTransition(i, e.currentTarget.value)}
                onblur={() => oncommit?.()}
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
                aria-label={locked ? "Locked" : "Move up"}
                onclick={(e) => {
                  e.stopPropagation();
                  moveSegment(i, -1);
                }}
                class="p-0.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 disabled:opacity-30  focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                aria-label={locked ? "Locked" : "Move down"}
                onclick={(e) => {
                  e.stopPropagation();
                  moveSegment(i, 1);
                }}
                class="p-0.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 disabled:opacity-30  focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={i === segments.length - 1 || locked}
              >
                <ChevronDownIcon className="size-3" />
              </button>
            </div>

            <!-- Segment Body -->
            <div class="flex-1 min-w-0 pr-1 py-1">
              <HeadingControls
                bind:endPoint={segments[i]}
                {locked}
                nested={true}
                {onchange}
                {oncommit}
              />
            </div>
          </div>
        </div>
      {/each}

      <div class="flex items-center -ml-[13px] pb-1 mt-1">
        <div
          class="w-2.5 h-2.5  bg-purple-500 mr-2 z-10 shrink-0"
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
            class="text-[11px] bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 px-3 py-1  transition-colors font-semibold shadow-sm border border-neutral-200 dark:border-neutral-700 flex items-center gap-1 w-fit"
            onclick={addTransition}
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
