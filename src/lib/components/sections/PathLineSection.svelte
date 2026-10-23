<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { untrack } from "svelte";

  import type { ActionDefinition, Line } from "../../../types/index";
  import { snapToGrid, gridSize } from "../../../stores";
  import ControlPointsSection from "./ControlPointsSection.svelte";
  import SpeedLimitField from "./SpeedLimitField.svelte";
  import PathOptionsSection from "./PathOptionsSection.svelte";
  import SpeedFixButtons from "./SpeedFixButtons.svelte";
  import { validSpeed } from "../../../utils/timeCalculator/speedCap";
  import {
    applySpeedFix,
    fastestSpeedThatFixes,
    latestStartThatFixes,
    followsBends,
    speedFixes,
    type FixContext,
    type SpeedFix,
  } from "../../../utils/timeCalculator/fixSearch";
  import {
    fallsShort,
    type SegmentFixes,
  } from "../../../utils/timeCalculator/advice";
  import HeadingControls, {
    type HeadingFields,
  } from "../HeadingControls.svelte";
  import ColorPicker from "../tools/ColorPicker.svelte";
  import {
    selectedLineId,
    selectedPointId,
    focusRequest,
  } from "../../../stores";
  import {
    startPointStore,
    timePredictionStore,
    sequenceStore,
  } from "../../projectStore";
  import CardControls from "./CardControls.svelte";
  import InsertAfterBar from "./InsertAfterBar.svelte";
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
  import { ChevronRightIcon, LinkIcon, TriangleWarningIcon } from "../icons";
  import { ui } from "../../ui";

  interface Props {
    line: Line;
    idx: number;
    lines: Line[];
    collapsed: boolean;
    collapsedControlPoints: boolean;
    onRemove: () => void;
    /** Inserts a step of that kind right after this path. */
    onAddAction: (def: ActionDefinition) => void;
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
    onAddAction,
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
    $snapToGrid ? `Snapping to ${$gridSize} grid` : "No snapping",
  );

  let hoveredLinkId: string | null = $state(null);
  let hoveredLinkAnchor: HTMLElement | null = $state(null);

  let xInput: HTMLInputElement | undefined = $state();
  let yInput: HTMLInputElement | undefined = $state();
  let headingControls: HeadingControls | undefined = $state();
  // How far each piecewise segment of this path ends short of its heading.
  let piecewiseShortfalls = $derived(
    $timePredictionStore?.timeline.find(
      (ev) => ev.type === "travel" && ev.lineIndex === idx,
    )?.piecewiseShortfalls,
  );
  let nameInput: HTMLInputElement | undefined = $state();

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

  let xDraft = $state("");
  let yDraft = $state("");
  let isEditingX = $state(false);
  let isEditingY = $state(false);

  $effect(() => {
    if (!isEditingX) {
      xDraft = formatDisplayCoordinate(userPoint.x, $settingsStore);
    }
    if (!isEditingY) {
      yDraft = formatDisplayCoordinate(userPoint.y, $settingsStore);
    }
  });

  function setColor(e: Event) {
    const color = (e.currentTarget as HTMLInputElement).value;
    lines[idx] = { ...lines[idx], color };
    lines = [...lines];
  }

  function commitEndpointInput(axis: "x" | "y") {
    let parsed = Number.parseFloat(axis === "x" ? xDraft : yDraft);
    if (Number.isNaN(parsed)) {
      xDraft = formatDisplayCoordinate(userPoint.x, $settingsStore);
      yDraft = formatDisplayCoordinate(userPoint.y, $settingsStore);
      return;
    }

    if ($settingsStore.visualizerUnits === "metric") {
      parsed = cmToInch(parsed);
    }

    const newPt =
      axis === "x"
        ? toField(
            { x: parsed, y: userPoint.y },
            $settingsStore.coordinateSystem || "Pedro",
          )
        : toField(
            { x: userPoint.x, y: parsed },
            $settingsStore.coordinateSystem || "Pedro",
          );

    line.endPoint.x = newPt.x;
    line.endPoint.y = newPt.y;
    lines[idx] = { ...line, endPoint: { ...line.endPoint } };
    lines = [...lines];
  }

  // Listen for focus requests
  $effect(() => {
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
  // What would clear a piecewise segment's shortfall, found by trying changes
  // in the simulation. It is asked for when the explanation is shown.
  function segmentFixes(segment: number): SegmentFixes {
    const ctx: FixContext = {
      startPoint: $startPointStore,
      lines: $state.snapshot(lines),
      sequence: $sequenceStore,
      settings: $settingsStore,
    };
    return {
      start: latestStartThatFixes(ctx, idx, segment),
      speed: fastestSpeedThatFixes(
        ctx,
        idx,
        (event) => !fallsShort(event.piecewiseShortfalls?.[segment]),
      ),
    };
  }

  // The speed limits: this path's own, and its chain's (kept on the first path).
  let robotMaxSpeed = $derived($settingsStore.maxVelocity || 100);
  let chainSpeedLine = $derived(
    chainRootIndex === -1 ? line : (lines[chainRootIndex] ?? line),
  );
  let chainSpeed = $derived(validSpeed(chainSpeedLine.chainMaxSpeed));
  // A path that was last in a chain can still carry the chain's speed.
  let showChainSpeed = $derived(isChainRoot || chainSpeed !== undefined);
  let pathSpeedPlaceholder = $derived(
    chainSpeed === undefined
      ? `${robotMaxSpeed} (robot max)`
      : `${chainSpeed} (chain)`,
  );

  // The first problem with how the robot drives this path: a bend it can't
  // follow at its speed, else a heading it can't finish turning.
  let travelEvent = $derived(
    $timePredictionStore?.timeline.find(
      (ev) => ev.type === "travel" && ev.lineIndex === idx,
    ),
  );
  let motionProblem = $derived.by(() => {
    const wide = travelEvent?.excursion;
    if (wide) {
      return {
        kind: "wide" as const,
        chip: "Runs wide",
        text: `The robot runs ${wide.maxOffset.toFixed(1)} in wide of a bend it can't follow at this speed.`,
        hint: "Reshape the bend, or split the path there (see Path Statistics).",
      };
    }
    const short = travelEvent?.piecewiseShortfalls?.find(fallsShort);
    if (short) {
      return {
        kind: "turn" as const,
        chip: "Won't finish turning",
        text: `A heading segment won't finish turning: it ends ${Math.round(short.degrees)}° short.`,
        hint: "Start the segment earlier or turn less (hover its warning under Heading).",
      };
    }
    return null;
  });

  // The speed limits that clear it, found by trying them in the simulation.
  // That takes a moment, so it waits until editing has settled.
  let motionFixes: SpeedFix[] = $state([]);
  let motionFixesChecked = $state(false);
  $effect(() => {
    const kind = motionProblem?.kind;
    motionFixes = [];
    motionFixesChecked = false;
    if (!kind) return;
    const ctx: FixContext = {
      startPoint: $startPointStore,
      lines: $state.snapshot(lines),
      sequence: $sequenceStore,
      settings: $settingsStore,
    };
    const handle = setTimeout(() => {
      motionFixes = speedFixes(ctx, idx, (event) =>
        kind === "wide"
          ? followsBends(ctx.settings)(event)
          : !event.piecewiseShortfalls?.some(fallsShort),
      );
      motionFixesChecked = true;
    }, 300);
    return () => clearTimeout(handle);
  });

  function applyMotionFix(fix: SpeedFix) {
    lines = applySpeedFix(lines, fix);
    recordChange?.(
      fix.field === "chainMaxSpeed" ? "Set Chain Max Speed" : "Set Max Speed",
    );
  }

  // The settings under Chain Motion start folded away; what is set shows beside the heading.
  let optionsOpen = $state(false);
  let optionsSummary = $derived([
    ...(validSpeed(line.maxSpeed) === undefined
      ? []
      : [`Max ${line.maxSpeed} in/s`]),
    ...(validSpeed(chainSpeedLine.chainMaxSpeed) === undefined ||
    !showChainSpeed
      ? []
      : [`Chain ${chainSpeedLine.chainMaxSpeed} in/s`]),
  ]);

  function setSpeed(
    field: "maxSpeed" | "chainMaxSpeed",
    speed: number | undefined,
  ) {
    const targetIdx =
      field === "chainMaxSpeed" && chainRootIndex !== -1 ? chainRootIndex : idx;
    lines[targetIdx] = { ...lines[targetIdx], [field]: speed };
    lines = [...lines];
    recordChange?.(
      field === "maxSpeed" ? "Change Max Speed" : "Change Chain Max Speed",
    );
  }

  let canShowGlobalHeadingToggle = $derived(
    isPartOfChain && !isOverriddenByGlobalHeading,
  );

  let pseudoGlobalEndPoint = $state<HeadingFields>({
    heading: "tangential",
    reverse: false,
    degrees: 0,
    startDeg: 0,
    endDeg: 0,
    targetX: 72,
    targetY: 72,
    segments: [],
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
      if (gh !== undefined && gh !== "none") {
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
    const targetIdx = chainRootIndex === -1 ? idx : chainRootIndex;
    const targetLine = lines[targetIdx];

    targetLine.globalHeading = pseudoGlobalEndPoint.heading;
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

<!-- A group, not a button: it holds buttons and fields of its own. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  role="group"
  tabindex="0"
  aria-label="Path {idx + 1}"
  aria-current={isSelected ? "true" : undefined}
  class={`bg-white dark:bg-neutral-800 rounded-md shadow-sm border transition-all duration-200 ${
    isSelected
      ? "border-emerald-500 ring-1 ring-emerald-500/20"
      : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
  } ${isHidden ? "opacity-50 grayscale-[50%]" : ""}`}
  onclick={() => {
    if (line.id) selectedLineId.set(line.id);
  }}
  onkeydown={(e) => {
    // Keys typed into the fields inside belong to them.
    if (e.target !== e.currentTarget) return;
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
        onclick={(e) => {
          e.stopPropagation();
          toggleCollapsed();
        }}
        class={ui.btnSm.ghost}
        title="{collapsed ? 'Expand' : 'Collapse'} path"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} Path {idx + 1}"
        aria-expanded={!collapsed}
      >
        <ChevronRightIcon
          className="size-3.5 transition-transform duration-200 {collapsed
            ? 'rotate-0'
            : 'rotate-90'}"
        />
        <span class="{ui.heading} whitespace-nowrap">Path {idx + 1}</span>
      </button>

      <div class="flex items-center gap-2 flex-1 min-w-0">
        <div class="relative flex-1 min-w-0">
          <input
            bind:this={nameInput}
            value={line.name}
            placeholder="Path Name"
            aria-label="Path name"
            title="Edit path name"
            class="w-full pl-2 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all placeholder-neutral-400 truncate"
            class:text-purple-500={hoveredLinkId === line.id}
            disabled={line.locked}
            oninput={handleNameInput}
            onblur={() => recordChange && recordChange("Rename Path")}
            onclick={(e) => {
              e.stopPropagation();
            }}
          />
          {#if line.id && isLineLinked(lines, line.id)}
            <div
              role="presentation"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-purple-500 cursor-help"
              onmouseenter={(e) => handleLinkHoverEnter(e, line.id || null)}
              onmouseleave={handleLinkHoverLeave}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              {#if hoveredLinkId === line.id}
                <div
                  use:tooltipPortal={hoveredLinkAnchor}
                  class="w-64 p-2 bg-purple-100 dark:bg-purple-900 border border-purple-300 dark:border-purple-700 rounded shadow-lg text-xs text-purple-900 dark:text-purple-100 z-50 pointer-events-none"
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
    <CardControls
      label="Path"
      hidden={isHidden}
      locked={!!line.locked}
      {canMoveUp}
      {canMoveDown}
      ontoggleHidden={() => {
        const currentLine = lines[idx];
        const newLine = { ...currentLine, hidden: !isHidden };
        lines[idx] = newLine;
        lines = [...lines];
        line = newLine;
        if (recordChange) recordChange();
      }}
      ontoggleLocked={() => {
        const currentLine = lines[idx];
        const newLine = { ...currentLine, locked: !currentLine.locked };
        lines[idx] = newLine;
        lines = [...lines];
        line = newLine;
      }}
      onMoveUp={() => onMoveUp?.()}
      onMoveDown={() => onMoveDown?.()}
      onRemove={() => onRemove?.()}
      buttonClass={ui.iconBtnSm.neutral}
      moveClass={ui.iconBtnSm.neutral}
      lockedIconClass="text-amber-600 dark:text-amber-400"
      deleteTitle="Delete Path"
      deleteClass="ml-1"
    >
      {#snippet before()}
        <ColorPicker
          color={line.color}
          oninput={(e) => setColor(e)}
          onchange={(e) => {
            setColor(e);
            recordChange?.("Change Path Color");
          }}
          title="Change Path Color"
          disabled={line.locked}
        />
      {/snippet}
    </CardControls>
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
            class="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide block"
          >
            Target Position
          </span>
          <div class="flex items-center gap-2">
            <div class="relative flex-[0.5] min-w-0 max-w-[200px]">
              <span
                class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-500 dark:text-neutral-400 select-none"
                >X</span
              >
              <input
                bind:this={xInput}
                class="{ui.inputSm} w-full pl-6 pr-2"
                step={$snapToGrid ? $gridSize : 0.1}
                type="number"
                min={$settingsStore.coordinateSystem === "FTC"
                  ? -($settingsStore.fieldHeight ?? 144) / 2
                  : 0}
                max={$settingsStore.coordinateSystem === "FTC"
                  ? ($settingsStore.fieldHeight ?? 144) / 2
                  : ($settingsStore.fieldWidth ?? 144)}
                value={xDraft}
                oninput={(e) => {
                  xDraft = e.currentTarget.value;
                }}
                onfocus={() => {
                  isEditingX = true;
                }}
                onblur={() => {
                  isEditingX = false;
                  commitEndpointInput("x");
                }}
                disabled={line.locked}
                title={snapToGridTitle}
                aria-label="Target X position"
                placeholder="0"
              />
            </div>
            <div class="relative flex-[0.5] min-w-0 max-w-[200px]">
              <span
                class="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-500 dark:text-neutral-400 select-none"
                >Y</span
              >
              <input
                bind:this={yInput}
                class="{ui.inputSm} w-full pl-6 pr-2"
                step={$snapToGrid ? $gridSize : 0.1}
                min={$settingsStore.coordinateSystem === "FTC"
                  ? -($settingsStore.fieldWidth ?? 144) / 2
                  : 0}
                max={$settingsStore.coordinateSystem === "FTC"
                  ? ($settingsStore.fieldWidth ?? 144) / 2
                  : ($settingsStore.fieldHeight ?? 144)}
                type="number"
                value={yDraft}
                oninput={(e) => {
                  yDraft = e.currentTarget.value;
                }}
                onfocus={() => {
                  isEditingY = true;
                }}
                onblur={() => {
                  isEditingY = false;
                  commitEndpointInput("y");
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
              class="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide block"
            >
              Heading
            </span>
            <HeadingControls
              bind:this={headingControls}
              endPoint={line.endPoint}
              locked={line.locked}
              shortfalls={piecewiseShortfalls}
              fixesFor={segmentFixes}
              onchange={() => {
                lines[idx] = { ...line, endPoint: { ...line.endPoint } };
                lines = [...lines];
              }}
              oncommit={() => {
                lines[idx] = { ...line, endPoint: { ...line.endPoint } };
                lines = [...lines];
                if (recordChange) recordChange("Update Heading");
              }}
            />
          </div>
        {:else}
          <div class="space-y-2" class:col-span-2={!isNarrow}>
            <span
              class="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide block"
              >Heading</span
            >
            <button
              class="w-full text-left text-sm text-neutral-500 dark:text-neutral-400 p-2 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-md flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              onclick={() => {
                if (onScrollToItem && chainGlobalSourceLine?.id) {
                  onScrollToItem(chainGlobalSourceLine.id);
                }
              }}
              title="Jump to global source"
            >
              <LinkIcon className="size-4 shrink-0 text-emerald-500" />
              Overridden by Global Chain Heading
            </button>
          </div>
        {/if}

        {#if canShowGlobalHeadingToggle}
          <div
            class="space-y-2 col-span-1 border-t border-neutral-200 dark:border-neutral-700 pt-2"
            class:col-span-3={!isNarrow}
          >
            <label class="flex items-center gap-2 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={hasGlobalHeadingDef}
                onchange={(e) => {
                  const targetIdx =
                    chainRootIndex === -1 ? idx : chainRootIndex;
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
                class={ui.checkbox}
              />
              <span
                class="text-sm font-semibold text-neutral-700 dark:text-neutral-300"
                >Global Chain Heading</span
              >
            </label>

            {#if hasGlobalHeadingDef}
              <div class="pl-2 mt-2 ml-1 border-l-2 border-emerald-500/30">
                <HeadingControls
                  endPoint={pseudoGlobalEndPoint}
                  locked={line.locked}
                  onchange={handleGlobalChange}
                  oncommit={() => {
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
        recordChange={() => {
          lines[idx] = { ...line };
          lines = [...lines];
          if (recordChange) recordChange("Update Control Points");
        }}
      />

      <!-- Settings most people leave alone -->
      <div>
        <PathOptionsSection
          id="path-options-{line.id}"
          summary={optionsSummary}
          warning={motionProblem?.chip}
          bind:open={optionsOpen}
        >
          {#if motionProblem}
            <div class="{ui.alert.warning} mb-3 flex flex-col gap-2">
              <div class="flex items-start gap-2">
                <TriangleWarningIcon className="size-4 shrink-0 mt-0.5" />
                <span>{motionProblem.text}</span>
              </div>
              <SpeedFixButtons
                fixes={motionFixes}
                onapply={applyMotionFix}
                disabled={line.locked}
              />
              {#if motionFixesChecked && motionFixes.length === 0}
                <span class="opacity-80">
                  No speed limit fixes it. {motionProblem.hint}
                </span>
              {/if}
            </div>
          {/if}
          <div
            class="grid gap-4"
            class:grid-cols-1={isNarrow || !showChainSpeed}
            class:grid-cols-2={!isNarrow && showChainSpeed}
          >
            {#if showChainSpeed}
              <SpeedLimitField
                label="Chain Max Speed"
                value={chainSpeedLine.chainMaxSpeed}
                placeholder="{robotMaxSpeed} (robot max)"
                ariaLabel="Chain max speed in inches per second"
                robotMax={robotMaxSpeed}
                disabled={line.locked}
                info={chainSpeedInfo}
                onchange={(speed) => setSpeed("chainMaxSpeed", speed)}
              />
            {/if}
            <SpeedLimitField
              label="Max Speed"
              value={line.maxSpeed}
              placeholder={pathSpeedPlaceholder}
              ariaLabel="Max speed of this path in inches per second"
              robotMax={robotMaxSpeed}
              disabled={line.locked}
              info={pathSpeedInfo}
              onchange={(speed) => setSpeed("maxSpeed", speed)}
            />
          </div>
        </PathOptionsSection>
      </div>

      <InsertAfterBar {onAddAction} />
    </div>
  {/if}
</div>

{#snippet pathSpeedInfo()}
  <p>
    <strong>Max Speed</strong> is the fastest the robot drives this path, in inches
    per second.
  </p>
  <p>
    Leave it blank to use the chain's speed, or else the robot's Max Velocity
    (Settings, Motion). A speed set here replaces the chain's for this path,
    even a higher one, just as in Pedro.
  </p>
  {@render exportNote(false)}
{/snippet}

{#snippet chainSpeedInfo()}
  <p>
    <strong>Chain Max Speed</strong> limits every path in this chain, the paths linked
    together so the robot doesn't stop between them.
  </p>
  <p>
    A path with its own <strong>Max Speed</strong> uses that instead. Leave it blank
    for no limit beyond the robot's Max Velocity.
  </p>
  {@render exportNote(true)}
{/snippet}

{#snippet exportNote(isChain: boolean)}
  <p class="text-neutral-300">
    Exported as <code>maxVelocityConstraint</code>
    {isChain ? "on the chain" : "on the path"} through
    <code>Constants.foresightConfig</code>. If your build fails with "cannot
    find symbol foresightConfig", add
    <code>public static ForesightConfig foresightConfig</code> to your Constants class
    and build your Follower from it (see Pedro's "Modifying Constants").
  </p>
{/snippet}
