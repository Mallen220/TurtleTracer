<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type { Line } from "../../types";
  import { snapToGrid, showGrid, gridSize } from "../../stores";
  import ControlPointsSection from "./ControlPointsSection.svelte";
  import HeadingControls from "./HeadingControls.svelte";
  import ColorPicker from "./ColorPicker.svelte";
  import { selectedLineId, selectedPointId, focusRequest } from "../../stores";
  import TrashIcon from "./icons/TrashIcon.svelte";
  import { handleWaypointRename, isLineLinked } from "../../utils/pointLinking";
  import { tooltipPortal } from "../actions/portal";

  export let line: Line;
  export let idx: number;
  export let lines: Line[];
  export let collapsed: boolean;
  // export let collapsedEventMarkers: boolean;
  export let collapsedControlPoints: boolean;
  export let onRemove: () => void;
  export let onInsertAfter: () => void;
  export let onAddWaitAfter: () => void;
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
  class={`flex flex-col w-full justify-start items-start gap-1 ${isSelected ? "border-l-4 border-green-500 pl-2" : ""}`}
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
  <div
    class="flex flex-row w-full justify-between items-center flex-wrap gap-y-2"
  >
    <div class="flex flex-row items-center gap-2 flex-wrap">
      <button
        tabindex="-1"
        on:click={toggleCollapsed}
        class="flex items-center gap-2 font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors"
        title="{collapsed ? 'Expand' : 'Collapse'} path"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} path"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-4 transition-transform {collapsed
            ? 'rotate-0'
            : 'rotate-90'}"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>
        Path {idx + 1}
      </button>

      <div class="relative">
        <input
          tabindex="-1"
          value={line.name}
          placeholder="Path {idx + 1}"
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-semibold min-w-[100px] pr-6"
          class:text-green-500={hoveredLinkId === line.id}
          disabled={line.locked}
          on:input={handleNameInput}
          on:blur={() => {
            // Commit the change for history/undo
            if (recordChange) recordChange();
          }}
        />
        {#if line.id && isLineLinked(lines, line.id)}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="absolute right-1 top-1/2 -translate-y-1/2 text-green-500 cursor-help flex items-center justify-center"
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
                Control points & events remain independent.
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <ColorPicker
        bind:color={line.color}
        title="Change Path Color"
        disabled={line.locked}
        tabindex={-1}
      />

      <!-- Lock/Unlock Button -->
      <button
        tabindex="-1"
        title={line.locked ? "Unlock Path" : "Lock Path"}
        aria-label={line.locked ? "Unlock Path" : "Lock Path"}
        on:click|stopPropagation={() => {
          line.locked = !line.locked;
          lines = [...lines]; // Force reactivity
        }}
        class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
      >
        {#if line.locked}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 stroke-yellow-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 stroke-gray-400"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {/if}
      </button>

      <div class="flex flex-row gap-0.5 ml-1">
        <button
          tabindex="-1"
          title={line.locked ? "Path locked" : "Move up"}
          aria-label="Move path up"
          on:click|stopPropagation={() => {
            if (!line.locked && onMoveUp) onMoveUp();
          }}
          class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canMoveUp || line.locked}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m5 15 7-7 7 7"
            />
          </svg>
        </button>
        <button
          tabindex="-1"
          title={line.locked ? "Path locked" : "Move down"}
          aria-label="Move path down"
          on:click|stopPropagation={() => {
            if (!line.locked && onMoveDown) onMoveDown();
          }}
          class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!canMoveDown || line.locked}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m19 9-7 7-7-7"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="flex flex-row justify-end items-center gap-1 ml-auto">
      <!-- Add Point After Button -->

      <button
        tabindex="-1"
        title="Add Point After This Line"
        aria-label="Add Point After This Line"
        on:click={onInsertAfter}
        class="text-green-500 hover:text-green-600"
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
      </button>

      <!-- Add Wait After Button -->
      <button
        tabindex="-1"
        title="Add Wait After"
        aria-label="Add Wait After"
        on:click={onAddWaitAfter}
        class="text-amber-500 hover:text-amber-600"
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
      </button>

      {#if lines.length > 1}
        <button
          tabindex="-1"
          title="Remove Line"
          aria-label="Remove Line"
          class="text-red-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
          on:click={() => {
            if (!line.locked && onRemove) onRemove();
          }}
          aria-disabled={line.locked}
          disabled={line.locked}
        >
          <TrashIcon className="size-5" strokeWidth={2} />
        </button>
      {/if}
    </div>
  </div>

  {#if !collapsed}
    <div class={`h-[0.75px] w-full`} style={`background: ${line.color}`} />

    <div class="flex flex-col justify-start items-start w-full">
      <div class="font-light">Point Position:</div>
      <div class="flex flex-wrap justify-start items-center gap-x-4 gap-y-2">
        <div class="flex items-center gap-2">
          <div class="font-extralight">X:</div>
          <input
            bind:this={xInput}
            tabindex="-1"
            class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14 sm:w-14"
            step={$snapToGrid && $showGrid ? $gridSize : 0.1}
            type="number"
            min="0"
            max="144"
            bind:value={line.endPoint.x}
            disabled={line.locked}
            title={snapToGridTitle}
          />
          <div class="font-extralight">Y:</div>
          <input
            bind:this={yInput}
            tabindex="-1"
            class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14 sm:w-14"
            step={$snapToGrid && $showGrid ? $gridSize : 0.1}
            min="0"
            max="144"
            type="number"
            bind:value={line.endPoint.y}
            disabled={line.locked}
            title={snapToGridTitle}
          />
        </div>

        <HeadingControls
          bind:this={headingControls}
          endPoint={line.endPoint}
          locked={line.locked}
          tabindex={-1}
          on:change={() => {
            // Force reactivity so timeline recalculates immediately
            lines = [...lines];
          }}
          on:commit={() => {
            // Commit change to history
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
  {/if}
</div>
