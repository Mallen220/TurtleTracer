<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Holds the line and the collapsed flag that ControlPointsSection binds to, so tests can read them back. -->
<script lang="ts">
  import ControlPointsSection from "../lib/components/sections/ControlPointsSection.svelte";
  import type { Line } from "../types";

  interface Props {
    initial: Line;
    lineIdx?: number;
    startCollapsed?: boolean;
    recordChange: () => void;
  }

  let {
    initial,
    lineIdx = 0,
    startCollapsed = false,
    recordChange,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let line = $state(initial);
  // svelte-ignore state_referenced_locally
  let collapsed = $state(startCollapsed);

  export const currentLine = () => line;
  export const isCollapsed = () => collapsed;
</script>

<ControlPointsSection bind:line {lineIdx} bind:collapsed {recordChange} />
