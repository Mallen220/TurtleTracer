<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileManagerToolbar.svelte -->
<script lang="ts">
  import {
    SearchIcon,
    SortNameIcon,
    ClockIcon,
    ViewListIcon,
    ViewGridIcon,
    CodeBracketSquareIcon,
  } from "../icons";

  interface Props {
    searchQuery?: string;
    sortMode?: "name" | "date";
    viewMode?: "list" | "grid";
    showJavaFiles?: boolean;
    onsortchange?: (mode: "name" | "date") => void;
    onviewchange?: (mode: "list" | "grid") => void;
    ontogglejava?: () => void;
    onsearch?: (query: string) => void;
  }

  let {
    searchQuery = $bindable(""),
    sortMode = "name",
    viewMode = "list",
    showJavaFiles = false,
    onsortchange,
    onviewchange,
    ontogglejava,
    onsearch,
  }: Props = $props();

  function handleSearch(e: Event) {
    const target = e.target as HTMLInputElement;
    searchQuery = target.value;
    onsearch?.(searchQuery);
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

    <!-- Java Files Toggle -->
    <button
      onclick={() => ontogglejava?.()}
      class="p-1.5 rounded transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 {showJavaFiles
        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/70'
        : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'}"
      title={showJavaFiles ? "Hide Java Files" : "Show Importable Java Files"}
      aria-label={showJavaFiles
        ? "Hide Java Files"
        : "Show Importable Java Files"}
    >
      <CodeBracketSquareIcon className="size-5" />
    </button>

    <!-- Sort Toggle -->
    <button
      onclick={() => onsortchange?.(sortMode === "name" ? "date" : "name")}
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
      onclick={() => onviewchange?.(viewMode === "list" ? "grid" : "list")}
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
