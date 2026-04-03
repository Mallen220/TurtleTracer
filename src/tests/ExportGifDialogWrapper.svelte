<script lang="ts">
  import ExportGifDialog from "../lib/components/dialogs/ExportGifDialog.svelte";
  let { props } = $props<{ props: any }>();
  let show = $state(props.show);
</script>

<ExportGifDialog {...props} bind:show={show} />

{#if !show}
  <div data-testid="dialog-closed-indicator">Closed</div>
{/if}
