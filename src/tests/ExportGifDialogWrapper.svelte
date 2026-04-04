<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import ExportGifDialog from "../lib/components/dialogs/ExportGifDialog.svelte";
  let { props }: { props: any } = $props();
  let show = $state(false);

  onMount(() => {
    show = props.show ?? false;
  });
</script>

<ExportGifDialog {...props} bind:show />

{#if !show}
  <div data-testid="dialog-closed-indicator">Closed</div>
{/if}
