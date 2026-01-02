<!-- src/lib/components/filemanager/PathPreview.svelte -->
<script lang="ts">
  import type { Point, Line } from "../../../types";
  import * as d3 from "d3";

  export let startPoint: Point;
  export let lines: Line[];
  export let width = 100;
  export let height = 100;

  const FIELD_SIZE = 144;

  $: scaleX = d3.scaleLinear().domain([0, FIELD_SIZE]).range([0, width]);
  $: scaleY = d3.scaleLinear().domain([0, FIELD_SIZE]).range([height, 0]);

  function getPathD(start: Point, pathLines: Line[]): string {
    if (!start) return "";
    let d = `M ${scaleX(start.x)} ${scaleY(start.y)}`;

    // Simple straight line approximation for preview performance
    // Ideally we would sample bezier, but for a tiny icon, line segments are fine
    // Or we can use Bezier commands if we convert control points

    for (const line of pathLines) {
      const end = line.endPoint;
      const cp = line.controlPoints;

      if (cp.length === 2) {
        // Cubic Bezier
        d += ` C ${scaleX(cp[0].x)} ${scaleY(cp[0].y)}, ${scaleX(cp[1].x)} ${scaleY(cp[1].y)}, ${scaleX(end.x)} ${scaleY(end.y)}`;
      } else if (cp.length === 1) {
        // Quadratic Bezier
        d += ` Q ${scaleX(cp[0].x)} ${scaleY(cp[0].y)}, ${scaleX(end.x)} ${scaleY(end.y)}`;
      } else {
        // Line
        d += ` L ${scaleX(end.x)} ${scaleY(end.y)}`;
      }
    }
    return d;
  }
</script>

<div class="relative bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 overflow-hidden" style="width: {width}px; height: {height}px; border-radius: 4px;">
  <svg {width} {height} viewBox="0 0 {width} {height}" class="block">
    <!-- Field Background -->
    <rect width={width} height={height} fill="none" />

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
      <circle cx={scaleX(startPoint.x)} cy={scaleY(startPoint.y)} r="3" fill="#10b981" />
    {/if}

    <!-- End Point -->
    {#if lines.length > 0}
      {@const end = lines[lines.length - 1].endPoint}
      <circle cx={scaleX(end.x)} cy={scaleY(end.y)} r="3" fill="#ef4444" />
    {/if}
  </svg>
</div>
