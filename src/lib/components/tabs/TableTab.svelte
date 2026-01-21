<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    Point,
    Line,
    SequenceItem,
    Shape,
    Settings,
  } from "../../../types/index";
  // Fixed incorrect relative import: WaypointTable is one level up from the tabs folder
  import WaypointTable from "../WaypointTable.svelte";
  import { validatePath } from "../../../utils/validation";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let recordChange: () => void;
  export let onPreviewChange: ((lines: Line[] | null) => void) | null = null;
  export let shapes: Shape[];
  export let settings: Settings;
  export let isActive: boolean = false;

  let waypointTableRef: any = null;
  let optimizationOpen = false;

  let collapsedObstacles = shapes.map(() => true);
  $: if (shapes.length !== collapsedObstacles.length) {
    collapsedObstacles = shapes.map(() => true);
  }

  function handleValidate() {
    validatePath(startPoint, lines, settings, sequence, shapes);
  }

  function handleOptimizationApply(newLines: Line[]) {
    lines = newLines;
    recordChange?.();
  }

  // Exported methods
  export function openAndStartOptimization() {
    if (waypointTableRef && waypointTableRef.openAndStartOptimization) {
      return waypointTableRef.openAndStartOptimization();
    }
    optimizationOpen = true;
  }

  export function stopOptimization() {
    if (waypointTableRef && waypointTableRef.stopOptimization) {
      waypointTableRef.stopOptimization();
    }
  }

  export function applyOptimization() {
    if (waypointTableRef && waypointTableRef.applyOptimization) {
      waypointTableRef.applyOptimization();
    }
  }

  export function discardOptimization() {
    if (waypointTableRef && waypointTableRef.discardOptimization) {
      waypointTableRef.discardOptimization();
    }
  }

  export function retryOptimization() {
    if (waypointTableRef && waypointTableRef.retryOptimization) {
      waypointTableRef.retryOptimization();
    }
  }

  export function getOptimizationStatus() {
    if (waypointTableRef && waypointTableRef.getOptimizationStatus) {
      return waypointTableRef.getOptimizationStatus();
    }
    return {
      isOpen: optimizationOpen,
      isRunning: false,
      optimizedLines: null,
      optimizationFailed: false,
    };
  }
</script>

<div class="p-4 w-full">
  <WaypointTable
    bind:this={waypointTableRef}
    {isActive}
    bind:startPoint
    bind:lines
    bind:sequence
    {recordChange}
    onToggleOptimization={() => (optimizationOpen = !optimizationOpen)}
    onValidate={handleValidate}
    {optimizationOpen}
    {handleOptimizationApply}
    onPreviewChange={onPreviewChange || (() => {})}
    bind:shapes
    bind:collapsedObstacles
    {settings}
  />
</div>
