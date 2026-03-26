<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { BasePoint, Settings } from "../../types/index";
  import { getShortcutFromSettings } from "../../utils";
  import { formatDisplayCoordinate } from "../../utils/coordinates";

  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let settings: Settings;
  export let onToggleOptimization: (() => void) | null = null;
  export let onValidate: (() => void) | null = null;
</script>

<div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
  <div class="font-semibold">Current Robot Position</div>
  <div class="flex flex-row justify-between items-center w-full">
    <div class="flex flex-row justify-start items-center gap-2">
      <div class="font-extralight">X:</div>
      <div class="w-16">{formatDisplayCoordinate(robotXY.x, settings)}</div>
      <div class="font-extralight">Y:</div>
      <div class="w-16">{formatDisplayCoordinate(robotXY.y, settings)}</div>
      <div class="font-extralight">Heading:</div>
      <div>
        {robotHeading.toFixed(0) === "-0" ? "0" : -robotHeading.toFixed(0)}&deg;
      </div>
    </div>
  </div>
</div>
