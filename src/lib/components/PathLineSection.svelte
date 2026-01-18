<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type { Line } from "../../types";
  import { snapToGrid, showGrid, gridSize } from "../../stores";
  import ControlPointsSection from "./ControlPointsSection.svelte";
  import HeadingControls from "./HeadingControls.svelte";
  import ColorPicker from "./ColorPicker.svelte";
  import { selectedLineId, selectedPointId, focusRequest } from "../../stores";
  import DeleteButtonWithConfirm from "./common/DeleteButtonWithConfirm.svelte";
  import { handleWaypointRename, isLineLinked } from "../../utils/pointLinking";
  import { tooltipPortal } from "../actions/portal";
  import { onMount, onDestroy } from "svelte";

  export let line: Line;
  export let idx: number;
  export let lines: Line[];
  export let collapsed: boolean;
  // export let collapsedEventMarkers: boolean;
  export let collapsedControlPoints: boolean;
  export let onRemove: () => void;
  export let onInsertAfter: () => void;
  export let onAddWaitAfter: () => void;
  export let onAddRotateAfter: () => void;
  export let recordChange: () => void;
  export let onMoveUp: () => void;
  export let onMoveDown: () => void;
  export let canMoveUp: boolean = true;
  export let canMoveDown: boolean = true;

  $: isSelected = $selectedLineId === line.id;

  $: snapToGridTitle =
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping";

  let hoveredLinkId: string | null = null;
  let hoveredLinkAnchor: HTMLElement | null = null;

  let xInput: HTMLInputElement;
  let yInput: HTMLInputElement;
  let headingControls: HeadingControls;
  let nameInput: HTMLInputElement | undefined;

  // Container-based responsiveness: observe the grid container's width and
  // toggle a compact layout when it becomes too narrow (e.g., in a small
  // control tab). This ensures the Heading section snaps under Target Position
  // based on the control tab size and not the viewport width.
  let gridContainer: HTMLElement;
  let isNarrow: boolean = false;
  const CONTROL_WIDTH_THRESHOLD = 480; // px, tweak as needed

  onMount(() => {
    if (!gridContainer) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        isNarrow = width < CONTROL_WIDTH_THRESHOLD;
      }
    });
    ro.observe(gridContainer);

    return () => ro.disconnect();
  });

  // Listen for focus requests
  $: if ($focusRequest) {
    // Only focus if this line is selected AND we are focusing the endpoint (point-IDX-0)
    // The selectedPointId format is point-{lineIndex+1}-{pointIndex}
    // So if idx (line index) matches, and pointIndex is 0, we focus this line's X/Y/H
    if ($selectedPointId === `point-${idx + 1}-0`) {
      if ($focusRequest.field === "x" && xInput) xInput.focus();
      if ($focusRequest.field === "y" && yInput) yInput.focus();
      if ($focusRequest.field === "heading" && headingControls)
        headingControls.focus();
    }
    // Special handling for rename focus which can happen on any selection of this line
    if (
      $focusRequest.field === "name" &&
      $focusRequest.id === line.id &&
      nameInput
    ) {
      nameInput.focus();
    }
  }

  function handleLinkHoverEnter(e: MouseEvent, id: string | null) {
    hoveredLinkId = id;
    hoveredLinkAnchor = e.currentTarget as HTMLElement;
  }
  function handleLinkHoverLeave() {
    hoveredLinkId = null;
    hoveredLinkAnchor = null;
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  function handleNameInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const newName = input.value;
    if (line.id) {
      lines = handleWaypointRename(lines, line.id, newName);
    } else {
      line.name = newName;
      lines = [...lines];
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  role="button"
  tabindex="0"
  aria-pressed={isSelected}
  class={`bg-white dark:bg-neutral-800 rounded-xl shadow-sm border transition-all duration-200 ${
    isSelected
      ? "border-purple-500 ring-1 ring-purple-500/20"
      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
  }`}
  on:click={() => {
    if (line.id) selectedLineId.set(line.id);
  }}
  on:keydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (line.id) selectedLineId.set(line.id);
    }
  }}
>
  <!-- Card Header -->
  <div class="flex items-center justify-between p-3 gap-3">
    <!-- Left: Title & Name -->
    <div class="flex items-center gap-3 flex-1 min-w-0">
      <button
        on:click|stopPropagation={toggleCollapsed}
        class="flex items-center gap-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 transition-colors px-1 py-1"
        title="{collapsed ? 'Expand' : 'Collapse'} path"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} Path {idx + 1}"
        aria-expanded={!collapsed}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2.5}
          stroke="currentColor"
          class="size-3.5 transition-transform duration-200 {collapsed
            ? '-rotate-90'
            : 'rotate-0'}"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
        <span
          class="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 whitespace-nowrap"
          >Path {idx + 1}</span
        >
      </button>

      <div class="flex items-center gap-2 flex-1 min-w-0">
        <div class="relative flex-1 min-w-0">
          <input
            value={line.name}
            placeholder="Path Name"
            aria-label="Path name"
            title="Edit path name"
            class="w-full pl-2 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all placeholder-neutral-400 truncate"
            class:text-green-500={hoveredLinkId === line.id}
            disabled={line.locked}
            on:input={handleNameInput}
            on:blur={() => recordChange && recordChange()}
            on:click|stopPropagation
          />
          {#if line.id && isLineLinked(lines, line.id)}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 cursor-help"
              on:mouseenter={(e) => handleLinkHoverEnter(e, line.id || null)}
              on:mouseleave={handleLinkHoverLeave}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-3.5 h-3.5"
              >
                <path
                  fill-rule="evenodd"
                  d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                  clip-rule="evenodd"
                />
              </svg>
              {#if hoveredLinkId === line.id}
                <div
                  use:tooltipPortal={hoveredLinkAnchor}
                  class="w-64 p-2 bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700 rounded shadow-lg text-xs text-green-900 dark:text-green-100 z-50 pointer-events-none"
                >
                  <strong>Linked Path</strong><br />
                  Logic: Same Name = Shared Position.<br />
                  This path shares its X/Y coordinates with other paths named '{line.name}'.
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Right: Controls -->
    <div class="flex items-center gap-1">
      <ColorPicker
        bind:color={line.color}
        title="Change Path Color"
        disabled={line.locked}
      />

      <button
        on:click|stopPropagation={() => {
          line.locked = !line.locked;
          lines = [...lines];
        }}
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors"
        title={line.locked ? "Unlock Path" : "Lock Path"}
        aria-label={line.locked ? "Unlock Path" : "Lock Path"}
      >
        {#if line.locked}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="size-4 text-amber-500"
          >
            <path
              fill-rule="evenodd"
              d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
              clip-rule="evenodd"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {/if}
      </button>

      <div class="h-4 w-px bg-neutral-200 dark:bg-neutral-700 mx-1"></div>

      <div
        class="flex items-center bg-neutral-100 dark:bg-neutral-900 rounded-lg p-0.5"
      >
        <button
          on:click|stopPropagation={() =>
            !line.locked && onMoveUp && onMoveUp()}
          disabled={!canMoveUp || line.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow"
          title="Move Up"
          aria-label="Move Up"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-3.5"
          >
            <path
              fill-rule="evenodd"
              d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <button
          on:click|stopPropagation={() =>
            !line.locked && onMoveDown && onMoveDown()}
          disabled={!canMoveDown || line.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow"
          title="Move Down"
          aria-label="Move Down"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-3.5"
          >
            <path
              fill-rule="evenodd"
              d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>

      {#if lines.length > 1}
        <DeleteButtonWithConfirm
          on:click={() => !line.locked && onRemove && onRemove()}
          disabled={line.locked}
          title="Delete Path"
        />
      {/if}
    </div>
  </div>

  {#if !collapsed}
    <div class="px-3 pb-3 space-y-4">
      <!-- Grid Layout for Inputs -->
      <div
        bind:this={gridContainer}
        class="grid gap-4"
        class:grid-cols-1={isNarrow}
        class:grid-cols-3={!isNarrow}
      >
        <!-- Target Position -->
        <div class="space-y-2">
          <span
            class="text-xs font-semibold text-neutral-500 uppercase tracking-wide block"
          >
            Target Position
          </span>
          <div class="flex items-center gap-2">
            <div class="relative flex-[0.5] min-w-0 max-w-[200px]">
              <span
                class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400 select-none"
                >X</span
              >
              <input
                bind:this={xInput}
                class="w-full pl-6 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
                step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                type="number"
                min="0"
                max="144"
                bind:value={line.endPoint.x}
                disabled={line.locked}
                title={snapToGridTitle}
                aria-label="Target X position"
                placeholder="0"
              />
            </div>
            <div class="relative flex-[0.5] min-w-0 max-w-[200px]">
              <span
                class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400 select-none"
                >Y</span
              >
              <input
                bind:this={yInput}
                class="w-full pl-6 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
                step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                min="0"
                max="144"
                type="number"
                bind:value={line.endPoint.y}
                disabled={line.locked}
                title={snapToGridTitle}
                aria-label="Target Y position"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <!-- Heading Control -->
        <div class="space-y-2" class:col-span-2={!isNarrow}>
          <span
            class="text-xs font-semibold text-neutral-500 uppercase tracking-wide block"
          >
            Heading
          </span>
          <HeadingControls
            bind:this={headingControls}
            endPoint={line.endPoint}
            locked={line.locked}
            on:change={() => (lines = [...lines])}
            on:commit={() => {
              lines = [...lines];
              recordChange();
            }}
          />
        </div>
      </div>

      <ControlPointsSection
        bind:line
        lineIdx={idx}
        bind:collapsed={collapsedControlPoints}
        {recordChange}
      />

      <!-- Action Bar -->
      <div
        class="flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-700/50"
      >
        <span class="text-xs font-medium text-neutral-400 mr-auto"
          >Insert after:</span
        >

        <button
          on:click={onInsertAfter}
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors border border-green-200 dark:border-green-800/30"
          title="Add Path After"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-3"
          >
            <path
              d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
            />
          </svg>
          Path
        </button>

        <button
          on:click={onAddWaitAfter}
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors border border-amber-200 dark:border-amber-800/30"
          title="Add Wait After"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-3"
          >
            <path
              d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
            />
          </svg>
          Wait
        </button>

        <button
          on:click={onAddRotateAfter}
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-900/30 transition-colors border border-pink-200 dark:border-pink-800/30"
          title="Add Rotate After"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-3"
          >
            <path
              d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"
            />
          </svg>
          Rotate
        </button>
      </div>
    </div>
  {/if}
</div>
