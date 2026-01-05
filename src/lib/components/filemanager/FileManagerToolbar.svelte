<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileManagerToolbar.svelte -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let searchQuery = "";
  export let sortMode: "name" | "date" = "name";
  export let viewMode: "list" | "grid" = "list";

  const dispatch = createEventDispatcher<{
    "new-file": void;
    "change-dir": void;
    refresh: void;
    "sort-change": "name" | "date";
    "view-change": "list" | "grid";
    search: string;
    "import-file": File;
  }>();

  function handleSearch(e: Event) {
    const target = e.target as HTMLInputElement;
    searchQuery = target.value;
    dispatch("search", searchQuery);
  }

  function handleImport(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      dispatch("import-file", target.files[0]);
      target.value = ""; // Reset
    }
  }
</script>

<div
  class="flex flex-col gap-2 p-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shrink-0 z-10"
>
  <!-- Row 1: Search (Full Width) -->
  <div class="relative w-full">
    <div
      class="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none text-neutral-400"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-4"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
        />
      </svg>
    </div>
    <input
      type="text"
      value={searchQuery}
      on:input={handleSearch}
      placeholder="Search files..."
      class="w-full pl-8 pr-2 py-1.5 text-sm bg-neutral-100 dark:bg-neutral-800 border-none rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none text-neutral-900 dark:text-white placeholder-neutral-500"
    />
  </div>

  <!-- Row 2: Controls -->
  <div class="flex items-center gap-1 w-full overflow-x-auto no-scrollbar">
    <!-- Sort Toggle -->
    <button
      on:click={() =>
        dispatch("sort-change", sortMode === "name" ? "date" : "name")}
      class="p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
      title={`Sort by ${sortMode === "name" ? "Date" : "Name"}`}
      aria-label={`Sort by ${sortMode === "name" ? "Date" : "Name"}`}
    >
      {#if sortMode === "name"}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0-3.75-3.75M17.25 21 21 17.25"
          />
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      {/if}
    </button>

    <!-- View Toggle -->
    <button
      on:click={() =>
        dispatch("view-change", viewMode === "list" ? "grid" : "list")}
      class="p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
      title={`Switch to ${viewMode === "list" ? "Grid" : "List"} View`}
      aria-label={`Switch to ${viewMode === "list" ? "Grid" : "List"} View`}
    >
      {#if viewMode === "list"}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
          />
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
      {/if}
    </button>

    <div class="flex-1"></div>

    <div
      class="w-px h-5 bg-neutral-200 dark:bg-neutral-700 mx-1 shrink-0"
    ></div>

    <!-- Import -->
    <label
      class="p-1.5 text-neutral-500 hover:text-purple-600 dark:text-neutral-400 dark:hover:text-purple-400 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
      title="Import .pp File"
      aria-label="Import .pp File"
    >
      <input type="file" accept=".pp" class="hidden" on:change={handleImport} />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
        />
      </svg>
    </label>

    <!-- New File -->
    <button
      on:click={() => dispatch("new-file")}
      class="p-1.5 text-neutral-500 hover:text-green-600 dark:text-neutral-400 dark:hover:text-green-400 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
      title="New File"
      aria-label="New File"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
    </button>

    <div
      class="w-px h-5 bg-neutral-200 dark:bg-neutral-700 mx-1 shrink-0"
    ></div>

    <!-- Refresh -->
    <button
      on:click={() => dispatch("refresh")}
      class="p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
      title="Refresh"
      aria-label="Refresh"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
    </button>

    <!-- Change Dir -->
    <button
      on:click={() => dispatch("change-dir")}
      class="p-1.5 text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0"
      title="Change Directory"
      aria-label="Change Directory"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
        />
      </svg>
    </button>
  </div>
</div>
