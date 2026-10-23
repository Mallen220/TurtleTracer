<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  The settings of a path that most people leave alone, folded away under one
  heading so they don't crowd the card. Closed, it still shows what has been
  set, as small chips. New settings of this kind belong inside it.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import ChevronDownIcon from "../icons/ChevronDownIcon.svelte";
  import { ui } from "../../ui";

  interface Props {
    title?: string;
    /** What has been set, one short chip each, e.g. "Max 25 in/s". */
    summary?: string[];
    /** A problem inside, shown closed as an amber chip so it isn't missed. */
    warning?: string;
    open?: boolean;
    /** The id of the panel, for `aria-controls`. */
    id: string;
    children: Snippet;
  }

  let {
    title = "Chain Motion",
    summary = [],
    warning,
    open = $bindable(false),
    id,
    children,
  }: Props = $props();
</script>

<div class="flex flex-col w-full">
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
    <button
      type="button"
      onclick={() => (open = !open)}
      class="{ui.btnSm.ghost} -ml-2"
      title="{open ? 'Hide' : 'Show'} {title.toLowerCase()} settings"
      aria-expanded={open}
      aria-controls={id}
    >
      <ChevronDownIcon
        className="size-3 transition-transform duration-200 {open
          ? 'rotate-0'
          : '-rotate-90'}"
        strokeWidth={2.5}
      />
      <span class={ui.heading}>{title}</span>
    </button>
    {#if !open}
      {#if warning}
        <span class={ui.badge.warning}>{warning}</span>
      {/if}
      {#each summary as chip}
        <span class={ui.badge.neutral}>{chip}</span>
      {/each}
    {/if}
  </div>

  {#if open}
    <div {id} class="mt-2">
      {@render children()}
    </div>
  {/if}
</div>
