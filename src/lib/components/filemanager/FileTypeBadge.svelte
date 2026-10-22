<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { FileInfo } from "../../../types";
  import {
    isCodeFileName,
    isLegacyProjectFileName,
  } from "../../../utils/fileExtensions";
  import LegacyFileBadge from "./LegacyFileBadge.svelte";
  import JavaFileBadge from "./JavaFileBadge.svelte";

  let { file }: { file: FileInfo } = $props();
</script>

<!-- Marks the files that aren't ordinary .turt projects. -->
{#if !file.isDirectory && isLegacyProjectFileName(file.name)}
  <LegacyFileBadge />
{:else if !file.isDirectory && isCodeFileName(file.name)}
  <JavaFileBadge name={file.name} />
{/if}
