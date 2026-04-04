<script lang="ts">
  import { onMount } from "svelte";
  import ExportGifDialog from "../lib/components/dialogs/ExportGifDialog.svelte";
  export let props: any;
  let show = false;

  onMount(() => {
    show = props.show ?? false;
  });
</script>

<ExportGifDialog {...props} bind:show={show} />

{#if !show}
  <div data-testid="dialog-closed-indicator">Closed</div>
{/if}
