<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import MarkdownIt from "markdown-it";
  import { features, type FeatureHighlight } from "./features";
  import { pages, type Page } from "./pages";
  // @ts-ignore
  import changelogContent from "../../../../CHANGELOG.md?raw";
  // Import app version from package.json so the UI shows the real version at build time
  // @ts-ignore
  import pkg from "../../../../package.json";

  export let show = false;

  const dispatch = createEventDispatcher();
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  });

  // Navigation state
  let activeTab: "home" | "changelog" = "home";
  let currentView: "grid" | "content" | "release-list" = "grid";
  let previousView: "grid" | "release-list" = "grid";
  let activePage: Page | null = null;
  let activeFeatureId: string | null = null;
  let searchQuery = "";

  $: searchResults = (() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();

    // Search pages
    const matchedPages = pages
      .filter(
        (p) =>
          p.type !== "changelog" && // Exclude full changelog from search results to avoid noise
          (p.title.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query) ||
            (p.content && p.content.toLowerCase().includes(query))),
      )
      .map((p) => ({ type: "page" as const, item: p }));

    // Search features
    const matchedFeatures = features
      .filter(
        (f) =>
          f.title.toLowerCase().includes(query) ||
          f.content.toLowerCase().includes(query),
      )
      .map((f) => ({ type: "feature" as const, item: f }));

    return [...matchedPages, ...matchedFeatures];
  })();

  function close() {
    dispatch("close");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && show) {
      if (searchQuery) {
        searchQuery = "";
        return;
      }
      if (currentView === "content" && activeTab === "home") {
        goBack();
      } else if (currentView === "release-list") {
        goBack();
      } else {
        close();
      }
    }
  }

  function handlePageClick(page: Page) {
    if (page.type === "changelog") {
      activeTab = "changelog";
      return;
    }

    if (page.type === "release-list") {
      currentView = "release-list";
      return;
    }

    if (page.type === "highlight") {
      if (page.highlightId) {
        activeFeatureId = page.highlightId;
        activePage = page;
        previousView = "grid";
        currentView = "content";
      }
      return;
    }

    if (page.type === "page") {
      activePage = page;
      previousView = "grid";
      currentView = "content";
    }
  }

  function handleFeatureClick(feature: FeatureHighlight) {
    activeFeatureId = feature.id;
    activePage = null;
    // If we are in the release list view, record that so we can go back
    if (currentView === "release-list") {
      previousView = "release-list";
    } else {
      previousView = "grid";
    }
    currentView = "content";
  }

  function handleSearchResultClick(result: {
    type: "page" | "feature";
    item: any;
  }) {
    if (result.type === "page") {
      handlePageClick(result.item);
    } else {
      handleFeatureClick(result.item);
    }
    // Note: searchQuery remains active, so 'back' will effectively return to search results
  }

  function goBack() {
    // If searching, we just clear the content view (if any) but keep search query active
    // This effectively returns to the search results list
    if (searchQuery && currentView === "content") {
      currentView = "grid"; // 'grid' + searchQuery = search results view
      activePage = null;
      activeFeatureId = null;
      return;
    }

    if (currentView === "content" && previousView === "release-list") {
      currentView = "release-list";
      activePage = null;
      activeFeatureId = null;
      return;
    }

    // Default back behavior
    currentView = "grid";
    activePage = null;
    activeFeatureId = null;
    searchQuery = ""; // Clear search when going back to home grid
  }

  function switchToHome() {
    activeTab = "home";
    currentView = "grid";
    activePage = null;
    activeFeatureId = null;
    searchQuery = "";
  }

  // Render markdown content
  // We only render the active content now
  $: activeContentHtml = (() => {
    if (activeTab === "changelog") {
      return md.render(changelogContent);
    }

    if (activeFeatureId) {
      const feature = features.find((f) => f.id === activeFeatureId);
      return feature ? md.render(feature.content) : "";
    }

    if (activePage && activePage.content) {
      return md.render(activePage.content);
    }

    return "";
  })();

  // Icons
  const icons: Record<string, string> = {
    sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
    rocket: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
    keyboard: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" ry="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M6 12h.001"/><path d="M10 12h.001"/><path d="M14 12h.001"/><path d="M18 12h.001"/><path d="M7 16h10"/></svg>`,
    "file-text": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`,
    folder: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
    pencil: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    play: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
    cube: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-9 5-9-5"/><polygon points="12 3 21 8 12 13 3 8 12 3"/></svg>`,
    "map-pin": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
    "chart-bar": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
    code: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    cog: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    clock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  };

  // Application version read from package.json (set at build time)
  const appVersion: string = (pkg as any)?.version ?? "?.?.?";

  $: title = searchQuery
    ? "Search Results"
    : activeTab === "changelog"
      ? "Full Changelog"
      : currentView === "content" && activePage
        ? activePage.title
        : currentView === "content" && activeFeatureId
          ? (features.find((f) => f.id === activeFeatureId)?.title ??
            "Feature Highlight")
          : currentView === "release-list"
            ? "Release Notes"
            : "What's New";
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="whats-new-title"
  >
    <div
      class="bg-white dark:bg-neutral-800 md:rounded-xl shadow-2xl w-full h-full md:h-auto md:w-full md:max-w-4xl md:max-h-[85vh] flex flex-col overflow-hidden border-0 md:border border-neutral-200 dark:border-neutral-700 transition-all duration-200"
    >
      <!-- Header -->
      <div
        class="flex-none p-4 md:p-6 border-b border-neutral-200 dark:border-neutral-700 flex flex-col md:flex-row justify-between items-start md:items-center bg-neutral-50 dark:bg-neutral-800 gap-4"
      >
        <div class="flex items-center gap-4 w-full md:w-auto">
          {#if activeTab === "changelog" || (activeTab === "home" && currentView !== "grid" && !searchQuery) || (searchQuery && currentView === "content")}
            <button
              class="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
              on:click={() =>
                activeTab === "changelog" ? switchToHome() : goBack()}
              aria-label="Back"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </button>
          {/if}
          <div class="flex-1">
            <h1
              id="whats-new-title"
              class="text-xl md:text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2 whitespace-nowrap"
            >
              {#if activeTab === "home" && currentView === "grid" && !searchQuery}
                <span>🎉</span>
              {/if}
              {title}
            </h1>
          </div>
        </div>

        <div class="flex items-center gap-3 w-full md:w-auto">
          {#if activeTab === "home"}
            <div class="relative w-full md:w-64">
              <input
                type="text"
                placeholder="Search..."
                bind:value={searchQuery}
                class="w-full px-4 py-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
              {#if searchQuery}
                <button
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  on:click={() => (searchQuery = "")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><line x1="18" y1="6" x2="6" y2="18" /><line
                      x1="6"
                      y1="6"
                      x2="18"
                      y2="18"
                    /></svg
                  >
                </button>
              {:else}
                <div
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><circle cx="11" cy="11" r="8" /><line
                      x1="21"
                      y1="21"
                      x2="16.65"
                      y2="16.65"
                    /></svg
                  >
                </div>
              {/if}
            </div>
          {/if}

          <button
            class="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors hidden md:block"
            on:click={close}
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <!-- Mobile Close Button (Absolute position top right) -->
          <button
            class="md:hidden absolute top-4 right-4 p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
            on:click={close}
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto bg-white dark:bg-neutral-900">
        {#if searchQuery && currentView !== "content"}
          <!-- Search Results View -->
          <div class="p-6 max-w-5xl mx-auto animate-fade-in">
            {#if searchResults.length === 0}
              <div
                class="flex flex-col items-center justify-center text-center py-12 text-neutral-500"
              >
                <div class="mb-4 text-6xl">🔍</div>
                <h3 class="text-xl font-bold mb-2">No results found</h3>
                <p>Try searching for something else.</p>
              </div>
            {:else}
              <div class="grid grid-cols-1 gap-2">
                {#each searchResults as result}
                  <button
                    class="flex items-start gap-4 p-4 rounded-lg border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all text-left group"
                    on:click={() => handleSearchResultClick(result)}
                  >
                    <div
                      class="p-2 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 shrink-0"
                    >
                      {#if result.type === "page"}
                        {@html icons[result.item.icon] || icons["sparkles"]}
                      {:else}
                        {@html icons["sparkles"]}
                      {/if}
                    </div>
                    <div>
                      <h3
                        class="font-bold text-neutral-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"
                      >
                        {result.item.title}
                      </h3>
                      <p
                        class="text-sm text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2"
                      >
                        {result.type === "page"
                          ? result.item.description
                          : "Feature Highlight"}
                      </p>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else if activeTab === "home" && currentView === "grid"}
          <!-- Grid View -->
          <div class="p-4 md:p-8 max-w-5xl mx-auto animate-fade-in">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {#each pages as page}
                <button
                  class="group flex flex-col items-start p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-purple-500 dark:hover:border-purple-500 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-white dark:hover:bg-neutral-800 transition-all duration-200 shadow-sm hover:shadow-md text-left w-full h-full"
                  on:click={() => handlePageClick(page)}
                >
                  <div
                    class="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 mb-4 group-hover:scale-110 transition-transform duration-200"
                  >
                    {@html icons[page.icon] || icons["sparkles"]}
                  </div>
                  <h3
                    class="text-lg font-bold text-neutral-900 dark:text-white mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"
                  >
                    {page.title}
                  </h3>
                  <p
                    class="text-neutral-500 dark:text-neutral-400 text-sm leading-relaxed"
                  >
                    {page.description}
                  </p>
                </button>
              {/each}
            </div>

            <!-- Version info footer -->
            <div
              class="mt-12 text-center text-sm text-neutral-400 dark:text-neutral-600"
            >
              Pedro Pathing Visualizer v{appVersion}
            </div>
          </div>
        {:else if activeTab === "home" && currentView === "release-list"}
          <!-- Release List View -->
          <div class="p-4 md:p-8 max-w-3xl mx-auto animate-fade-in">
            <div class="space-y-4">
              {#each features as feature}
                <button
                  class="w-full flex flex-col items-start p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-purple-500 dark:hover:border-purple-500 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-white dark:hover:bg-neutral-800 transition-all duration-200 shadow-sm hover:shadow-md text-left"
                  on:click={() => handleFeatureClick(feature)}
                >
                  <div class="flex items-center gap-3 mb-2">
                    <div
                      class="p-1.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                    >
                      {@html icons["sparkles"]}
                    </div>
                    <h3
                      class="text-lg font-bold text-neutral-900 dark:text-white"
                    >
                      {feature.title}
                    </h3>
                  </div>
                  <p class="text-neutral-500 dark:text-neutral-400 text-sm">
                    Click to view highlights for this version.
                  </p>
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <!-- Content View -->
          <div class="p-4 md:p-8 max-w-3xl mx-auto animate-fade-in">
            <div class="prose dark:prose-invert max-w-none">
              {@html activeContentHtml}
            </div>

            {#if activeTab === "home" && currentView === "content"}
              <div
                class="mt-12 pt-6 border-t border-neutral-200 dark:border-neutral-700 flex justify-center"
              >
                <button
                  class="px-6 py-2 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors text-sm font-medium"
                  on:click={goBack}
                >
                  Back
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style lang="postcss">
  /* Global styles for rendered markdown */
  :global(.prose h1) {
    @apply text-2xl font-bold mb-4 mt-8 first:mt-0;
  }
  :global(.prose h2) {
    @apply text-xl font-bold mb-3 mt-6;
  }
  :global(.prose h3) {
    @apply text-lg font-bold mb-2 mt-4;
  }
  :global(.prose p) {
    @apply mb-4 leading-relaxed;
  }
  :global(.prose ul) {
    @apply list-disc list-outside ml-5 mb-4;
  }
  :global(.prose ol) {
    @apply list-decimal list-outside ml-5 mb-4;
  }
  :global(.prose li) {
    @apply mb-1;
  }
  :global(.prose strong) {
    @apply font-bold text-neutral-900 dark:text-neutral-100;
  }
  :global(.prose a) {
    @apply text-purple-600 dark:text-purple-400 hover:underline;
  }
  :global(.prose code) {
    @apply bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-sm font-mono text-purple-700 dark:text-purple-300;
  }
  :global(.prose pre) {
    @apply bg-neutral-100 dark:bg-neutral-800 p-4 rounded-lg overflow-x-auto mb-4 text-sm font-mono;
  }
  :global(.prose blockquote) {
    @apply border-l-4 border-purple-200 dark:border-purple-900 pl-4 italic my-4;
  }
  :global(.prose img) {
    @apply rounded-lg shadow-md max-w-full my-4 border border-neutral-200 dark:border-neutral-700;
  }

  .animate-fade-in {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
