<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Asks what to do with files edited both here and on GitHub. -->
<script lang="ts">
  import { parseGitHubPath } from "../../../utils/github/paths";
  import type { Resolution } from "../../../utils/github/repos";
  import PathText from "../PathText.svelte";
  import { ui } from "../../ui";

  interface Props {
    /** App paths of the files. */
    conflicts: string[];
    onresolve: (resolution: Resolution) => void;
    oncancel: () => void;
  }

  let { conflicts, onresolve, oncancel }: Props = $props();

  const names = $derived(
    conflicts.map((path) => parseGitHubPath(path)?.repoPath ?? path),
  );
</script>

<div class="{ui.alert.warning} flex flex-col gap-2" role="alert">
  <p>
    Someone committed changes to {conflicts.length === 1 ? "a file" : "files"} you've
    also edited here:
  </p>
  <ul class="font-mono list-disc pl-4">
    {#each names as name (name)}
      <li class="[overflow-wrap:anywhere]"><PathText path={name} /></li>
    {/each}
  </ul>
  <p>
    <strong>Keep both</strong> is safest: GitHub's version stays, and yours is saved
    next to it as "(my version)" so you can compare them.
  </p>
  <div class="flex flex-wrap gap-2">
    <button class={ui.btnSm.warning} onclick={() => onresolve("both")}
      >Keep both</button
    >
    <button
      class={ui.btnSm.secondary}
      onclick={() => onresolve("theirs")}
      title="Your edits to these files are thrown away">Use GitHub's</button
    >
    <button
      class={ui.btnSm.secondary}
      onclick={() => onresolve("mine")}
      title="Committing will replace what your teammate committed"
      >Keep mine</button
    >
    <button class="px-2 py-1 hover:underline" onclick={oncancel}>Cancel</button>
  </div>
</div>
