<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { dialogRegistry } from "../registries";
</script>

{#each $dialogRegistry as dialog (dialog.id)}
  {#if dialog.component}
    <svelte:component this={dialog.component} {...dialog.props} />
  {/if}
{/each}
