<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Binds lines/sequence to a plain object so tests can see the component's edits. -->
<script lang="ts">
  import { untrack } from "svelte";
  import GlobalEventMarkers from "../lib/components/GlobalEventMarkers.svelte";
  import type { Line, SequenceItem, TimePrediction } from "../types";

  let {
    project,
    timePrediction = undefined,
  }: {
    project: { lines: Line[]; sequence: SequenceItem[] };
    timePrediction?: TimePrediction | null;
  } = $props();
  // Only the initial values are wanted; edits flow back through the effect.
  const { lines: initialLines, sequence: initialSequence } = untrack(
    () => project,
  );
  let lines = $state(initialLines);
  let sequence = $state(initialSequence);

  $effect(() => {
    project.lines = $state.snapshot(lines) as Line[];
    project.sequence = $state.snapshot(sequence) as SequenceItem[];
  });
</script>

<GlobalEventMarkers
  bind:lines
  bind:sequence
  collapsedMarkers={false}
  {timePrediction}
/>
