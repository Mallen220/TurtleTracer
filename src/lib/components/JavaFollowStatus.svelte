<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- In the Navbar while a Java file is followed: whether the field is up to date with it, and the way out. -->
<script lang="ts">
  import {
    followedJava,
    saveFollowedAsProject,
    stopFollowing,
  } from "../javaFollow";
  import PathText from "./PathText.svelte";
  import { EyeIcon } from "./icons";

  let open = $state(false);
  let root: HTMLElement | undefined = $state();

  const updated = $derived(
    $followedJava?.updatedAt
      ? new Date($followedJava.updatedAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      : null,
  );
</script>

<svelte:window
  onclick={(e) => {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }}
  onkeydown={(e) => {
    if (open && e.key === "Escape") open = false;
  }}
/>

{#if $followedJava}
  {@const followed = $followedJava}
  <div class="relative flex items-center" bind:this={root}>
    <button
      class="text-[11px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1.5 whitespace-nowrap max-w-[260px] {followed.error
        ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-200'
        : 'bg-green-100 border-green-300 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:border-green-700 dark:text-green-200'}"
      title={followed.error
        ? `Line ${followed.error.line}: ${followed.error.message} The field shows the last version that worked.`
        : "The field shows this Java file, and updates each time it's saved in your editor."}
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      <EyeIcon className="size-3 shrink-0" />
      <span class="truncate">{followed.name}</span>
      {#if followed.error}
        <span class="shrink-0">· line {followed.error.line}</span>
      {:else}
        <span
          class="size-1.5 rounded-full bg-green-500 shrink-0"
          aria-hidden="true"
        ></span>
      {/if}
    </button>

    {#if open}
      <div
        class="absolute left-0 top-full mt-2 z-[1100] w-80 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-3 flex flex-col gap-2 text-xs text-neutral-700 dark:text-neutral-300"
        role="dialog"
        aria-label="Following a Java file"
      >
        <div class="font-semibold text-sm text-neutral-900 dark:text-white">
          Following {followed.name}
        </div>
        <div
          class="font-mono text-[11px] text-neutral-500 [overflow-wrap:anywhere]"
        >
          <PathText path={followed.path} />
        </div>

        {#if followed.error}
          <p
            class="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2 text-amber-900 dark:text-amber-200"
            role="alert"
          >
            {#if followed.error.line > 0}<strong
                >Line {followed.error.line}:</strong
              >{/if}
            {followed.error.message}
            {#if followed.paths > 0}The field shows the last version that
              worked.{/if}
          </p>
        {:else}
          <p>
            Up to date: {followed.paths}
            {followed.paths === 1 ? "path" : "paths"}{#if updated}, read at {updated}{/if}.
            Save the file in your editor and the field updates.
          </p>
        {/if}

        {#if followed.notes.length > 0}
          <div>
            <div class="font-medium mb-1">Skipped in the file:</div>
            <ul
              class="max-h-28 overflow-y-auto list-disc pl-4 space-y-0.5 text-neutral-600 dark:text-neutral-400"
            >
              {#each followed.notes as note, i (i)}
                <li>Line {note.line}: {note.message}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <p class="text-neutral-500 dark:text-neutral-400">
          The paths are locked while you follow the file; change them in your
          editor. Nothing is exported over it.
        </p>

        <div class="flex justify-end gap-2 pt-1">
          <button
            class="px-2.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onclick={() => {
              open = false;
              stopFollowing();
            }}
          >
            Stop following
          </button>
          <button
            class="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium"
            onclick={() => {
              open = false;
              void saveFollowedAsProject();
            }}
          >
            Save as project
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}
