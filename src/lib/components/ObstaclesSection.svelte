<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { createTriangle } from "../../utils";
  import { snapToGrid, showGrid, gridSize } from "../../stores";
  import TrashIcon from "./icons/TrashIcon.svelte";
  import SectionHeader from "./common/SectionHeader.svelte";
  import type { Shape } from "../../types";

  export let shapes: Shape[];
  export let collapsedObstacles: boolean[];
  export let collapsed: boolean = false;

  $: snapToGridTitle =
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping";

  function toggleObstacle(index: number) {
    collapsedObstacles[index] = !collapsedObstacles[index];
    collapsedObstacles = [...collapsedObstacles]; // Force reactivity
  }

  function addObstacle() {
    shapes = [...shapes, createTriangle(shapes.length)];
    // Add a new collapsed state for the new obstacle (default to collapsed)
    collapsedObstacles = [...collapsedObstacles, true];
    // Expand the section if it was collapsed
    if (collapsed) collapsed = false;
  }
</script>

<div
  class="flex flex-col w-full border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 overflow-hidden"
>
  <SectionHeader
    title="Obstacles"
    bind:collapsed
    count={shapes.length}
    onAdd={addObstacle}
  />

  {#if !collapsed}
    <div class="p-2 flex flex-col gap-2">
      {#if shapes.length === 0}
        <div class="text-xs text-neutral-500 italic p-2 text-center">
          No obstacles defined. Click + to add one.
        </div>
      {:else}
        {#each shapes as shape, shapeIdx}
          <div
            class="flex flex-col w-full justify-start items-start gap-1 p-2 border rounded-md border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900/30"
          >
            <div class="flex flex-row w-full justify-between items-center">
              <div class="flex flex-row items-center gap-2">
                <button
                  on:click={() => toggleObstacle(shapeIdx)}
                  class="flex items-center gap-2 font-medium text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors"
                  title="{collapsedObstacles[shapeIdx]
                    ? 'Expand'
                    : 'Collapse'} obstacle"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width={2}
                    stroke="currentColor"
                    class="size-4 transition-transform {collapsedObstacles[
                      shapeIdx
                    ]
                      ? 'rotate-0'
                      : 'rotate-90'}"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="m8.25 4.5 7.5 7.5-7.5 7.5"
                    />
                  </svg>
                  Obstacle {shapeIdx + 1}
                </button>

                <input
                  bind:value={shape.name}
                  placeholder="Obstacle {shapeIdx + 1}"
                  class="pl-1.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm font-medium h-7"
                />
                <div
                  class="relative size-6 rounded-full overflow-hidden shadow-sm border border-neutral-300 dark:border-neutral-600 shrink-0"
                  style="background-color: {shape.color}"
                >
                  <input
                    type="color"
                    bind:value={shape.color}
                    class="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    title="Change Obstacle Color"
                  />
                </div>
              </div>

              <div class="flex flex-row gap-1">
                <button
                  title="Remove Shape"
                  on:click={() => {
                    shapes.splice(shapeIdx, 1);
                    shapes = shapes;
                    // Also remove the collapsed state for this obstacle
                    collapsedObstacles.splice(shapeIdx, 1);
                    collapsedObstacles = [...collapsedObstacles];
                  }}
                  class="text-neutral-400 hover:text-red-500 transition-colors p-1"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            </div>

            {#if !collapsedObstacles[shapeIdx]}
              <div
                class="flex flex-col gap-2 w-full mt-2 pl-4 pr-1 border-l-2 border-neutral-200 dark:border-neutral-700"
              >
                <div class="flex flex-col gap-2">
                  {#each shape.vertices as vertex, vertexIdx}
                    <div
                      class="flex flex-row justify-start items-center gap-2 group"
                    >
                      <div class="font-mono text-xs text-neutral-500 w-4">
                        {vertexIdx + 1}
                      </div>
                      <div class="flex items-center gap-1">
                        <span
                          class="font-extralight text-xs text-neutral-500 dark:text-neutral-400"
                          >X</span
                        >
                        <input
                          bind:value={vertex.x}
                          type="number"
                          min="0"
                          max="144"
                          step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                          title={snapToGridTitle}
                          class="pl-1.5 py-0.5 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-purple-500 w-20 text-sm font-mono"
                        />
                      </div>
                      <div class="flex items-center gap-1">
                        <span
                          class="font-extralight text-xs text-neutral-500 dark:text-neutral-400"
                          >Y</span
                        >
                        <input
                          bind:value={vertex.y}
                          type="number"
                          min="0"
                          max="144"
                          step={$snapToGrid && $showGrid ? $gridSize : 0.1}
                          class="pl-1.5 py-0.5 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-purple-500 w-20 text-sm font-mono"
                          title={snapToGridTitle}
                        />
                      </div>
                      {#if $snapToGrid && $showGrid}
                        <span
                          class="text-xs text-green-500"
                          title="Snapping enabled">✓</span
                        >
                      {/if}
                      <div class="flex items-center gap-1 ml-auto">
                        <button
                          title="Add Vertex After"
                          class="text-neutral-400 hover:text-purple-500 transition-colors p-1"
                          on:click={() => {
                            // Duplicate current vertex for easier editing
                            const newVertex = { ...vertex };
                            shape.vertices.splice(vertexIdx + 1, 0, newVertex);
                            shape.vertices = shape.vertices;
                          }}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width={2}
                            stroke="currentColor"
                            class="size-4"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M12 4.5v15m7.5-7.5h-15"
                            />
                          </svg>
                        </button>
                        {#if shape.vertices.length > 3}
                          <button
                            title="Remove Vertex"
                            class="text-neutral-400 hover:text-red-500 transition-colors p-1"
                            on:click={() => {
                              shape.vertices.splice(vertexIdx, 1);
                              shape.vertices = shape.vertices;
                            }}
                          >
                            <TrashIcon className="size-4" strokeWidth={2} />
                          </button>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
