<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  The plugin manager. The plugin host is loaded the first time this opens
  (or when a plugin starts), so the app doesn't load it for people who never
  use plugins.
-->
<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import { fade, fly, scale } from "svelte/transition";
  import type {
    PluginEntry,
    PluginStatus,
  } from "../../plugins/host/PluginHost";
  import { loadPluginHost, pluginsSupported } from "../../plugins";
  import SchemaForm from "../../plugins/ui/SchemaForm.svelte";
  import { settingsStore } from "../../projectStore";
  import PuzzleIcon from "../icons/PuzzleIcon.svelte";
  import FolderIcon from "../icons/FolderIcon.svelte";
  import {
    CloseIcon,
    SearchIcon,
    TrashIcon,
    TriangleWarningIcon,
    ArrowCircleIcon,
  } from "../icons";
  import { ui, type Tone } from "../../ui";

  interface Props {
    isOpen?: boolean;
  }

  let { isOpen = $bindable(false) }: Props = $props();

  type Host = Awaited<ReturnType<typeof loadPluginHost>>;
  let host = $state<Host | null>(null);
  let entries = $state<PluginEntry[] | null>(null);
  let safeMode = $state(false);
  let loadError = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let searchQuery = $state("");
  let pluginToDelete = $state<PluginEntry | null>(null);
  let expanded = $state<Record<string, boolean>>({});

  $effect(() => {
    if (!isOpen || host || !pluginsSupported()) return;
    loadPluginHost()
      .then(async (loaded) => {
        host = loaded;
        // Kept for as long as the app runs, like the host.
        loaded.entries.subscribe((list) => (entries = list));
        loaded.safeMode.subscribe((on) => (safeMode = on));
        await loaded.refresh();
      })
      .catch((e) => (loadError = String(e?.message ?? e)));
  });

  let filtered = $derived(
    (entries ?? []).filter((p) =>
      `${p.name} ${p.manifest?.description ?? ""}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
    ),
  );

  const STATUS: Record<PluginStatus, { label: string; tone: Tone }> = {
    off: { label: "Off", tone: "neutral" },
    starting: { label: "Starting…", tone: "info" },
    installing: { label: "Installing packages…", tone: "info" },
    running: { label: "On", tone: "success" },
    failed: { label: "Failed", tone: "danger" },
    paused: { label: "Paused", tone: "warning" },
    unresponsive: { label: "Not responding", tone: "warning" },
    "needs-consent": { label: "Needs permission", tone: "warning" },
    invalid: { label: "Can't load", tone: "danger" },
    legacy: { label: "Old format", tone: "warning" },
  };

  /** Runs a host action, showing its error on the plugin if it fails. */
  async function run(id: string, action: () => Promise<unknown>) {
    busy = id;
    try {
      await action();
    } catch (e) {
      host?.onError(id, String((e as Error)?.message ?? e));
    } finally {
      busy = null;
    }
  }

  async function install(kind: "folder" | "zip") {
    if (!host) return;
    busy = "install";
    try {
      const id = await host.install(kind);
      if (id) expanded = { ...expanded, [id]: true };
    } catch (e) {
      loadError = String((e as Error)?.message ?? e);
    } finally {
      busy = null;
    }
  }

  async function confirmDelete() {
    const plugin = pluginToDelete;
    pluginToDelete = null;
    if (plugin && host) await run(plugin.id, () => host!.remove(plugin.id));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) {
      if (pluginToDelete) pluginToDelete = null;
      else isOpen = false;
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
                Plugins run in a sandbox and can only do what you allow.
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

        {#if safeMode}
          <p class="{ui.alert.warning} text-sm">
            Turtle Tracer was started in safe mode, so no plugins are running.
            Restart it normally to use them.
          </p>
        {/if}

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
            aria-label="Search installed plugins"
            class="{ui.input} w-full pl-10"
          />
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 overflow-y-auto p-6">
        {#if !pluginsSupported()}
          <p class="{ui.alert.info} text-sm">
            Plugins are available in the desktop app.
          </p>
        {:else if loadError}
          <p class="{ui.alert.danger} text-sm mb-4">{loadError}</p>
        {/if}

        {#if entries && entries.length === 0}
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
              A plugin is a folder with a plugin.json. Install one from a folder
              or a .zip, or put it in your plugins folder.
            </p>
          </div>
        {:else if entries && filtered.length === 0}
          <div
            class="flex flex-col items-center justify-center py-16 text-center"
          >
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
          <div class="flex flex-col gap-3">
            {#each filtered as plugin (plugin.id)}
              {@const status = STATUS[plugin.status]}
              {@const canToggle =
                !!plugin.manifest && plugin.status !== "legacy" && !safeMode}
              <div
                class="flex flex-col gap-3 p-4 bg-white dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex items-start gap-3 min-w-0">
                    <div
                      class="flex-shrink-0 p-2.5 rounded-md {plugin.status ===
                      'running'
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'}"
                    >
                      <PuzzleIcon className="size-5" />
                    </div>
                    <div class="min-w-0">
                      <h3
                        class="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-base"
                        title={plugin.id}
                      >
                        {plugin.name}
                        {#if plugin.manifest}
                          <span
                            class="ml-1 text-xs font-normal text-neutral-500 dark:text-neutral-400"
                            >{plugin.manifest.version}</span
                          >
                        {/if}
                      </h3>
                      <div class="flex flex-wrap items-center gap-2 mt-1">
                        <span class={ui.badge[status.tone]}>{status.label}</span
                        >
                        {#each plugin.permissions as permission (permission)}
                          <span
                            class={ui.badge.neutral}
                            title="Permission it asks for"
                          >
                            {permission}
                          </span>
                        {/each}
                        {#each Object.keys(plugin.dependencies) as name (name)}
                          <span
                            class={ui.badge.info}
                            title="npm package it uses">{name}</span
                          >
                        {/each}
                      </div>
                      {#if plugin.manifest?.description}
                        <p
                          class="text-sm text-neutral-600 dark:text-neutral-300 mt-2"
                        >
                          {plugin.manifest.description}
                        </p>
                      {/if}
                      {#if plugin.manifest?.author}
                        <p
                          class="text-xs text-neutral-500 dark:text-neutral-400 mt-1"
                        >
                          By {plugin.manifest.author}
                        </p>
                      {/if}
                    </div>
                  </div>

                  <div class="flex items-center gap-1 flex-shrink-0">
                    {#if canToggle}
                      <label
                        class="relative inline-flex items-center cursor-pointer mr-2"
                      >
                        <input
                          type="checkbox"
                          checked={plugin.enabled}
                          disabled={busy === plugin.id}
                          onchange={(e) => {
                            const on = e.currentTarget.checked;
                            // Show the real state until the host says otherwise.
                            e.currentTarget.checked = plugin.enabled;
                            run(plugin.id, () =>
                              host!.setEnabled(plugin.id, on),
                            );
                          }}
                          class="sr-only peer"
                          aria-label="Turn {plugin.name} on or off"
                        />
                        <div
                          class="w-9 h-5 bg-neutral-200 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-600 rounded-full peer dark:bg-neutral-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-neutral-600 peer-checked:bg-emerald-600"
                        ></div>
                      </label>
                    {/if}
                    {#if plugin.enabled && plugin.manifest}
                      <button
                        onclick={() =>
                          run(plugin.id, () => host!.restart(plugin.id))}
                        class={ui.iconBtnSm.neutral}
                        title="Restart (after editing its files)"
                        aria-label="Restart {plugin.name}"
                        disabled={busy === plugin.id}
                      >
                        <ArrowCircleIcon className="size-4" />
                      </button>
                    {/if}
                    {#if plugin.status !== "legacy"}
                      <button
                        onclick={() => host?.openFolder(plugin.id)}
                        class={ui.iconBtnSm.neutral}
                        title="Open its folder"
                        aria-label="Open the folder of {plugin.name}"
                      >
                        <FolderIcon className="size-4" />
                      </button>
                    {/if}
                    <button
                      onclick={() => (pluginToDelete = plugin)}
                      class={ui.iconBtnSm.danger}
                      title="Move to the trash"
                      aria-label="Remove {plugin.name}"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                </div>

                {#if plugin.problem}
                  <div
                    class="{ui.alert[
                      plugin.status === 'legacy' ? 'warning' : 'danger'
                    ]} flex items-start gap-2 text-sm"
                  >
                    <TriangleWarningIcon
                      className="size-4 mt-0.5 flex-shrink-0"
                    />
                    <span class="whitespace-pre-wrap break-words"
                      >{plugin.problem}</span
                    >
                  </div>
                {/if}

                {#if plugin.settingsFields.length || plugin.errors.length}
                  <div
                    class="border-t border-neutral-200 dark:border-neutral-700 pt-3"
                  >
                    <button
                      class={ui.link}
                      aria-expanded={expanded[plugin.id] ?? false}
                      onclick={() =>
                        (expanded = {
                          ...expanded,
                          [plugin.id]: !expanded[plugin.id],
                        })}
                    >
                      {expanded[plugin.id] ? "Hide" : "Show"}
                      {plugin.settingsFields.length ? "settings" : ""}
                      {plugin.settingsFields.length && plugin.errors.length
                        ? "and"
                        : ""}
                      {plugin.errors.length
                        ? `${plugin.errors.length} recent errors`
                        : ""}
                    </button>
                    {#if expanded[plugin.id]}
                      <div class="mt-3 flex flex-col gap-4">
                        {#if plugin.settingsFields.length}
                          <SchemaForm
                            fields={plugin.settingsFields}
                            values={plugin.settings}
                            units={$settingsStore.visualizerUnits}
                            idPrefix="plugin-settings-{plugin.id}"
                            onChange={(values) =>
                              run(plugin.id, () =>
                                host!.saveSettings(plugin.id, values),
                              )}
                          />
                        {/if}
                        {#if plugin.errors.length}
                          <ol
                            class="max-h-48 overflow-y-auto rounded-md bg-neutral-100 dark:bg-neutral-900 p-2 font-mono text-xs text-neutral-700 dark:text-neutral-300 space-y-1"
                          >
                            {#each plugin.errors as error, i (i)}
                              <li class="whitespace-pre-wrap break-words">
                                {error}
                              </li>
                            {/each}
                          </ol>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="{ui.dialogFooter} justify-between flex-wrap gap-2">
        <div class="flex flex-wrap gap-2">
          <button
            onclick={() => install("folder")}
            class={ui.btn.secondary}
            disabled={!host || busy === "install"}
          >
            Install from folder…
          </button>
          <button
            onclick={() => install("zip")}
            class={ui.btn.secondary}
            disabled={!host || busy === "install"}
          >
            Install from .zip…
          </button>
          <button
            onclick={() => host?.openFolder()}
            class={ui.btn.ghost}
            disabled={!host}
          >
            <FolderIcon className="size-5" />
            Open Folder
          </button>
          <button
            onclick={() => host?.refresh()}
            class={ui.btn.ghost}
            disabled={!host}
          >
            <ArrowCircleIcon className="size-4" />
            Refresh
          </button>
        </div>

        <button onclick={() => (isOpen = false)} class={ui.btn.primary}
          >Done</button
        >
      </div>

      <!-- Delete Confirmation -->
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
              Remove Plugin?
            </h3>
            <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
              <span class="font-semibold text-neutral-900 dark:text-neutral-100"
                >{pluginToDelete.name}</span
              > will be moved to the trash, and its settings forgotten.
            </p>
            <div class="flex gap-3">
              <button
                onclick={() => (pluginToDelete = null)}
                class="{ui.btn.outline} flex-1"
              >
                Cancel
              </button>
              <button onclick={confirmDelete} class="{ui.btn.danger} flex-1"
                >Remove</button
              >
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
