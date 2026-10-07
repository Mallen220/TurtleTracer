<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- A settings row for one number: a labelled input that keeps to a minimum, with a reset to the default. -->
<script lang="ts">
  import { settingsEditor } from "../settingsEditor";
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import type { Settings } from "../../../../types/index";

  type NumberKey = {
    [K in keyof Settings]-?: [Settings[K]] extends [number | undefined]
      ? K
      : never;
  }[keyof Settings];

  interface Props {
    settings: Settings;
    /** Which setting this edits. */
    name: NumberKey;
    label: string;
    description?: string;
    searchQuery: string;
    /** The id of the input, which the label points at. */
    id: string;
    /** The smallest value allowed. */
    min?: number;
    step?: number;
  }

  let {
    settings = $bindable(),
    name,
    label,
    description = "",
    searchQuery,
    id,
    min = 0,
    step = 1,
  }: Props = $props();

  const { set, setNumber, resettable } = settingsEditor(
    () => settings,
    (next) => (settings = next),
  );
</script>

<SettingsItem
  {label}
  {...resettable(name)}
  {description}
  {searchQuery}
  forId={id}
>
  <input
    {id}
    type="number"
    value={settings[name]}
    {min}
    {step}
    oninput={(e) =>
      set(name, (Number.parseFloat(e.currentTarget.value) || 0) as never)}
    onchange={(e) => setNumber(name, e.currentTarget.value, min)}
    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
</SettingsItem>
