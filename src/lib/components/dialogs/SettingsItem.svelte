<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  export let label: string;
  export let description: string = "";
  export let searchQuery: string = "";
  export let layout: "col" | "row" = "col";
  export let section: boolean = false;
  export let forId: string = "";
  export let onReset: (() => void) | undefined = undefined;
  export let isModified: boolean = false;

  $: isVisible =
    searchQuery === "" ||
    label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    description.toLowerCase().includes(searchQuery.toLowerCase());
</script>

<div
  class="transition-all duration-200"
  class:hidden={!isVisible}
  class:visible-setting={isVisible}
  class:mb-4={!section && layout === "col"}
  class:mb-3={!section && layout === "row"}
>
  {#if section}
    <slot />
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
          on:click={onReset}
          aria-label="Reset {label}"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            class="w-4 h-4"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      {/if}
    </div>
    <slot />
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
              on:click={onReset}
              aria-label="Reset {label}"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                class="w-4 h-4"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          {/if}
        </div>
        {#if description}
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            {description}
          </div>
        {/if}
      </div>
      <slot />
    </div>
  {/if}
</div>
