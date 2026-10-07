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

  let waypointTableRef: ReturnType<typeof WaypointTable> | null = $state(null);

  let collapsedObstacles = $state(shapes.map(() => true));
  $effect(() => {
    if (shapes.length !== collapsedObstacles.length) {
      collapsedObstacles = shapes.map(() => true);
    }
  });

  // Exported methods
  export function copyTable() {
    waypointTableRef?.copyTableToClipboard();
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
