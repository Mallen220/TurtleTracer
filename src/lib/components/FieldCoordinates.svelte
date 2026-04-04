<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { settingsStore } from "../projectStore";
  import { toUser } from "../../utils/coordinates";

  interface Props {
    x: number;
    y: number;
    visible?: boolean;
    isObstructed?: boolean;
  }

  let { x, y, visible = true, isObstructed = false }: Props = $props();

  let positionClass = $derived(
    isObstructed ? "top-2 right-2" : "bottom-2 left-2",
  );

  // Use settings directly
  let system = $derived($settingsStore.coordinateSystem || "Pedro");

  let userPoint = $derived(toUser({ x: x || 0, y: y || 0 }, system));
</script>

{#if visible}
  <div
    class="absolute {positionClass} bg-white/90 dark:bg-neutral-800/90  px-3 py-1.5 rounded-md shadow-sm border border-neutral-200 dark:border-neutral-700 z-50 pointer-events-none select-none transition-opacity duration-200"
    role="status"
    aria-label="Field Coordinates"
  >
    <div
      class="flex flex-row gap-3 text-xs font-mono text-neutral-600 dark:text-neutral-400"
    >
      <span class="flex gap-1">
        <span class="font-bold text-neutral-800 dark:text-neutral-200">X:</span>
        <span>{userPoint.x.toFixed(1)}"</span>
      </span>
      <span class="flex gap-1">
        <span class="font-bold text-neutral-800 dark:text-neutral-200">Y:</span>
        <span>{userPoint.y.toFixed(1)}"</span>
      </span>
    </div>
  </div>
{/if}
