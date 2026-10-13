<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { ui } from "../../ui";
  interface Props {
    allCollapsed?: boolean;
    onToggle: () => void;
  }

  let { allCollapsed = false, onToggle }: Props = $props();
</script>

<button
  onclick={() => onToggle && onToggle()}
  class="{ui.btn.secondary} mb-2"
  aria-label={allCollapsed ? "Expand All" : "Collapse All"}
>
  {#if allCollapsed}
    <span class="whitespace-nowrap">Expand All</span>
  {:else}
    <span class="whitespace-nowrap">Collapse All</span>
  {/if}
</button>
