<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- A message, with the paths marked in it (pathInMessage) shortened. -->
<script lang="ts">
  import PathText from "./PathText.svelte";
  import { messageParts } from "../../utils/messagePaths";

  let { message }: { message: string } = $props();
</script>

{#each messageParts(message) as part, i (i)}{#if "path" in part}<PathText
      path={part.path}
    />{:else}{part.text}{/if}{/each}
