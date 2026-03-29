<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { slide } from "svelte/transition";
  import type { SequenceMacroItem, Transformation } from "../../../types";
  import { ArrowsPointingOutIcon, ArrowPathIcon, ArrowsRightLeftIcon, ChevronUpIcon, ChevronDownIcon, TrashIcon } from "../icons";

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
            <div class="block text-[10px] font-medium text-neutral-500 mb-1">
              Pivot
            </div>
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
            <div class="block text-[10px] font-medium text-neutral-500 mb-1">
              Axis
            </div>
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
            <div class="block text-[10px] font-medium text-neutral-500 mb-1">
              Around
            </div>
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
              <ArrowsPointingOutIcon className="size-3" strokeWidth={2} />
            {:else if t.type === "rotate"}
              <ArrowPathIcon className="size-3" strokeWidth={2} />
            {:else}
              <ArrowsRightLeftIcon className="size-3" strokeWidth={2} />
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
              aria-label="Move transform up"
              class="p-0.5 text-neutral-400 hover:text-neutral-600 disabled:opacity-0"
            >
              <ChevronUpIcon className="size-3" />
            </button>
            <button
              on:click={() => moveTransform(i, 1)}
              disabled={i === (macro.transformations?.length ?? 0) - 1}
              aria-label="Move transform down"
              class="p-0.5 text-neutral-400 hover:text-neutral-600 disabled:opacity-0"
            >
              <ChevronDownIcon className="size-3" />
            </button>
            <button
              on:click={() => removeTransform(i)}
              aria-label="Remove transform"
              class="p-0.5 text-red-400 hover:text-red-600 ml-1"
            >
              <TrashIcon className="size-3" />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
