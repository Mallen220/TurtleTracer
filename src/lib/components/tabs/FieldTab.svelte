<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    Point,
    Line,
    SequenceItem,
    Shape,
    Settings,
    BasePoint,
  } from "../../../types/index";
  import { tick } from "svelte";
  import { slide } from "svelte/transition";
  import RobotPositionDisplay from "../RobotPositionDisplay.svelte";
  import CollapseAllButton from "../tools/CollapseAllButton.svelte";
  import OptimizationDialog from "../dialogs/OptimizationDialog.svelte";
  import GlobalEventMarkers from "../GlobalEventMarkers.svelte";
  import ObstaclesSection from "../sections/ObstaclesSection.svelte";
  import { validatePath } from "../../../utils/validation";

  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let shapes: Shape[];
  export let settings: Settings;
  export let recordChange: () => void;
  export let onPreviewChange: ((lines: Line[] | null) => void) | null = null;

  // Local state for optimization
  let optimizationOpen = false;
  let optDialogRef: any = null;
  let globalMarkersRef: GlobalEventMarkers;
  let optIsRunning: boolean = false;
  let optOptimizedLines: Line[] | null = null;
  let optFailed: boolean = false;

  // Collapsed state
  let collapsedSections = {
    obstacles: shapes.map(() => true),
    obstaclesSection: false,
    globalMarkers: false,
  };

  $: if (shapes.length !== collapsedSections.obstacles.length) {
    collapsedSections.obstacles = shapes.map(() => true);
  }

  $: allCollapsed =
    collapsedSections.obstacles.every((v) => v) &&
    collapsedSections.globalMarkers;

  function toggleCollapseAll() {
    if (allCollapsed) {
      collapsedSections.obstacles = shapes.map(() => false);
      collapsedSections.obstaclesSection = false;
      collapsedSections.globalMarkers = false;
    } else {
      collapsedSections.obstacles = shapes.map(() => true);
      collapsedSections.obstaclesSection = true;
      collapsedSections.globalMarkers = true;
    }
    collapsedSections = { ...collapsedSections };
  }

  function handleValidate() {
    validatePath(startPoint, lines, settings, sequence, shapes);
  }

  function handleOptimizationApply(newLines: Line[]) {
    lines = newLines;
    recordChange?.();
  }

  // Exported methods for ControlTab to call
  export async function openAndStartOptimization() {
    try {
      optimizationOpen = true;
      await tick();
      if (optDialogRef && optDialogRef.startOptimization)
        await optDialogRef.startOptimization();
    } catch (e) {
      console.error("Error opening/starting field optimizer:", e);
      optimizationOpen = false;
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
      isOpen: optimizationOpen,
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
    <RobotPositionDisplay
      {robotXY}
      {robotHeading}
      {settings}
      onToggleOptimization={() => (optimizationOpen = !optimizationOpen)}
      onValidate={handleValidate}
    />

    <div class="flex items-center justify-end">
      <CollapseAllButton {allCollapsed} onToggle={toggleCollapseAll} />
    </div>
  </div>

  {#if optimizationOpen}
    <div
      class="w-full border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-4"
      transition:slide
    >
      <OptimizationDialog
        bind:this={optDialogRef}
        bind:isRunning={optIsRunning}
        bind:optimizedLines={optOptimizedLines}
        bind:optimizationFailed={optFailed}
        isOpen={true}
        {startPoint}
        {lines}
        {settings}
        {sequence}
        {shapes}
        onApply={handleOptimizationApply}
        {onPreviewChange}
        onClose={() => (optimizationOpen = false)}
      />
    </div>
  {/if}

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
  />
</div>
