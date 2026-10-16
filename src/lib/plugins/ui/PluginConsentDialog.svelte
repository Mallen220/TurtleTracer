<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Asks before turning on a plugin that wants permissions or npm packages. -->
<script lang="ts">
  import type { PluginManifest } from "../protocol/ipc";
  import { ui } from "../../ui";

  interface Props {
    manifest: PluginManifest;
    /** What each permission it asks for allows, in words. */
    permissions: string[];
    onAllow: () => void;
    onCancel: () => void;
  }

  let { manifest, permissions, onAllow, onCancel }: Props = $props();

  let packages = $derived(Object.entries(manifest.dependencies ?? {}));
</script>

<div
  class="{ui.overlay} z-[110]"
  role="dialog"
  aria-modal="true"
  aria-labelledby="plugin-consent-title"
  tabindex="-1"
  onkeydown={(e) => {
    e.stopPropagation();
    if (e.key === "Escape") onCancel();
  }}
>
  <div class="{ui.dialog} w-full max-w-lg p-6">
    <h2 id="plugin-consent-title" class="{ui.title} mb-1">
      Turn on {manifest.name}?
    </h2>
    <p class="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
      Version {manifest.version}{manifest.author
        ? `, by ${manifest.author}`
        : ""}
    </p>

    <p class="mb-2 text-sm">
      Like every plugin, it can read the open project and add buttons, menus,
      steps and drawings. It runs in a sandbox, so it can't reach your files,
      the internet or the rest of the app. It also asks to:
    </p>

    {#if permissions.length}
      <ul class="mb-4 ml-5 list-disc space-y-1 text-sm">
        {#each permissions as text (text)}
          <li>{text}</li>
        {/each}
      </ul>
    {/if}

    {#if packages.length}
      <div class="{ui.alert.warning} mb-4 text-sm">
        <p class="mb-2 font-medium">
          Download {packages.length === 1
            ? "a package"
            : `${packages.length} packages`}
          from npm, and anything they need:
        </p>
        <ul class="mb-2 ml-5 list-disc font-mono text-xs">
          {#each packages as [name, version] (name)}
            <li>{name} {version}</li>
          {/each}
        </ul>
        <p>
          Packages are code written by other people. They run inside the
          plugin's sandbox, but only allow this if you trust where the plugin
          came from.
        </p>
      </div>
    {/if}

    <div class="flex justify-end gap-3">
      <button onclick={onCancel} class={ui.btn.ghost}>Cancel</button>
      <button onclick={onAllow} class={ui.btn.primary}>Allow and turn on</button
      >
    </div>
  </div>
</div>
