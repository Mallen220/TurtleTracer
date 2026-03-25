<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/FileManagerToolbar.svelte -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import FolderIcon from "../icons/FolderIcon.svelte";

  export let searchQuery = "";
  export let sortMode: "name" | "date" = "name";
  export let viewMode: "list" | "grid" = "list";

  const dispatch = createEventDispatcher<{
    "new-file": void;
    "new-folder": void;
    "sort-change": "name" | "date";
    "view-change": "list" | "grid";
    search: string;
    "import-file": File;
    "import-java": File;
    "import-telemetry": void;
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

  function handleImportJava(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      dispatch("import-java", target.files[0]);
      target.value = ""; // Reset
    }
  }

  let fileInput: HTMLInputElement;
  let javaInput: HTMLInputElement;

  let showAddMenu = false;

  function handleWindowClick(e: MouseEvent) {
    if (showAddMenu) {
      const target = e.target as HTMLElement;
      if (!target.closest(".add-dropdown-container")) {
        showAddMenu = false;
      }
    }
  }

  function handleAddMenuToggle(e: MouseEvent) {
    e.stopPropagation();
    showAddMenu = !showAddMenu;
  }
</script>

<svelte:window on:click={handleWindowClick} />

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

  <!-- Row 2: Add Actions & Directories -->
  <div class="flex items-center gap-1 w-full">
    <!-- Add Dropdown -->
    <div class="relative add-dropdown-container overflow-visible">
      <button
        on:click={handleAddMenuToggle}
        class="flex items-center justify-center p-1.5 text-neutral-500 hover:text-green-600 dark:text-neutral-400 dark:hover:text-green-400 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
        title="Add / Import"
        aria-label="Add / Import"
        aria-haspopup="true"
        aria-expanded={showAddMenu}
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

      {#if showAddMenu}
        <div
          class="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-neutral-800 rounded-md shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 z-[60] flex flex-col"
        >
          <button
            on:click={() => {
              dispatch("new-file");
              showAddMenu = false;
            }}
            class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-4 text-green-500"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
              />
            </svg>
            New File
          </button>

          <button
            on:click={() => {
              dispatch("new-folder");
              showAddMenu = false;
            }}
            class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-4 text-blue-500"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
              />
            </svg>
            New Folder
          </button>

          <div
            class="h-px bg-neutral-200 dark:bg-neutral-700 my-1 w-full"
            role="presentation"
            aria-hidden="true"
          ></div>

          <button
            on:click={() => {
              fileInput?.click();
              showAddMenu = false;
            }}
            class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-4 text-purple-500"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
              />
            </svg>
            Import File
          </button>

          <button
            on:click={() => {
              javaInput?.click();
              showAddMenu = false;
            }}
            class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-4 text-orange-500"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
              />
            </svg>
            Import Java
          </button>

          <button
            on:click={() => {
              dispatch("import-telemetry");
              showAddMenu = false;
            }}
            class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-4 text-blue-500"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
              />
            </svg>
            Import Telemetry
          </button>
        </div>
      {/if}
    </div>

    <!-- Hidden Inputs for Imports -->
    <input
      bind:this={javaInput}
      type="file"
      accept=".java"
      class="hidden"
      on:change={handleImportJava}
      tabindex="-1"
    />
    <input
      bind:this={fileInput}
      type="file"
      accept=".turt,.pp"
      class="hidden"
      on:change={handleImport}
      tabindex="-1"
    />

  </div>
</div>
