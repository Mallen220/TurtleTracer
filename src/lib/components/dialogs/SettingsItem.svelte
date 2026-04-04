<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { ResetIcon } from "../icons/index";

  interface Props {
    label: string;
    description?: string;
    searchQuery?: string;
    layout?: "col" | "row";
    section?: boolean;
    forId?: string;
    onReset?: (() => void) | undefined;
    isModified?: boolean;
    children?: import("svelte").Snippet;
  }

  let {
    label,
    description = "",
    searchQuery = "",
    layout = "col",
    section = false,
    forId = "",
    onReset = undefined,
    isModified = false,
    children,
  }: Props = $props();

  let isVisible = $derived(
    searchQuery === "" ||
      label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      description.toLowerCase().includes(searchQuery.toLowerCase()),
  );
</script>

<div
  class="transition-all duration-200"
  class:hidden={!isVisible}
  class:visible-setting={isVisible}
  class:mb-4={!section && layout === "col"}
  class:mb-3={!section && layout === "row"}
>
  {#if section}
    {@render children?.()}
  {:else if layout === "col"}
    <div class="flex items-start justify-between mb-1">
      <label
        for={forId}
        class="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
      >
        {label}
        {#if description}
          <div
            class="text-xs text-neutral-500 dark:text-neutral-400 font-normal mt-0.5"
          >
            {description}
          </div>
        {/if}
      </label>
      {#if onReset && isModified}
        <button
          type="button"
          class="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          title="Reset to default"
          onclick={onReset}
          aria-label="Reset {label}"
        >
          <ResetIcon className="w-4 h-4" />
        </button>
      {/if}
    </div>
    {@render children?.()}
  {:else}
    <div
      class="flex items-center justify-between p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
    >
      <div class="flex-1 mr-4">
        <div class="flex items-center gap-2 mb-1">
          <label
            for={forId}
            class="text-sm font-medium text-neutral-700 dark:text-neutral-300 block"
          >
            {label}
          </label>
          {#if onReset && isModified}
            <button
              type="button"
              class="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-200 dark:hover:bg-neutral-700 transition-colors flex-shrink-0"
              title="Reset to default"
              onclick={onReset}
              aria-label="Reset {label}"
            >
              <ResetIcon className="w-4 h-4" />
            </button>
          {/if}
        </div>
        {#if description}
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            {description}
          </div>
        {/if}
      </div>
      {@render children?.()}
    </div>
  {/if}
</div>
