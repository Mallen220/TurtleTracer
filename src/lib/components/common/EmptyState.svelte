<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import DocumentIcon from "../icons/DocumentIcon.svelte";

  export let title: string;
  export let description: string;
  export let compact = false;
</script>

<div
  class="flex flex-col items-center justify-center text-center border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/50 {compact
    ? 'py-6 px-4'
    : 'py-12 px-4'}"
>
  <div
    class="bg-neutral-100 dark:bg-neutral-800 rounded-full mb-3 flex items-center justify-center {compact
      ? 'p-2'
      : 'p-3'}"
  >
    <slot name="icon">
      <!-- Default Icon -->
      <DocumentIcon className="size-6 text-neutral-400" strokeWidth={1.5} />
    </slot>
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
    <slot name="action" />
  </div>
</div>
