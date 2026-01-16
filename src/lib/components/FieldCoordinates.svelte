<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  export let x: number;
  export let y: number;
  export let visible: boolean = true;
  export let isObstructed: boolean = false;

  $: positionClass = isObstructed ? "top-2 right-2" : "bottom-2 left-2";
</script>

{#if visible}
  <div
    class="absolute {positionClass} bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-neutral-200 dark:border-neutral-700 z-50 pointer-events-none select-none transition-opacity duration-200"
    role="status"
    aria-label="Field Coordinates"
  >
    <div
      class="flex flex-row gap-3 text-xs font-mono text-neutral-600 dark:text-neutral-400"
    >
      <span class="flex gap-1">
        <span class="font-bold text-neutral-800 dark:text-neutral-200">X:</span>
        <span>{(x || 0).toFixed(1)}"</span>
      </span>
      <span class="flex gap-1">
        <span class="font-bold text-neutral-800 dark:text-neutral-200">Y:</span>
        <span>{(y || 0).toFixed(1)}"</span>
      </span>
    </div>
  </div>
{/if}
