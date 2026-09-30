<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Holds ExportCodeDialog's open state so tests can open it and read whether it is open. -->
<script lang="ts">
  import ExportCodeDialog from "../lib/components/dialogs/ExportCodeDialog.svelte";

  let isOpen = $state(false);
  let dialog: ExportCodeDialog | undefined = $state();

  export function openWithFormat(
    format: "java" | "points" | "sequential" | "json" | "custom",
    name?: string,
  ) {
    return dialog!.openWithFormat(format, name);
  }
  export const isDialogOpen = () => isOpen;
</script>

<ExportCodeDialog
  bind:this={dialog}
  bind:isOpen
  startPoint={{ x: 0, y: 0, heading: "tangential", reverse: false }}
  lines={[]}
  sequence={[]}
  shapes={[]}
/>
