<script lang="ts">
  import StrategySheetPreview from "../../../src/lib/components/dialogs/StrategySheetPreview.svelte";

  let { isOpen = $bindable(false), ...rest } = $props();

  export function getIsOpen() {
    return isOpen;
  }
</script>

<StrategySheetPreview bind:isOpen {...rest} />
