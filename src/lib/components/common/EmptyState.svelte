<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import DocumentIcon from "../icons/DocumentIcon.svelte";

  interface Props {
    title: string;
    description: string;
    compact?: boolean;
    icon?: import("svelte").Snippet;
    action?: import("svelte").Snippet;
  }

  let { title, description, compact = false, icon, action }: Props = $props();
</script>

<div
  class="flex flex-col items-center justify-center text-center border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50/50 dark:bg-neutral-900/50 {compact
    ? 'py-6 px-4'
    : 'py-12 px-4'}"
>
  <div
    class="bg-neutral-100 dark:bg-neutral-800 rounded-full mb-3 flex items-center justify-center {compact
      ? 'p-2'
      : 'p-3'}"
  >
    {#if icon}{@render icon()}{:else}
      <!-- Default Icon -->
      <DocumentIcon className="size-6 text-neutral-400" strokeWidth={1.5} />
    {/if}
  </div>
  <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
    {title}
  </h3>
  <p
    class="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs mx-auto"
  >
    {description}
  </p>
  <div class="mt-4 empty:hidden">
    {@render action?.()}
  </div>
</div>
