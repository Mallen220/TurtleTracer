<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  The field: the 2D editor, and any other ways of showing it that plugins
  add (a 3D view, say). The switch between them only appears when there's
  more than one; the 2D editor stays mounted underneath.
-->
<script lang="ts">
  import type { ComponentProps } from "svelte";
  import FieldRenderer from "./FieldRenderer.svelte";
  import { fieldViewRegistry } from "../registries";
  import { isPresentationMode } from "../../stores";
  import { ui } from "../ui";

  type RendererProps = ComponentProps<typeof FieldRenderer>;

  interface Props {
    width: number;
    height: number;
    timePrediction: RendererProps["timePrediction"];
    committedRobotState: RendererProps["committedRobotState"];
    previewOptimizedLines: RendererProps["previewOptimizedLines"];
    onRecordChange: RendererProps["onRecordChange"];
  }

  let {
    width,
    height,
    timePrediction,
    committedRobotState,
    previewOptimizedLines,
    onRecordChange,
  }: Props = $props();

  let renderer: FieldRenderer | undefined = $state();
  /** The plugin view being shown, or null for the 2D editor. */
  let activeViewId: string | null = $state(null);
  let activeView = $derived(
    $fieldViewRegistry.find((view) => view.id === activeViewId),
  );

  // Back to 2D when the view goes away (its plugin was turned off).
  $effect(() => {
    if (activeViewId && !activeView) activeViewId = null;
  });

  // Used by the export dialogs and keyboard shortcuts.
  export function getTwoInstance() {
    return renderer?.getTwoInstance();
  }

  export function panToField(x: number, y: number) {
    renderer?.panToField(x, y);
  }
</script>

<div class="relative" style:width="{width}px" style:height="{height}px">
  <FieldRenderer
    bind:this={renderer}
    {width}
    {height}
    {timePrediction}
    {committedRobotState}
    {previewOptimizedLines}
    {onRecordChange}
  />

  {#if activeView}
    {@const View = activeView.component}
    <div
      class="absolute inset-0 z-40 rounded-md overflow-hidden bg-neutral-50 dark:bg-neutral-900"
    >
      <View {...activeView.props} />
    </div>
  {/if}

  {#if $fieldViewRegistry.length > 0 && !$isPresentationMode}
    <div
      class="{ui.tabList} absolute top-2 left-2 z-50"
      role="tablist"
      aria-label="Field view"
    >
      <button
        role="tab"
        aria-selected={!activeView}
        class={ui.tab(!activeView)}
        onclick={() => (activeViewId = null)}>2D</button
      >
      {#each $fieldViewRegistry as view (view.id)}
        <button
          role="tab"
          aria-selected={activeViewId === view.id}
          class={ui.tab(activeViewId === view.id)}
          onclick={() => (activeViewId = view.id)}>{view.title}</button
        >
      {/each}
    </div>
  {/if}
</div>
