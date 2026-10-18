<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { observeSize } from "../../actions/observeSize";
  import { get } from "svelte/store";
  import { scale } from "svelte/transition";
  import { exportPathToImage } from "../../../utils/exportAnimation";
  import { saveBlob } from "../../../utils/file";
  import type Two from "two.js";
  import type { Group } from "two.js/src/group";
  import type { Settings } from "../../../types";
  import { FIELD_SIZE, DEFAULT_FIELD_MAP } from "../../../config";
  import { fieldZoom, fieldPan } from "../../../stores";
  import { CloseIcon, SpinnerIcon, ArrowDownTrayIcon } from "../icons";
  import { ui } from "../../ui";

  interface Props {
    show?: boolean;
    twoInstance: Two;
    settings: Settings;
    robotLengthPx: number;
    robotWidthPx: number;
    robotState: { x: number; y: number; heading: number };
    // D3 Scales passed as functions
    xScale?: (v: number) => number;
    yScale?: (v: number) => number;
    onclose?: () => void;
  }

  let {
    show = $bindable(false),
    twoInstance,
    settings,
    robotLengthPx,
    robotWidthPx,
    robotState,
    xScale = (v) => v,
    yScale = (v) => v,
    onclose,
  }: Props = $props();

  let format: "png" | "jpeg" | "svg" = $state("png");
  let resolutionScale = $state(1);
  let quality = $state(0.9); // 0.1 - 1.0 for JPEG

  let status = $state("idle"); // idle, generating, done, error
  let statusMessage = $state("");
  let previewBlob: Blob | null = null;
  let previewUrl: string | null = $state(null);

  // Store View State
  let savedZoom = 1;
  let savedPan = { x: 0, y: 0 };

  // Preview sizing helpers
  let containerW = $state(0);
  let containerH = $state(0);
  let iconSize = $derived(
    Math.max(0, Math.floor(Math.min(containerW || 0, containerH || 0))),
  );

  function close() {
    show = false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    previewBlob = null;
    status = "idle";
    onclose?.();
  }

  function toggleValidationVisibility(visible: boolean) {
    // Collision markers and snap guides don't belong in the picture.
    for (const id of ["collision-group", "snap-group"]) {
      const group = twoInstance?.scene?.getById(id) as Group | null;
      if (group) group.visible = visible;
    }
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
        height: yScale(0) - yScale(FIELD_SIZE), // Inverted Y scale: yScale(0) > yScale(FIELD_SIZE)
      };

      const robotScreenState = {
        x: xScale(robotState.x),
        y: yScale(robotState.y),
        heading: robotState.heading,
      };

      const blob = await exportPathToImage({
        two: twoInstance,
        format,
        scale: resolutionScale,
        quality,
        backgroundImageSrc: settings.fieldMap
          ? `/fields/${settings.fieldMap}`
          : `/fields/${DEFAULT_FIELD_MAP}`,
        robotImageSrc:
          settings.robotImage && settings.robotImage !== "none"
            ? settings.robotImage
            : undefined,
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

    const result = await saveBlob(previewBlob, `field_export.${ext}`, label);
    if (result === "cancelled") return;
    statusMessage = result === "saved" ? "Saved successfully!" : "Downloaded!";
    setTimeout(close, 1500);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  onMount(() => {
    // Save current view state
    savedZoom = get(fieldZoom);
    savedPan = get(fieldPan);

    // Force default view
    fieldZoom.set(1);
    fieldPan.set({ x: 0, y: 0 });

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
    if (twoInstance) twoInstance.update();

    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
  <div
    class="{ui.overlay} z-[100]"
    transition:scale={{ duration: 200, start: 0.95 }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-image-title"
      class="{ui.dialog} w-full max-w-2xl flex flex-col max-h-[90vh]"
    >
      <!-- Header -->
      <div class={ui.dialogHeader}>
        <h2
          id="export-image-title"
          class="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
        >
          Export Image
        </h2>
        <button
          title="Close"
          class="text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
          onclick={close}
          aria-label="Close"
        >
          <CloseIcon className="w-6 h-6" />
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
              onchange={generatePreview}
              class="{ui.input} block w-full"
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
              onchange={generatePreview}
              class="{ui.input} block w-full"
            >
              <option value={0.25}>25%</option>
              <option value={0.5}>50%</option>
              <option value={1}>100%</option>
              <option value={2}>200%</option>
              <option value={4}>400%</option>
            </select>
          </div>

          <!-- Quality (JPEG Only) -->
          {#if format === "jpeg"}
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
                onchange={generatePreview}
                class="w-full accent-emerald-600"
              />
            </div>
          {/if}
        </div>

        <!-- Info Blurb for SVG -->
        {#if format === "svg"}
          <div class={ui.alert.info}>
            <strong>Note:</strong> SVG export embeds the field and robot images.
            File size may be larger than expected.
            <p class="mt-1">
              If you select <em>No Image</em> in settings the green square robot with
              directional arrows will be used instead of an external graphic.
            </p>
          </div>
        {/if}

        <!-- Status / Error -->
        {#if status === "generating"}
          <div
            class="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400"
          >
            <SpinnerIcon className="animate-spin h-4 w-4 text-emerald-600" />
            <span>{statusMessage}</span>
          </div>
        {:else if status === "error"}
          <div class={ui.alert.danger} role="alert">
            <span class="font-medium">Error!</span>
            {statusMessage}
          </div>
        {:else if status === "done"}
          <!-- Optional success message -->
        {/if}

        <!-- Preview Area -->
        <div
          use:observeSize={(size) => {
            containerW = size.width;
            containerH = size.height;
          }}
          class="{ui.well} flex-1 min-h-[200px] flex items-center justify-center overflow-hidden relative p-2"
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
      <div class="{ui.dialogFooter} justify-end">
        <button class={ui.btn.ghost} onclick={close}> Cancel </button>

        <button
          class={ui.btn.primary}
          onclick={downloadImage}
          disabled={status === "generating" || !previewUrl}
        >
          <ArrowDownTrayIcon className="w-4 h-4" strokeWidth={1.5} />
          Download / Save
        </button>
      </div>
    </div>
  </div>
{/if}
