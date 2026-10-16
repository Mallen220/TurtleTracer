<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Dialogs that are opened by setting a store flag and need nothing else from the app. -->
<script lang="ts">
  import {
    showSettings,
    showShortcuts,
    showFileManager,
    showPluginManager,
    showTelemetryDialog,
    showTransformDialog,
    showUpdateAvailableDialog,
  } from "../../stores";
  import { settingsStore } from "../projectStore";
  import FileManager from "../FileManager.svelte";
  import UpdateAvailableDialog from "./dialogs/UpdateAvailableDialog.svelte";
  import SettingsDialog from "./dialogs/SettingsDialog.svelte";
  import TelemetryDialog from "./dialogs/TelemetryDialog.svelte";
  import TransformDialog from "./dialogs/TransformDialog.svelte";
  import KeyboardShortcutsDialog from "./dialogs/KeyboardShortcutsDialog.svelte";

  // Few people open the plugin manager, so it loads the first time it opens
  // and then stays mounted (so it can animate closed).
  let pluginManagerOpened = $state(false);
  $effect(() => {
    if ($showPluginManager) pluginManagerOpened = true;
  });
</script>

<UpdateAvailableDialog bind:show={$showUpdateAvailableDialog} />

<SettingsDialog bind:isOpen={$showSettings} bind:settings={$settingsStore} />
<TelemetryDialog bind:isOpen={$showTelemetryDialog} />
<TransformDialog bind:isOpen={$showTransformDialog} />
<KeyboardShortcutsDialog
  bind:isOpen={$showShortcuts}
  bind:settings={$settingsStore}
/>
{#if pluginManagerOpened}
  {#await import("./dialogs/PluginManagerDialog.svelte") then { default: PluginManagerDialog }}
    <PluginManagerDialog bind:isOpen={$showPluginManager} />
  {/await}
{/if}

{#if $showFileManager}
  <FileManager bind:isOpen={$showFileManager} bind:settings={$settingsStore} />
{/if}
