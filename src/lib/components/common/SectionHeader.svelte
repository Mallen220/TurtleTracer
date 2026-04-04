<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { ChevronRightIcon, PlusIcon } from "../icons/index";

  interface Props {
    title: string;
    collapsed?: boolean;
    count?: number | undefined;
    onAdd?: (() => void) | undefined;
  }

  let {
    title,
    collapsed = $bindable(false),
    count = undefined,
    onAdd = undefined,
  }: Props = $props();

  function toggleCollapsed() {
    collapsed = !collapsed;
  }
</script>

<div
  class="flex items-center justify-between w-full p-2 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700"
>
  <button
    onclick={toggleCollapsed}
    class="flex items-center gap-2 font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-sm text-neutral-800 dark:text-neutral-200"
    title="{collapsed ? 'Show' : 'Hide'} {title}"
    aria-expanded={!collapsed}
  >
    <ChevronRightIcon
      className="size-4 transition-transform {collapsed
        ? 'rotate-0'
        : 'rotate-90'}"
    />
    {title}
    {#if count !== undefined}
      <span class="text-xs font-normal text-neutral-500 dark:text-neutral-400"
        >({count})</span
      >
    {/if}
  </button>

  {#if onAdd}
    <button
      onclick={onAdd}
      class="text-sm text-purple-500 hover:text-purple-600 flex items-center gap-1 px-2 py-1"
      title="Add Item"
      aria-label="Add Item to {title}"
    >
      <PlusIcon className="size-4" />
      Add
    </button>
  {/if}
</div>
