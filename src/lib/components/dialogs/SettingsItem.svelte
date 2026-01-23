<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  export let label: string;
  export let description: string = "";
  export let searchQuery: string = "";
  export let layout: "col" | "row" = "col";
  export let section: boolean = false;
  export let forId: string = "";

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
    <label
      for={forId}
      class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
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
    <slot />
  {:else}
    <div
      class="flex items-center justify-between p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
    >
      <div>
        <label
          for={forId}
          class="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1"
        >
          {label}
        </label>
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
