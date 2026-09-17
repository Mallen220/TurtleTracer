<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { LINE_WIDTH } from "../../../config";
  import {
    formatDrawingSvgPath,
    type DrawingPoint,
  } from "./FieldDrawingHandler";

  interface Props {
    width: number;
    height: number;
    x: (v: number) => number;
    y: (v: number) => number;
    uiLength: (inches: number) => number;
    onionLayerElements: any[];
    facingLineElements: any[];
    isDrawingMode: boolean;
    isDrawing: boolean;
    drawPoints: DrawingPoint[];
  }

  let {
    width,
    height,
    x,
    y,
    uiLength,
    onionLayerElements,
    facingLineElements,
    isDrawingMode,
    isDrawing,
    drawPoints,
  }: Props = $props();
</script>

<svg
  class="absolute inset-0 pointer-events-none"
  style={`z-index: 14; width: ${width}px; height: ${height}px;`}
>
  {#each onionLayerElements as layer}
    <polygon
      points={layer.corners.map((c: any) => `${x(c.x)},${y(c.y)}`).join(" ")}
      fill="none"
      stroke="#818cf8"
      stroke-width={uiLength(0.5)}
      opacity="0.35"
    />
  {/each}
  {#each facingLineElements as fl}
    <line
      x1={fl.x1}
      y1={fl.y1}
      x2={fl.x2}
      y2={fl.y2}
      stroke={fl.color}
      stroke-width={uiLength(0.4)}
      stroke-dasharray={`${uiLength(1.5)} ${uiLength(1.5)}`}
      opacity="0.7"
    />
  {/each}
  {#if isDrawingMode && isDrawing && drawPoints.length > 0}
    <path
      d={formatDrawingSvgPath(drawPoints, x, y)}
      fill="none"
      stroke="#a855f7"
      stroke-width={uiLength(LINE_WIDTH)}
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {/if}
</svg>
