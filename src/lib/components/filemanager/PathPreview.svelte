<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/filemanager/PathPreview.svelte -->
<script lang="ts">
  import type { Point, Line } from "../../../types";
  import * as d3 from "d3";

  export let startPoint: Point;
  export let lines: Line[];
  export let width = 100;
  export let height = 100;
  export let fieldImage: string | null = null;

  const FIELD_SIZE = 144;

  // Use a uniform scale based on the minimum dimension so the field preview
  // keeps its aspect and is not stretched. Center the scaled field inside the
  // available width/height.
  $: iconSize = Math.min(width, height);
  $: offsetX = Math.max(0, Math.round((width - iconSize) / 2));
  $: offsetY = Math.max(0, Math.round((height - iconSize) / 2));

  $: _scale = d3.scaleLinear().domain([0, FIELD_SIZE]).range([0, iconSize]);
  // scaleX and scaleY are functions so we can add the offsets and invert Y.
  $: scaleX = (v: number) => _scale(v) + offsetX;
  $: scaleY = (v: number) => offsetY + (iconSize - _scale(v));

  function isValidPoint(p: any): p is Point {
    return p && typeof p.x === "number" && typeof p.y === "number";
  }

  // Compute a point on a Bezier curve of arbitrary degree using De Casteljau's algorithm
  function deCasteljau(controlPoints: Point[], t: number): Point {
    // Work on a shallow copy to avoid mutating inputs
    let pts: any[] = controlPoints.map((p) => ({ x: p.x, y: p.y }));
    const n = pts.length;
    for (let r = 1; r < n; r++) {
      for (let i = 0; i < n - r; i++) {
        pts[i] = {
          x: pts[i].x * (1 - t) + pts[i + 1].x * t,
          y: pts[i].y * (1 - t) + pts[i + 1].y * t,
        };
      }
    }
    return pts[0] as Point;
  }

  function getPathD(start: Point, pathLines: Line[]): string {
    if (!start) return "";

    let d = `M ${scaleX(start.x)} ${scaleY(start.y)}`;
    let current: any = { x: start.x, y: start.y };

    for (const line of pathLines || []) {
      if (!line || !line.endPoint || !isValidPoint(line.endPoint)) continue;
      const end = line.endPoint;
      const cpRaw = Array.isArray(line.controlPoints) ? line.controlPoints : [];
      const cps = cpRaw.filter(isValidPoint);

      // If there are no control points, just draw a straight line
      if (cps.length === 0) {
        d += ` L ${scaleX(end.x)} ${scaleY(end.y)}`;
        current = { x: end.x, y: end.y };
        continue;
      }

      // Build control array for De Casteljau: [current, ...cps, end]
      const bezierControls: Point[] = [current as Point, ...cps, end];

      // Choose number of samples based on degree and icon size (more points for higher degree)
      const degree = bezierControls.length - 1;
      const baseSamples = 10; // higher default for smoother curves
      const samples = Math.min(
        48,
        Math.max(baseSamples, Math.ceil(baseSamples * (degree / 1.5))),
      );

      // Debug log for high-degree curves
      const PREVIEW_DEBUG = true;
      if (PREVIEW_DEBUG && cps.length > 2) {
        console.debug(
          `[preview] Sampling degree ${degree} curve (control points: ${cps.length}) with ${samples} samples`,
        );
      }

      // Sample the curve and emit small line segments for the preview
      for (let s = 1; s <= samples; s++) {
        const t = s / samples;
        const pt = deCasteljau(bezierControls, t);
        d += ` L ${scaleX(pt.x)} ${scaleY(pt.y)}`;
      }

      current = { x: end.x, y: end.y };
    }

    return d;
  }
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
    {#if lines.length > 0}
      {@const end = lines[lines.length - 1].endPoint}
      <circle cx={scaleX(end.x)} cy={scaleY(end.y)} r="3" fill="#ef4444" />
    {/if}
  </svg>
</div>
