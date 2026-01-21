<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { createTriangle } from "../../utils";
  import { snapToGrid, showGrid, gridSize } from "../../stores";
  import { settingsStore } from "../projectStore";
  import TrashIcon from "./icons/TrashIcon.svelte";
  import SaveIcon from "./icons/SaveIcon.svelte";
  import SectionHeader from "./common/SectionHeader.svelte";
  import EmptyState from "./common/EmptyState.svelte";
  import SaveNameDialog from "./SaveNameDialog.svelte";
  import type { Shape, ObstaclePreset } from "../../types";

  export let shapes: Shape[];
  export let collapsedObstacles: boolean[];
  export let collapsed: boolean = false;

  let selectedPresetId: string = "";
  let showSaveDialog = false;

  $: snapToGridTitle =
    $snapToGrid && $showGrid ? `Snapping to ${$gridSize} grid` : "No snapping";

  function openSaveDialog() {
    if (shapes.length === 0) {
      // Should ideally use a toast, but this is a fallback
      return;
    }
    showSaveDialog = true;
  }

  function handleSavePreset(name: string) {
    const newPreset: ObstaclePreset = {
      id: `preset-${Math.random().toString(36).slice(2)}`,
      name: name,
      shapes: JSON.parse(JSON.stringify(shapes)), // Deep copy
    };

    $settingsStore.obstaclePresets = [
      ...($settingsStore.obstaclePresets || []),
      newPreset,
    ];
    selectedPresetId = newPreset.id;
  }

  function loadPreset() {
    if (!selectedPresetId) return;
    const preset = ($settingsStore.obstaclePresets || []).find(
      (p) => p.id === selectedPresetId,
    );
    if (!preset) return;

    if (shapes.length > 0) {
      // Safe replacement check - ideally use a better dialog but standard confirm is robust
      if (!confirm("This will replace current obstacles. Continue?")) return;
    }

    shapes = JSON.parse(JSON.stringify(preset.shapes)); // Deep copy
    // Reset collapsed states
    collapsedObstacles = new Array(shapes.length).fill(false);
  }

  function deletePreset() {
    if (!selectedPresetId) return;
    if (!confirm("Are you sure you want to delete this preset?")) return;

    $settingsStore.obstaclePresets = (
      $settingsStore.obstaclePresets || []
    ).filter((p) => p.id !== selectedPresetId);
    selectedPresetId = "";
  }

  function toggleObstacle(index: number) {
    collapsedObstacles[index] = !collapsedObstacles[index];
    collapsedObstacles = [...collapsedObstacles]; // Force reactivity
  }

  function addObstacle() {
    shapes = [...shapes, createTriangle(shapes.length)];
    // Add a new collapsed state for the new obstacle (default to expanded for better UX)
    collapsedObstacles = [...collapsedObstacles, false];
    // Expand the section if it was collapsed
    if (collapsed) collapsed = false;
  }

  // React to external additions to shapes (e.g. from keybindings)
  $: if (shapes.length > collapsedObstacles.length) {
    const diff = shapes.length - collapsedObstacles.length;
    // Default new externally added obstacles to expanded (false) so user can see them immediately
    collapsedObstacles = [...collapsedObstacles, ...Array(diff).fill(false)];
    // Force expand section if a new shape is added externally (e.g. shortcut)
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
    <!-- Preset Controls (Compact Toolbar) -->
    <div
      class="p-2 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 flex flex-row gap-2 items-center"
    >
      <div
        class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider shrink-0"
      >
        Presets
      </div>
      <div class="flex-1 min-w-0">
        <select
          bind:value={selectedPresetId}
          class="w-full text-xs h-7 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          <option value="">Select...</option>
          {#each $settingsStore.obstaclePresets || [] as preset}
            <option value={preset.id}>{preset.name}</option>
          {/each}
        </select>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-1 shrink-0">
        <button
          on:click={loadPreset}
          disabled={!selectedPresetId}
          title="Load Selected Preset"
          class="p-1 h-7 w-7 flex items-center justify-center rounded-md text-neutral-500 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <!-- Download/Load Icon -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 9.75l-3 3m0 0 3 3m-3-3H21"
            />
          </svg>
        </button>

        <button
          on:click={openSaveDialog}
          disabled={shapes.length === 0}
          title="Save Current as Preset"
          class="p-1 h-7 w-7 flex items-center justify-center rounded-md text-neutral-500 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <SaveIcon className="size-4" />
        </button>

        <button
          on:click={deletePreset}
          disabled={!selectedPresetId}
          title="Delete Selected Preset"
          class="p-1 h-7 w-7 flex items-center justify-center rounded-md text-neutral-500 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-40 disabled:hover:text-neutral-500 disabled:cursor-not-allowed transition-colors"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
    </div>

    <SaveNameDialog
      bind:show={showSaveDialog}
      title="Save Obstacle Preset"
      prompt="Enter a name for this preset:"
      defaultName="My Preset"
      onSave={handleSavePreset}
      onCancel={() => (showSaveDialog = false)}
    />

    <div class="p-2 flex flex-col gap-2">
      {#if shapes.length === 0}
        <EmptyState
          title="No obstacles"
          description="Click + to add a new obstacle or keep-in zone."
          compact={true}
        >
          <div slot="icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-6 text-neutral-400"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
              />
            </svg>
          </div>
        </EmptyState>
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
                    : 'Collapse'} {shape.type === 'keep-in'
                    ? 'Keep-In'
                    : 'Obstacle'}"
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
                  {shape.type === "keep-in" ? "Keep-In" : "Obstacle"}
                  {shapeIdx + 1}
                </button>

                <input
                  bind:value={shape.name}
                  placeholder="{shape.type === 'keep-in'
                    ? 'Keep-In'
                    : 'Obstacle'} {shapeIdx + 1}"
                  class="pl-1.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm font-medium h-7"
                  disabled={shape.locked ?? false}
                />

                <select
                  bind:value={shape.type}
                  class="h-7 text-xs rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  disabled={shape.locked ?? false}
                >
                  <option value="obstacle">Obstacle</option>
                  <option value="keep-in">Keep-In</option>
                </select>

                <div
                  class="relative size-6 rounded-full overflow-hidden shadow-sm border border-neutral-300 dark:border-neutral-600 shrink-0"
                  style="background-color: {shape.color}"
                >
                  <input
                    type="color"
                    bind:value={shape.color}
                    class="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    title="Change Obstacle Color"
                    disabled={shape.locked ?? false}
                  />
                </div>
              </div>

              <div class="flex flex-row gap-1">
                <button
                  title={shape.visible !== false ? "Hide Shape" : "Show Shape"}
                  on:click={() => {
                    shape.visible = !(shape.visible !== false);
                    shapes = [...shapes];
                  }}
                  class="p-1 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 transition-colors"
                >
                  {#if shape.visible !== false}
                    <!-- Eye Open -->
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="size-4"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                      />
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      />
                    </svg>
                  {:else}
                    <!-- Eye Slash -->
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="size-4"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  {/if}
                </button>
                <button
                  title={shape.locked ? "Unlock Obstacle" : "Lock Obstacle"}
                  aria-label={shape.locked
                    ? "Unlock Obstacle"
                    : "Lock Obstacle"}
                  aria-pressed={shape.locked ?? false}
                  on:click={() => {
                    shape.locked = !(shape.locked ?? false);
                    shapes = [...shapes];
                  }}
                  class="p-1 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 transition-colors"
                >
                  {#if shape.locked}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      class="size-4 text-amber-500"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  {:else}
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
                        d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                      />
                    </svg>
                  {/if}
                </button>
                <button
                  title="Remove Shape"
                  on:click={() => {
                    shapes.splice(shapeIdx, 1);
                    shapes = shapes;
                    // Also remove the collapsed state for this obstacle
                    collapsedObstacles.splice(shapeIdx, 1);
                    collapsedObstacles = [...collapsedObstacles];
                  }}
                  class="text-neutral-400 hover:text-red-500 transition-colors p-1 disabled:opacity-50 disabled:hover:text-neutral-400"
                  disabled={shape.locked ?? false}
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
                          disabled={shape.locked ?? false}
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
                          disabled={shape.locked ?? false}
                        />
                      </div>
                      <!-- {#if $snapToGrid && $showGrid}
                        <span
                          class="text-xs text-green-500"
                          title="Snapping enabled">✓</span
                        >
                      {/if} -->
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
                          disabled={shape.locked ?? false}
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
                            class="text-neutral-400 hover:text-red-500 transition-colors p-1 disabled:opacity-50 disabled:hover:text-neutral-400"
                            on:click={() => {
                              shape.vertices.splice(vertexIdx, 1);
                              shape.vertices = shape.vertices;
                            }}
                            disabled={shape.locked ?? false}
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
