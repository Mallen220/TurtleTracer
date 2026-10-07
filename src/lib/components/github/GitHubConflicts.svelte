<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Asks what to do with files edited both here and on GitHub. -->
<script lang="ts">
  import { parseGitHubPath } from "../../../utils/github/paths";
  import type { Resolution } from "../../../utils/github/repos";

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

<div
  class="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-900 dark:text-amber-200 flex flex-col gap-2"
  role="alert"
>
  <p>
    Someone committed changes to {conflicts.length === 1 ? "a file" : "files"} you've
    also edited here:
  </p>
  <ul class="font-mono list-disc pl-4">
    {#each names as name (name)}
      <li class="truncate">{name}</li>
    {/each}
  </ul>
  <p>
    <strong>Keep both</strong> is safest: GitHub's version stays, and yours is saved
    next to it as "(my version)" so you can compare them.
  </p>
  <div class="flex flex-wrap gap-2">
    <button
      class="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium"
      onclick={() => onresolve("both")}>Keep both</button
    >
    <button
      class="px-2 py-1 rounded bg-white dark:bg-neutral-800 border border-amber-400 dark:border-amber-700 font-medium"
      onclick={() => onresolve("theirs")}
      title="Your edits to these files are thrown away">Use GitHub's</button
    >
    <button
      class="px-2 py-1 rounded bg-white dark:bg-neutral-800 border border-amber-400 dark:border-amber-700 font-medium"
      onclick={() => onresolve("mine")}
      title="Committing will replace what your teammate committed"
      >Keep mine</button
    >
    <button class="px-2 py-1 hover:underline" onclick={oncancel}>Cancel</button>
  </div>
</div>
