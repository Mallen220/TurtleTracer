<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
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

  interface Props {
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    recordChange: () => void;
    shapes: Shape[];
    settings: Settings;
    isActive?: boolean;
  }

  let {
    startPoint = $bindable(),
    lines = $bindable(),
    sequence = $bindable(),
    recordChange,
    shapes = $bindable(),
    settings,
    isActive = false,
  }: Props = $props();

  let waypointTableRef: any = $state(null);

  let collapsedObstacles = $state(shapes.map(() => true));
  $effect(() => {
    if (shapes.length !== collapsedObstacles.length) {
      collapsedObstacles = shapes.map(() => true);
    }
  });

  function handleOptimizationApply(newLines: Line[]) {
    lines = newLines;
    recordChange?.();
  }

  // Exported methods
  export function copyTable() {
    if (waypointTableRef && waypointTableRef.copyTableToClipboard) {
      waypointTableRef.copyTableToClipboard();
    }
  }

  export function openAndStartOptimization() {
    if (waypointTableRef && waypointTableRef.openAndStartOptimization) {
      return waypointTableRef.openAndStartOptimization();
    }
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
      isOpen: true,
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
    bind:shapes
    bind:collapsedObstacles
    {settings}
  />
</div>
