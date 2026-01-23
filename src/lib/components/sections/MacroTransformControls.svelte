<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { slide } from "svelte/transition";
  import type { SequenceMacroItem, Transformation } from "../../../types";

  export let macro: SequenceMacroItem;
  export let onUpdate: () => void;

  let activeTab: "translate" | "rotate" | "flip" = "translate";

  // Form State
  let dx = 0;
  let dy = 0;
  let degrees = 90;
  let pivotType: "origin" | "center" | "custom" = "center";
  let pivotX = 72;
  let pivotY = 72;
  let flipAxis: "horizontal" | "vertical" = "horizontal";

  function addTransform() {
    let t: Transformation;
    if (activeTab === "translate") {
      if (dx === 0 && dy === 0) return;
      t = { type: "translate", dx, dy };
    } else if (activeTab === "rotate") {
      if (degrees === 0) return;
      t = {
        type: "rotate",
        degrees,
        pivot: pivotType === "custom" ? { x: pivotX, y: pivotY } : pivotType,
      };
    } else {
      t = {
        type: "flip",
        axis: flipAxis,
        pivot: pivotType === "custom" ? { x: pivotX, y: pivotY } : pivotType,
      };
    }

    if (!macro.transformations) macro.transformations = [];
    macro.transformations = [...macro.transformations, t];

    // Reset fields
    dx = 0;
    dy = 0;

    onUpdate();
  }

  function removeTransform(index: number) {
    if (!macro.transformations) return;
    macro.transformations = macro.transformations.filter(
      (_: Transformation, i: number) => i !== index,
    );
    onUpdate();
  }

  function moveTransform(index: number, delta: number) {
    if (!macro.transformations) return;
    const newIdx = index + delta;
    if (newIdx < 0 || newIdx >= macro.transformations.length) return;

    const item = macro.transformations[index];
    const newTransforms = [...macro.transformations];
    newTransforms.splice(index, 1);
    newTransforms.splice(newIdx, 0, item);
    macro.transformations = newTransforms;
    onUpdate();
  }

  function formatPivot(t: Transformation) {
    if (!t.pivot || t.pivot === "origin") return "Origin (72,72)";
    if (t.pivot === "center") return "Center";
    return `(${t.pivot.x.toFixed(1)}, ${t.pivot.y.toFixed(1)})`;
  }
</script>

<div
  class="space-y-4 p-3 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg border border-neutral-200 dark:border-neutral-700/50"
>
  <div class="flex items-center justify-between">
    <h4 class="text-xs font-bold text-neutral-500 uppercase tracking-wide">
      Transformations
    </h4>
    {#if macro.transformations && macro.transformations.length > 0}
      <span
        class="text-[10px] bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 px-1.5 py-0.5 rounded-full"
        >{macro.transformations.length}</span
      >
    {/if}
  </div>

  <!-- Add Controls -->
  <div class="space-y-3">
    <!-- Tabs -->
    <div
      class="flex gap-1 p-0.5 bg-neutral-200/50 dark:bg-neutral-800 rounded-md"
    >
      <button
        class="flex-1 py-1 text-xs font-medium rounded transition-all {activeTab ===
        'translate'
          ? 'bg-white dark:bg-neutral-700 shadow-sm text-blue-600 dark:text-blue-400'
          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
        on:click={() => (activeTab = "translate")}
      >
        Translate
      </button>
      <button
        class="flex-1 py-1 text-xs font-medium rounded transition-all {activeTab ===
        'rotate'
          ? 'bg-white dark:bg-neutral-700 shadow-sm text-blue-600 dark:text-blue-400'
          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
        on:click={() => (activeTab = "rotate")}
      >
        Rotate
      </button>
      <button
        class="flex-1 py-1 text-xs font-medium rounded transition-all {activeTab ===
        'flip'
          ? 'bg-white dark:bg-neutral-700 shadow-sm text-blue-600 dark:text-blue-400'
          : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}"
        on:click={() => (activeTab = "flip")}
      >
        Flip
      </button>
    </div>

    <!-- Inputs -->
    <div
      class="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md p-3"
    >
      {#if activeTab === "translate"}
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-medium text-neutral-500">
              <span class="block mb-1">X Delta</span>
              <input
                type="number"
                bind:value={dx}
                class="w-full px-2 py-1 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </label>
          </div>
          <div>
            <label class="block text-[10px] font-medium text-neutral-500">
              <span class="block mb-1">Y Delta</span>
              <input
                type="number"
                bind:value={dy}
                class="w-full px-2 py-1 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </label>
          </div>
        </div>
      {:else if activeTab === "rotate"}
        <div class="space-y-2">
          <div>
            <label class="block text-[10px] font-medium text-neutral-500">
              <span class="block mb-1">Angle (deg)</span>
              <input
                type="number"
                bind:value={degrees}
                class="w-full px-2 py-1 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </label>
          </div>

          <div>
            <div class="block text-[10px] font-medium text-neutral-500 mb-1"
              >Pivot</div
            >
            <div class="flex flex-wrap gap-2">
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  bind:group={pivotType}
                  value="center"
                  class="w-3 h-3 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-xs">Center</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  bind:group={pivotType}
                  value="origin"
                  class="w-3 h-3 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-xs">Origin (72,72)</span>
                <span class="text-xs">Origin (72,72)</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  bind:group={pivotType}
                  value="custom"
                  class="w-3 h-3 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-xs">Custom</span>
              </label>
            </div>
            {#if pivotType === "custom"}
              <div
                class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-700/50"
              >
                <input
                  type="number"
                  placeholder="X"
                  bind:value={pivotX}
                  class="w-full px-2 py-1 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-sm"
                />
                <input
                  type="number"
                  placeholder="Y"
                  bind:value={pivotY}
                  class="w-full px-2 py-1 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-sm"
                />
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="space-y-2">
          <div>
            <div class="block text-[10px] font-medium text-neutral-500 mb-1"
              >Axis</div
            >
            <div class="flex gap-2">
              <label
                class="flex items-center gap-1.5 cursor-pointer bg-neutral-50 dark:bg-neutral-900/50 px-2 py-1 rounded border border-neutral-100 dark:border-neutral-700 flex-1 justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <input
                  type="radio"
                  bind:group={flipAxis}
                  value="horizontal"
                  class="w-3 h-3 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-xs">Horizontal</span>
              </label>
              <label
                class="flex items-center gap-1.5 cursor-pointer bg-neutral-50 dark:bg-neutral-900/50 px-2 py-1 rounded border border-neutral-100 dark:border-neutral-700 flex-1 justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <input
                  type="radio"
                  bind:group={flipAxis}
                  value="vertical"
                  class="w-3 h-3 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-xs">Vertical</span>
              </label>
            </div>
          </div>

          <div>
            <div class="block text-[10px] font-medium text-neutral-500 mb-1"
              >Around</div
            >
            <div class="flex flex-wrap gap-2">
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  bind:group={pivotType}
                  value="center"
                  class="w-3 h-3 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-xs">Center</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  bind:group={pivotType}
                  value="origin"
                  class="w-3 h-3 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-xs">Origin</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  bind:group={pivotType}
                  value="custom"
                  class="w-3 h-3 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-xs">Custom</span>
              </label>
            </div>
            {#if pivotType === "custom"}
              <div
                class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-700/50"
              >
                <input
                  type="number"
                  placeholder="X"
                  bind:value={pivotX}
                  class="w-full px-2 py-1 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-sm"
                />
                <input
                  type="number"
                  placeholder="Y"
                  bind:value={pivotY}
                  class="w-full px-2 py-1 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded text-sm"
                />
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <button
        on:click={addTransform}
        class="w-full mt-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors shadow-sm"
      >
        Add {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
      </button>
    </div>
  </div>

  <!-- Active Transformations -->
  {#if macro.transformations && macro.transformations.length > 0}
    <div class="space-y-1.5 pt-1">
      {#each macro.transformations as t, i}
        <div
          class="flex items-center gap-2 p-2 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-sm text-xs group"
          transition:slide={{ duration: 200 }}
        >
          <div
            class="flex-none p-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          >
            {#if t.type === "translate"}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="size-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
                />
              </svg>
            {:else if t.type === "rotate"}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="size-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            {:else}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="size-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                />
              </svg>
            {/if}
          </div>

          <div class="flex-1 min-w-0">
            <span
              class="font-medium text-neutral-900 dark:text-neutral-100 capitalize"
              >{t.type}</span
            >
            <span class="text-neutral-500">
              {#if t.type === "translate"}
                ({t.dx ?? 0}, {t.dy ?? 0})
              {:else if t.type === "rotate"}
                {t.degrees}° @ {formatPivot(t)}
              {:else}
                {t.axis} @ {formatPivot(t)}
              {/if}
            </span>
          </div>

          <div
            class="flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <button
              on:click={() => moveTransform(i, -1)}
              disabled={i === 0}
              class="p-0.5 text-neutral-400 hover:text-neutral-600 disabled:opacity-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="size-3"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
            <button
              on:click={() => moveTransform(i, 1)}
              disabled={i === (macro.transformations?.length ?? 0) - 1}
              class="p-0.5 text-neutral-400 hover:text-neutral-600 disabled:opacity-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="size-3"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
            <button
              on:click={() => removeTransform(i)}
              class="p-0.5 text-red-400 hover:text-red-600 ml-1"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="size-3"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
