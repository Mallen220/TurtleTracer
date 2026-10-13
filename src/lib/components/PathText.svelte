<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- A path, shortened to where it starts and ends; clicking the "…" shows the rest. -->
<script lang="ts">
  import { displayPath, shortenPath } from "../../utils/displayPaths";

  interface Props {
    /** An app path, or a path inside a repository. */
    path: string;
  }

  let { path }: Props = $props();

  const full = $derived(displayPath(path));
  const short = $derived(shortenPath(path));
  // The path that was expanded, so a different one starts shortened again.
  let expanded = $state<string | null>(null);
</script>

<!-- Lets a path wrap before a separator rather than in the middle of a name. -->
{#snippet wrapping(
  text: string,
)}{#each text.split(/(?=[\\/])/) as piece, i (i)}{#if i > 0}<wbr
      />{/if}{piece}{/each}{/snippet}

{#if short && expanded !== path}<span title={full}
    >{@render wrapping(short.start)}<button
      type="button"
      class="mx-px px-1 rounded bg-black/10 hover:bg-black/20 dark:bg-white/15 dark:hover:bg-white/25 font-sans focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
      title="Show the full path"
      aria-label="Show the full path"
      onclick={(e) => {
        e.stopPropagation();
        expanded = path;
      }}>…</button
    >{@render wrapping(short.end)}</span
  >{:else}{@render wrapping(full)}{/if}
