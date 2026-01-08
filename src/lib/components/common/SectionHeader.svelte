<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  export let title: string;
  export let collapsed: boolean = false;
  export let count: number | undefined = undefined;
  export let onAdd: (() => void) | undefined = undefined;

  function toggleCollapsed() {
    collapsed = !collapsed;
  }
</script>

<div class="flex items-center justify-between w-full p-2 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
  <button
    on:click={toggleCollapsed}
    class="flex items-center gap-2 font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-sm text-neutral-800 dark:text-neutral-200"
    title="{collapsed ? 'Show' : 'Hide'} {title}"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width={2}
      stroke="currentColor"
      class="size-4 transition-transform {collapsed ? 'rotate-0' : 'rotate-90'}"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
    {title}
    {#if count !== undefined}
      <span class="text-xs font-normal text-neutral-500 dark:text-neutral-400">({count})</span>
    {/if}
  </button>

  {#if onAdd}
    <button
      on:click={onAdd}
      class="text-sm text-purple-500 hover:text-purple-600 flex items-center gap-1 px-2 py-1"
      title="Add Item"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-4"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      Add
    </button>
  {/if}
</div>
