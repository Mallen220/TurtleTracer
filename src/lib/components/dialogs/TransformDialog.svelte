<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { CloseIcon } from "../icons";
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
  } from "../../../utils/pathTransform";
  import { sequenceStore } from "../../../lib/projectStore";
  import { ui } from "../../ui";

  interface Props {
    isOpen?: boolean;
  }

  let { isOpen = $bindable(false) }: Props = $props();

  let activeTab: "translate" | "rotate" | "flip" | "reverse" =
    $state("translate");

  // Translate State
  let translateX = $state(0);
  let translateY = $state(0);

  // Pivot Settings (shared for Rotate & Flip)
  let pivotMode: "center" | "origin" | "custom" = $state("center");
  let customPivotX = $state(72);
  let customPivotY = $state(72);

  // Rotate State
  let rotateDegrees = $state(0);

  // Flip State
  let flipHorizontal = $state(false);
  let flipVertical = $state(false);

  let effectivePivotX = $derived(
    pivotMode === "center" ? 72 : pivotMode === "origin" ? 0 : customPivotX,
  );
  let effectivePivotY = $derived(
    pivotMode === "center" ? 72 : pivotMode === "origin" ? 0 : customPivotY,
  );

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
    } catch (e: any) {
      notification.set({
        message: `Transformation failed: ${e.message}`,
        type: "error",
        timeout: 5000,
      });
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div
    transition:fade={{ duration: 200, easing: cubicInOut }}
    class="{ui.overlay} z-[2000]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="transform-dialog-title"
  >
    <div
      transition:fly={{ duration: 200, y: 20, easing: cubicInOut }}
      class="{ui.dialog} w-full max-w-md overflow-hidden"
    >
      <div class={ui.dialogHeader}>
        <h2
          id="transform-dialog-title"
          class="text-lg font-bold text-neutral-900 dark:text-neutral-100"
        >
          Transform Path
        </h2>
        <button
          onclick={() => (isOpen = false)}
          class={ui.iconBtnSm.neutral}
          aria-label="Close"
        >
          <CloseIcon
            className="w-5 h-5 text-neutral-500 dark:text-neutral-400"
            strokeWidth={2}
          />
        </button>
      </div>

      <div
        class="flex border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
      >
        <button
          onclick={() => (activeTab = "translate")}
          class={ui.tabUnderline(activeTab === "translate")}
        >
          Translate
        </button>
        <button
          onclick={() => (activeTab = "rotate")}
          class={ui.tabUnderline(activeTab === "rotate")}
        >
          Rotate
        </button>
        <button
          onclick={() => (activeTab = "flip")}
          class={ui.tabUnderline(activeTab === "flip")}
        >
          Flip
        </button>
        <button
          onclick={() => (activeTab = "reverse")}
          class={ui.tabUnderline(activeTab === "reverse")}
        >
          Reverse
        </button>
      </div>

      <div class="p-6 bg-white dark:bg-neutral-900 space-y-6">
        {#if activeTab === "reverse"}
          <div>
            <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              Reverse the direction of the entire path and sequence.
            </p>
          </div>
        {:else if activeTab === "translate"}
          <div>
            <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              Shift the entire path and all its points by a given offset in
              inches.
            </p>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="translate-x" class="{ui.label} block mb-1">
                  X Offset (inches)
                </label>
                <input
                  id="translate-x"
                  type="number"
                  bind:value={translateX}
                  class="{ui.input} w-full"
                />
              </div>
              <div>
                <label for="translate-y" class="{ui.label} block mb-1">
                  Y Offset (inches)
                </label>
                <input
                  id="translate-y"
                  type="number"
                  bind:value={translateY}
                  class="{ui.input} w-full"
                />
              </div>
            </div>
          </div>
        {:else}
          <div>
            <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              {activeTab === "rotate"
                ? "Rotate the entire path around a pivot point."
                : "Flip the entire path across an axis."}
            </p>

            <div class="space-y-4">
              {#if activeTab === "rotate"}
                <div>
                  <label for="rotate-degrees" class="{ui.label} block mb-1">
                    Angle (Degrees, Clockwise)
                  </label>
                  <input
                    id="rotate-degrees"
                    type="number"
                    bind:value={rotateDegrees}
                    class="{ui.input} w-full"
                  />
                </div>
              {:else}
                <div class="flex gap-6 pt-2 pb-2">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={flipHorizontal}
                      class={ui.checkbox}
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
                      class={ui.checkbox}
                    />
                    <span
                      class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
                      >Flip Vertical (Y)</span
                    >
                  </label>
                </div>
              {/if}

              <div class="{ui.well} mt-4 p-4">
                <label for="pivot-mode" class="{ui.heading} block mb-2">
                  Pivot Point
                </label>
                <div class="flex gap-2 mb-3">
                  <label class={ui.checkLabel}>
                    <input
                      type="radio"
                      bind:group={pivotMode}
                      value="center"
                      name="pivot-mode"
                      class={ui.checkbox}
                    /> Center (72, 72)
                  </label>
                  <label class="{ui.checkLabel} ml-4">
                    <input
                      type="radio"
                      bind:group={pivotMode}
                      value="origin"
                      name="pivot-mode"
                      class={ui.checkbox}
                    /> Origin (0, 0)
                  </label>
                  <label class="{ui.checkLabel} ml-4">
                    <input
                      type="radio"
                      bind:group={pivotMode}
                      value="custom"
                      name="pivot-mode"
                      class={ui.checkbox}
                    /> Custom
                  </label>
                </div>

                {#if pivotMode === "custom"}
                  <div
                    class="grid grid-cols-2 gap-4"
                    transition:fade={{ duration: 100 }}
                  >
                    <div>
                      <label for="pivot-x" class="{ui.label} block mb-1">
                        Pivot X
                      </label>
                      <input
                        id="pivot-x"
                        type="number"
                        bind:value={customPivotX}
                        class="{ui.input} w-full"
                      />
                    </div>
                    <div>
                      <label for="pivot-y" class="{ui.label} block mb-1">
                        Pivot Y
                      </label>
                      <input
                        id="pivot-y"
                        type="number"
                        bind:value={customPivotY}
                        class="{ui.input} w-full"
                      />
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <div class="{ui.dialogFooter} justify-end">
        <button onclick={() => (isOpen = false)} class={ui.btn.ghost}>
          Cancel
        </button>
        <button onclick={applyTransform} class={ui.btn.primary}> Apply </button>
      </div>
    </div>
  </div>
{/if}
