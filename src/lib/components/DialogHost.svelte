<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { dialogRegistry } from "../registries";
</script>

{#each $dialogRegistry as dialog (dialog.id)}
  {#if dialog.component}
    <dialog.component {...dialog.props} />
  {/if}
{/each}
