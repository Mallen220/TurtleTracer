<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import { fade, fly, scale } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { PluginManager } from "../../pluginManager";
  import { pluginsStore, type PluginInfo } from "../../pluginsStore";
  import PuzzleIcon from "../icons/PuzzleIcon.svelte";
  import FolderIcon from "../icons/FolderIcon.svelte";
  import {
    CloseIcon,
    SearchIcon,
    PluginManagerIcon,
    TrashIcon,
    TriangleWarningIcon,
    ArrowPathIcon,
  } from "../icons";

  export let isOpen = false;

  let searchQuery = "";
  let pluginToDelete: PluginInfo | null = null;

  // Derived status for better UI
  $: filteredPlugins = $pluginsStore.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  $: loadedPlugins = filteredPlugins.filter((p) => p.loaded);
  $: errorPlugins = filteredPlugins.filter((p) => !p.loaded);

  async function confirmDelete() {
    if (pluginToDelete) {
      await PluginManager.deletePlugin(pluginToDelete.name);
      pluginToDelete = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) {
      if (pluginToDelete) {
        pluginToDelete = null;
      } else {
        isOpen = false;
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    transition:fade={{ duration: 300, easing: cubicInOut }}
    class="fixed inset-0 z-[1005] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="plugin-manager-title"
  >
    <!-- Modal Container -->
    <div
      transition:fly={{ duration: 300, y: 20, easing: cubicInOut }}
      class="flex flex-col w-full max-w-4xl max-h-[85vh] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden relative"
    >
      <!-- Header -->
      <div
        class="flex flex-col gap-4 p-6 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 z-20"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
            >
              <PuzzleIcon className="size-6" />
            </div>
            <div>
              <h2
                id="plugin-manager-title"
                class="text-xl font-bold text-neutral-900 dark:text-white"
              >
                Plugin Manager
              </h2>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                Manage your installed extensions
              </p>
            </div>
          </div>
          <button
            on:click={() => (isOpen = false)}
            aria-label="Close"
            class="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <CloseIcon className="size-6" />
          </button>
        </div>

        <div class="relative w-full group">
          <div
            class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
          >
            <SearchIcon
              className="size-5 text-neutral-400 group-focus-within:text-purple-500 transition-colors"
            />
          </div>
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search installed plugins..."
            class="w-full pl-10 pr-4 py-2.5 bg-neutral-100 dark:bg-neutral-800 border border-transparent focus:bg-white dark:focus:bg-neutral-900 focus:border-purple-500 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-500 transition-all outline-none"
          />
        </div>
      </div>

      <!-- Main Content -->
      <div
        class="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-neutral-300 dark:scrollbar-thumb-neutral-700"
      >
        {#if $pluginsStore.length === 0}
          <div
            class="flex flex-col items-center justify-center py-16 text-center"
          >
            <div
              class="p-6 bg-neutral-50 dark:bg-neutral-800/50 rounded-full mb-6"
            >
              <PluginManagerIcon
                className="size-16 text-neutral-300 dark:text-neutral-600"
              />
            </div>
            <h3 class="text-xl font-semibold text-neutral-900 dark:text-white">
              No Plugins Installed
            </h3>
            <p
              class="text-neutral-500 dark:text-neutral-400 max-w-sm mt-2 mb-8 leading-relaxed"
            >
              Enhance the visualizer by adding Javascript (.js) or TypeScript
              (.ts) plugins to your plugins folder.
            </p>
            <button
              on:click={() => PluginManager.openPluginsFolder()}
              class="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all font-medium shadow-lg hover:shadow-purple-500/25 flex items-center gap-2"
            >
              <FolderIcon className="size-5" />
              Open Plugins Folder
            </button>
          </div>
        {:else if filteredPlugins.length === 0}
          <div
            class="flex flex-col items-center justify-center py-16 text-center"
          >
            <div
              class="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-full mb-4"
            >
              <SearchIcon className="size-8 text-neutral-400" />
            </div>
            <p class="text-neutral-500 dark:text-neutral-400 text-lg">
              No plugins match "<span
                class="font-semibold text-neutral-900 dark:text-white"
                >{searchQuery}</span
              >"
            </p>
            <button
              on:click={() => (searchQuery = "")}
              class="mt-4 text-purple-600 dark:text-purple-400 hover:underline"
            >
              Clear search
            </button>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Loaded Plugins -->
            {#each loadedPlugins as plugin (plugin.name)}
              <div
                animate:flip={{ duration: 300 }}
                transition:scale={{
                  duration: 200,
                  start: 0.95,
                  opacity: 0,
                  easing: cubicInOut,
                }}
                class="group flex flex-col p-4 bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md dark:hover:shadow-neutral-900/50 transition-all duration-200"
              >
                <div class="flex items-start justify-between gap-4 mb-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <div
                      class="flex-shrink-0 p-2.5 rounded-lg {plugin.enabled
                        ? 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 text-green-600 dark:text-green-400'
                        : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-400 dark:text-neutral-500'}"
                    >
                      <PuzzleIcon className="size-5" />
                    </div>
                    <div class="min-w-0">
                      <h3
                        class="font-semibold text-neutral-900 dark:text-white truncate text-base"
                        title={plugin.name}
                      >
                        {plugin.name}
                      </h3>
                      <div class="flex items-center gap-2 mt-0.5">
                        <span
                          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium {plugin.enabled
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'}"
                        >
                          <span
                            class="w-1.5 h-1.5 rounded-full {plugin.enabled
                              ? 'bg-green-500'
                              : 'bg-neutral-400'}"
                          ></span>
                          {plugin.enabled ? "Active" : "Disabled"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="mt-auto flex flex-col gap-3">
                  {#if plugin.description}
                    <p
                      class="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2"
                    >
                      {plugin.description}
                    </p>
                  {/if}

                  <div
                    class="pt-3 flex items-center justify-between border-t border-neutral-100 dark:border-neutral-700/50"
                  >
                    <label
                      class="relative inline-flex items-center cursor-pointer group/toggle"
                    >
                      <input
                        type="checkbox"
                        checked={plugin.enabled}
                        on:change={(e) =>
                          PluginManager.togglePlugin(
                            plugin.name,
                            e.currentTarget.checked,
                          )}
                        class="sr-only peer"
                      />
                      <div
                        class="w-9 h-5 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-neutral-600 peer-checked:bg-purple-600"
                      ></div>
                      <span
                        class="ml-2 text-xs font-medium text-neutral-500 group-hover/toggle:text-neutral-700 dark:text-neutral-400 dark:group-hover/toggle:text-neutral-200 transition-colors"
                      >
                        {plugin.enabled ? "On" : "Off"}
                      </span>
                    </label>

                    <button
                      on:click={() => (pluginToDelete = plugin)}
                      class="p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Delete plugin"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            {/each}

            <!-- Error Plugins -->
            {#each errorPlugins as plugin (plugin.name)}
              <div
                animate:flip={{ duration: 300 }}
                transition:scale={{
                  duration: 200,
                  start: 0.95,
                  opacity: 0,
                  easing: cubicInOut,
                }}
                class="flex flex-col p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800/50"
              >
                <div class="flex items-start gap-3 mb-2">
                  <div
                    class="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                  >
                    <TriangleWarningIcon className="size-5" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3
                      class="font-semibold text-red-900 dark:text-red-200 truncate"
                      title={plugin.name}
                    >
                      {plugin.name}
                    </h3>
                    <div class="text-xs text-red-700 dark:text-red-300 mt-1">
                      Failed to load
                    </div>
                  </div>
                  <button
                    on:click={() => (pluginToDelete = plugin)}
                    class="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
                <div
                  class="bg-white/50 dark:bg-black/20 p-2 rounded text-xs font-mono text-red-800 dark:text-red-200 break-all"
                >
                  {plugin.error || "Unknown error"}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="p-4 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-200 dark:border-neutral-800 flex justify-between items-center"
      >
        <div class="flex gap-3">
          <button
            on:click={() => PluginManager.openPluginsFolder()}
            class="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors font-medium flex items-center gap-2"
          >
            <FolderIcon className="size-5" />
            Open Folder
          </button>
          <button
            on:click={() => PluginManager.reloadPlugins()}
            class="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors font-medium flex items-center gap-2"
          >
            <ArrowPathIcon className="size-4" />
            Reload All
          </button>
        </div>

        <button
          on:click={() => (isOpen = false)}
          class="px-6 py-2 text-sm bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black rounded-lg transition-colors font-semibold shadow-sm"
        >
          Done
        </button>
      </div>

      <!-- Delete Confirmation Dialog -->
      {#if pluginToDelete}
        <div
          transition:fade={{ duration: 150 }}
          class="absolute inset-0 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            transition:scale={{ duration: 200, start: 0.95 }}
            class="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border border-neutral-200 dark:border-neutral-700 p-6 max-w-sm w-full text-center"
          >
            <div
              class="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4"
            >
              <TrashIcon className="size-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 class="text-lg font-bold text-neutral-900 dark:text-white mb-2">
              Delete Plugin?
            </h3>
            <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
              Are you sure you want to remove <span
                class="font-semibold text-neutral-900 dark:text-white"
                >{pluginToDelete.name}</span
              >? This cannot be undone.
            </p>
            <div class="flex gap-3">
              <button
                on:click={() => (pluginToDelete = null)}
                class="flex-1 px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors font-medium text-sm"
              >
                Cancel
              </button>
              <button
                on:click={confirmDelete}
                class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors font-medium text-sm shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Custom Scrollbar */
  ::-webkit-scrollbar {
    width: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 10px;
  }
  :global(.dark) ::-webkit-scrollbar-thumb {
    background: #475569;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
  :global(.dark) ::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }
</style>
