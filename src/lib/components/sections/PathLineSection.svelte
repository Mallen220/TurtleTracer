<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { untrack } from "svelte";
  import { run, stopPropagation, createBubbler } from "svelte/legacy";

  const bubble = createBubbler();
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
  import { startPointStore } from "../../projectStore";
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
  import { onMount } from "svelte";
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

  interface Props {
    line: Line;
    idx: number;
    lines: Line[];
    collapsed: boolean;
    collapsedControlPoints: boolean;
    onRemove: () => void;
    onInsertAfter: () => void;
    onAddWaitAfter: () => void;
    onAddRotateAfter: () => void;
    onAddAction?: ((def: any) => void) | undefined;
    recordChange: (action?: string) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    onScrollToItem?: (id: string) => void;
  }

  let {
    line = $bindable(),
    idx,
    lines = $bindable(),
    collapsed = $bindable(),
    collapsedControlPoints = $bindable(),
    onRemove,
    onInsertAfter,
    onAddWaitAfter,
    onAddRotateAfter,
    onAddAction = undefined,
    recordChange,
    onMoveUp,
    onMoveDown,
    canMoveUp = true,
    canMoveDown = true,
    onScrollToItem,
  }: Props = $props();

  let isSelected = $derived($selectedLineId === line.id);
  let isHidden = $derived(line.hidden ?? false);

  let snapToGridTitle = $derived(
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping",
  );

  let hoveredLinkId: string | null = $state(null);
  let hoveredLinkAnchor: HTMLElement | null = $state(null);

  let xInput: HTMLInputElement | undefined = $state();
  let yInput: HTMLInputElement | undefined = $state();
  let headingControls: HeadingControls | undefined = $state();
  let nameInput: HTMLInputElement | undefined;

  // Container-based responsiveness: observe the grid container's width and
  // toggle a compact layout when it becomes too narrow (e.g., in a small
  // control tab). This ensures the Heading section snaps under Target Position
  // based on the control tab size and not the viewport width.
  let gridContainer: HTMLElement | undefined = $state();
  let isNarrow: boolean = $state(false);
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

  let userPoint = $derived(
    toUser(line.endPoint, $settingsStore.coordinateSystem || "Pedro"),
  );

  // Listen for focus requests
  run(() => {
    if ($focusRequest) {
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
  });

  let isChainContinuation = $derived(line.isChain === true);
  let isChainRoot = $derived(
    !isChainContinuation &&
      idx + 1 < lines.length &&
      lines[idx + 1].isChain === true,
  );

  let chainRootIndex = $derived.by(() => {
    if (isChainRoot) return idx;
    if (isChainContinuation) {
      for (let i = idx; i >= 0; i--) {
        if (!lines[i].isChain) return i;
      }
    }
    return -1;
  });

  let chainGlobalSourceLine = $derived.by(() => {
    if (chainRootIndex === -1) return null;
    if (lines[chainRootIndex].globalHeading !== undefined)
      return lines[chainRootIndex];
    for (let i = chainRootIndex + 1; i < lines.length; i++) {
      if (!lines[i].isChain) break;
      if (lines[i].globalHeading !== undefined) return lines[i];
    }
    return null;
  });

  let isPartOfChain = $derived(isChainRoot || isChainContinuation);
  let hasGlobalHeadingDef = $derived(line.globalHeading !== undefined);
  let isOverriddenByGlobalHeading = $derived(
    chainGlobalSourceLine !== null && chainGlobalSourceLine !== line,
  );
  let canShowGlobalHeadingToggle = $derived(
    isPartOfChain && !isOverriddenByGlobalHeading,
  );

  let pseudoGlobalEndPoint = $state({
    heading: "tangential",
    reverse: false,
    degrees: 0,
    startDeg: 0,
    endDeg: 0,
    targetX: 72,
    targetY: 72,
    segments: [] as any[],
  });

  // Watch STORE -> SIDEBAR (Sync only when store changes externally)
  $effect(() => {
    // Watch these from the line prop (store)
    const gh = line.globalHeading;
    const gr = line.globalReverse;
    const gd = line.globalDegrees;
    const gsd = line.globalStartDeg;
    const ged = line.globalEndDeg;
    const gtx = line.globalTargetX;
    const gty = line.globalTargetY;
    const gsegs = line.globalSegments;

    untrack(() => {
      // Apply to our local pseudo-object for the UI
      if (gh !== undefined) {
        pseudoGlobalEndPoint.heading = gh;
        pseudoGlobalEndPoint.reverse = gr ?? false;
        pseudoGlobalEndPoint.degrees = gd ?? 0;
        pseudoGlobalEndPoint.startDeg = gsd ?? 0;
        pseudoGlobalEndPoint.endDeg = ged ?? 0;
        pseudoGlobalEndPoint.targetX = gtx ?? 72;
        pseudoGlobalEndPoint.targetY = gty ?? 72;

        // Initialize segments if Piecewise is active but list is empty
        let nextSegs = gsegs ? $state.snapshot(gsegs) : [];
        if (gh === "piecewise" && nextSegs.length === 0) {
          nextSegs = [
            { tStart: 0, tEnd: 1, heading: "tangential", reverse: gr ?? false },
          ];
        }
        pseudoGlobalEndPoint.segments = nextSegs;
      }
    });
  });

  function handleGlobalChange() {
    const targetIdx = chainRootIndex !== -1 ? chainRootIndex : idx;
    const targetLine = lines[targetIdx];

    targetLine.globalHeading = pseudoGlobalEndPoint.heading as any;
    targetLine.globalReverse = pseudoGlobalEndPoint.reverse;
    targetLine.globalDegrees = pseudoGlobalEndPoint.degrees;
    targetLine.globalStartDeg = pseudoGlobalEndPoint.startDeg;
    targetLine.globalEndDeg = pseudoGlobalEndPoint.endDeg;
    targetLine.globalTargetX = pseudoGlobalEndPoint.targetX;
    targetLine.globalTargetY = pseudoGlobalEndPoint.targetY;
    targetLine.globalSegments = $state.snapshot(pseudoGlobalEndPoint.segments);

    lines[targetIdx] = { ...targetLine };
    lines = [...lines];

    // If this is the first path in the project, sync the project start point heading
    if (targetIdx === 0) {
      startPointStore.update((s) => {
        const h = pseudoGlobalEndPoint.heading;
        if (h === "constant" || h === "linear") {
          s.heading = h;
          if (h === "constant") s.degrees = pseudoGlobalEndPoint.degrees;
          else {
            s.startDeg = pseudoGlobalEndPoint.startDeg;
            s.endDeg = pseudoGlobalEndPoint.endDeg;
          }
        } else if (h === "tangential" || h === "facingPoint") {
          s.heading = h;
          if (h === "facingPoint") {
            s.targetX = pseudoGlobalEndPoint.targetX;
            s.targetY = pseudoGlobalEndPoint.targetY;
          }
        }
        return { ...s };
      });
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
  onclick={() => {
    if (line.id) selectedLineId.set(line.id);
  }}
  onkeydown={(e) => {
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
        onclick={stopPropagation(toggleCollapsed)}
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
            oninput={handleNameInput}
            onblur={() => recordChange && recordChange("Rename Path")}
            onclick={stopPropagation(bubble("click"))}
          />
          {#if line.id && isLineLinked(lines, line.id)}
            <div
              role="presentation"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 cursor-help"
              onmouseenter={(e) => handleLinkHoverEnter(e, line.id || null)}
              onmouseleave={handleLinkHoverLeave}
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
        oninput={() => {
          lines = [...lines];
        }}
        onchange={() => {
          lines = [...lines];
          if (recordChange) recordChange("Change Path Color");
        }}
        title="Change Path Color"
        disabled={line.locked}
      />

      <button
        onclick={stopPropagation(() => {
          const currentLine = lines[idx];
          const newLine = { ...currentLine, hidden: !isHidden };
          lines[idx] = newLine;
          lines = [...lines];
          line = newLine;
          if (recordChange) recordChange();
        })}
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
        onclick={stopPropagation(() => {
          const currentLine = lines[idx];
          const newLine = { ...currentLine, locked: !currentLine.locked };
          lines[idx] = newLine;
          lines = [...lines];
          line = newLine;
        })}
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
          onclick={stopPropagation(
            () => !line.locked && onMoveUp && onMoveUp(),
          )}
          disabled={!canMoveUp || line.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          title="Move Up"
          aria-label="Move Up"
        >
          <ArrowUpIcon className="size-3.5" />
        </button>
        <button
          onclick={stopPropagation(
            () => !line.locked && onMoveDown && onMoveDown(),
          )}
          disabled={!canMoveDown || line.locked}
          class="p-1 rounded-md hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          title="Move Down"
          aria-label="Move Down"
        >
          <ArrowDownIcon className="size-3.5" />
        </button>
      </div>

      <DeleteButtonWithConfirm
        onclick={() => !line.locked && onRemove && onRemove()}
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
                oninput={(e) => {
                  let val = Number.parseFloat(e.currentTarget.value);
                  if (!Number.isNaN(val)) {
                    if ($settingsStore.visualizerUnits === "metric") {
                      val = cmToInch(val);
                    }
                    const newPt = toField(
                      { x: val, y: userPoint.y },
                      $settingsStore.coordinateSystem || "Pedro",
                    );
                    line.endPoint.x = newPt.x;
                    line.endPoint.y = newPt.y;
                    lines[idx] = { ...line, endPoint: { ...line.endPoint } };
                    lines = [...lines];
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
                oninput={(e) => {
                  let val = Number.parseFloat(e.currentTarget.value);
                  if (!Number.isNaN(val)) {
                    if ($settingsStore.visualizerUnits === "metric") {
                      val = cmToInch(val);
                    }
                    const newPt = toField(
                      { x: userPoint.x, y: val },
                      $settingsStore.coordinateSystem || "Pedro",
                    );
                    line.endPoint.x = newPt.x;
                    line.endPoint.y = newPt.y;
                    lines[idx] = { ...line, endPoint: { ...line.endPoint } };
                    lines = [...lines];
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
        {#if !isOverriddenByGlobalHeading && !hasGlobalHeadingDef}
          <div
            class="space-y-2"
            class:col-span-2={!isNarrow &&
              line.endPoint.heading !== "piecewise"}
            class:col-span-3={!isNarrow &&
              line.endPoint.heading === "piecewise"}
          >
            <span
              class="text-xs font-semibold text-neutral-500 uppercase tracking-wide block"
            >
              Heading
            </span>
            <HeadingControls
              bind:this={headingControls}
              endPoint={line.endPoint}
              locked={line.locked}
              on:change={() => {
                lines[idx] = { ...line, endPoint: { ...line.endPoint } };
                lines = [...lines];
              }}
              on:commit={() => {
                lines[idx] = { ...line, endPoint: { ...line.endPoint } };
                lines = [...lines];
                if (recordChange) recordChange("Update Heading");
              }}
            />
          </div>
        {:else}
          <div class="space-y-2" class:col-span-2={!isNarrow}>
            <span
              class="text-xs font-semibold text-neutral-500 uppercase tracking-wide block"
              >Heading</span
            >
            <button
              class="w-full text-left text-sm text-neutral-400 p-2 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/50 rounded-lg flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              onclick={() => {
                if (onScrollToItem && chainGlobalSourceLine?.id) {
                  onScrollToItem(chainGlobalSourceLine.id);
                }
              }}
              title="Jump to global source"
            >
              <LinkIcon className="size-4 shrink-0 text-purple-500" />
              Overridden by Global Chain Heading
            </button>
          </div>
        {/if}

        {#if canShowGlobalHeadingToggle}
          <div
            class="space-y-2 col-span-1 border-t border-neutral-100 dark:border-neutral-700 pt-2"
            class:col-span-3={!isNarrow}
          >
            <label class="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={hasGlobalHeadingDef}
                onchange={(e) => {
                  const targetIdx =
                    chainRootIndex !== -1 ? chainRootIndex : idx;
                  const targetLine = lines[targetIdx];
                  if (e.currentTarget.checked) {
                    targetLine.globalHeading = line.endPoint.heading;
                    if (line.endPoint.degrees !== undefined)
                      targetLine.globalDegrees = line.endPoint.degrees;
                    if (line.endPoint.targetX !== undefined)
                      targetLine.globalTargetX = line.endPoint.targetX;
                    if (line.endPoint.targetY !== undefined)
                      targetLine.globalTargetY = line.endPoint.targetY;
                    if (line.endPoint.reverse !== undefined)
                      targetLine.globalReverse = line.endPoint.reverse;
                    if (line.endPoint.startDeg !== undefined)
                      targetLine.globalStartDeg = line.endPoint.startDeg;
                    if (line.endPoint.endDeg !== undefined)
                      targetLine.globalEndDeg = line.endPoint.endDeg;
                    if (
                      line.endPoint.segments &&
                      line.endPoint.segments.length > 0
                    )
                      targetLine.globalSegments = $state.snapshot(
                        line.endPoint.segments,
                      );
                    else if (line.endPoint.heading === "piecewise") {
                      targetLine.globalSegments = [
                        {
                          tStart: 0,
                          tEnd: 1,
                          heading: "tangential",
                          reverse: line.endPoint.reverse ?? false,
                        },
                      ];
                    }
                  } else {
                    targetLine.globalHeading = undefined;
                  }
                  if (targetIdx === 0) {
                    startPointStore.update((s) => {
                      const h = targetLine.globalHeading;
                      if (h === "constant" || h === "linear") {
                        s.heading = h;
                        if (h === "constant")
                          s.degrees = targetLine.globalDegrees || 0;
                        else {
                          s.startDeg = targetLine.globalStartDeg || 0;
                          s.endDeg = targetLine.globalEndDeg || 0;
                        }
                      } else if (h === "tangential" || h === "facingPoint") {
                        s.heading = h;
                        if (h === "facingPoint") {
                          s.targetX = targetLine.globalTargetX || 0;
                          s.targetY = targetLine.globalTargetY || 0;
                        }
                      }
                      return { ...s };
                    });
                  }
                  lines[targetIdx] = { ...targetLine };
                  lines = [...lines];
                  if (recordChange) recordChange("Toggle Global Heading");
                }}
                disabled={line.locked}
                class="rounded text-purple-500 focus:ring-purple-500 bg-neutral-100 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
              />
              <span
                class="text-sm font-semibold text-neutral-600 dark:text-neutral-300"
                >Global Chain Heading</span
              >
            </label>

            {#if hasGlobalHeadingDef}
              <div class="pl-2 mt-2 ml-1 border-l-2 border-purple-500/30">
                <HeadingControls
                  endPoint={pseudoGlobalEndPoint}
                  locked={line.locked}
                  on:change={handleGlobalChange}
                  on:commit={() => {
                    handleGlobalChange();
                    if (recordChange) recordChange("Update Global Heading");
                  }}
                />
              </div>
            {/if}
          </div>
        {/if}
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
              onclick={() => {
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
