<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import {
    SIZE_WIDTHS,
    MIN_WIDTH,
    clampWidth,
  } from "../../../utils/animationExportPlan";
  import { ui } from "../../ui";

  interface Props {
    value: number;
    aspect: number; // height / width of the field view
    id: string;
    disabled?: boolean;
    onchange?: () => void;
  }

  let {
    value = $bindable(),
    aspect,
    id,
    disabled = false,
    onchange,
  }: Props = $props();

  let custom = $state(!SIZE_WIDTHS.includes(value));
  let draft: number | null = $state(value);

  function pick(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    custom = v === "custom";
    if (custom) draft = value;
    else {
      value = Number(v);
      onchange?.();
    }
  }

  // Out of range or blank values snap to the nearest allowed one.
  function commit() {
    const w = Number.isFinite(draft)
      ? clampWidth(draft as number, aspect)
      : value;
    draft = w;
    if (w === value) return;
    value = w;
    onchange?.();
  }
</script>

<div class="flex flex-col gap-2">
  <label
    for={id}
    class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
  >
    Size
  </label>
  <select
    {id}
    value={custom ? "custom" : String(value)}
    onchange={pick}
    {disabled}
    class="{ui.input} block w-full"
  >
    {#each SIZE_WIDTHS as w (w)}
      <option value={String(w)}>{w} × {Math.round(w * aspect)}</option>
    {/each}
    <option value="custom">Custom…</option>
  </select>
  {#if custom}
    <div
      class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
    >
      <input
        id="{id}-custom"
        type="number"
        min={MIN_WIDTH}
        step="1"
        aria-label="Custom width in pixels"
        bind:value={draft}
        onblur={commit}
        onkeydown={(e) => e.key === "Enter" && commit()}
        {disabled}
        class="{ui.input} block w-full min-w-0 flex-1"
      />
      <span data-testid="custom-size" class="shrink-0 whitespace-nowrap"
        >× {Math.round(value * aspect)} px</span
      >
    </div>
  {/if}
</div>
