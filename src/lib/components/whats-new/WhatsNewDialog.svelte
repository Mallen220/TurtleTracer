<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import MarkdownIt from "markdown-it";
  import { features } from "./features";
  // @ts-ignore
  import changelogContent from "../../../../CHANGELOG.md?raw";

  export let show = false;

  const dispatch = createEventDispatcher();
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  });

  let activeTab: "features" | "changelog" = "features";

  function close() {
    dispatch("close");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && show) {
      close();
    }
  }

  // Render markdown content
  $: featuresHtml = features
    .map(
      (f) => `
      <div class="mb-8 border-b border-neutral-200 dark:border-neutral-700 pb-6 last:border-0">
        <h2 class="text-xl font-bold mb-4 text-purple-600 dark:text-purple-400">${f.title}</h2>
        <div class="markdown-body text-neutral-800 dark:text-neutral-200">
          ${md.render(f.content)}
        </div>
      </div>
    `,
    )
    .join("");

  $: changelogHtml = md.render(changelogContent);
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
      class="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-neutral-200 dark:border-neutral-700"
    >
      <!-- Header -->
      <div
        class="flex-none p-6 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center bg-neutral-50 dark:bg-neutral-800"
      >
        <div>
          <h1
            id="whats-new-title"
            class="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2"
          >
            <span>🎉</span> What's New
          </h1>
          <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Check out the latest updates and improvements.
          </p>
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

      <!-- Tabs -->
      <div
        class="flex-none flex border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
      >
        <button
          class="flex-1 py-4 text-sm font-medium border-b-2 transition-colors relative"
          class:border-purple-500={activeTab === "features"}
          class:text-purple-600={activeTab === "features"}
          class:dark:text-purple-400={activeTab === "features"}
          class:border-transparent={activeTab !== "features"}
          class:text-neutral-500={activeTab !== "features"}
          class:dark:text-neutral-400={activeTab !== "features"}
          class:hover:text-neutral-700={activeTab !== "features"}
          class:dark:hover:text-neutral-300={activeTab !== "features"}
          on:click={() => (activeTab = "features")}
        >
          ✨ Highlights
        </button>
        <button
          class="flex-1 py-4 text-sm font-medium border-b-2 transition-colors relative"
          class:border-purple-500={activeTab === "changelog"}
          class:text-purple-600={activeTab === "changelog"}
          class:dark:text-purple-400={activeTab === "changelog"}
          class:border-transparent={activeTab !== "changelog"}
          class:text-neutral-500={activeTab !== "changelog"}
          class:dark:text-neutral-400={activeTab !== "changelog"}
          class:hover:text-neutral-700={activeTab !== "changelog"}
          class:dark:hover:text-neutral-300={activeTab !== "changelog"}
          on:click={() => (activeTab = "changelog")}
        >
          📝 Full Changelog
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-0 bg-white dark:bg-neutral-900">
        {#if activeTab === "features"}
          <div class="p-8 max-w-3xl mx-auto animate-fade-in">
            <!-- Features Content -->
            <!-- Use a wrapper for prose styling -->
            <div class="prose dark:prose-invert max-w-none">
              {@html featuresHtml}
            </div>

            {#if features.length === 0}
              <div class="text-center py-12 text-neutral-500">
                <p>No feature highlights available for this version.</p>
                <button
                  class="text-purple-500 hover:underline mt-2"
                  on:click={() => (activeTab = "changelog")}
                >
                  View Changelog
                </button>
              </div>
            {/if}
          </div>
        {:else}
          <div class="p-8 max-w-3xl mx-auto animate-fade-in">
            <div class="prose dark:prose-invert max-w-none">
              {@html changelogHtml}
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="flex-none p-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 flex justify-end"
      >
        <button
          class="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors shadow-sm"
          on:click={close}
        >
          Got it!
        </button>
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
