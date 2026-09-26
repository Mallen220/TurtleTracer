<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { Point, Line, BasePoint } from "../../../types";
  import * as d3 from "d3";
  import { getCurvePoint } from "../../../utils/math";

  interface Props {
    startPoint: Point;
    lines: Line[];
    width?: number;
    height?: number;
    fieldImage?: string | null;
  }

  let {
    startPoint,
    lines,
    width = 100,
    height = 100,
    fieldImage = null,
  }: Props = $props();

  const FIELD_SIZE = 144;

  // Use a uniform scale based on the minimum dimension so the field preview
  // keeps its aspect and is not stretched. Center the scaled field inside the
  // available width/height.
  let iconSize = $derived(Math.min(width, height));
  let offsetX = $derived(Math.max(0, Math.round((width - iconSize) / 2)));
  let offsetY = $derived(Math.max(0, Math.round((height - iconSize) / 2)));

  let _scale = $derived(
    d3.scaleLinear().domain([0, FIELD_SIZE]).range([0, iconSize]),
  );
  let scaleX = $derived((v: number) => _scale(v) + offsetX);
  let scaleY = $derived((v: number) => offsetY + (iconSize - _scale(v)));

  const isValidPoint = (p: unknown): p is BasePoint =>
    !!p &&
    typeof (p as BasePoint).x === "number" &&
    typeof (p as BasePoint).y === "number";

  // Files come from disk, so skip anything malformed rather than crash.
  function getPathD(start: Point, pathLines: Line[]): string {
    if (!start) return "";

    let d = `M ${scaleX(start.x)} ${scaleY(start.y)}`;
    let current: BasePoint = start;

    for (const line of pathLines ?? []) {
      if (!isValidPoint(line?.endPoint)) continue;
      const end = line.endPoint;
      const cps = (line.controlPoints ?? []).filter(isValidPoint);

      if (cps.length === 0) {
        d += ` L ${scaleX(end.x)} ${scaleY(end.y)}`;
      } else {
        // Approximate the curve with short straight segments, using more of
        // them for higher-degree curves.
        const curve = [current, ...cps, end];
        const degree = curve.length - 1;
        const samples = Math.min(
          48,
          Math.max(10, Math.ceil((10 * degree) / 1.5)),
        );
        for (let s = 1; s <= samples; s++) {
          const pt = getCurvePoint(s / samples, curve);
          d += ` L ${scaleX(pt.x)} ${scaleY(pt.y)}`;
        }
      }
      current = end;
    }

    return d;
  }

  let endPoint = $derived(lines.at(-1)?.endPoint);
</script>

<div
  class="relative bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 overflow-hidden"
  style="width: {width}px; height: {height}px; border-radius: 4px;"
>
  <svg {width} {height} viewBox="0 0 {width} {height}" class="block">
    <!-- Field Background -->
    {#if fieldImage}
      <!-- Fit the field image into the centered square without stretching -->
      <image
        href={fieldImage}
        x={offsetX}
        y={offsetY}
        width={iconSize}
        height={iconSize}
        preserveAspectRatio="xMidYMid meet"
      />
    {/if}
    <rect
      x={offsetX}
      y={offsetY}
      width={iconSize}
      height={iconSize}
      fill="none"
      stroke={fieldImage ? "none" : "#ccc"}
    />

    <!-- Path -->
    <path
      d={getPathD(startPoint, lines)}
      fill="none"
      stroke="#3b82f6"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <!-- Start Point -->
    {#if startPoint}
      <circle
        cx={scaleX(startPoint.x)}
        cy={scaleY(startPoint.y)}
        r="3"
        fill="#10b981"
      />
    {/if}

    <!-- End Point -->
    {#if endPoint}
      <circle
        cx={scaleX(endPoint.x)}
        cy={scaleY(endPoint.y)}
        r="3"
        fill="#ef4444"
      />
    {/if}
  </svg>
</div>
