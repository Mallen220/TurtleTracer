<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { showUpdateAvailableDialog, updateDataStore } from "../../../stores";
  import MarkdownIt from "markdown-it";
  import LoadingSpinner from "../common/LoadingSpinner.svelte";

  export let show = false;

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  });

  let updateData: {
    version: string;
    releaseNotes: string;
    url: string;
  } | null = null;
  $: updateData = $updateDataStore;

  let isWindows = false;
  let isStore = false;
  let releaseNotesHtml = "";
  let isLoadingNotes = false;
  // Current installed app version (populated from preload in Electron)
  let currentVersion: string | null = null;

  onMount(async () => {
    const api = (window as any).electronAPI;
    if (api) {
      // Check platform
      const userAgent = window.navigator.userAgent;
      isWindows = userAgent.indexOf("Windows") !== -1;

      if (api.isWindowsStore) {
        isStore = await api.isWindowsStore();
      }

      // Try to read the currently installed app version from the preload API
      if (api.getAppVersion) {
        try {
          const v = await api.getAppVersion();
          currentVersion = typeof v === "string" ? v : String(v || "");
        } catch (err) {
          console.warn("Failed to read app version from preload:", err);
        }
      }
    }
  });

  // Fetch release notes when updateData changes or show becomes true
  $: if (show && updateData) {
    fetchReleaseNotes(updateData.version, updateData.releaseNotes);
  }

  async function fetchReleaseNotes(version: string, fallbackNotes: string) {
    // If we already have HTML for this version, skip
    // (Simple check, in a real app we might cache by version more robustly)
    if (releaseNotesHtml && releaseNotesHtml.length > 0) return;

    isLoadingNotes = true;
    try {
      // Try to fetch from the raw GitHub URL
      // https://raw.githubusercontent.com/Mallen220/PedroPathingPlusVisualizer/main/src/lib/components/whats-new/features/v{version}.md
      const response = await fetch(
        `https://raw.githubusercontent.com/Mallen220/PedroPathingPlusVisualizer/main/src/lib/components/whats-new/features/v${version}.md`,
      );

      if (response.ok) {
        const text = await response.text();
        releaseNotesHtml = md.render(text);
      } else {
        throw new Error("Failed to fetch remote notes");
      }
    } catch (e) {
      console.warn("Failed to fetch detailed release notes, using fallback", e);
      // Fallback to the notes provided by the update check (usually GitHub Release body)
      releaseNotesHtml = md.render(
        fallbackNotes || "No release notes available.",
      );
    } finally {
      isLoadingNotes = false;
    }
  }

  function close() {
    showUpdateAvailableDialog.set(false);
  }

  function handleDownload() {
    const api = (window as any).electronAPI;
    if (api && updateData) {
      if (api.downloadUpdate) {
        // Pass version and url
        api.downloadUpdate(updateData.version, updateData.url);
      } else if (api.openExternal) {
        // Fallback
        api.openExternal(updateData.url);
      }
    }
    close();
  }

  function handleSkip() {
    const api = (window as any).electronAPI;
    if (api && updateData && api.skipUpdate) {
      api.skipUpdate(updateData.version);
    }
    close();
  }

  function handleSwitchToStore() {
    const api = (window as any).electronAPI;
    if (api && api.openExternal) {
      // URL from README
      api.openExternal(
        "https://apps.microsoft.com/detail/9nb7sqkhhct6?cid=DevShareMCLPCS&hl=en-US&gl=US",
      );
    }
    close();
  }

  // Open the GitHub releases page for this release (keeps dialog open)
  function handleOpenReleases(): void {
    const api = (window as any).electronAPI;
    if (api && api.openExternal && updateData?.url) {
      api.openExternal(updateData.url);
    } else if (updateData?.url) {
      window.open(updateData.url, "_blank", "noopener");
    }
  }
</script>

{#if show && updateData}
  <div
    class="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="relative bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl w-full max-w-[520px] overflow-hidden border border-neutral-100 dark:border-neutral-800"
      transition:scale={{
        start: 0.95,
        duration: 300,
        easing: cubicOut,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
    >
      <!-- Background decorative blobs -->
      <div
        class="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"
      ></div>
      <div
        class="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3 pointer-events-none"
      ></div>

      <!-- Close Button -->
      <button
        on:click={close}
        class="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all z-10"
        aria-label="Close"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="w-5 h-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6 18 18 6M6 6l12 12"
          />
        </svg>
      </button>

      <div class="relative p-8 flex flex-col gap-6">
        <!-- Top Section -->
        <div class="text-center space-y-2">
          <div
            class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 text-purple-600 dark:text-purple-400 mb-2 shadow-sm ring-1 ring-purple-100 dark:ring-purple-900/50"
          >
            <!-- Use the rocket icon (consistent with What's New) -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="w-8 h-8"
            >
              <path
                d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"
              />
              <path
                d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
              />
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
            </svg>
          </div>
          <h2
            id="update-title"
            class="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight"
          >
            New Version Available
          </h2>
          <p class="text-neutral-500 dark:text-neutral-400">
            Version <span
              class="font-semibold text-purple-600 dark:text-purple-400"
              >{updateData.version}</span
            > is ready for you.
          </p>
        </div>

        <!-- MS Store Recommendation (Friendly Card) -->
        {#if isWindows && !isStore}
          <div
            class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 p-1 rounded-2xl"
          >
            <div
              class="bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-blue-100 dark:border-blue-900/50 rounded-xl p-4 flex items-start gap-4"
            >
              <div
                class="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-lg text-blue-600 dark:text-blue-400 shrink-0"
              >
                <!-- Microsoft 4‑square logo (colored) — increased size -->
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 32 32"
                  class="w-6 h-6"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect x="5" y="5" width="10" height="10" fill="#F25325" />
                  <rect x="17" y="5" width="10" height="10" fill="#80BC06" />
                  <rect x="5" y="17" width="10" height="10" fill="#05A6F0" />
                  <rect x="17" y="17" width="10" height="10" fill="#FEBA08" />
                </svg>
              </div>
              <div class="flex-1">
                <h3
                  class="font-semibold text-sm text-neutral-900 dark:text-white"
                >
                  Want automatic updates?
                </h3>
                <p
                  class="text-xs text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed"
                >
                  Switch to the Microsoft Store version and never worry about
                  updating manually again.
                </p>
                <button
                  on:click={handleSwitchToStore}
                  class="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 inline-flex items-center gap-1 transition-colors group"
                >
                  Get it for free
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        {/if}

        <!-- Release Notes -->
        <div class="space-y-3">
          <div
            class="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="w-4 h-4 text-purple-500"
            >
              <path
                fill-rule="evenodd"
                d="M4.125 3C3.089 3 2.25 3.84 2.25 4.875V18a3 3 0 0 0 3 3h15a3 3 0 0 1-3-3V4.875C17.25 3.839 16.41 3 15.375 3H4.125ZM12 9.75a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 0-1.5H12Zm-.75-2.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5H12a.75.75 0 0 1-.75-.75ZM6 12.75a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5H6Zm-.75 3.75a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5H6a.75.75 0 0 1-.75-.75ZM6 6.75a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5H6Zm-.75 3.75a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5H6a.75.75 0 0 1-.75-.75ZM6 15.75a.75.75 0 0 0 0 1.5h2.25a.75.75 0 0 0 0-1.5H6Z"
                clip-rule="evenodd"
              />
            </svg>
            Release Notes
          </div>
          <div
            class="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 rounded-xl p-4 max-h-40 overflow-y-auto custom-scrollbar"
          >
            {#if isLoadingNotes}
              <div class="flex items-center justify-center h-20">
                <LoadingSpinner size="sm" text="Loading highlights..." />
              </div>
            {:else}
              <div class="prose prose-sm dark:prose-invert max-w-none">
                {@html releaseNotesHtml}
              </div>
            {/if}
          </div>
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-3 pt-2">
          <button
            on:click={handleDownload}
            class="w-full py-3 px-4 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black font-semibold rounded-xl transition-all transform active:scale-[0.98] shadow-lg shadow-neutral-500/20 dark:shadow-none flex justify-center items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="w-5 h-5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            Download & Install
          </button>

          <div class="flex justify-between items-center gap-3 px-1">
            <div class="flex items-center gap-2">
              <button
                on:click={handleSkip}
                aria-label="Skip this version"
                class="px-3 py-1.5 text-sm font-medium rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/20"
              >
                Skip this version
              </button>

              <button
                on:click={handleOpenReleases}
                aria-label="Open releases page"
                class="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-50 dark:bg-gray-900/20 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900/30 border border-gray-200 dark:border-gray-800/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500/20"
              >
                Open Releases Page
              </button>
            </div>

            <button
              on:click={close}
              aria-label="Remind me later"
              class="px-3 py-1.5 text-sm font-medium rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-800/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/20"
            >
              Remind me later
            </button>
          </div>
        </div>

        {#if currentVersion}
          <div
            class="mt-3 text-center text-xs text-neutral-400 dark:text-neutral-500"
          >
            Current version: <span
              class="font-mono text-xs text-neutral-600 dark:text-neutral-300"
              >{currentVersion}</span
            >
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style lang="postcss">
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.3);
    border-radius: 20px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.5);
  }

  /* Prose Overrides for Compact View */
  :global(.prose h1) {
    @apply text-lg font-bold mb-2 mt-4 first:mt-0;
  }
  :global(.prose h2) {
    @apply text-base font-bold mb-2 mt-3;
  }
  :global(.prose h3) {
    @apply text-sm font-bold mb-1 mt-2;
  }
  :global(.prose p) {
    @apply mb-2 leading-relaxed text-sm text-neutral-600 dark:text-neutral-300;
  }
  :global(.prose ul) {
    @apply list-disc list-outside ml-4 mb-2;
  }
  :global(.prose li) {
    @apply mb-0.5 text-sm text-neutral-600 dark:text-neutral-300;
  }
  :global(.prose strong) {
    @apply font-bold text-neutral-900 dark:text-neutral-100;
  }
</style>
