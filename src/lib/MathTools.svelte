<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import {
    showRuler,
    showProtractor,
    showGrid,
    protractorLockToRobot,
    gridSize,
    isPresentationMode,
  } from "../stores";
  import { settingsStore } from "./projectStore";
  import { toUser } from "../utils/coordinates";
  import type * as d3 from "d3";

  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
  export let twoElement: HTMLDivElement;
  export let robotXY: { x: number; y: number } = { x: 0, y: 0 };

  let rulerStart = { x: 20, y: 72 };
  let rulerEnd = { x: 80, y: 72 };
  let rulerDragging: "start" | "end" | null = null;

  let protractorPos = { x: 72, y: 72 };
  let protractorRadiusAngle = 0;
  let protractorDragging: "move" | "rotate" | "resize" | null = null;
  let protractorRotateStart = 0;
  let protractorRadius = 60;
  let protractorResizeAngle = -60;

  const MIN_PROTRACTOR_RADIUS = 30;
  const MAX_PROTRACTOR_RADIUS = 150;

  $: normalizedProtractorAngle = Math.round(
    protractorRadiusAngle < 0
      ? 360 + protractorRadiusAngle
      : protractorRadiusAngle,
  );
  $: resizeHandleRadians = (protractorResizeAngle * Math.PI) / 180;
  $: resizeHandlePosition = {
    x: Math.cos(resizeHandleRadians) * protractorRadius,
    y: -Math.sin(resizeHandleRadians) * protractorRadius,
  };

  function handleMouseDown(event: MouseEvent, type: string) {
    event.stopPropagation();
    if (type === "ruler-start") {
      rulerDragging = "start";
    } else if (type === "ruler-end") {
      rulerDragging = "end";
    } else if (type === "protractor-move") {
      if (!$protractorLockToRobot) {
        protractorDragging = "move";
      }
    } else if (type === "protractor-rotate") {
      protractorDragging = "rotate";
      const rect = twoElement.getBoundingClientRect();
      const centerX = x(actualProtractorPos.x);
      const centerY = y(actualProtractorPos.y);
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      protractorRotateStart =
        Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI) -
        protractorRadiusAngle;
    } else if (type === "protractor-resize") {
      protractorDragging = "resize";
    }
  }

  function handleMouseMove(event: MouseEvent) {
    if (!twoElement) return;

    const rect = twoElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const inchX = x.invert(mouseX);
    const inchY = y.invert(mouseY);

    if (rulerDragging === "start") {
      rulerStart = { x: inchX, y: inchY };
    } else if (rulerDragging === "end") {
      rulerEnd = { x: inchX, y: inchY };
    } else if (protractorDragging === "move") {
      protractorPos = { x: inchX, y: inchY };
    } else if (protractorDragging === "rotate") {
      const centerX = x(actualProtractorPos.x);
      const centerY = y(actualProtractorPos.y);
      const angle =
        Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI);
      protractorRadiusAngle = angle - protractorRotateStart;
    } else if (protractorDragging === "resize") {
      const centerX = x(actualProtractorPos.x);
      const centerY = y(actualProtractorPos.y);
      const dx = mouseX - centerX;
      const dy = mouseY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const clampedRadius = Math.min(
        MAX_PROTRACTOR_RADIUS,
        Math.max(MIN_PROTRACTOR_RADIUS, distance),
      );
      protractorRadius = clampedRadius;
      const angleRadians = Math.atan2(centerY - mouseY, mouseX - centerX);
      protractorResizeAngle = angleRadians * (180 / Math.PI);
    }
  }

  function handleMouseUp() {
    rulerDragging = null;
    protractorDragging = null;
  }

  // Optimization: direct multiplication is faster than Math.pow(x, 2)
  $: rulerLength = Math.sqrt(
    (rulerEnd.x - rulerStart.x) * (rulerEnd.x - rulerStart.x) +
      (rulerEnd.y - rulerStart.y) * (rulerEnd.y - rulerStart.y),
  );

  $: deltaX = Math.abs(rulerEnd.x - rulerStart.x);
  $: deltaY = Math.abs(rulerEnd.y - rulerStart.y);
  $: rulerAngle =
    Math.atan2(rulerEnd.y - rulerStart.y, rulerEnd.x - rulerStart.x) *
    (180 / Math.PI);
  $: displayAngle = ((rulerAngle % 360) + 360) % 360;

  // Smart Label Positioning
  $: startPx = { x: x(rulerStart.x), y: y(rulerStart.y) };
  $: endPx = { x: x(rulerEnd.x), y: y(rulerEnd.y) };

  // Calculate Length Label Position (Perpendicular to hypotenuse, away from corner)
  $: lengthLabelPos = (() => {
    // Corner in pixels (Right angle vertex)
    const cornerPx = { x: endPx.x, y: startPx.y };
    // Midpoint of hypotenuse
    const midPx = {
      x: (startPx.x + endPx.x) / 2,
      y: (startPx.y + endPx.y) / 2,
    };
    // Vector from Corner to Midpoint
    const dx = midPx.x - cornerPx.x;
    const dy = midPx.y - cornerPx.y;
    // Normalize and scale
    const len = Math.sqrt(dx * dx + dy * dy);
    const offset = 15; // Distance from line
    if (len < 0.001) return { x: midPx.x, y: midPx.y - 15 }; // Fallback
    return {
      x: midPx.x + (dx / len) * offset,
      y: midPx.y + (dy / len) * offset,
    };
  })();

  // Delta Label Visibility Thresholds (in pixels)
  const MIN_LABEL_PX = 30;
  $: showDeltaX = Math.abs(endPx.x - startPx.x) > MIN_LABEL_PX;
  $: showDeltaY = Math.abs(endPx.y - startPx.y) > MIN_LABEL_PX;

  // Calculate protractor position - lock to robot if enabled
  $: actualProtractorPos = $protractorLockToRobot
    ? robotXY // robotXY is now in inches
    : protractorPos;

  const FIELD_SIZE = 144;
  let spacing = 12;
  let gridPositions: number[] = [];

  $: spacing = Math.max(1, $gridSize || 12);
  $: gridPositions = (() => {
    const positions: number[] = [];
    for (let pos = 0; pos <= FIELD_SIZE; pos += spacing) {
      positions.push(Number(pos.toFixed(6)));
    }
    if (positions[positions.length - 1] !== FIELD_SIZE) {
      positions.push(FIELD_SIZE);
    }
    return positions;
  })();
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

{#if $showGrid && !$isPresentationMode}
  <svg class="absolute top-0 left-0 w-full h-full pointer-events-none z-20">
    <!-- Vertical grid lines -->
    {#each gridPositions as position, i}
      <line
        x1={x(position)}
        y1={y(0)}
        x2={x(position)}
        y2={y(FIELD_SIZE)}
        stroke={i % 2 === 0 ? "#6b7280" : "#9ca3af"}
        stroke-width={i % 2 === 0 ? "1.5" : "0.5"}
        opacity="0.3"
      />
      <text
        x={x(position)}
        y={y(0) + 15}
        class="fill-gray-600 dark:fill-gray-400 text-xs"
        text-anchor="middle"
      >
        {toUser(
          { x: position, y: 0 },
          $settingsStore.coordinateSystem || "Pedro",
        ).y}"
      </text>
    {/each}

    <!-- Horizontal grid lines -->
    {#each gridPositions as position, i}
      <line
        x1={x(0)}
        y1={y(position)}
        x2={x(FIELD_SIZE)}
        y2={y(position)}
        stroke={i % 2 === 0 ? "#6b7280" : "#9ca3af"}
        stroke-width={i % 2 === 0 ? "1.5" : "0.5"}
        opacity="0.3"
      />
      <text
        x={x(position)}
        y={y(0) - 5}
        class="fill-gray-600 dark:fill-gray-400 text-xs"
        text-anchor="middle"
      >
        {toUser(
          { x: 0, y: position },
          $settingsStore.coordinateSystem || "Pedro",
        ).x}"
      </text>
    {/each}
  </svg>
{/if}

{#if $showRuler && !$isPresentationMode}
  <svg class="absolute top-0 left-0 w-full h-full z-40 pointer-events-none">
    <!-- Ruler components (legs) -->
    <line
      x1={x(rulerStart.x)}
      y1={y(rulerStart.y)}
      x2={x(rulerEnd.x)}
      y2={y(rulerStart.y)}
      stroke="#3b82f6"
      stroke-width="1.5"
      stroke-dasharray="4 2"
      class="pointer-events-none opacity-60"
    />
    <line
      x1={x(rulerEnd.x)}
      y1={y(rulerStart.y)}
      x2={x(rulerEnd.x)}
      y2={y(rulerEnd.y)}
      stroke="#3b82f6"
      stroke-width="1.5"
      stroke-dasharray="4 2"
      class="pointer-events-none opacity-60"
    />

    <!-- Ruler line -->
    <line
      x1={x(rulerStart.x)}
      y1={y(rulerStart.y)}
      x2={x(rulerEnd.x)}
      y2={y(rulerEnd.y)}
      stroke="#3b82f6"
      stroke-width="3"
      class="pointer-events-none"
    />

    <!-- Smart Labels -->
    {#if showDeltaX}
      <text
        x={(startPx.x + endPx.x) / 2}
        y={startPx.y + (endPx.y > startPx.y ? -12 : 18)}
        class="fill-blue-600 dark:fill-blue-400 text-xs pointer-events-none stroke-white dark:stroke-neutral-900 stroke-[3px]"
        style="paint-order: stroke fill;"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        Δx: {deltaX.toFixed(1)}"
      </text>
    {/if}

    {#if showDeltaY}
      <text
        x={endPx.x + (endPx.x > startPx.x ? 12 : -12)}
        y={(startPx.y + endPx.y) / 2}
        class="fill-blue-600 dark:fill-blue-400 text-xs pointer-events-none stroke-white dark:stroke-neutral-900 stroke-[3px]"
        style="paint-order: stroke fill;"
        text-anchor={endPx.x > startPx.x ? "start" : "end"}
        dominant-baseline="middle"
      >
        Δy: {deltaY.toFixed(1)}"
      </text>
    {/if}

    <!-- Angle Label (near start) -->
    <text
      x={startPx.x + Math.cos(rulerAngle * (Math.PI / 180)) * 25}
      y={startPx.y - Math.sin(rulerAngle * (Math.PI / 180)) * 25}
      class="fill-blue-600 dark:fill-blue-400 text-xs font-bold pointer-events-none stroke-white dark:stroke-neutral-900 stroke-[3px]"
      style="paint-order: stroke fill;"
      text-anchor="middle"
      dominant-baseline="middle"
    >
      {displayAngle.toFixed(1)}°
    </text>

    <!-- Start handle -->
    <circle
      cx={startPx.x}
      cy={startPx.y}
      r="8"
      fill="#3b82f6"
      class="cursor-move pointer-events-auto"
      role="button"
      tabindex="0"
      aria-label="Ruler start point"
      on:mousedown={(e) => handleMouseDown(e, "ruler-start")}
    />

    <!-- End handle -->
    <circle
      cx={endPx.x}
      cy={endPx.y}
      r="8"
      fill="#3b82f6"
      class="cursor-move pointer-events-auto"
      role="button"
      tabindex="0"
      aria-label="Ruler end point"
      on:mousedown={(e) => handleMouseDown(e, "ruler-end")}
    />

    <!-- Length label -->
    <text
      x={lengthLabelPos.x}
      y={lengthLabelPos.y}
      class="fill-blue-600 dark:fill-blue-400 font-bold pointer-events-none stroke-white dark:stroke-neutral-900 stroke-[3px]"
      style="paint-order: stroke fill;"
      text-anchor="middle"
      dominant-baseline="middle"
    >
      {rulerLength.toFixed(2)}"
    </text>
  </svg>
{/if}

{#if $showProtractor && !$isPresentationMode}
  <svg class="absolute top-0 left-0 w-full h-full z-40 pointer-events-none">
    <g
      transform="translate({x(actualProtractorPos.x)}, {y(
        actualProtractorPos.y,
      )})"
    >
      <!-- Full circle protractor -->
      <circle
        cx="0"
        cy="0"
        r={protractorRadius}
        fill="rgba(59, 130, 246, 0.15)"
        stroke="#3b82f6"
        stroke-width="2"
        class="pointer-events-auto"
      />

      <!-- Degree marks every 10 degrees -->
      {#each Array(36) as _, i}
        {@const angle = (i * 10 * Math.PI) / 180}
        {@const r1 = protractorRadius - 10}
        {@const r2 = protractorRadius}
        {@const x1 = Math.cos(angle) * r1}
        {@const y1 = -Math.sin(angle) * r1}
        {@const x2 = Math.cos(angle) * r2}
        {@const y2 = -Math.sin(angle) * r2}
        <line
          {x1}
          {y1}
          {x2}
          {y2}
          stroke="#3b82f6"
          stroke-width={i % 3 === 0 ? "2" : "1"}
        />
        {#if i % 3 === 0}
          {@const r3 = protractorRadius + 10}
          <text
            x={Math.cos(angle) * r3}
            y={-Math.sin(angle) * r3 + 4}
            class="fill-blue-600 dark:fill-blue-400 text-xs font-semibold"
            text-anchor="middle"
          >
            {i * 10}°
          </text>
        {/if}
      {/each}

      <!-- Cardinal direction line (0°) - fixed -->
      <line
        x1="0"
        y1="0"
        x2={protractorRadius + 5}
        y2="0"
        stroke="#d1d5db"
        stroke-width="2"
        opacity="0.5"
      />

      <!-- Rotating radius line -->
      <g transform="rotate({protractorRadiusAngle})">
        <line
          x1="0"
          y1="0"
          x2={protractorRadius + 5}
          y2="0"
          stroke="#ef4444"
          stroke-width="3"
        />

        <!-- Rotation handle on edge -->
        <circle
          cx={protractorRadius}
          cy="0"
          r="10"
          fill="#10b981"
          stroke="#059669"
          stroke-width="2"
          class="cursor-grab pointer-events-auto"
          role="button"
          tabindex="0"
          aria-label="Drag to rotate radius line"
          on:mousedown={(e) => handleMouseDown(e, "protractor-rotate")}
        />
        <text
          x={protractorRadius}
          y="4"
          class="fill-white text-xs font-bold pointer-events-none"
          text-anchor="middle">➜</text
        >
      </g>

      <!-- Angle display -->
      <text
        x="0"
        y={-protractorRadius - 15}
        class="fill-red-600 dark:fill-red-400 text-sm font-bold"
        text-anchor="middle"
      >
        {360 - normalizedProtractorAngle}°
      </text>

      <!-- Resize Handle -->
      <g>
        <circle
          cx={resizeHandlePosition.x}
          cy={resizeHandlePosition.y}
          r="10"
          fill="#f97316"
          stroke="#ea580c"
          stroke-width="2"
          class="cursor-nwse-resize pointer-events-auto"
          role="button"
          tabindex="0"
          aria-label="Drag to resize protractor"
          on:mousedown={(e) => handleMouseDown(e, "protractor-resize")}
        />
        <text
          x={resizeHandlePosition.x}
          y={resizeHandlePosition.y + 4}
          class="fill-white text-xs font-bold pointer-events-none"
          text-anchor="middle"
        >
          ↔
        </text>
      </g>

      <!-- Center move handle / lock indicator -->
      <circle
        cx="0"
        cy="0"
        r="8"
        fill={$protractorLockToRobot ? "#fbbf24" : "#3b82f6"}
        stroke={$protractorLockToRobot ? "#f59e0b" : "#1d4ed8"}
        stroke-width="2"
        class={$protractorLockToRobot
          ? "cursor-pointer pointer-events-auto"
          : "cursor-move pointer-events-auto"}
        role="button"
        tabindex="0"
        aria-label={$protractorLockToRobot
          ? "Click to unlock from robot"
          : "Drag to move protractor"}
        on:mousedown={(e) => {
          if ($protractorLockToRobot) {
            e.stopPropagation();
            protractorLockToRobot.set(false);
          } else {
            handleMouseDown(e, "protractor-move");
          }
        }}
      />
      {#if $protractorLockToRobot}
        <text
          x="0"
          y="3"
          class="fill-white text-[10px] font-bold pointer-events-none"
          text-anchor="middle">x</text
        >
      {/if}
    </g>
  </svg>
{/if}
