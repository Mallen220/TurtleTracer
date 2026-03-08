<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  export let allCollapsed: boolean = false;
  export let onToggle: () => void;
</script>

<button
  on:click={() => onToggle && onToggle()}
  class="text-sm mb-2 px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700"
  aria-label="Toggle collapse/expand all"
>
  {#if allCollapsed}
    <span class="whitespace-nowrap">Expand All</span>
  {:else}
    <span class="whitespace-nowrap">Collapse All</span>
  {/if}
</button>
