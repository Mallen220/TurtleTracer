<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { ui } from "../../ui";
  import { selectOnMount } from "./fileBrowser.svelte";

  interface Props {
    value: string;
    class?: string;
    onsave?: (name: string) => void;
    oncancel?: () => void;
  }

  let {
    value = $bindable(),
    class: className = "",
    onsave,
    oncancel,
  }: Props = $props();
</script>

<input
  type="text"
  bind:value
  use:selectOnMount
  onclick={(e) => e.stopPropagation()}
  class="{ui.inputXs} w-full {className}"
  onkeydown={(e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") onsave?.(value);
    if (e.key === "Escape") oncancel?.();
  }}
  onblur={() => oncancel?.()}
/>
