<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Renders HeadingControls on reactive state, copying each edit into `project.endPoint`. -->
<script lang="ts">
  import { untrack } from "svelte";
  import type { PiecewiseShortfall } from "../types";
  import type { SegmentFixes } from "../utils/timeCalculator/advice";
  import HeadingControls, {
    type HeadingFields,
  } from "../lib/components/HeadingControls.svelte";

  let {
    project,
    nested = false,
    noPrev = false,
    resolved,
    locked = false,
    shortfalls = [],
    fixesFor,
    onchange,
    oncommit,
    expose,
  }: {
    project: { endPoint: HeadingFields };
    nested?: boolean;
    noPrev?: boolean;
    resolved?: HeadingFields;
    locked?: boolean;
    shortfalls?: PiecewiseShortfall[];
    fixesFor?: (i: number) => SegmentFixes;
    onchange?: () => void;
    oncommit?: () => void;
    expose?: (api: { focus: () => void }) => void;
  } = $props();

  let endPoint = $state(untrack(() => project.endPoint));
  let controls: HeadingControls | undefined = $state();
  $effect(() => {
    project.endPoint = $state.snapshot(endPoint);
  });
  $effect(() => {
    if (controls) expose?.({ focus: () => controls!.focus() });
  });
</script>

<HeadingControls
  bind:this={controls}
  bind:endPoint
  {nested}
  {noPrev}
  {resolved}
  {locked}
  {shortfalls}
  {fixesFor}
  onchange={() => {
    project.endPoint = $state.snapshot(endPoint);
    onchange?.();
  }}
  oncommit={() => {
    project.endPoint = $state.snapshot(endPoint);
    oncommit?.();
  }}
/>
