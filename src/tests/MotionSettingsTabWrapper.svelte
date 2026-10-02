<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Holds the settings the Motion tab edits, so tests can read them back. -->
<script lang="ts">
  import { untrack } from "svelte";
  import MotionSettingsTab from "../lib/components/settings/tabs/MotionSettingsTab.svelte";
  import { DEFAULT_SETTINGS } from "../config/defaults";
  import type { Settings } from "../types";

  let {
    initial = {},
    searchQuery = "",
  }: { initial?: Partial<Settings>; searchQuery?: string } = $props();

  let settings = $state({ ...DEFAULT_SETTINGS, ...untrack(() => initial) });

  export const getSettings = () => $state.snapshot(settings) as Settings;
</script>

<MotionSettingsTab bind:settings {searchQuery} />
