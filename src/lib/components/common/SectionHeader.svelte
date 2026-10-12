<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { ChevronRightIcon, PlusIcon } from "../icons/index";
  import { ui } from "../../ui";

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

<div class="{ui.bar} flex items-center justify-between w-full p-2">
  <button
    onclick={toggleCollapsed}
    class={ui.btn.ghost}
    title="{collapsed ? 'Show' : 'Hide'} {title}"
    aria-label="{collapsed ? 'Show' : 'Hide'} {title}"
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
      class={ui.btnSm.accentSoft}
      title="Add Item"
      aria-label="Add Item"
    >
      <PlusIcon className="size-4" />
      Add
    </button>
  {/if}
</div>
