<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { BasePoint, Settings } from "../../types/index";
  import { formatDisplayCoordinate } from "../../utils/coordinates";

  interface Props {
    robotXY: BasePoint;
    robotHeading: number;
    robotT?: number | null;
    settings: Settings;
  }

  let { robotXY, robotHeading, robotT = null, settings }: Props = $props();
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
      <div class="w-12">
        {robotHeading.toFixed(0) === "-0" ? "0" : -robotHeading.toFixed(0)}&deg;
      </div>
      <div class="font-extralight">T:</div>
      <div class="w-12 tabular-nums" title="How far along the current path">
        {robotT === null ? "-" : robotT.toFixed(3)}
      </div>
    </div>
  </div>
</div>
