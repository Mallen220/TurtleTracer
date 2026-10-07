<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Renders WaypointTable on reactive state, copying each edit into `project`. -->
<script lang="ts">
  import { untrack } from "svelte";
  import WaypointTable from "../lib/components/WaypointTable.svelte";
  import { DEFAULT_SETTINGS } from "../config/defaults";
  import type { Line, Point, SequenceItem, Settings } from "../types";

  let {
    project,
    recordChange = () => {},
    settings = DEFAULT_SETTINGS,
  }: {
    project: { startPoint: Point; lines: Line[]; sequence: SequenceItem[] };
    recordChange?: () => void;
    settings?: Settings;
  } = $props();

  let startPoint = $state(untrack(() => project.startPoint));
  let lines = $state(untrack(() => project.lines));
  let sequence = $state(untrack(() => project.sequence));
  $effect(() => {
    project.startPoint = $state.snapshot(startPoint);
    project.lines = $state.snapshot(lines);
    project.sequence = $state.snapshot(sequence) as SequenceItem[];
  });
</script>

<WaypointTable
  bind:startPoint
  bind:lines
  bind:sequence
  {recordChange}
  shapes={[]}
  collapsedObstacles={[]}
  {settings}
/>
