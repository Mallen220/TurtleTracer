<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  A speed limit for a path or a chain, in in/s, with an `i` that explains it.
  Blank means no limit of its own. The value is only sent on when the field
  loses focus or Enter is pressed, and anything that isn't a number above
  zero clears it.
-->
<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import { InfoIcon } from "../icons";
  import { tooltipPortal } from "../../actions/portal";
  import { ui } from "../../ui";

  interface Props {
    label: string;
    value: number | undefined;
    /** Shown when blank: the speed used instead. */
    placeholder: string;
    ariaLabel: string;
    disabled?: boolean;
    /** The robot's Max Velocity; a value above it is held to it, and the field says so. */
    robotMax?: number;
    /** What the `i` says. */
    info: Snippet;
    onchange: (value: number | undefined) => void;
  }

  let {
    label,
    value,
    placeholder,
    ariaLabel,
    disabled = false,
    robotMax,
    info,
    onchange,
  }: Props = $props();

  const show = (n: number | undefined) => (n === undefined ? "" : String(n));

  let draft = $state(untrack(() => show(value)));
  let editing = $state(false);
  // Follow the value while it isn't being typed into (undo, other edits).
  $effect(() => {
    const shown = show(value);
    if (!editing) draft = shown;
  });

  let tipAnchor: HTMLElement | null = $state(null);

  function commit() {
    editing = false;
    const parsed = Number.parseFloat(draft);
    const next =
      Number.isFinite(parsed) && parsed > 0
        ? Math.round(parsed * 100) / 100
        : undefined;
    draft = show(next);
    if (next !== value) onchange(next);
  }

  let heldBack = $derived(
    robotMax !== undefined && value !== undefined && value > robotMax,
  );
</script>

<div class="space-y-1.5 min-w-0">
  <span
    class="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide"
  >
    {label}
    <span
      role="img"
      aria-label="About {label}"
      class="text-neutral-500 dark:text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 cursor-help normal-case"
      onmouseenter={(e) => (tipAnchor = e.currentTarget as HTMLElement)}
      onmouseleave={() => (tipAnchor = null)}
    >
      <InfoIcon className="size-3.5" />
      {#if tipAnchor}
        <div
          use:tooltipPortal={tipAnchor}
          class="w-72 p-2 bg-neutral-800 border border-neutral-700 rounded shadow-lg text-xs font-normal tracking-normal text-neutral-100 z-50 pointer-events-none space-y-1.5"
        >
          {@render info()}
        </div>
      {/if}
    </span>
  </span>
  <div class="relative max-w-[200px]">
    <input
      type="number"
      min="0"
      step="1"
      class="{ui.inputSm} w-full pr-10"
      class:border-amber-500={heldBack}
      class:dark:border-amber-500={heldBack}
      bind:value={draft}
      onfocus={() => (editing = true)}
      onblur={commit}
      onkeydown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      {disabled}
      aria-label={ariaLabel}
      {placeholder}
    />
    <span
      class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-500 dark:text-neutral-400 select-none pointer-events-none"
      >in/s</span
    >
  </div>
  {#if heldBack}
    <p class="text-xs text-amber-600 dark:text-amber-400">
      Held to the robot's Max Velocity ({robotMax} in/s).
    </p>
  {/if}
</div>
