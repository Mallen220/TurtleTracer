<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  A number input with a short label inside its left edge. For angles it can
  show a small heading preview above it, and offer to wrap values outside
  [-180, 180].
-->
<script lang="ts">
  import { transformAngle } from "../../../utils/math";
  import HeadingIndicator from "./HeadingIndicator.svelte";
  import { TriangleWarningIcon } from "../icons";

  interface Props {
    value: number | undefined;
    label: string;
    /** Left padding that clears the label, e.g. "pl-8". */
    inset: string;
    labelClass?: string;
    ariaLabel: string;
    title: string;
    step?: number;
    /** Heading to preview above the input; omit for non-angles. */
    indicator?: number;
    /** Warn when the value is outside [-180, 180]. */
    isAngle?: boolean;
    /** Marks the input HeadingControls focuses first. */
    primary?: boolean;
    disabled?: boolean;
    tabindex?: number;
    onchange?: () => void;
    oncommit?: () => void;
  }

  let {
    value = $bindable(),
    label,
    inset,
    labelClass = "text-[10px] uppercase tracking-wider",
    ariaLabel,
    title,
    step = 1,
    indicator,
    isAngle = false,
    primary = false,
    disabled = false,
    tabindex,
    onchange,
    oncommit,
  }: Props = $props();

  let isOutOfBounds = $derived(
    isAngle && value !== undefined && (value > 180 || value <= -180),
  );

  function wrap() {
    value = transformAngle(value ?? 0);
    onchange?.();
    oncommit?.();
  }
</script>

<div class="relative flex-1">
  {#if indicator !== undefined}
    <HeadingIndicator
      degrees={indicator}
      size={16}
      className="absolute -top-7 left-1/2 -translate-x-1/2 text-neutral-400 dark:text-neutral-500"
    />
  {/if}
  <span
    class="absolute left-2 top-1/2 -translate-y-1/2 font-bold text-neutral-400 select-none {labelClass}"
    >{label}</span
  >
  <input
    class="w-full {inset} py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700  focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
    class:pr-6={isOutOfBounds}
    class:pr-1={!isOutOfBounds}
    class:border-yellow-500={isOutOfBounds}
    class:dark:border-yellow-500={isOutOfBounds}
    data-primary={primary || undefined}
    type="number"
    {step}
    {value}
    oninput={(e) => {
      const parsed = Number.parseFloat(e.currentTarget.value);
      if (!Number.isNaN(parsed)) value = parsed;
      onchange?.();
    }}
    onblur={(e) => {
      // A cleared box means zero, so what's shown matches what's saved.
      if (Number.isNaN(Number.parseFloat(e.currentTarget.value))) {
        value = 0;
        e.currentTarget.value = "0";
        onchange?.();
      }
      oncommit?.();
    }}
    {title}
    aria-label={ariaLabel}
    {disabled}
    {tabindex}
  />
  {#if isOutOfBounds && !disabled}
    <button
      onclick={wrap}
      title="Angle is out of bounds. Click to normalize to [-180, 180]."
      aria-label="Angle is out of bounds. Click to normalize to [-180, 180]."
      class="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 transition-colors"
    >
      <TriangleWarningIcon className="size-3" />
    </button>
  {/if}
</div>
