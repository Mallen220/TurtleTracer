<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Renders WaypointTable on lines held in a store, as the app does: plain objects, not Svelte state. -->
<script lang="ts">
  import { untrack } from "svelte";
  import { writable } from "svelte/store";
  import WaypointTable from "../lib/components/WaypointTable.svelte";
  import { DEFAULT_SETTINGS } from "../config/defaults";
  import type { Line, Point, SequenceItem } from "../types";

  let {
    startPoint,
    lines,
    sequence,
    recordChange = () => {},
  }: {
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    recordChange?: () => void;
  } = $props();

  const start = writable(untrack(() => startPoint));
  const lineStore = writable(untrack(() => lines));
  const sequenceStore = writable(untrack(() => sequence));
  export const currentLines = () => {
    let value: Line[] = [];
    lineStore.subscribe((v) => (value = v))();
    return value;
  };
</script>

<WaypointTable
  bind:startPoint={$start}
  bind:lines={$lineStore}
  bind:sequence={$sequenceStore}
  {recordChange}
  shapes={[]}
  collapsedObstacles={[]}
  settings={DEFAULT_SETTINGS}
/>
