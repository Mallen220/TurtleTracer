<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { slide } from "svelte/transition";
  import type { SequenceMacroItem, Transformation } from "../../../types";
  import {
    ArrowsPointingOutIcon,
    ArrowCircleIcon,
    SwitchIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    TrashIcon,
  } from "../icons";
  import { ui } from "../../ui";

  interface Props {
    macro: SequenceMacroItem;
    onUpdate: () => void;
  }

  let { macro = $bindable(), onUpdate }: Props = $props();

  let activeTab: "translate" | "rotate" | "flip" = $state("translate");

  // Form State
  let dx = $state(0);
  let dy = $state(0);
  let degrees = $state(90);
  let pivotType: "origin" | "center" | "custom" = $state("center");
  let pivotX = $state(72);
  let pivotY = $state(72);
  let flipAxis: "horizontal" | "vertical" = $state("horizontal");

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

<div class="{ui.well} space-y-4 p-3">
  <div class="flex items-center justify-between">
    <h4 class={ui.heading}>Transformations</h4>
    {#if macro.transformations && macro.transformations.length > 0}
      <span class={ui.badge.neutral}>{macro.transformations.length}</span>
    {/if}
  </div>

  <!-- Add Controls -->
  <div class="space-y-3">
    <!-- Tabs -->
    <div class={ui.tabList}>
      <button
        class="{ui.tab(activeTab === 'translate')} flex-1"
        onclick={() => (activeTab = "translate")}
      >
        Translate
      </button>
      <button
        class="{ui.tab(activeTab === 'rotate')} flex-1"
        onclick={() => (activeTab = "rotate")}
      >
        Rotate
      </button>
      <button
        class="{ui.tab(activeTab === 'flip')} flex-1"
        onclick={() => (activeTab = "flip")}
      >
        Flip
      </button>
    </div>

    <!-- Inputs -->
    <div class="{ui.card} p-3">
      {#if activeTab === "translate"}
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-medium text-neutral-500">
              <span class="block mb-1">X Delta</span>
              <input
                type="number"
                bind:value={dx}
                class="{ui.inputXs} w-full"
              />
            </label>
          </div>
          <div>
            <label class="block text-[10px] font-medium text-neutral-500">
              <span class="block mb-1">Y Delta</span>
              <input
                type="number"
                bind:value={dy}
                class="{ui.inputXs} w-full"
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
                class="{ui.inputXs} w-full"
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
                  class={ui.checkbox}
                />
                <span class="text-xs">Center</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  bind:group={pivotType}
                  value="origin"
                  class={ui.checkbox}
                />
                <span class="text-xs">Origin (72,72)</span>
                <span class="text-xs">Origin (72,72)</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  bind:group={pivotType}
                  value="custom"
                  class={ui.checkbox}
                />
                <span class="text-xs">Custom</span>
              </label>
            </div>
            {#if pivotType === "custom"}
              <div
                class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-700"
              >
                <input
                  type="number"
                  placeholder="X"
                  bind:value={pivotX}
                  class="{ui.inputXs} w-full"
                />
                <input
                  type="number"
                  placeholder="Y"
                  bind:value={pivotY}
                  class="{ui.inputXs} w-full"
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
              <label class="{ui.btnSm.secondary} cursor-pointer flex-1">
                <input
                  type="radio"
                  bind:group={flipAxis}
                  value="horizontal"
                  class={ui.checkbox}
                />
                <span class="text-xs">Horizontal</span>
              </label>
              <label class="{ui.btnSm.secondary} cursor-pointer flex-1">
                <input
                  type="radio"
                  bind:group={flipAxis}
                  value="vertical"
                  class={ui.checkbox}
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
                  class={ui.checkbox}
                />
                <span class="text-xs">Center</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  bind:group={pivotType}
                  value="origin"
                  class={ui.checkbox}
                />
                <span class="text-xs">Origin</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  bind:group={pivotType}
                  value="custom"
                  class={ui.checkbox}
                />
                <span class="text-xs">Custom</span>
              </label>
            </div>
            {#if pivotType === "custom"}
              <div
                class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-neutral-200 dark:border-neutral-700"
              >
                <input
                  type="number"
                  placeholder="X"
                  bind:value={pivotX}
                  class="{ui.inputXs} w-full"
                />
                <input
                  type="number"
                  placeholder="Y"
                  bind:value={pivotY}
                  class="{ui.inputXs} w-full"
                />
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <button onclick={addTransform} class="{ui.btnSm.primary} w-full mt-3">
        Add {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
      </button>
    </div>
  </div>

  <!-- Active Transformations -->
  {#if macro.transformations && macro.transformations.length > 0}
    <div class="space-y-1.5 pt-1">
      {#each macro.transformations as t, i}
        <div
          class="{ui.card} flex items-center gap-2 p-2 text-xs group"
          transition:slide={{ duration: 200 }}
        >
          <div
            class="flex-none p-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          >
            {#if t.type === "translate"}
              <ArrowsPointingOutIcon className="size-3" strokeWidth={2} />
            {:else if t.type === "rotate"}
              <ArrowCircleIcon className="size-3" strokeWidth={2} />
            {:else}
              <SwitchIcon className="size-3" strokeWidth={2} />
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
              onclick={() => moveTransform(i, -1)}
              disabled={i === 0}
              aria-label="Move transform up"
              class="p-0.5 text-neutral-400 hover:text-neutral-600 disabled:opacity-0"
            >
              <ChevronUpIcon className="size-3" />
            </button>
            <button
              onclick={() => moveTransform(i, 1)}
              disabled={i === (macro.transformations?.length ?? 0) - 1}
              aria-label="Move transform down"
              class="p-0.5 text-neutral-400 hover:text-neutral-600 disabled:opacity-0"
            >
              <ChevronDownIcon className="size-3" />
            </button>
            <button
              onclick={() => removeTransform(i)}
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
