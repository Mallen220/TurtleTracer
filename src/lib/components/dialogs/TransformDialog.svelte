<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import { get } from "svelte/store";
  import {
    startPointStore,
    linesStore,
    shapesStore,
  } from "../../../lib/projectStore";
  import { isUnsaved, notification } from "../../../stores";
  import {
    translatePathData,
    rotatePathData,
    flipPathData,
    reversePathData,
    scalePathData,
  } from "../../../utils/pathTransform";
  import { sequenceStore } from "../../../lib/projectStore";

  export let isOpen = false;

  let activeTab: "translate" | "rotate" | "flip" | "reverse" | "scale" =
    "translate";

  // Translate State
  let translateX = 0;
  let translateY = 0;

  // Pivot Settings (shared for Rotate & Flip)
  let pivotMode: "center" | "origin" | "custom" = "center";
  let customPivotX = 72;
  let customPivotY = 72;

  // Rotate State
  let rotateDegrees = 0;

  // Flip State
  let flipHorizontal = false;
  let flipVertical = false;

  // Scale State
  let scaleXPercent = 100;
  let scaleYPercent = 100;
  let uniformScale = true;

  $: if (uniformScale) {
    scaleYPercent = scaleXPercent;
  }

  $: effectivePivotX =
    pivotMode === "center" ? 72 : pivotMode === "origin" ? 0 : customPivotX;
  $: effectivePivotY =
    pivotMode === "center" ? 72 : pivotMode === "origin" ? 0 : customPivotY;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) {
      isOpen = false;
    }
  }

  function applyTransform() {
    try {
      const data = {
        startPoint: get(startPointStore),
        lines: get(linesStore),
        shapes: get(shapesStore),
        sequence: get(sequenceStore),
      };

      // Use the PathData interface so the optional sequence field is recognised
      let transformedData:
        | import("../../../utils/pathTransform").PathData
        | undefined;

      if (activeTab === "translate") {
        if (translateX === 0 && translateY === 0) return;
        transformedData = translatePathData(data, translateX, translateY);
        notification.set({
          message: `Path translated by (${translateX}", ${translateY}")`,
          type: "success",
          timeout: 2000,
        });
      } else if (activeTab === "rotate") {
        if (rotateDegrees === 0) return;
        transformedData = rotatePathData(
          data,
          rotateDegrees,
          effectivePivotX,
          effectivePivotY,
        );
        notification.set({
          message: `Path rotated by ${rotateDegrees}°`,
          type: "success",
          timeout: 2000,
        });
      } else if (activeTab === "flip") {
        if (!flipHorizontal && !flipVertical) return;
        transformedData = flipPathData(
          data,
          flipHorizontal,
          flipVertical,
          effectivePivotX,
          effectivePivotY,
        );
        notification.set({
          message: `Path flipped`,
          type: "success",
          timeout: 2000,
        });
      } else if (activeTab === "reverse") {
        transformedData = reversePathData(data);
        notification.set({
          message: `Path reversed`,
          type: "success",
          timeout: 2000,
        });
      } else if (activeTab === "scale") {
        if (scaleXPercent === 100 && scaleYPercent === 100) return;
        transformedData = scalePathData(
          data,
          scaleXPercent / 100,
          scaleYPercent / 100,
          effectivePivotX,
          effectivePivotY,
        );
        notification.set({
          message: `Path scaled by ${scaleXPercent}% X, ${scaleYPercent}% Y`,
          type: "success",
          timeout: 2000,
        });
      }

      if (transformedData) {
        startPointStore.set(transformedData.startPoint);
        linesStore.set(transformedData.lines);
        if (transformedData.shapes) {
          shapesStore.set(transformedData.shapes);
        }
        if (transformedData?.sequence) {
          sequenceStore.set(transformedData.sequence);
        }
        isUnsaved.set(true);
      }

      isOpen = false;

      // Reset values
      translateX = 0;
      translateY = 0;
      rotateDegrees = 0;
      flipHorizontal = false;
      flipVertical = false;
      scaleXPercent = 100;
      scaleYPercent = 100;
      uniformScale = true;
    } catch (e: any) {
      notification.set({
        message: `Transformation failed: ${e.message}`,
        type: "error",
        timeout: 5000,
      });
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    transition:fade={{ duration: 200, easing: cubicInOut }}
    class="fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="transform-dialog-title"
  >
    <div
      transition:fly={{ duration: 200, y: 20, easing: cubicInOut }}
      class="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-neutral-200 dark:border-neutral-800"
    >
      <div
        class="flex justify-between items-center p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50"
      >
        <h2
          id="transform-dialog-title"
          class="text-lg font-bold text-neutral-900 dark:text-white"
        >
          Transform Path
        </h2>
        <button
          on:click={() => (isOpen = false)}
          class="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="w-5 h-5 text-neutral-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div
        class="flex border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
      >
        <button
          on:click={() => (activeTab = "translate")}
          class="flex-1 py-3 text-sm font-medium border-b-2 transition-colors {activeTab ===
          'translate'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'}"
        >
          Translate
        </button>
        <button
          on:click={() => (activeTab = "rotate")}
          class="flex-1 py-3 text-sm font-medium border-b-2 transition-colors {activeTab ===
          'rotate'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'}"
        >
          Rotate
        </button>
        <button
          on:click={() => (activeTab = "flip")}
          class="flex-1 py-3 text-sm font-medium border-b-2 transition-colors {activeTab ===
          'flip'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'}"
        >
          Flip
        </button>
        <button
          on:click={() => (activeTab = "reverse")}
          class="flex-1 py-3 text-sm font-medium border-b-2 transition-colors {activeTab ===
          'reverse'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'}"
        >
          Reverse
        </button>
        <button
          on:click={() => (activeTab = "scale")}
          class="flex-1 py-3 text-sm font-medium border-b-2 transition-colors {activeTab ===
          'scale'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'}"
        >
          Scale
        </button>
      </div>

      <div class="p-6 bg-white dark:bg-neutral-900 space-y-6">
        {#if activeTab === "reverse"}
          <div>
            <p class="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Reverse the direction of the entire path and sequence.
            </p>
          </div>
        {:else if activeTab === "translate"}
          <div>
            <p class="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Shift the entire path and all its points by a given offset in
              inches.
            </p>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label
                  for="translate-x"
                  class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  X Offset (inches)
                </label>
                <input
                  id="translate-x"
                  type="number"
                  bind:value={translateX}
                  class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  for="translate-y"
                  class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Y Offset (inches)
                </label>
                <input
                  id="translate-y"
                  type="number"
                  bind:value={translateY}
                  class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        {:else if activeTab === "scale"}
          <div>
            <p class="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Scale the entire path relative to a pivot point.
            </p>

            <div class="mb-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={uniformScale}
                  class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800"
                />
                <span
                  class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                  >Uniform Scale</span
                >
              </label>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label
                  for="scale-x"
                  class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Scale X (%)
                </label>
                <input
                  id="scale-x"
                  type="number"
                  bind:value={scaleXPercent}
                  class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  for="scale-y"
                  class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Scale Y (%)
                </label>
                <input
                  id="scale-y"
                  type="number"
                  bind:value={scaleYPercent}
                  disabled={uniformScale}
                  class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div
              class="mt-4 p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800/50"
            >
              <label
                for="pivot-mode"
                class="block text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2"
              >
                Pivot Point
              </label>
              <div class="flex gap-2 mb-3">
                <label
                  class="flex items-center gap-1.5 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300"
                >
                  <input
                    type="radio"
                    bind:group={pivotMode}
                    value="center"
                    name="pivot-mode-scale"
                    class="text-blue-600 focus:ring-blue-500 border-neutral-300 dark:border-neutral-600"
                  /> Center (72, 72)
                </label>
                <label
                  class="flex items-center gap-1.5 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300 ml-4"
                >
                  <input
                    type="radio"
                    bind:group={pivotMode}
                    value="origin"
                    name="pivot-mode-scale"
                    class="text-blue-600 focus:ring-blue-500 border-neutral-300 dark:border-neutral-600"
                  /> Origin (0, 0)
                </label>
                <label
                  class="flex items-center gap-1.5 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300 ml-4"
                >
                  <input
                    type="radio"
                    bind:group={pivotMode}
                    value="custom"
                    name="pivot-mode-scale"
                    class="text-blue-600 focus:ring-blue-500 border-neutral-300 dark:border-neutral-600"
                  /> Custom
                </label>
              </div>

              {#if pivotMode === "custom"}
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      for="pivot-x-scale"
                      class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                    >
                      Pivot X
                    </label>
                    <input
                      id="pivot-x-scale"
                      type="number"
                      bind:value={customPivotX}
                      class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label
                      for="pivot-y-scale"
                      class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                    >
                      Pivot Y
                    </label>
                    <input
                      id="pivot-y-scale"
                      type="number"
                      bind:value={customPivotY}
                      class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <div>
            <p class="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              {activeTab === "rotate"
                ? "Rotate the entire path around a pivot point."
                : "Flip the entire path across an axis."}
            </p>

            <div class="space-y-4">
              {#if activeTab === "rotate"}
                <div>
                  <label
                    for="rotate-degrees"
                    class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                  >
                    Angle (Degrees, Clockwise)
                  </label>
                  <input
                    id="rotate-degrees"
                    type="number"
                    bind:value={rotateDegrees}
                    class="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              {:else}
                <div class="flex gap-6 pt-2 pb-2">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={flipHorizontal}
                      class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800"
                    />
                    <span
                      class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                      >Flip Horizontal (X)</span
                    >
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={flipVertical}
                      class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800"
                    />
                    <span
                      class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                      >Flip Vertical (Y)</span
                    >
                  </label>
                </div>
              {/if}

              <div
                class="mt-4 p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800/50"
              >
                <label
                  for="pivot-mode"
                  class="block text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2"
                >
                  Pivot Point
                </label>
                <div class="flex gap-2 mb-3">
                  <label
                    class="flex items-center gap-1.5 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    <input
                      type="radio"
                      bind:group={pivotMode}
                      value="center"
                      name="pivot-mode"
                      class="text-blue-600 focus:ring-blue-500 border-neutral-300 dark:border-neutral-600"
                    /> Center (72, 72)
                  </label>
                  <label
                    class="flex items-center gap-1.5 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300 ml-4"
                  >
                    <input
                      type="radio"
                      bind:group={pivotMode}
                      value="origin"
                      name="pivot-mode"
                      class="text-blue-600 focus:ring-blue-500 border-neutral-300 dark:border-neutral-600"
                    /> Origin (0, 0)
                  </label>
                  <label
                    class="flex items-center gap-1.5 cursor-pointer text-sm text-neutral-700 dark:text-neutral-300 ml-4"
                  >
                    <input
                      type="radio"
                      bind:group={pivotMode}
                      value="custom"
                      name="pivot-mode"
                      class="text-blue-600 focus:ring-blue-500 border-neutral-300 dark:border-neutral-600"
                    /> Custom
                  </label>
                </div>

                {#if pivotMode === "custom"}
                  <div
                    class="grid grid-cols-2 gap-4"
                    transition:fade={{ duration: 100 }}
                  >
                    <div>
                      <label
                        for="pivot-x"
                        class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                      >
                        Pivot X
                      </label>
                      <input
                        id="pivot-x"
                        type="number"
                        bind:value={customPivotX}
                        class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label
                        for="pivot-y"
                        class="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                      >
                        Pivot Y
                      </label>
                      <input
                        id="pivot-y"
                        type="number"
                        bind:value={customPivotY}
                        class="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div
        class="p-4 bg-neutral-50 dark:bg-neutral-900/50 border-t border-neutral-200 dark:border-neutral-800 flex justify-end gap-3"
      >
        <button
          on:click={() => (isOpen = false)}
          class="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          on:click={applyTransform}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
        >
          Apply
        </button>
      </div>
    </div>
  </div>
{/if}
