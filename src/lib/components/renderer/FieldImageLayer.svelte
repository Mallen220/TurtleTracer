<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { Settings } from "../../../types";

  interface Props {
    settings: Settings;
    fieldW: number;
    fieldH: number;
    x: (v: number) => number;
    y: (v: number) => number;
  }

  let { settings, fieldW, fieldH, x, y }: Props = $props();

  let activeCustomMap = $derived(
    settings.customMaps?.find((m) => m.id === settings.fieldMap),
  );
</script>

{#if activeCustomMap}
  <img
    src={activeCustomMap.imageData}
    alt="Custom Field"
    class="absolute z-10 max-w-none"
    style={`
      left: ${x(activeCustomMap.x)}px;
      top: ${y(activeCustomMap.y)}px;
      width: ${x(activeCustomMap.x + activeCustomMap.width) - x(activeCustomMap.x)}px;
      height: ${y(activeCustomMap.y - activeCustomMap.height) - y(activeCustomMap.y)}px;
    `}
    draggable="false"
  />
{:else}
  <img
    src={settings.fieldMap && !settings.fieldMap.includes("custom")
      ? `/fields/${settings.fieldMap}`
      : "/fields/biobuzz.webp"}
    alt="Field"
    class="absolute rounded-lg z-10 max-w-none"
    style={`top: ${y(fieldH)}px; left: ${x(0)}px; width: ${x(fieldW) - x(0)}px; height: ${y(0) - y(fieldH)}px;`}
    draggable="false"
    onerror={function (e) {
      const target = e.currentTarget || e.target;
      if (target instanceof HTMLImageElement) {
        target.src = "/fields/biobuzz.webp";
      }
    }}
  />
{/if}
