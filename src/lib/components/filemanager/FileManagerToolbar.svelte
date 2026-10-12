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
  import { ui } from "../../ui";

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

<div class="{ui.bar} flex flex-col gap-2 p-2 shrink-0 z-10 overflow-visible">
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
        class="{ui.inputSm} w-full pl-8"
      />
    </div>

    <!-- Java Files Toggle -->
    <button
      onclick={() => ontogglejava?.()}
      class="{showJavaFiles
        ? ui.iconBtnSm.active
        : ui.iconBtnSm.neutral} shrink-0"
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
      class="{ui.iconBtnSm.neutral} shrink-0"
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
      class="{ui.iconBtnSm.neutral} shrink-0"
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
