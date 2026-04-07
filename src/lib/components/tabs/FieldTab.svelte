<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { run } from "svelte/legacy";

  import type {
    Point,
    Line,
    SequenceItem,
    Shape,
    Settings,
    BasePoint,
  } from "../../../types/index";
  import RobotPositionDisplay from "../RobotPositionDisplay.svelte";
  import CollapseAllButton from "../tools/CollapseAllButton.svelte";
  import OptimizationDialog from "../dialogs/OptimizationDialog.svelte";
  import GlobalEventMarkers from "../GlobalEventMarkers.svelte";
  import ObstaclesSection from "../sections/ObstaclesSection.svelte";
  import { linesStore } from "../../projectStore";

  interface Props {
    robotXY: BasePoint;
    robotHeading: number;
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    shapes: Shape[];
    settings: Settings;
    recordChange: (description?: string) => void;
    onPreviewChange?: ((lines: Line[] | null) => void) | null;
    isActive?: boolean;
  }

  let {
    robotXY,
    robotHeading,
    startPoint,
    lines = $bindable(),
    sequence = $bindable(),
    shapes = $bindable(),
    settings,
    recordChange,
    onPreviewChange = null,
    isActive = false,
  }: Props = $props();

  // Local state for optimization
  let optDialogRef: any = $state(null);
  let globalMarkersRef: GlobalEventMarkers | undefined = $state();
  let optIsRunning: boolean = $state(false);
  let optOptimizedLines: Line[] | null = $state(null);
  let optFailed: boolean = $state(false);

  // Collapsed state
  let collapsedSections = $state({
    obstacles: shapes.map(() => true),
    obstaclesSection: false,
    globalMarkers: false,
    optimizerSection: false,
  });

  run(() => {
    if (shapes.length !== collapsedSections.obstacles.length) {
      collapsedSections.obstacles = shapes.map(() => true);
    }
  });

  function toSerializableLines(input: Line[]): Line[] {
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(input, (_key, value) => {
      if (typeof value === "function") return undefined;

      if (value && typeof value === "object") {
        if (typeof window !== "undefined" && value === window) {
          return undefined;
        }

        if (typeof Node !== "undefined" && value instanceof Node) {
          return undefined;
        }

        const obj = value as object;
        if (seen.has(obj)) {
          return undefined;
        }
        seen.add(obj);
      }

      return value;
    });

    return JSON.parse(serialized) as Line[];
  }

  let allCollapsed = $derived(
    collapsedSections.obstacles.every((v) => v) &&
      collapsedSections.globalMarkers &&
      collapsedSections.optimizerSection,
  );

  function toggleCollapseAll() {
    if (allCollapsed) {
      collapsedSections.obstacles = shapes.map(() => false);
      collapsedSections.obstaclesSection = false;
      collapsedSections.globalMarkers = false;
      collapsedSections.optimizerSection = false;
    } else {
      collapsedSections.obstacles = shapes.map(() => true);
      collapsedSections.obstaclesSection = true;
      collapsedSections.globalMarkers = true;
      collapsedSections.optimizerSection = true;
    }
    collapsedSections = { ...collapsedSections };
  }

  function handleOptimizationApply(newLines: Line[]) {
    const safeLines = toSerializableLines(newLines);
    // Commit to the canonical store first so recordChange snapshots the new path.
    linesStore.set(safeLines);
    lines = safeLines;
    recordChange?.();
  }

  // Exported methods for ControlTab to call
  export async function openAndStartOptimization() {
    try {
      if (optDialogRef && optDialogRef.startOptimization)
        await optDialogRef.startOptimization();
    } catch (e) {
      console.error("Error opening/starting field optimizer:", e);
    }
  }

  export function stopOptimization() {
    if (optDialogRef && optDialogRef.stopOptimization) {
      try {
        optDialogRef.stopOptimization();
      } catch (e) {
        console.error("Error stopping field optimizer:", e);
      }
    }
  }

  export function applyOptimization() {
    if (optDialogRef && optDialogRef.handleApply) {
      try {
        optDialogRef.handleApply();
      } catch (e) {
        console.error("Error applying field optimizer result:", e);
      }
    }
  }

  export function discardOptimization() {
    if (optDialogRef && optDialogRef.handleClose) {
      try {
        optDialogRef.handleClose();
      } catch (e) {
        console.error("Error discarding/closing field optimizer:", e);
      }
    }
  }

  export function retryOptimization() {
    if (optDialogRef && optDialogRef.startOptimization) {
      try {
        optDialogRef.startOptimization();
      } catch (e) {
        console.error("Error retrying field optimizer:", e);
      }
    }
  }

  export function getOptimizationStatus() {
    return {
      isOpen: true,
      isRunning: optIsRunning,
      optimizedLines: optOptimizedLines,
      optimizationFailed: optFailed,
    };
  }

  export async function scrollToMarker(markerId: string) {
    if (globalMarkersRef) {
      await globalMarkersRef.scrollToMarker(markerId);
    }
  }
</script>

<div class="p-4 w-full flex flex-col gap-6">
  <div class="flex items-center justify-between w-full gap-4">
    <RobotPositionDisplay {robotXY} {robotHeading} {settings} />

    <div class="flex items-center justify-end">
      <CollapseAllButton {allCollapsed} onToggle={toggleCollapseAll} />
    </div>
  </div>

  <OptimizationDialog
    bind:this={optDialogRef}
    bind:isRunning={optIsRunning}
    bind:optimizedLines={optOptimizedLines}
    bind:optimizationFailed={optFailed}
    bind:isOpen={() => !collapsedSections.optimizerSection, (v) => collapsedSections.optimizerSection = !v}
    {startPoint}
    {lines}
    {settings}
    {sequence}
    {shapes}
    onApply={handleOptimizationApply}
    {onPreviewChange}
  />

  <GlobalEventMarkers
    bind:this={globalMarkersRef}
    bind:sequence
    bind:lines
    bind:collapsedMarkers={collapsedSections.globalMarkers}
  />

  <ObstaclesSection
    bind:shapes
    bind:collapsedObstacles={collapsedSections.obstacles}
    bind:collapsed={collapsedSections.obstaclesSection}
    {isActive}
    {recordChange}
  />
</div>
