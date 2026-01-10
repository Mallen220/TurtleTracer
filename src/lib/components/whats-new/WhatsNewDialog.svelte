<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import MarkdownIt from "markdown-it";
  import { features } from "./features";
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
  let currentView: "grid" | "content" = "grid";
  let activePage: Page | null = null;
  let activeFeatureId: string | null = null;

  function close() {
    dispatch("close");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && show) {
      if (currentView === "content" && activeTab === "home") {
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

    if (page.type === "highlight") {
      if (page.highlightId) {
        activeFeatureId = page.highlightId;
        activePage = page;
        currentView = "content";
      }
      return;
    }

    if (page.type === "page") {
      activePage = page;
      currentView = "content";
    }
  }

  function goBack() {
    currentView = "grid";
    activePage = null;
    activeFeatureId = null;
  }

  function switchToHome() {
    activeTab = "home";
    currentView = "grid";
    activePage = null;
    activeFeatureId = null;
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
  };

  // Application version read from package.json (set at build time)
  const appVersion: string = (pkg as any)?.version ?? "?.?.?";

  $: title =
    activeTab === "changelog"
      ? "Full Changelog"
      : currentView === "content" && activePage
        ? activePage.title
        : "What's New";
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="whats-new-title"
  >
    <div
      class="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-neutral-200 dark:border-neutral-700 transition-all duration-200"
    >
      <!-- Header -->
      <div
        class="flex-none p-6 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center bg-neutral-50 dark:bg-neutral-800"
      >
        <div class="flex items-center gap-4">
          {#if activeTab === "changelog" || (activeTab === "home" && currentView === "content")}
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
          <div>
            <h1
              id="whats-new-title"
              class="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2"
            >
              {#if activeTab === "home" && currentView === "grid"}
                <span>🎉</span>
              {/if}
              {title}
            </h1>
          </div>
        </div>
        <button
          class="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
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

      <!-- Content -->
      <div class="flex-1 overflow-y-auto bg-white dark:bg-neutral-900">
        {#if activeTab === "home" && currentView === "grid"}
          <div class="p-8 max-w-5xl mx-auto animate-fade-in">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        {:else}
          <div class="p-8 max-w-3xl mx-auto animate-fade-in">
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
                  Back to Overview
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
