<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { scale } from "svelte/transition";
  import { exportPathToImage } from "../../../utils/exportAnimation";
  import { FIELD_SIZE } from "../../../config";
  import { fieldZoom, fieldPan } from "../../../stores";

  export let show = false;
  export let twoInstance: any;
  export let settings: any;
  export let robotLengthPx: number;
  export let robotWidthPx: number;
  export let robotState: { x: number; y: number; heading: number };
  export let electronAPI: any;

  // D3 Scales passed as functions
  export let xScale: (v: number) => number = (v) => v;
  export let yScale: (v: number) => number = (v) => v;

  const dispatch = createEventDispatcher();

  let format: "png" | "jpeg" | "svg" = "png";
  let resolutionScale = 1.0;
  let quality = 0.9; // 0.1 - 1.0 for JPEG

  let status = "idle"; // idle, generating, done, error
  let statusMessage = "";
  let previewBlob: Blob | null = null;
  let previewUrl: string | null = null;

  // Store View State
  let savedZoom = 1.0;
  let savedPan = { x: 0, y: 0 };

  // Preview sizing helpers
  let previewContainer: HTMLDivElement | null = null;
  let containerW = 0;
  let containerH = 0;
  $: iconSize = Math.max(
    0,
    Math.floor(Math.min(containerW || 0, containerH || 0)),
  );

  function close() {
    show = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    previewBlob = null;
    status = "idle";
    dispatch("close");
  }

  function toggleValidationVisibility(visible: boolean) {
    if (!twoInstance || !twoInstance.scene) return;
    twoInstance.scene.children.forEach((child: any) => {
      // Hide validation markers and snap guides
      if (child.id === "collision-group" || child.id === "snap-group") {
        child.visible = visible;
      }
    });
  }

  async function generatePreview() {
    status = "generating";
    statusMessage = "Capturing...";
    previewBlob = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;

    try {
      // Hide warnings before capture
      toggleValidationVisibility(false);

      // Force Two.js update to ensure latest state (and visibility) is rendered
      twoInstance.update();

      // Calculate Screen Coordinates
      const bgBounds = {
          x: xScale(0),
          y: yScale(FIELD_SIZE), // Top-left visual coordinate (since Y is inverted in field space)
          width: xScale(FIELD_SIZE) - xScale(0),
          height: yScale(0) - yScale(FIELD_SIZE) // Inverted Y scale: yScale(0) > yScale(FIELD_SIZE)
      };

      const robotScreenState = {
          x: xScale(robotState.x),
          y: yScale(robotState.y),
          heading: robotState.heading
      };

      const blob = await exportPathToImage({
        two: twoInstance,
        format,
        scale: resolutionScale,
        quality,
        backgroundImageSrc: settings.fieldMap
          ? `/fields/${settings.fieldMap}`
          : "/fields/decode.webp",
        robotImageSrc: settings.robotImage || "/robot.png",
        robotLengthPx,
        robotWidthPx,
        backgroundBounds: bgBounds,
        robotScreenState: robotScreenState,
      });

      // Restore warnings
      toggleValidationVisibility(true);
      twoInstance.update(); // Update again to show them back in UI if needed (though not strictly necessary as render loop runs)

      previewBlob = blob;
      previewUrl = URL.createObjectURL(blob);
      status = "done";
      statusMessage = "Preview ready!";
    } catch (err: any) {
      console.error(err);
      // Ensure visibility restored even on error
      toggleValidationVisibility(true);
      twoInstance.update();

      status = "error";
      statusMessage = "Error: " + err;
    }
  }

  async function downloadImage() {
    if (!previewBlob) {
      await generatePreview();
    }

    if (!previewBlob) return;

    const ext = format === "jpeg" ? "jpg" : format;
    const label = format.toUpperCase();

    if (
      electronAPI &&
      electronAPI.showSaveDialog &&
      electronAPI.writeFileBase64
    ) {
      const dest = await electronAPI.showSaveDialog({
        defaultPath: `field_export.${ext}`,
        filters: [{ name: label, extensions: [ext] }],
      });
      if (dest) {
        const reader = new FileReader();
        reader.onload = async () => {
          const b64 = (reader.result as string).split(",")[1];
          await electronAPI.writeFileBase64!(dest, b64);
          statusMessage = "Saved successfully!";
          setTimeout(close, 1500);
        };
        reader.readAsDataURL(previewBlob);
      }
    } else {
      const a = document.createElement("a");
      a.href = previewUrl!;
      a.download = `field_export.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      statusMessage = "Downloaded!";
      setTimeout(close, 1500);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  // ResizeObserver
  let _ro: ResizeObserver | null = null;
  onMount(() => {
    // Save current view state
    savedZoom = get(fieldZoom);
    savedPan = get(fieldPan);

    // Force default view
    fieldZoom.set(1.0);
    fieldPan.set({ x: 0, y: 0 });

    if (typeof ResizeObserver !== "undefined" && previewContainer) {
      _ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const c = entry.contentRect;
          containerW = c.width;
          containerH = c.height;
        }
      });
      _ro.observe(previewContainer);
    }

    // Wait a brief moment for store updates to propagate to Two.js scene before capturing
    setTimeout(() => {
      generatePreview();
    }, 100);
  });

  onDestroy(() => {
    // Restore view state
    fieldZoom.set(savedZoom);
    fieldPan.set(savedPan);

    // Ensure validation visibility is restored if dialog is closed mid-process
    toggleValidationVisibility(true);
    if(twoInstance) twoInstance.update();

    if (_ro) _ro.disconnect();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    transition:scale={{ duration: 200, start: 0.95 }}
  >
    <div
      class="bg-white dark:bg-neutral-800 rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700"
      >
        <h2
          class="text-xl font-semibold text-neutral-800 dark:text-neutral-100"
        >
          Export Image
        </h2>
        <button
          class="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          on:click={close}
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="w-6 h-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 overflow-y-auto flex-1 flex flex-col gap-6 min-h-0">
        <!-- Controls Row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Format -->
          <div class="flex flex-col gap-2">
            <label
              for="img-format"
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Format
            </label>
            <select
              id="img-format"
              bind:value={format}
              on:change={generatePreview}
              class="bg-neutral-100 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block w-full p-2.5"
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="svg">SVG</option>
            </select>
          </div>

          <!-- Scale -->
          <div class="flex flex-col gap-2">
            <label
              for="img-scale"
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Scale: {Math.round(resolutionScale * 100)}%
            </label>
            <select
              id="img-scale"
              bind:value={resolutionScale}
              on:change={generatePreview}
              class="bg-neutral-100 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block w-full p-2.5"
            >
              <option value={0.25}>25%</option>
              <option value={0.5}>50%</option>
              <option value={1.0}>100%</option>
              <option value={2.0}>200%</option>
              <option value={4.0}>400%</option>
            </select>
          </div>

          <!-- Quality (JPEG Only) -->
           {#if format === 'jpeg'}
          <div class="flex flex-col gap-2">
            <label
              for="img-quality"
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Quality: {Math.round(quality * 100)}%
            </label>
            <input
              id="img-quality"
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              bind:value={quality}
              on:change={generatePreview}
              class="w-full accent-purple-600"
            />
          </div>
          {/if}
        </div>

        <!-- Info Blurb for SVG -->
        {#if format === "svg"}
          <div
            class="text-xs text-neutral-500 dark:text-neutral-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-100 dark:border-blue-800"
          >
            <strong>Note:</strong> SVG export embeds the field and robot images. File size may be larger than expected.
          </div>
        {/if}

         <!-- Status / Error -->
        {#if status === "generating"}
             <div class="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                <svg class="animate-spin h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{statusMessage}</span>
             </div>
        {:else if status === "error"}
          <div
            class="p-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400"
            role="alert"
          >
            <span class="font-medium">Error!</span>
            {statusMessage}
          </div>
        {:else if status === "done"}
             <!-- Optional success message -->
        {/if}

        <!-- Preview Area -->
        <div
          bind:this={previewContainer}
          class="flex-1 min-h-[200px] flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden relative p-2"
        >
          {#if previewUrl}
            <img
              src={previewUrl}
              alt="Export Preview"
              class="shadow-sm"
              style="width: {iconSize}px; height: {iconSize}px; object-fit: contain;"
            />
          {:else}
             <!-- Placeholder -->
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div
        class="flex items-center justify-end px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 gap-3"
      >
        <button
          class="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
          on:click={close}
        >
          Cancel
        </button>

        <button
          class="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          on:click={downloadImage}
          disabled={status === "generating" || !previewUrl}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l-3-3m0 0l-3 3m3-3v7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Download / Save
        </button>
      </div>
    </div>
  </div>
{/if}
