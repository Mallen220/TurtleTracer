<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- "· a.turt (1 of 3)" after an export dialog's title, when it isn't for the open project. -->
<script lang="ts">
  import { currentFilePath, exportCycle, exportSwap } from "../../../stores";
</script>

{#if $exportSwap}
  <span class="font-normal text-neutral-500 dark:text-neutral-400">
    · {($currentFilePath ?? "").split(/[\\/]/).pop()}{$exportCycle
      ? ` (${$exportCycle.index + 1} of ${$exportCycle.files.length})`
      : ""}
  </span>
{/if}
