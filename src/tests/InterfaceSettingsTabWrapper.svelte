<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Holds the settings the Interface tab edits, so tests can read them back. -->
<script lang="ts">
  import { untrack } from "svelte";
  import InterfaceSettingsTab from "../lib/components/settings/tabs/InterfaceSettingsTab.svelte";
  import { DEFAULT_SETTINGS } from "../config/defaults";
  import type { Settings } from "../types";

  let {
    initial = {},
    searchQuery = "",
  }: { initial?: Partial<Settings>; searchQuery?: string } = $props();

  let settings = $state({ ...DEFAULT_SETTINGS, ...untrack(() => initial) });

  export const getSettings = () => $state.snapshot(settings) as Settings;
</script>

<InterfaceSettingsTab bind:settings {searchQuery} />
