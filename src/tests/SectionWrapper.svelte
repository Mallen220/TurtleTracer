<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Renders a sequence section bound to a plain object so tests can see its edits. -->
<script lang="ts">
  import { untrack, type Component } from "svelte";
  import type { SequenceItem } from "../types";

  // svelte-ignore custom_element_props_identifier
  let {
    section: Section,
    kind,
    project,
    ...handlers
  }: {
    section: Component<any>;
    kind: "wait" | "rotate" | "macro";
    project: { sequence: SequenceItem[] };
    [key: string]: unknown;
  } = $props();

  let sequence = $state(untrack(() => project.sequence));
  $effect(() => {
    project.sequence = $state.snapshot(sequence) as SequenceItem[];
  });
</script>

<Section {...{ [kind]: sequence[0] }} bind:sequence {...handlers} />
