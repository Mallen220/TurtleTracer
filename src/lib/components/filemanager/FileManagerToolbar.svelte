<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileManagerToolbar.svelte -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    SearchIcon,
    SortNameIcon,
    ClockIcon,
    ViewListIcon,
    ViewGridIcon,
  } from "../icons";

  interface Props {
    searchQuery?: string;
    sortMode?: "name" | "date";
    viewMode?: "list" | "grid";
  }

  let {
    searchQuery = $bindable(""),
    sortMode = "name",
    viewMode = "list",
  }: Props = $props();

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
        <SearchIcon className="size-4" strokeWidth={2} />
      </div>
      <input
        type="text"
        value={searchQuery}
        oninput={handleSearch}
        placeholder="Search files..."
        class="w-full pl-8 pr-2 py-1.5 text-sm bg-neutral-100 dark:bg-neutral-800 border-none rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none text-neutral-900 dark:text-white placeholder-neutral-500"
      />
    </div>

    <!-- Sort Toggle -->
    <button
      onclick={() =>
        dispatch("sort-change", sortMode === "name" ? "date" : "name")}
      class="p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      title={`Sort by ${sortMode === "name" ? "Date" : "Name"}`}
      aria-label={`Sort by ${sortMode === "name" ? "Date" : "Name"}`}
    >
      {#if sortMode === "name"}
        <SortNameIcon className="size-5" strokeWidth={2} />
      {:else}
        <ClockIcon className="size-5" />
      {/if}
    </button>

    <!-- View Toggle -->
    <button
      onclick={() =>
        dispatch("view-change", viewMode === "list" ? "grid" : "list")}
      class="p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      title={`Switch to ${viewMode === "list" ? "Grid" : "List"} View`}
      aria-label={`Switch to ${viewMode === "list" ? "Grid" : "List"} View`}
    >
      {#if viewMode === "list"}
        <ViewListIcon className="size-5" strokeWidth={2} />
      {:else}
        <ViewGridIcon className="size-5" strokeWidth={2} />
      {/if}
    </button>
  </div>
</div>
