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
    TrashIcon,
    TriangleWarningIcon,
    ArrowCircleIcon,
  } from "../icons";
  import { ui } from "../../ui";

  interface Props {
    isOpen?: boolean;
  }

  let { isOpen = $bindable(false) }: Props = $props();

  let searchQuery = $state("");
  let pluginToDelete: PluginInfo | null = $state(null);

  // Derived status for better UI
  let filteredPlugins = $derived(
    $pluginsStore.filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );
  let loadedPlugins = $derived(filteredPlugins.filter((p) => p.loaded));
  let errorPlugins = $derived(filteredPlugins.filter((p) => !p.loaded));

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

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div
    transition:fade={{ duration: 300, easing: cubicInOut }}
    class="{ui.overlay} z-[1005]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="plugin-manager-title"
  >
    <!-- Modal Container -->
    <div
      transition:fly={{ duration: 300, y: 20, easing: cubicInOut }}
      class="{ui.dialog} flex flex-col w-full max-w-4xl max-h-[85vh] overflow-hidden relative"
    >
      <!-- Header -->
      <div
        class="flex flex-col gap-4 p-6 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 z-20"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center w-10 h-10 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
            >
              <PuzzleIcon className="size-6" />
            </div>
            <div>
              <h2
                id="plugin-manager-title"
                class="text-xl font-bold text-neutral-900 dark:text-neutral-100"
              >
                Plugin Manager
              </h2>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                Manage your installed extensions
              </p>
            </div>
          </div>
          <button
            onclick={() => (isOpen = false)}
            aria-label="Close"
            class={ui.iconBtn.neutral}
          >
            <CloseIcon className="size-6" />
          </button>
        </div>

        <div class="relative w-full group">
          <div
            class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
          >
            <SearchIcon
              className="size-5 text-neutral-500 dark:text-neutral-400 group-focus-within:text-emerald-500 transition-colors"
            />
          </div>
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search installed plugins..."
            class="{ui.input} w-full pl-10"
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
              <PuzzleIcon
                className="size-16 text-neutral-300 dark:text-neutral-600"
              />
            </div>
            <h3
              class="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
            >
              No Plugins Installed
            </h3>
            <p
              class="text-neutral-500 dark:text-neutral-400 max-w-sm mt-2 mb-8 leading-relaxed"
            >
              Enhance the visualizer by adding Javascript (.js) or TypeScript
              (.ts) plugins to your plugins folder.
            </p>
            <button
              onclick={() => PluginManager.openPluginsFolder()}
              class={ui.btn.primary}
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
              <SearchIcon
                className="size-8 text-neutral-500 dark:text-neutral-400"
              />
            </div>
            <p class="text-neutral-500 dark:text-neutral-400 text-lg">
              No plugins match "<span
                class="font-semibold text-neutral-900 dark:text-neutral-100"
                >{searchQuery}</span
              >"
            </p>
            <button onclick={() => (searchQuery = "")} class="{ui.link} mt-4">
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
                class="group flex flex-col p-4 bg-white dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md dark:hover:shadow-neutral-900/50 transition-all duration-200"
              >
                <div class="flex items-start justify-between gap-4 mb-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <div
                      class="flex-shrink-0 p-2.5 rounded-md {plugin.enabled
                        ? 'bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 text-green-600 dark:text-green-400'
                        : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}"
                    >
                      <PuzzleIcon className="size-5" />
                    </div>
                    <div class="min-w-0">
                      <h3
                        class="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-base"
                        title={plugin.name}
                      >
                        {plugin.name}
                      </h3>
                      <div class="flex items-center gap-2 mt-0.5">
                        <span
                          class={ui.badge[
                            plugin.enabled ? "success" : "neutral"
                          ]}
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
                      class="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2"
                    >
                      {plugin.description}
                    </p>
                  {/if}

                  <div
                    class="pt-3 flex items-center justify-between border-t border-neutral-200 dark:border-neutral-700"
                  >
                    <label
                      class="relative inline-flex items-center cursor-pointer group/toggle"
                    >
                      <input
                        type="checkbox"
                        checked={plugin.enabled}
                        onchange={(e) =>
                          PluginManager.togglePlugin(
                            plugin.name,
                            e.currentTarget.checked,
                          )}
                        class="sr-only peer"
                      />
                      <div
                        class="w-9 h-5 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-500/20 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-neutral-600 peer-checked:bg-emerald-600"
                      ></div>
                      <span
                        class="ml-2 text-xs font-medium text-neutral-500 group-hover/toggle:text-neutral-700 dark:text-neutral-400 dark:group-hover/toggle:text-neutral-200 transition-colors"
                      >
                        {plugin.enabled ? "On" : "Off"}
                      </span>
                    </label>

                    <button
                      onclick={() => (pluginToDelete = plugin)}
                      class={ui.iconBtnSm.danger}
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
                class="{ui.alert.danger} flex flex-col"
              >
                <div class="flex items-start gap-3 mb-2">
                  <div
                    class="p-2 rounded-md bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
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
                    onclick={() => (pluginToDelete = plugin)}
                    class={ui.iconBtnSm.danger}
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
      <div class="{ui.dialogFooter} justify-between">
        <div class="flex gap-3">
          <button
            onclick={() => PluginManager.openPluginsFolder()}
            class={ui.btn.ghost}
          >
            <FolderIcon className="size-5" />
            Open Folder
          </button>
          <button
            onclick={() => PluginManager.reloadPlugins()}
            class={ui.btn.ghost}
          >
            <ArrowCircleIcon className="size-4" />
            Reload All
          </button>
        </div>

        <button onclick={() => (isOpen = false)} class={ui.btn.primary}>
          Done
        </button>
      </div>

      <!-- Delete Confirmation Dialog -->
      {#if pluginToDelete}
        <div
          transition:fade={{ duration: 150 }}
          class="absolute inset-0 bg-white/60 dark:bg-neutral-900/60 z-50 flex items-center justify-center p-4"
        >
          <div
            transition:scale={{ duration: 200, start: 0.95 }}
            class="{ui.dialog} p-6 max-w-sm w-full text-center"
          >
            <div
              class="mx-auto w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4"
            >
              <TrashIcon className="size-6 text-red-600 dark:text-red-400" />
            </div>
            <h3
              class="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-2"
            >
              Delete Plugin?
            </h3>
            <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
              Are you sure you want to remove <span
                class="font-semibold text-neutral-900 dark:text-neutral-100"
                >{pluginToDelete.name}</span
              >? This cannot be undone.
            </p>
            <div class="flex gap-3">
              <button
                onclick={() => (pluginToDelete = null)}
                class="{ui.btn.outline} flex-1"
              >
                Cancel
              </button>
              <button onclick={confirmDelete} class="{ui.btn.danger} flex-1">
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
