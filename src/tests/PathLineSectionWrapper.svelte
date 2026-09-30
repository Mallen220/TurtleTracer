<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Renders one PathLineSection on reactive state, and lets tests read the lines back. -->
<script lang="ts">
  import { untrack } from "svelte";
  import PathLineSection from "../lib/components/sections/PathLineSection.svelte";
  import type { ActionDefinition, Line } from "../types";

  let {
    initial,
    idx = 0,
    collapsedStart = false,
    recordChange = () => {},
    onRemove = () => {},
    onMoveUp = () => {},
    onMoveDown = () => {},
    onAddAction = (_def: ActionDefinition) => {},
    onScrollToItem = undefined,
    canMoveUp = true,
    canMoveDown = true,
  }: {
    initial: Line[];
    idx?: number;
    collapsedStart?: boolean;
    recordChange?: (action?: string) => void;
    onRemove?: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onAddAction?: (def: ActionDefinition) => void;
    onScrollToItem?: (id: string) => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
  } = $props();

  let lines = $state(untrack(() => initial));
  let collapsed = $state(untrack(() => collapsedStart));
  let collapsedControlPoints = $state(true);

  export const getLines = () => $state.snapshot(lines) as Line[];
  export const isCollapsed = () => collapsed;
</script>

<PathLineSection
  bind:line={lines[idx]}
  {idx}
  bind:lines
  bind:collapsed
  bind:collapsedControlPoints
  {onRemove}
  {onAddAction}
  {recordChange}
  {onMoveUp}
  {onMoveDown}
  {canMoveUp}
  {canMoveDown}
  {onScrollToItem}
/>
