<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileManagerToolbar.svelte -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let searchQuery = "";
  export let sortMode: "name" | "date" = "name";
  export let viewMode: "list" | "grid" = "list";

  const dispatch = createEventDispatcher<{
    "sort-change": "name" | "date";
    "view-change": "list" | "grid";
    search: string;
  }>();

  function handleSearch(e: Event) {
    const target = e.target as HTMLInputElement;
    searchQuery = target.value;
    dispatch("search", searchQuery);
  }
</script>

<div
  class="flex flex-col gap-2 p-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shrink-0 z-10 overflow-visible"
>
  <!-- Header: Search + Sort/View + Change Dir -->
  <div class="flex items-center gap-1 w-full relative">
    <!-- Search (Full Width) -->
    <div class="relative flex-1">
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

    <!-- Sort Toggle -->
    <button
      on:click={() =>
        dispatch("sort-change", sortMode === "name" ? "date" : "name")}
      class="p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
      class="p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
  </div>
</div>
