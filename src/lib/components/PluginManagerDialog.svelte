<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { PluginManager } from "../pluginManager";
  import { pluginsStore, type PluginInfo } from "../pluginsStore";

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
</script>

{#if isOpen}
  <div
    transition:fade={{ duration: 500, easing: cubicInOut }}
    class="bg-black bg-opacity-25 flex flex-col justify-center items-center fixed top-0 left-0 w-full h-full z-[1005]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="plugin-manager-title"
  >
    <div
      transition:fly={{ duration: 500, easing: cubicInOut, y: 20 }}
      class="flex flex-col justify-start items-start p-6 bg-white dark:bg-neutral-900 rounded-lg w-full max-w-2xl max-h-[92vh] shadow-2xl border border-neutral-200 dark:border-neutral-800 relative"
    >
      <!-- Header -->
      <div class="flex flex-col w-full mb-6 gap-4">
        <div class="flex flex-row justify-between items-center w-full">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-6 text-purple-600 dark:text-purple-400"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a2.873 2.873 0 0 0-1.603-.784A1.875 1.875 0 0 0 1.5 12c0 1.036.84 2.25 1.875 2.25a2.873 2.873 0 0 0 1.603-.784c.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 1 .663.64v0c0 .355-.186.676-.401.959a2.873 2.873 0 0 0-.784 1.603c0 1.242.84 2.25 1.875 2.25s1.875-1.008 1.875-2.25a2.873 2.873 0 0 0-.784-1.603c-.215-.283-.401-.604-.401-.959v0a.64.64 0 0 1 .643-.657c1.613.186 3.25.293 4.907.315.068-.32.12-.642.152-.966a.64.64 0 0 1-.663-.658v0c.355 0 .676.186.959.401.29.221.634.349 1.003.349 1.035 0 1.875-1.007 1.875-2.25s-.84-2.25-1.875-2.25a2.873 2.873 0 0 0-1.003.349c-.283.215-.604.401-.959.401v0a.656.656 0 0 1-.658-.663 48.422 48.422 0 0 0-.315-4.907c-.32-.068-.642-.12-.966-.152a.64.64 0 0 1-.658-.663v0c0-.355.186-.676.401-.959a2.873 2.873 0 0 0 .784-1.603c0-1.242-.84-2.25-1.875-2.25S15.75 2.508 15.75 3.75c0 .613.232 1.18.618 1.603.215.283.401.604.401.959v0a.64.64 0 0 1-.643.657c-1.613-.186-3.25-.293-4.907-.315-.068.32-.12.642-.152.966a.64.64 0 0 1-.663.658Z"
                />
              </svg>
            </div>
            <div>
              <h2
                id="plugin-manager-title"
                class="text-xl font-bold text-neutral-900 dark:text-white"
              >
                Plugin Manager
              </h2>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                Extend functionality with custom plugins
              </p>
            </div>
          </div>
          <button
            on:click={() => (isOpen = false)}
            aria-label="Close plugin manager"
            class="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
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

        <!-- Search Bar -->
        <div class="relative w-full">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5 text-neutral-400">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
            </div>
            <input
                type="text"
                bind:value={searchQuery}
                placeholder="Search plugins..."
                class="w-full pl-10 pr-4 py-2 bg-neutral-100 dark:bg-neutral-800 border-none rounded-lg text-neutral-900 dark:text-white placeholder-neutral-500 focus:ring-2 focus:ring-purple-500 focus:outline-none transition-shadow"
            />
        </div>
      </div>

      <!-- Main Content -->
      <div class="w-full flex-1 overflow-y-auto mb-6 pr-1">
        {#if $pluginsStore.length === 0}
          <div
            class="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800/30"
          >
            <div
              class="p-4 bg-white dark:bg-neutral-800 rounded-full shadow-sm mb-4"
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
                  d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                />
              </svg>
            </div>
            <h3 class="text-lg font-medium text-neutral-900 dark:text-white">
              No Plugins Installed
            </h3>
            <p
              class="text-neutral-500 dark:text-neutral-400 max-w-sm mt-2 mb-6"
            >
              Add Javascript (.js) or TypeScript (.ts) plugin files to your
              plugins folder to extend the visualizer's capabilities.
            </p>
            <button
              on:click={() => PluginManager.openPluginsFolder()}
              class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors font-medium shadow-sm hover:shadow"
            >
              Open Plugins Folder
            </button>
          </div>
        {:else if filteredPlugins.length === 0}
             <div
            class="flex flex-col items-center justify-center py-12 text-center"
          >
            <p class="text-neutral-500 dark:text-neutral-400">
                No plugins match "{searchQuery}"
            </p>
          </div>
        {:else}
          <div class="space-y-4">
            <!-- Loaded Plugins -->
            {#if loadedPlugins.length > 0}
              <div>
                <h3
                  class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3 ml-1"
                >
                  Installed Plugins ({loadedPlugins.length})
                </h3>
                <div class="space-y-3">
                  {#each loadedPlugins as plugin (plugin.name)}
                    <div
                      class="flex items-start justify-between p-4 bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm transition-all hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-md"
                    >
                      <div class="flex items-start gap-4 flex-1 min-w-0">
                        <div
                          class="mt-1 p-2 rounded-lg {plugin.enabled
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                            : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-400 dark:text-neutral-500'}"
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
                              d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a2.873 2.873 0 0 0-1.603-.784A1.875 1.875 0 0 0 1.5 12c0 1.036.84 2.25 1.875 2.25a2.873 2.873 0 0 0 1.603-.784c.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 1 .663.64v0c0 .355-.186.676-.401.959a2.873 2.873 0 0 0-.784 1.603c0 1.242.84 2.25 1.875 2.25s1.875-1.008 1.875-2.25a2.873 2.873 0 0 0-.784-1.603c-.215-.283-.401-.604-.401-.959v0a.64.64 0 0 1 .643-.657c1.613.186 3.25.293 4.907.315.068-.32.12-.642.152-.966a.64.64 0 0 1-.663-.658v0c.355 0 .676.186.959.401.29.221.634.349 1.003.349 1.035 0 1.875-1.007 1.875-2.25s-.84-2.25-1.875-2.25a2.873 2.873 0 0 0-1.003.349c-.283.215-.604.401-.959.401v0a.656.656 0 0 1-.658-.663 48.422 48.422 0 0 0-.315-4.907c-.32-.068-.642-.12-.966-.152a.64.64 0 0 1-.658-.663v0c0-.355.186-.676.401-.959a2.873 2.873 0 0 0 .784-1.603c0-1.242-.84-2.25-1.875-2.25S15.75 2.508 15.75 3.75c0 .613.232 1.18.618 1.603.215.283.401.604.401.959v0a.64.64 0 0 1-.643.657c-1.613-.186-3.25-.293-4.907-.315-.068.32-.12.642-.152.966a.64.64 0 0 1-.663.658Z"
                            />
                          </svg>
                        </div>
                        <div class="min-w-0">
                          <div
                            class="font-medium text-neutral-900 dark:text-white truncate"
                            title={plugin.name}
                          >
                            {plugin.name}
                          </div>
                          <div
                            class="text-xs mt-1 {plugin.enabled
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-neutral-500 dark:text-neutral-400'}"
                          >
                            {plugin.enabled ? "Active" : "Disabled"}
                          </div>
                        </div>
                      </div>

                      <div class="flex items-center gap-4 ml-4">
                        <label
                          class="relative inline-flex items-center cursor-pointer"
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
                            class="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-neutral-600 peer-checked:bg-purple-600"
                          ></div>
                        </label>

                        <button
                            on:click={() => pluginToDelete = plugin}
                            class="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            aria-label="Delete plugin"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Failed Plugins -->
            {#if errorPlugins.length > 0}
              <div>
                <h3
                  class="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3 ml-1 mt-6"
                >
                  Failed to Load ({errorPlugins.length})
                </h3>
                <div class="space-y-3">
                  {#each errorPlugins as plugin (plugin.name)}
                    <div
                      class="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800/50"
                    >
                      <div class="flex items-start justify-between">
                        <div class="flex items-start gap-4 flex-1 min-w-0">
                            <div
                            class="mt-1 p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
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
                            <div class="flex-1 min-w-0">
                            <div
                                class="font-medium text-red-900 dark:text-red-200 truncate"
                                title={plugin.name}
                            >
                                {plugin.name}
                            </div>
                            <div
                                class="text-sm mt-1 text-red-700 dark:text-red-300 break-words font-mono bg-red-100 dark:bg-red-900/20 p-2 rounded"
                            >
                                {plugin.error || "Unknown error"}
                            </div>
                            </div>
                        </div>
                        <button
                            on:click={() => pluginToDelete = plugin}
                            class="ml-4 p-2 text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            aria-label="Delete plugin"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="flex justify-between items-center w-full pt-4 border-t border-neutral-200 dark:border-neutral-800"
      >
        <div class="flex gap-3">
          <button
            on:click={() => PluginManager.openPluginsFolder()}
            class="px-4 py-2 text-sm bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-md transition-colors flex items-center gap-2 font-medium"
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
                d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
              />
            </svg>
            Open Folder
          </button>
          <button
            on:click={() => PluginManager.reloadPlugins()}
            class="px-4 py-2 text-sm bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-md transition-colors flex items-center gap-2 font-medium"
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
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            Reload Plugins
          </button>
        </div>

        <button
          on:click={() => (isOpen = false)}
          class="px-5 py-2 text-sm bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black rounded-md transition-colors font-medium shadow-sm"
        >
          Done
        </button>
      </div>

      <!-- Delete Confirmation Dialog -->
      {#if pluginToDelete}
      <div
        transition:fade={{ duration: 200 }}
        class="absolute inset-0 bg-white/95 dark:bg-neutral-900/95 z-10 rounded-lg flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm"
      >
        <div class="bg-red-100 dark:bg-red-900/30 p-3 rounded-full mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-8 text-red-600 dark:text-red-400">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
        </div>
        <h3 class="text-xl font-bold text-neutral-900 dark:text-white mb-2">Delete Plugin?</h3>
        <p class="text-neutral-500 dark:text-neutral-400 mb-6">
            Are you sure you want to delete <span class="font-bold text-neutral-900 dark:text-neutral-300">{pluginToDelete.name}</span>? This action cannot be undone.
        </p>
        <div class="flex gap-3 w-full max-w-xs">
            <button
                on:click={() => pluginToDelete = null}
                class="flex-1 px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors font-medium"
            >
                Cancel
            </button>
            <button
                on:click={confirmDelete}
                class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium shadow-sm"
            >
                Delete
            </button>
        </div>
      </div>
      {/if}

    </div>
  </div>
{/if}

<style>
  /* Custom Scrollbar for the list */
  ::-webkit-scrollbar {
    width: 8px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
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
