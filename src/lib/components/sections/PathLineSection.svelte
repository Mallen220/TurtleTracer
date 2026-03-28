<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { Line } from "../../../types/index";
  import { snapToGrid, showGrid, gridSize } from "../../../stores";
  import ControlPointsSection from "./ControlPointsSection.svelte";
  import HeadingControls from "../HeadingControls.svelte";
  import ColorPicker from "../tools/ColorPicker.svelte";
  import {
    selectedLineId,
    selectedPointId,
    focusRequest,
  } from "../../../stores";
  import DeleteButtonWithConfirm from "../common/DeleteButtonWithConfirm.svelte";
  import {
    handleWaypointRename,
    isLineLinked,
  } from "../../../utils/pointLinking";
  import { settingsStore } from "../../projectStore";
  import {
    toUser,
    toField,
    formatDisplayCoordinate,
    cmToInch,
  } from "../../../utils/coordinates";
  import { tooltipPortal } from "../../actions/portal";
  import { onMount, onDestroy } from "svelte";
  import { actionRegistry } from "../../actionRegistry";
  import { getSmallButtonClass } from "../../../utils/buttonStyles";
  import {
    ChevronRightIcon,
    EyeIcon,
    EyeSlashIcon,
    LockIcon,
    UnlockIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    PlusIcon,
    LinkIcon,
  } from "../icons";

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
  export let onAddAction: ((def: any) => void) | undefined = undefined;
  export let recordChange: (action?: string) => void;
  export let onMoveUp: () => void;
  export let onMoveDown: () => void;
  export let canMoveUp: boolean = true;
  export let canMoveDown: boolean = true;

  $: isSelected = $selectedLineId === line.id;
  $: isHidden = line.hidden ?? false;

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

  $: userPoint = toUser(
    line.endPoint,
    $settingsStore.coordinateSystem || "Pedro",
  );

  // Listen for focus requests
  $: if ($focusRequest) {
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

<div
  role="button"
  tabindex="0"
  aria-pressed={isSelected}
  class={`bg-white dark:bg-neutral-800 rounded-xl shadow-sm border transition-all duration-200 ${
    isSelected
      ? "border-purple-500 ring-1 ring-purple-500/20"
      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
  } ${isHidden ? "opacity-50 grayscale-[50%]" : ""}`}
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
        class="flex items-center gap-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 transition-colors px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        title="{collapsed ? 'Expand' : 'Collapse'} path"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} Path {idx + 1}"
        aria-expanded={!collapsed}
      >
        <ChevronRightIcon
          className="size-3.5 transition-transform duration-200 {collapsed
            ? 'rotate-0'
            : 'rotate-90'}"
        />
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
            on:blur={() => recordChange && recordChange("Rename Path")}
            on:click|stopPropagation
          />
          {#if line.id && isLineLinked(lines, line.id)}
            <div
              role="presentation"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 cursor-help"
              on:mouseenter={(e) => handleLinkHoverEnter(e, line.id || null)}
              on:mouseleave={handleLinkHoverLeave}
            >
              <LinkIcon className="w-3.5 h-3.5" />
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
          line.hidden = !isHidden;
          lines = [...lines];
          if (recordChange) recordChange();
        }}
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        title={isHidden ? "Show Path" : "Hide Path"}
        aria-label={isHidden ? "Show Path" : "Hide Path"}
      >
        {#if isHidden}
          <EyeSlashIcon className="size-4 text-neutral-400" strokeWidth={2} />
        {:else}
          <EyeIcon className="size-4" strokeWidth={2} />
        {/if}
      </button>

      <button
        on:click|stopPropagation={() => {
          line.locked = !line.locked;
          lines = [...lines];
        }}
        class="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        title={line.locked ? "Unlock Path" : "Lock Path"}
        aria-label={line.locked ? "Unlock Path" : "Lock Path"}
      >
        {#if line.locked}
          <LockIcon className="size-4 text-amber-500" />
        {:else}
          <UnlockIcon className="size-4" strokeWidth={2} />
        {/if}
      </button>

      <div
        class="h-4 w-px bg-neutral-200 dark:bg-neutral-700 mx-1"
        role="presentation"
        aria-hidden="true"
      ></div>

      <div
        class="flex items-center bg-neutral-100 dark:bg-neutral-900 rounded-lg p-0.5"
      >
        <button
          on:click|stopPropagation={() =>
            !line.locked && onMoveUp && onMoveUp()}
          disabled={!canMoveUp || line.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          title="Move Up"
          aria-label="Move Up"
        >
          <ArrowUpIcon className="size-3.5" />
        </button>
        <button
          on:click|stopPropagation={() =>
            !line.locked && onMoveDown && onMoveDown()}
          disabled={!canMoveDown || line.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          title="Move Down"
          aria-label="Move Down"
        >
          <ArrowDownIcon className="size-3.5" />
        </button>
      </div>

      <DeleteButtonWithConfirm
        on:click={() => !line.locked && onRemove && onRemove()}
        disabled={line.locked}
        title="Delete Path"
        className="ml-1"
      />
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
                min={$settingsStore.coordinateSystem === "FTC" ? "-72" : "0"}
                max={$settingsStore.coordinateSystem === "FTC" ? "72" : "144"}
                value={formatDisplayCoordinate(userPoint.x, $settingsStore)}
                on:change={(e) => {
                  let val = parseFloat(e.currentTarget.value);
                  if (!isNaN(val)) {
                    if ($settingsStore.visualizerUnits === "metric") {
                      val = cmToInch(val);
                    }
                    const newPt = toField(
                      { x: val, y: userPoint.y },
                      $settingsStore.coordinateSystem || "Pedro",
                    );
                    line.endPoint.x = newPt.x;
                    line.endPoint.y = newPt.y;
                  }
                }}
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
                min={$settingsStore.coordinateSystem === "FTC" ? "-72" : "0"}
                max={$settingsStore.coordinateSystem === "FTC" ? "72" : "144"}
                type="number"
                value={formatDisplayCoordinate(userPoint.y, $settingsStore)}
                on:change={(e) => {
                  let val = parseFloat(e.currentTarget.value);
                  if (!isNaN(val)) {
                    if ($settingsStore.visualizerUnits === "metric") {
                      val = cmToInch(val);
                    }
                    const newPt = toField(
                      { x: userPoint.x, y: val },
                      $settingsStore.coordinateSystem || "Pedro",
                    );
                    line.endPoint.x = newPt.x;
                    line.endPoint.y = newPt.y;
                  }
                }}
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
              recordChange("Update Heading");
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
        class="flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-700/50 flex-wrap"
      >
        <span class="text-xs font-medium text-neutral-400 mr-auto"
          >Insert after:</span
        >

        {#each Object.values($actionRegistry) as def (def.kind)}
          {#if def.createDefault || def.isPath}
            {@const color = def.buttonColor || "gray"}
            <button
              on:click={() => {
                if (onAddAction) onAddAction(def);
                else if (def.isPath) onInsertAfter();
                else if (def.isWait) onAddWaitAfter();
                else if (def.isRotate) onAddRotateAfter();
              }}
              class={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${getSmallButtonClass(color)}`}
              title={`Add ${def.label} After`}
              aria-label={`Add ${def.label} After`}
            >
              <PlusIcon className="size-3" />
              {def.label}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
</div>
