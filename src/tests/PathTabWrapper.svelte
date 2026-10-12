<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Holds the lines and sequence that PathTab binds to, so tests can read them back after an edit. -->
<script lang="ts">
  import PathTab from "../lib/components/tabs/PathTab.svelte";
  import type { Line, Point, SequenceItem, Settings } from "../types";

  interface Props {
    initialLines: Line[];
    initialSequence: SequenceItem[];
    startPoint: Point;
    settings: Settings;
    recordChange: (action?: string) => void;
  }

  let {
    initialLines,
    initialSequence,
    startPoint,
    settings,
    recordChange,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let lines = $state(initialLines);
  // svelte-ignore state_referenced_locally
  let sequence = $state(initialSequence);
  // svelte-ignore state_referenced_locally
  let start = $state(startPoint);

  export const currentLines = () => $state.snapshot(lines);
  export const currentSequence = () => $state.snapshot(sequence);
</script>

<PathTab
  bind:startPoint={start}
  bind:lines
  bind:sequence
  {settings}
  {recordChange}
  isActive={true}
/>
