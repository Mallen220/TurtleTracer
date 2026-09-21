<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Stands in for FileList/FileGrid so tests can call their callbacks directly. -->
<script lang="ts">
  // svelte-ignore custom_element_props_identifier
  const props = $props();
  $effect.pre(() => {
    (globalThis as any).__fileList = props;
  });
</script>
