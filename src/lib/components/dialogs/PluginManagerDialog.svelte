<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import { fade, fly, scale } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { PluginManager } from "../../pluginManager";
  import { pluginsStore, type PluginInfo } from "../../pluginsStore";
  import PuzzleIcon from "../icons/PuzzleIcon.svelte";

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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div class="relative w-full group">
          <div
            class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-5 text-neutral-400 group-focus-within:text-purple-500 transition-colors"
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1"
                stroke="currentColor"
                class="size-16 text-neutral-300 dark:text-neutral-600"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                />
              </svg>
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
                  d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                />
              </svg>
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-8 text-neutral-400"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
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
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="size-4"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
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
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                      />
                    </svg>
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
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="size-4"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-4"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
              />
            </svg>
            Open Folder
          </button>
          <button
            on:click={() => PluginManager.reloadPlugins()}
            class="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors font-medium flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-4"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-6 text-red-600 dark:text-red-400"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
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
