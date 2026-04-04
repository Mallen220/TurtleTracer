<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { settingsStore } from "../../projectStore";
  import ArrowRightIcon from "../icons/ArrowRightIcon.svelte";

  interface Props {
    degrees?: number;
    size?: number;
    className?: string;
  }

  let { degrees = 0, size = 16, className = "" }: Props = $props();

  let fieldRotation = $derived($settingsStore.fieldRotation || 0);

  let rotation = $derived(-(degrees - fieldRotation));
</script>

<div
  class="inline-flex items-center justify-center shrink-0 {className}"
  style="transform: rotate({rotation}deg); width: {size}px; height: {size}px; transition: transform 0.2s ease-out;"
  role="presentation"
  aria-hidden="true"
>
  <!-- Arrow pointing RIGHT (0 degrees) -->
  <!-- Line: (4, 12) -> (20, 12) -->
  <!-- Head: (14, 6) -> (20, 12) -> (14, 18) -->
  <ArrowRightIcon
    className="w-full h-full text-purple-600 dark:text-purple-400"
    strokeWidth={2.5}
  />
</div>
