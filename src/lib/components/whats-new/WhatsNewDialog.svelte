<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher, onMount, tick } from "svelte";
  import MarkdownIt from "markdown-it";
  import { features, getAllFeatures, type FeatureHighlight } from "./features";

  // @ts-ignore
  import pkg from "../../../../package.json";
  export let show = false;

  const dispatch = createEventDispatcher();
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  });

  // Mode can be 'features' (viewing individual features of current release) or 'releases' (viewing full changelogs)
  let viewMode: "features" | "releases" = "features";

  let currentRelease: FeatureHighlight | null = null;
  let allReleases: FeatureHighlight[] = [];

  // Left menu state
  let parsedFeatures: { id: string; title: string; content: string }[] = [];
  let activeFeatureId: string | null = null;
  let activeReleaseId: string | null = null;

  // Runtime-loaded features (dynamic fallback)
  let runtimeFeatures: FeatureHighlight[] = [];
  $: displayedFeatures = features.length ? getAllFeatures() : runtimeFeatures;

  onMount(async () => {
    // Dynamic import fallback (kept from original implementation)
    if (
      features.length === 0 &&
      typeof (import.meta as any).glob === "function"
    ) {
      try {
        let dynamic: Record<string, (args?: any) => Promise<any>> | undefined;
        dynamic = (import.meta as any).glob("./features/*.md", {
          query: "?raw",
          import: "default",
        }) as Record<string, (args?: any) => Promise<any>>;

        const entries = Object.entries(dynamic || {});
        const out: FeatureHighlight[] = [];
        for (const [path, importer] of entries) {
          try {
            const res = await importer();
            const content =
              typeof res === "string" ? res : (res?.default ?? "");
            const fileName = path.split("/").pop()!;
            const id = fileName.replace(/\.md$/, "");
            out.push({
              id,
              title: `Version ${id.replace(/^v/, "")} Highlights`,
              content,
            });
          } catch (e) {}
        }

        out.sort((a, b) => {
          const pa = a.id
            .replace(/^v/, "")
            .split(".")
            .map((n) => parseInt(n, 10) || 0);
          const pb = b.id
            .replace(/^v/, "")
            .split(".")
            .map((n) => parseInt(n, 10) || 0);
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            if ((pb[i] || 0) !== (pa[i] || 0))
              return (pb[i] || 0) - (pa[i] || 0);
          }
          return 0;
        });
        runtimeFeatures = out;
      } catch (e) {}
    }
  });

  // Re-run parsing automatically when the displayed features update (e.g. via Vite HMR for live preview)
  $: allReleases = displayedFeatures;
  $: currentRelease = allReleases.length > 0 ? allReleases[0] : null;

  $: if (currentRelease && show) {
    const lines = currentRelease.content.split("\n");
    const extracted: { id: string; title: string; content: string }[] = [];
    let currentTitle = "Overview";
    let currentContent: string[] = [];

    for (const line of lines) {
      // Find headings like "## Feature" or "### **Bug Fixes:**"
      const headingMatch = line.match(
        /^(#{2,4})\s+(?:\*\*|__)?(.*?)(?:\*\*|__)?\s*$/,
      );
      if (
        headingMatch &&
        !headingMatch[2].toLowerCase().includes("what's new")
      ) {
        const text = currentContent.join("\n").trim();
        // Skip adding sections if they have no real text content
        if (text.length > 0) {
          extracted.push({
            id: currentTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            title: currentTitle.replace(/:$/, ""),
            content: text,
          });
        }
        currentTitle = headingMatch[2].trim();
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    const finalText = currentContent.join("\n").trim();
    if (finalText.length > 0) {
      extracted.push({
        id: currentTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        title: currentTitle.replace(/:$/, ""),
        content: finalText,
      });
    }

    parsedFeatures = extracted;
    // Auto-select the first feature if we don't have one selected or if it was removed
    if (
      parsedFeatures.length > 0 &&
      (!activeFeatureId ||
        !parsedFeatures.find((f) => f.id === activeFeatureId))
    ) {
      activeFeatureId = parsedFeatures[0].id;
    }
  }

  function close() {
    show = false;
    viewMode = "features";
    dispatch("close");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && show) {
      close();
    }
  }

  $: activeContentHtml = (() => {
    if (viewMode === "features") {
      const feature = parsedFeatures.find((f) => f.id === activeFeatureId);
      return feature ? md.render(feature.content) : "";
    } else {
      const release = allReleases.find((r) => r.id === activeReleaseId);
      return release ? md.render(release.content) : "";
    }
  })();
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
      class="bg-white dark:bg-neutral-800 md:rounded-xl shadow-2xl w-full h-full md:h-auto md:w-full md:max-w-5xl md:max-h-[70vh] flex overflow-hidden border-0 md:border border-neutral-200 dark:border-neutral-700 transition-all duration-200"
    >
      <!-- Adobe Style Split View -->
      <!-- Left Sidebar / Menu -->
      <div
        class="w-full md:w-80 border-r border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 flex flex-col overflow-hidden shrink-0 {viewMode ===
        'features'
          ? 'flex md:flex'
          : 'hidden md:flex'}"
      >
        <div
          class="h-[73px] p-4 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center bg-white dark:bg-neutral-800 shrink-0"
        >
          <div class="flex items-center gap-2">
            {#if viewMode === "releases"}
              <button
                on:click={() => (viewMode = "features")}
                class="p-1 -ml-1 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700"
                aria-label="Back"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                  /></svg
                >
              </button>
            {/if}
            <h2
              class="font-bold text-lg text-neutral-900 dark:text-white"
              id="whats-new-title"
            >
              {viewMode === "features" ? "What's New" : "All Releases"}
            </h2>
          </div>
          <!-- Mobile Close -->
          <button
            on:click={close}
            class="md:hidden p-2 -mr-2 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              /></svg
            >
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          {#if viewMode === "features"}
            <div
              class="mb-3 px-2 text-xs font-bold text-neutral-500 uppercase tracking-wider"
            >
              Version {currentRelease?.id.replace(/^v/, "")}
            </div>
            {#each parsedFeatures as feature}
              <button
                class="w-full text-left px-3 py-2.5 rounded-lg text-base transition-all border {activeFeatureId ===
                feature.id
                  ? 'bg-white dark:bg-neutral-700 border-neutral-200 dark:border-neutral-600 shadow-sm text-purple-600 dark:text-purple-400 font-bold'
                  : 'border-transparent text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50'}"
                on:click={() => (activeFeatureId = feature.id)}
              >
                {feature.title}
              </button>
            {/each}
          {:else}
            {#each allReleases as release}
              <button
                class="w-full text-left px-3 py-2.5 rounded-lg text-base transition-all border {activeReleaseId ===
                release.id
                  ? 'bg-white dark:bg-neutral-700 border-neutral-200 dark:border-neutral-600 shadow-sm text-purple-600 dark:text-purple-400 font-bold'
                  : 'border-transparent text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50'}"
                on:click={() => (activeReleaseId = release.id)}
              >
                {release.title}
              </button>
            {/each}
          {/if}
        </div>

        <!-- Footer Toggle -->
        <div
          class="p-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800"
        >
          {#if viewMode === "features"}
            <button
              class="w-full py-2 px-3 flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
              on:click={() => {
                viewMode = "releases";
                activeReleaseId = currentRelease?.id || allReleases[0]?.id;
              }}
            >
              <span>View Previous Releases</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                /></svg
              >
            </button>
          {:else}
            <button
              class="w-full py-2 px-3 flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
              on:click={() => (viewMode = "features")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 19l-7-7 7-7"
                /></svg
              >
              <span>Back to What's New</span>
            </button>
          {/if}
        </div>
      </div>

      <!-- Right Content Pane -->
      <div
        class="flex-1 flex flex-col bg-white dark:bg-neutral-900 min-w-0 {viewMode ===
        'releases'
          ? 'block'
          : 'hidden md:flex'}"
      >
        <div
          class="h-[73px] flex md:justify-end items-center p-4 border-b border-neutral-200 dark:border-neutral-700 shrink-0"
        >
          <!-- Mobile Back Button (only when in releases view on small screens) -->
          <button
            on:click={() => (viewMode = "features")}
            class="md:hidden flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              /></svg
            >
            Back
          </button>

          <div class="flex-1"></div>

          <!-- Desktop Close -->
          <button
            on:click={close}
            class="hidden md:block p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              ><path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              /></svg
            >
          </button>
        </div>

        <div
          class="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar animate-fade-in relative"
        >
          {#if viewMode === "features"}
            <div class="grid max-w-3xl w-full">
              {#each parsedFeatures as feature, i (feature.id)}
                <div
                  class="col-start-1 row-start-1 flex flex-col transition-opacity duration-200"
                  style="visibility: {feature.id === activeFeatureId
                    ? 'visible'
                    : 'hidden'}; opacity: {feature.id === activeFeatureId
                    ? '1'
                    : '0'}; pointer-events: {feature.id === activeFeatureId
                    ? 'auto'
                    : 'none'}; z-index: {feature.id === activeFeatureId
                    ? '10'
                    : '0'};"
                >
                  <div>
                    <h2
                      class="text-3xl font-extrabold text-neutral-900 dark:text-white mb-6"
                    >
                      {feature.title}
                    </h2>
                    <div
                      class="prose dark:prose-invert max-w-none text-neutral-600 dark:text-neutral-300 prose-purple prose-headings:text-neutral-900 dark:prose-headings:text-white prose-a:text-purple-600 dark:prose-a:text-purple-400 text-lg md:text-xl leading-relaxed"
                    >
                      {@html md.render(feature.content)}
                    </div>
                  </div>

                  <div
                    class="mt-12 pt-6 border-t border-neutral-200 dark:border-neutral-700 flex justify-end pb-4"
                  >
                    {#if i < parsedFeatures.length - 1}
                      <button
                        class="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg shadow-md transition-all flex items-center gap-2"
                        on:click={() =>
                          (activeFeatureId = parsedFeatures[i + 1].id)}
                      >
                        Next
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 5l7 7-7 7"
                          /></svg
                        >
                      </button>
                    {:else}
                      <button
                        class="px-6 py-2.5 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-800 dark:text-white font-bold rounded-lg transition-all"
                        on:click={close}
                      >
                        Done
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="max-w-4xl mx-auto">
              <div
                class="prose dark:prose-invert max-w-none prose-purple text-lg md:text-xl leading-relaxed text-neutral-600 dark:text-neutral-300"
              >
                {@html activeContentHtml}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style lang="postcss">
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
