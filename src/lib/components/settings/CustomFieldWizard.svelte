<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import type { CustomFieldConfig } from "../../../types";

  export let isOpen = false;
  export let currentConfig: CustomFieldConfig | undefined = undefined;

  const dispatch = createEventDispatcher();

  let step = 1; // 1: Upload, 2: Calibrate P1, 3: Calibrate P2, 4: Review
  let imageData: string | null = null;
  let mapName = "My Custom Field";

  // Calibration points (Image Pixels)
  let p1: { x: number; y: number } | null = null;
  let p2: { x: number; y: number } | null = null;

  // Real world points (Field Inches)
  let w1 = { x: 0, y: 144 }; // Default: Top-Left (Y=144 is top)
  let w2 = { x: 144, y: 0 }; // Default: Bottom-Right (Y=0 is bottom)

  let imageElement: HTMLImageElement;
  let imageContainer: HTMLDivElement;

  let wasOpen = false;
  $: if (isOpen && !wasOpen) {
    wasOpen = true;
    // Reset state on open
    step = 1;
    p1 = null;
    p2 = null;

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
      console.log("File selected:", file.name, file.size, file.type);
      const reader = new FileReader();
      reader.onload = (evt) => {
        const result = reader.result; // Use reader.result directly
        if (typeof result === "string") {
          console.log("File read successfully. Length:", result.length);
          imageData = result;
          step = 2; // Move to next step automatically
          p1 = null;
          p2 = null;
        } else {
          console.error("File read failed: result is not a string", result);
          alert("Failed to read image file. Please try again.");
        }
      };
      reader.onerror = () => {
        console.error("FileReader error:", reader.error);
        alert(
          "Error reading file: " + (reader.error?.message || "Unknown error"),
        );
      };
      reader.readAsDataURL(file);
    }
  }

  function handleImageLoadError(e: Event) {
    console.error("Image element failed to load source");
    alert(
      "The image failed to load in the browser. It may be corrupted or an unsupported format.",
    );
  }

  function handleImageClick(e: MouseEvent) {
    if (!imageElement) return;

    // Get click coordinates relative to the image
    const rect = imageElement.getBoundingClientRect();
    const scaleX = imageElement.naturalWidth / rect.width;
    const scaleY = imageElement.naturalHeight / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (step === 2) {
      p1 = { x, y };
    } else if (step === 3) {
      p2 = { x, y };
    }
  }

  function nextStep() {
    if (step === 2 && p1) step = 3;
    else if (step === 3 && p2) step = 4;
  }

  function prevStep() {
    if (step > 1) step--;
  }

  function calculateConfig(): CustomFieldConfig | null {
    if (!imageData || !p1 || !p2) return null;

    // Calculate Pixels Per Inch
    const distPx = Math.sqrt(
      Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2),
    );
    const distIn = Math.sqrt(
      Math.pow(w1.x - w2.x, 2) + Math.pow(w1.y - w2.y, 2),
    );

    if (distIn === 0) return null; // Avoid division by zero

    const ppi = distPx / distIn;

    // Calculate Image Dimensions in Inches
    if (!imageElement) return null;

    const widthIn = imageElement.naturalWidth / ppi;
    const heightIn = imageElement.naturalHeight / ppi;

    // Calculate Field Coordinates of Image Top-Left
    const left1 = w1.x - p1.x / ppi;
    const top1 = w1.y + p1.y / ppi;

    const left2 = w2.x - p2.x / ppi;
    const top2 = w2.y + p2.y / ppi;

    // Average for better accuracy
    const x = (left1 + left2) / 2;
    const y = (top1 + top2) / 2;

    return {
      id: currentConfig?.id || crypto.randomUUID(), // Maintain ID if editing, else generate new
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

  // Helper to format number
  const fmt = (n: number) => n.toFixed(1);
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
          class="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
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
          {#each [1, 2, 3, 4] as s}
            <div
              class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === s ? "bg-blue-600 text-white" : step > s ? "bg-green-500 text-white" : "bg-neutral-200 dark:bg-neutral-800 text-neutral-500"}`}
            >
              {step > s ? "✓" : s}
            </div>
            {#if s < 4}
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
              >
                Map Name
              </label>
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
            <label
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md cursor-pointer transition-colors"
            >
              Select Image
              <input
                type="file"
                accept="image/*"
                class="hidden"
                on:change={handleImageUpload}
              />
            </label>
            {#if imageData}
              <button
                class="mt-4 text-blue-600 dark:text-blue-400 hover:underline"
                on:click={() => (step = 2)}
              >
                Use currently loaded image
              </button>
            {/if}
          </div>
        {:else}
          <!-- Image Area for Calibration -->
          <div class="flex flex-col lg:flex-row gap-4 h-full min-h-[400px]">
            <div
              class="flex-1 relative bg-neutral-100 dark:bg-neutral-900 rounded-lg overflow-hidden flex items-center justify-center border border-neutral-200 dark:border-neutral-700"
            >
              <div
                class="relative max-w-full max-h-[60vh]"
                bind:this={imageContainer}
              >
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                <img
                  bind:this={imageElement}
                  src={imageData}
                  alt="Field Calibration"
                  class={`max-w-full max-h-[60vh] object-contain ${step === 2 || step === 3 ? "cursor-crosshair" : ""}`}
                  on:click={handleImageClick}
                  on:error={handleImageLoadError}
                />

                {#if p1}
                  <div
                    class="absolute w-4 h-4 border-2 border-blue-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={`left: ${(p1.x / imageElement.naturalWidth) * 100}%; top: ${(p1.y / imageElement.naturalHeight) * 100}%;`}
                  >
                    <div
                      class="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white text-xs px-1 rounded whitespace-nowrap"
                    >
                      Point 1
                    </div>
                  </div>
                {/if}
                {#if p2}
                  <div
                    class="absolute w-4 h-4 border-2 border-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={`left: ${(p2.x / imageElement.naturalWidth) * 100}%; top: ${(p2.y / imageElement.naturalHeight) * 100}%;`}
                  >
                    <div
                      class="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-red-500 text-white text-xs px-1 rounded whitespace-nowrap"
                    >
                      Point 2
                    </div>
                  </div>
                {/if}
              </div>
            </div>

            <!-- Sidebar Controls -->
            <div class="w-full lg:w-80 flex flex-col gap-4">
              {#if step === 2}
                <div
                  class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
                >
                  <h3 class="font-bold text-blue-900 dark:text-blue-100 mb-2">
                    Step 2: First Reference Point
                  </h3>
                  <p class="text-sm text-blue-800 dark:text-blue-200 mb-4">
                    Click a known point on the image (e.g., Top-Left corner of
                    the field).
                  </p>

                  <div class="space-y-3">
                    <div>
                      <label
                        for="w1-x"
                        class="block text-xs font-medium text-neutral-500 dark:text-neutral-400"
                        >Field X (inches)</label
                      >
                      <input
                        id="w1-x"
                        type="number"
                        bind:value={w1.x}
                        class="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
                      />
                    </div>
                    <div>
                      <label
                        for="w1-y"
                        class="block text-xs font-medium text-neutral-500 dark:text-neutral-400"
                        >Field Y (inches)</label
                      >
                      <input
                        id="w1-y"
                        type="number"
                        bind:value={w1.y}
                        class="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
                      />
                    </div>
                    {#if p1}
                      <div
                        class="text-xs text-green-600 dark:text-green-400 font-medium"
                      >
                        Point 1 set at ({Math.round(p1.x)}, {Math.round(p1.y)})
                        px
                      </div>
                    {:else}
                      <div class="text-xs text-neutral-500 italic">
                        Click on image to set point
                      </div>
                    {/if}
                  </div>
                </div>
              {:else if step === 3}
                <div
                  class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
                >
                  <h3 class="font-bold text-red-900 dark:text-red-100 mb-2">
                    Step 3: Second Reference Point
                  </h3>
                  <p class="text-sm text-red-800 dark:text-red-200 mb-4">
                    Click another known point (e.g., Bottom-Right corner).
                  </p>

                  <div class="space-y-3">
                    <div>
                      <label
                        for="w2-x"
                        class="block text-xs font-medium text-neutral-500 dark:text-neutral-400"
                        >Field X (inches)</label
                      >
                      <input
                        id="w2-x"
                        type="number"
                        bind:value={w2.x}
                        class="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
                      />
                    </div>
                    <div>
                      <label
                        for="w2-y"
                        class="block text-xs font-medium text-neutral-500 dark:text-neutral-400"
                        >Field Y (inches)</label
                      >
                      <input
                        id="w2-y"
                        type="number"
                        bind:value={w2.y}
                        class="w-full px-3 py-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
                      />
                    </div>
                    {#if p2}
                      <div
                        class="text-xs text-green-600 dark:text-green-400 font-medium"
                      >
                        Point 2 set at ({Math.round(p2.x)}, {Math.round(p2.y)})
                        px
                      </div>
                    {:else}
                      <div class="text-xs text-neutral-500 italic">
                        Click on image to set point
                      </div>
                    {/if}
                  </div>
                </div>
              {:else if step === 4}
                <div
                  class="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                >
                  <h3 class="font-bold text-green-900 dark:text-green-100 mb-2">
                    Step 4: Review
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
                            <!-- Field bounds -->
                            <div
                              class="absolute inset-0 border-2 border-dashed border-neutral-400 z-10 pointer-events-none"
                            ></div>
                            <!-- Image preview scaled to fit 144x144 field -->
                            <!-- We simulate the field view here. Field is 0-144. Image is placed at x,y with w,h -->
                            <!-- We map 0-144 to 0-100% -->
                            <img
                              src={imageData}
                              alt="Preview"
                              class="absolute max-w-none opacity-80"
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
                    <p class="text-red-500">
                      Error calculating calibration. Points might be too close
                      or invalid.
                    </p>
                  {/if}
                </div>
              {/if}

              <div class="mt-auto flex justify-between gap-2 pt-4">
                <button
                  on:click={prevStep}
                  disabled={step === 1}
                  class="px-4 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded disabled:opacity-50"
                  >Back</button
                >
                {#if step < 4}
                  <button
                    on:click={nextStep}
                    disabled={(step === 2 && !p1) || (step === 3 && !p2)}
                    class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >Next</button
                  >
                {:else}
                  <button
                    on:click={handleSave}
                    class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
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
