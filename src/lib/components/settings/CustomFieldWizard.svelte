<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import type { CustomFieldConfig } from "../../../types";

  export let isOpen = false;
  export let currentConfig: CustomFieldConfig | undefined = undefined;

  const dispatch = createEventDispatcher();

  let step = 1; // 1: Upload, 2: Calibrate Field Bounds, 3: Review
  let imageData: string | null = null;
  let mapName = "My Custom Field";

  // Bounding box state (relative 0-1 percentage of the image container to keep it responsive)
  let box = {
    x: 0.1,
    y: 0.1,
    width: 0.8,
    height: 0.8,
  };

  let imageElement: HTMLImageElement;
  let imageContainer: HTMLDivElement;

  let wasOpen = false;
  $: if (isOpen && !wasOpen) {
    wasOpen = true;
    // Reset state on open
    step = 1;
    box = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };

    if (currentConfig) {
      imageData = currentConfig.imageData;
      mapName = currentConfig.name || "My Custom Field";
    } else {
      imageData = null;
      mapName = "My Custom Field";
    }
  } else if (!isOpen && wasOpen) {
    wasOpen = false;
  }

  function handleClose() {
    dispatch("close");
  }

  function handleImageUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          imageData = result;
          step = 2;
        } else {
          alert("Failed to read image file. Please try again.");
        }
      };
      reader.onerror = () => {
        alert(
          "Error reading file: " + (reader.error?.message || "Unknown error"),
        );
      };
      reader.readAsDataURL(file);
    }
  }

  function handleImageLoadError(e: Event) {
    alert(
      "The image failed to load in the browser. It may be corrupted or an unsupported format.",
    );
  }

  function nextStep() {
    if (step < 3) step++;
  }

  function prevStep() {
    if (step > 1) step--;
  }

  function calculateConfig(): CustomFieldConfig | null {
    if (!imageData || !imageElement) return null;

    // Convert relative box to pixels on the natural image
    const pxLeft = box.x * imageElement.naturalWidth;
    const pxTop = box.y * imageElement.naturalHeight;
    const pxWidth = box.width * imageElement.naturalWidth;
    const pxHeight = box.height * imageElement.naturalHeight;

    if (pxWidth <= 0 || pxHeight <= 0) return null;

    // The box represents the 144x144 field.
    // scaleX = 144 inches / pxWidth pixels => inches per pixel
    const scaleX = 144 / pxWidth;
    const scaleY = 144 / pxHeight;

    // Total image width/height in inches
    const widthIn = imageElement.naturalWidth * scaleX;
    const heightIn = imageElement.naturalHeight * scaleY;

    // The box left edge corresponds to X = 0.
    // So the image left edge (which is pxLeft pixels to the left of the box) is at X = -pxLeft * scaleX
    const x = -pxLeft * scaleX;

    // The box top edge corresponds to Y = 144.
    // The image top edge is pxTop pixels above the box.
    // Since Y increases upwards, moving up by pxTop pixels means adding (pxTop * scaleY) inches.
    const y = 144 + pxTop * scaleY;

    return {
      id: currentConfig?.id || crypto.randomUUID(),
      name: mapName,
      imageData,
      x,
      y,
      width: widthIn,
      height: heightIn,
    };
  }

  function handleSave() {
    const config = calculateConfig();
    if (config) {
      dispatch("save", config);
      dispatch("close");
    }
  }

  const fmt = (n: number) => n.toFixed(1);

  // Dragging logic for the bounding box
  let isDragging = false;
  let dragType = ""; // 'move', 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
  let dragStart = { x: 0, y: 0 };
  let boxStart = { x: 0, y: 0, width: 0, height: 0 };

  function handlePointerDown(e: PointerEvent, type: string) {
    if (!imageContainer) return;
    isDragging = true;
    dragType = type;
    dragStart = { x: e.clientX, y: e.clientY };
    boxStart = { ...box };
    // @ts-ignore
    e.target.setPointerCapture(e.pointerId);
    e.stopPropagation();
    e.preventDefault();
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging || !imageContainer) return;

    const rect = imageContainer.getBoundingClientRect();
    // Delta in relative percentage (0-1)
    const dx = (e.clientX - dragStart.x) / rect.width;
    const dy = (e.clientY - dragStart.y) / rect.height;

    let newBox = { ...boxStart };

    if (dragType === "move") {
      newBox.x += dx;
      newBox.y += dy;
    } else {
      if (dragType.includes("n")) {
        newBox.y += dy;
        newBox.height -= dy;
      }
      if (dragType.includes("s")) {
        newBox.height += dy;
      }
      if (dragType.includes("w")) {
        newBox.x += dx;
        newBox.width -= dx;
      }
      if (dragType.includes("e")) {
        newBox.width += dx;
      }
    }

    // Constraints
    if (newBox.width < 0.05) {
      if (dragType.includes("w")) newBox.x = box.x + box.width - 0.05;
      newBox.width = 0.05;
    }
    if (newBox.height < 0.05) {
      if (dragType.includes("n")) newBox.y = box.y + box.height - 0.05;
      newBox.height = 0.05;
    }

    // Clamp to 0-1
    if (newBox.x < 0) {
      if (dragType !== "move") newBox.width += newBox.x;
      newBox.x = 0;
    }
    if (newBox.y < 0) {
      if (dragType !== "move") newBox.height += newBox.y;
      newBox.y = 0;
    }
    if (newBox.x + newBox.width > 1) {
      if (dragType === "move") newBox.x = 1 - newBox.width;
      else newBox.width = 1 - newBox.x;
    }
    if (newBox.y + newBox.height > 1) {
      if (dragType === "move") newBox.y = 1 - newBox.height;
      else newBox.height = 1 - newBox.y;
    }

    box = newBox;
  }

  function handlePointerUp(e: PointerEvent) {
    isDragging = false;
    dragType = "";
    // @ts-ignore
    if (e.target.hasPointerCapture(e.pointerId)) {
      // @ts-ignore
      e.target.releasePointerCapture(e.pointerId);
    }
  }
</script>

{#if isOpen}
  <div
    transition:fade={{ duration: 300 }}
    class="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
    style="z-index: 2000;"
  >
    <div
      transition:fly={{ y: 20, duration: 300, easing: cubicInOut }}
      class="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
    >
      <!-- Header -->
      <div
        class="p-4 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center"
      >
        <h2 class="text-xl font-bold text-neutral-900 dark:text-white">
          Custom Field Map Wizard
        </h2>
        <button
          on:click={handleClose}
          class="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <!-- Progress Steps -->
        <div class="flex items-center justify-center gap-2 mb-4">
          {#each [1, 2, 3] as s}
            <div
              class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === s ? "bg-blue-600 text-white" : step > s ? "bg-green-500 text-white" : "bg-neutral-200 dark:bg-neutral-800 text-neutral-500"}`}
            >
              {step > s ? "✓" : s}
            </div>
            {#if s < 3}
              <div
                class={`w-8 h-0.5 ${step > s ? "bg-green-500" : "bg-neutral-200 dark:bg-neutral-800"}`}
              ></div>
            {/if}
          {/each}
        </div>

        {#if step === 1}
          <div
            class="flex flex-col items-center justify-center h-64 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800/50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-12 w-12 text-neutral-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <div class="w-full max-w-sm mb-4">
              <label
                for="mapName"
                class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >Map Name</label
              >
              <input
                id="mapName"
                type="text"
                bind:value={mapName}
                placeholder="e.g. My Practice Field"
                class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p class="text-neutral-600 dark:text-neutral-400 mb-4">
              Upload a custom field map image
            </p>
            <button
              on:click={() =>
                document.getElementById("wizard-image-input")?.click()}
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Select Image
            </button>
            <input
              id="wizard-image-input"
              type="file"
              accept="image/*"
              class="hidden"
              tabindex="-1"
              on:change={handleImageUpload}
            />
            {#if imageData}
              <button
                class="mt-4 text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                on:click={() => (step = 2)}
              >
                Use currently loaded image
              </button>
            {/if}
          </div>
        {:else}
          <div class="flex flex-col lg:flex-row gap-4 h-full min-h-[400px]">
            <div
              class="flex-1 relative bg-neutral-100 dark:bg-neutral-900 rounded-lg overflow-hidden flex items-center justify-center border border-neutral-200 dark:border-neutral-700 p-4"
            >
              <div
                class="relative select-none touch-none"
                bind:this={imageContainer}
                style="max-width: 100%; max-height: 60vh;"
              >
                <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                <img
                  bind:this={imageElement}
                  src={imageData}
                  alt="Field Calibration"
                  class="max-w-full max-h-[60vh] object-contain pointer-events-none"
                  on:error={handleImageLoadError}
                />

                {#if step === 2}
                  <!-- Bounding Box -->
                  <div
                    class="absolute border-2 border-blue-500 bg-blue-500/10 cursor-move"
                    style={`left: ${box.x * 100}%; top: ${box.y * 100}%; width: ${box.width * 100}%; height: ${box.height * 100}%;`}
                    on:pointerdown={(e) => handlePointerDown(e, "move")}
                    on:pointermove={handlePointerMove}
                    on:pointerup={handlePointerUp}
                    on:pointercancel={handlePointerUp}
                  >
                    <!-- Handles -->
                    <!-- N -->
                    <div
                      class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-ns-resize"
                      on:pointerdown|stopPropagation={(e) =>
                        handlePointerDown(e, "n")}
                      on:pointermove={handlePointerMove}
                      on:pointerup={handlePointerUp}
                      on:pointercancel={handlePointerUp}
                    ></div>
                    <!-- S -->
                    <div
                      class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-ns-resize"
                      on:pointerdown|stopPropagation={(e) =>
                        handlePointerDown(e, "s")}
                      on:pointermove={handlePointerMove}
                      on:pointerup={handlePointerUp}
                      on:pointercancel={handlePointerUp}
                    ></div>
                    <!-- W -->
                    <div
                      class="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-ew-resize"
                      on:pointerdown|stopPropagation={(e) =>
                        handlePointerDown(e, "w")}
                      on:pointermove={handlePointerMove}
                      on:pointerup={handlePointerUp}
                      on:pointercancel={handlePointerUp}
                    ></div>
                    <!-- E -->
                    <div
                      class="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-ew-resize"
                      on:pointerdown|stopPropagation={(e) =>
                        handlePointerDown(e, "e")}
                      on:pointermove={handlePointerMove}
                      on:pointerup={handlePointerUp}
                      on:pointercancel={handlePointerUp}
                    ></div>
                    <!-- NW -->
                    <div
                      class="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-nwse-resize"
                      on:pointerdown|stopPropagation={(e) =>
                        handlePointerDown(e, "nw")}
                      on:pointermove={handlePointerMove}
                      on:pointerup={handlePointerUp}
                      on:pointercancel={handlePointerUp}
                    ></div>
                    <!-- NE -->
                    <div
                      class="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-nesw-resize"
                      on:pointerdown|stopPropagation={(e) =>
                        handlePointerDown(e, "ne")}
                      on:pointermove={handlePointerMove}
                      on:pointerup={handlePointerUp}
                      on:pointercancel={handlePointerUp}
                    ></div>
                    <!-- SW -->
                    <div
                      class="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-nesw-resize"
                      on:pointerdown|stopPropagation={(e) =>
                        handlePointerDown(e, "sw")}
                      on:pointermove={handlePointerMove}
                      on:pointerup={handlePointerUp}
                      on:pointercancel={handlePointerUp}
                    ></div>
                    <!-- SE -->
                    <div
                      class="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-nwse-resize"
                      on:pointerdown|stopPropagation={(e) =>
                        handlePointerDown(e, "se")}
                      on:pointermove={handlePointerMove}
                      on:pointerup={handlePointerUp}
                      on:pointercancel={handlePointerUp}
                    ></div>
                  </div>
                {/if}
              </div>
            </div>

            <!-- Sidebar Controls -->
            <div class="w-full lg:w-80 flex flex-col gap-4">
              {#if step === 2}
                <div
                  class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg h-full flex flex-col"
                >
                  <h3 class="font-bold text-blue-900 dark:text-blue-100 mb-2">
                    Step 2: Calibrate Field Bounds
                  </h3>
                  <p
                    class="text-sm text-blue-800 dark:text-blue-200 mb-4 flex-1"
                  >
                    Drag and resize the blue box so that it perfectly aligns
                    with the outer boundaries of the 144x144 inch playable field
                    in your image.
                  </p>
                  <div
                    class="bg-white dark:bg-neutral-800 p-3 rounded border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-600 dark:text-neutral-400"
                  >
                    <ul class="list-disc pl-4 space-y-1">
                      <li>Include the entire field floor.</li>
                      <li>
                        Exclude the walls if you want your robot to navigate
                        inside them.
                      </li>
                      <li>The box will map to 0-144 on both X and Y axes.</li>
                    </ul>
                  </div>
                </div>
              {:else if step === 3}
                <div
                  class="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                >
                  <h3 class="font-bold text-green-900 dark:text-green-100 mb-2">
                    Step 3: Review
                  </h3>
                  {#if calculateConfig() !== null}
                    {@const res = calculateConfig()}
                    {#if res !== null}
                      <div class="space-y-2 text-sm">
                        <p>
                          <strong>Image Dimensions:</strong>
                          {fmt(res.width)}" x {fmt(res.height)}"
                        </p>
                        <p>
                          <strong>Top-Left Position:</strong> ({fmt(res.x)}", {fmt(
                            res.y,
                          )}")
                        </p>

                        <div
                          class="mt-4 p-2 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700"
                        >
                          <p class="text-xs text-neutral-500 mb-1">Preview:</p>
                          <div
                            class="aspect-square w-full bg-neutral-100 relative overflow-hidden border border-neutral-300"
                          >
                            <div
                              class="absolute inset-0 border-2 border-dashed border-neutral-400 z-10 pointer-events-none"
                            ></div>
                            <img
                              src={imageData}
                              alt="Preview"
                              class="absolute max-w-none opacity-80 pointer-events-none"
                              style={`
                                left: ${(res.x / 144) * 100}%;
                                top: ${(1 - res.y / 144) * 100}%;
                                width: ${(res.width / 144) * 100}%;
                                height: ${(res.height / 144) * 100}%;
                              `}
                            />
                          </div>
                          <p class="text-xs text-neutral-400 mt-1">
                            Dashed box is the 144x144 field.
                          </p>
                        </div>
                      </div>
                    {/if}
                  {:else}
                    <p class="text-red-500">Error calculating calibration.</p>
                  {/if}
                </div>
              {/if}

              <div class="mt-auto flex justify-between gap-2 pt-4">
                <button
                  on:click={prevStep}
                  disabled={step === 1}
                  class="px-4 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >Back</button
                >
                {#if step < 3}
                  <button
                    on:click={nextStep}
                    class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >Next</button
                  >
                {:else}
                  <button
                    on:click={handleSave}
                    class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                    >Save & Apply</button
                  >
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
