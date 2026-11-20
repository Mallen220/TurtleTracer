<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { DEFAULT_FIELD_MAP } from "../../../config";
  import { untrack } from "svelte";
  import { observeSize } from "../../actions/observeSize";
  import { scale } from "svelte/transition";
  import {
    exportPathToGif,
    exportPathToApng,
    estimateGifSize,
  } from "../../../utils/exportAnimation";
  import {
    GIF_FPS,
    APNG_FPS,
    MEMORY_WARN_BYTES,
    frameCountFor,
    frameMemoryBytes,
    formatBytes,
  } from "../../../utils/animationExportPlan";
  import { CloseIcon, PhotoIcon } from "../icons";
  import { saveBlob } from "../../../utils/file";
  import type { BatchOutput } from "../../../utils/batchExport";
  import type Two from "two.js";
  import type { AnimationController } from "../../../utils/animation";
  import type { Settings } from "../../../types";
  import ExportCycleActions from "./ExportCycleActions.svelte";
  import ExportFileLabel from "./ExportFileLabel.svelte";
  import { exportCycle } from "../../../stores";
  import { ui } from "../../ui";
  import ExportWidthSelect from "./ExportWidthSelect.svelte";

  let format: "gif" | "apng" = $state("gif");
  let fps = $state(15);
  let outWidth = $state(720); // exported width in pixels
  let reduceColors = $state(false); // APNG only
  // The field view as it is on screen, measured when the dialog opens. The
  // export keeps its aspect ratio.
  let fieldW = $state(0);
  let fieldH = $state(0);
  let duration = $state(0);

  let aspect = $derived(fieldW ? fieldH / fieldW : 1);
  let outHeight = $derived(Math.round(outWidth * aspect));
  let frames = $derived(frameCountFor(duration, fps));
  let memoryBytes = $derived(frameMemoryBytes(outWidth, outHeight, frames));
  let fpsOptions = $derived.by(() => (format === "apng" ? APNG_FPS : GIF_FPS));
  let estimateBytes: number | null = $state(null);
  let estimating = $state(false);

  function invalidatePreview() {
    if (status === "generating") {
      try {
        abortController?.abort();
      } catch (e) {
        console.warn("Abort threw", e);
      }
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    previewBlob = null;
    status = "idle";
    progress = 0;
    statusMessage = "";
  }

  let status = $state("idle"); // idle, generating, done, error
  let progress = $state(0);
  let statusMessage = $state("");
  let previewBlob: Blob | null = $state(null);
  let previewUrl: string | null = $state(null);

  let abortController: AbortController | null = null;

  // Preview sizing helpers — measure the preview container and constrain
  // the preview image to a square sized by min(width, height)
  let containerW = $state(0);
  let containerH = $state(0);

  function close() {
    if (status === "generating") {
      // Immediately close UI and clean up state before aborting to avoid any race
      show = false;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      previewBlob = null;
      status = "idle";
      progress = 0;

      try {
        abortController?.abort();
      } catch (e) {
        console.warn("Abort threw", e);
      }

      onclose?.();
      return;
    }

    show = false;
    // Clean up
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    previewBlob = null;
    status = "idle";
    progress = 0;
    onclose?.();
  }

  function handleCancel() {
    close();
  }

  function exportOptions(signal: AbortSignal) {
    return {
      two: twoInstance,
      animationController,
      durationSec: duration,
      fps,
      width: outWidth,
      reduceColors,
      signal,
      backgroundImageSrc: settings.fieldMap
        ? `/fields/${settings.fieldMap}`
        : `/fields/${DEFAULT_FIELD_MAP}`,
      robotImageSrc:
        settings.robotImage && settings.robotImage !== "none"
          ? settings.robotImage
          : undefined,
      // note: choosing 'none' in settings yields the green square robot instead
      robotLengthPx,
      robotWidthPx,
      getRobotState: robotStateFunction,
    };
  }

  async function generatePreview() {
    if (status === "generating") return;
    // Start a new AbortController for this generation session
    abortController = new AbortController();

    status = "generating";
    progress = 0;
    statusMessage = "Capturing frames...";
    previewBlob = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;

    try {
      // reminder: if robotImage = "none", the export routines will render the
      // green square with wheel-direction arrows rather than load an external image
      const options = {
        ...exportOptions(abortController.signal),
        onProgress: (p: number, stage?: string) => {
          progress = p;
          statusMessage = `${stage ?? "Working"}... ${Math.round(p * 100)}%`;
        },
      };

      let blob: Blob;
      if (format === "gif") {
        blob = await exportPathToGif(options);
      } else {
        blob = await exportPathToApng(options);
      }

      previewBlob = blob;
      previewUrl = URL.createObjectURL(blob);
      status = "done";
      statusMessage = "Preview ready!";
    } catch (err: any) {
      console.error(err);
      if (err && err.name === "AbortError") {
        // Cancellation requested — reset status but keep dialog open
        status = "idle";
        statusMessage = "Cancelled";
        progress = 0;
      } else {
        status = "error";
        statusMessage =
          err instanceof RangeError
            ? `Not enough memory for this size (${err.message}). Try a smaller size or a lower frame rate.`
            : "Error: " + err;
      }
    } finally {
      abortController = null;
    }
  }

  /** For Run as Batch: the animation of the file that is open now. */
  export async function exportForBatch(
    signal: AbortSignal,
    onProgress: (fraction: number) => void,
  ): Promise<BatchOutput> {
    duration = animationController.getDuration();
    const options = { ...exportOptions(signal), onProgress };
    const blob =
      format === "gif"
        ? await exportPathToGif(options)
        : await exportPathToApng(options);
    return {
      suffix: `.${format === "gif" ? "gif" : "png"}`,
      data: blob,
    };
  }

  async function downloadAnimation() {
    if (!previewBlob) {
      await generatePreview();
    }

    if (!previewBlob) return;

    const ext = format === "gif" ? "gif" : "png";
    const label = format === "gif" ? "GIF" : "Animated PNG";

    const result = await saveBlob(previewBlob, `path.${ext}`, label);
    if (result === "cancelled") return;
    statusMessage = result === "saved" ? "Saved successfully!" : "Downloaded!";
    setTimeout(close, 2000);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  // ResizeObserver to track preview container size

  interface Props {
    show?: boolean;
    twoInstance: Two;
    animationController: AnimationController;
    settings: Settings;
    robotLengthPx: number;
    robotWidthPx: number;
    robotStateFunction: (percent: number) => {
      x: number;
      y: number;
      heading: number;
    };
    onclose?: () => void;
  }

  let {
    show = $bindable(false),
    twoInstance,
    animationController,
    settings,
    robotLengthPx,
    robotWidthPx,
    robotStateFunction,
    onclose,
  }: Props = $props();

  // GIF can't do the higher frame rates, so fall back to its fastest.
  $effect(() => {
    if (format === "gif" && fps > GIF_FPS.at(-1)) {
      fps = GIF_FPS.at(-1);
    }
  });

  // Measure the field view and animation each time the dialog opens.
  $effect(() => {
    if (!show) return;
    const rect = (
      twoInstance.renderer.domElement as unknown as SVGElement
    ).getBoundingClientRect();
    fieldW = rect.width;
    fieldH = rect.height;
    duration = animationController.getDuration();
  });

  // Rough GIF size, from encoding a sample frame. An APNG has no estimate:
  // its size depends on how much changes between frames. Waits a moment after
  // the last change and is cancelled if the settings change again or a
  // preview starts.
  $effect(() => {
    estimateBytes = null;
    estimating = false;
    // Read here, not in the timer below, so a change to any restarts this.
    fps;
    outWidth;
    duration;
    if (
      !show ||
      !fieldW ||
      format !== "gif" ||
      status === "generating" ||
      previewBlob
    )
      return;
    const ctrl = new AbortController();
    estimating = true;
    const timer = setTimeout(async () => {
      try {
        const bytes = await estimateGifSize(exportOptions(ctrl.signal));
        if (!ctrl.signal.aborted) estimateBytes = bytes;
      } catch (e) {
        // The estimate is a nicety; an aborted or failed one just goes away.
        console.warn("Size estimate failed", e);
      } finally {
        if (!ctrl.signal.aborted) estimating = false;
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  });

  $effect(() => {
    if (show) {
      // Create a dependency on these variables to invalidate preview when they change
      format;
      fps;
      outWidth;
      reduceColors;

      untrack(() => {
        // Only invalidate if we aren't currently generating.
        // If we ARE generating, the next preview will be fresh anyway.
        if (status !== "generating") {
          invalidatePreview();
        }
      });
    }
  });
  // Largest box of the export's aspect ratio that fits the preview area.
  let previewFit = $derived.by(() => {
    const k = Math.min(containerW / outWidth, containerH / outHeight);
    return {
      w: Math.max(0, Math.floor(outWidth * k)),
      h: Math.max(0, Math.floor(outHeight * k)),
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
  <div
    class="{ui.overlay} z-[100]"
    transition:scale={{
      duration: (globalThis as any).vitest === undefined ? 200 : 0,
      start: 0.95,
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-animation-title"
      class="{ui.dialog} w-full max-w-2xl flex flex-col max-h-[90vh]"
    >
      <!-- Header -->
      <div class={ui.dialogHeader}>
        <h2
          id="export-animation-title"
          class="text-xl font-semibold text-neutral-900 dark:text-neutral-100"
        >
          Export Animation
          <ExportFileLabel />
        </h2>
        <button
          title={$exportCycle ? "Skip this file" : "Close"}
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
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Format -->
          <div class="flex flex-col gap-2">
            <label
              for="anim-format"
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Format
            </label>
            <select
              id="anim-format"
              bind:value={format}
              disabled={status === "generating"}
              class="{ui.input} block w-full"
            >
              <option value="gif">GIF</option>
              <option value="apng">Animated PNG</option>
            </select>
          </div>

          <!-- FPS Control -->
          <div class="flex flex-col gap-2">
            <label
              for="gif-fps"
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Frame Rate
            </label>
            <select
              id="gif-fps"
              bind:value={fps}
              disabled={status === "generating"}
              class="{ui.input} block w-full"
            >
              {#each fpsOptions as option (option)}
                <option value={option}>{option} FPS</option>
              {/each}
            </select>
          </div>

          <ExportWidthSelect
            id="gif-scale"
            bind:value={outWidth}
            {aspect}
            disabled={status === "generating"}
          />

          <!-- Colors (APNG only; a GIF always has 256) -->
          {#if format === "apng"}
            <div class="flex flex-col gap-2">
              <span
                class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Colors
              </span>
              <label
                class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
              >
                <input
                  id="apng-reduce-colors"
                  type="checkbox"
                  bind:checked={reduceColors}
                  disabled={status === "generating"}
                  class="accent-emerald-600"
                />
                Reduce to 256 colors (smaller file)
              </label>
            </div>
          {/if}
        </div>

        <!-- Summary -->
        <div class="text-sm text-neutral-600 dark:text-neutral-400">
          <div data-testid="export-summary">
            {outWidth} × {outHeight} px · {fps} fps · {duration.toFixed(1)} s ·
            {frames} frames
          </div>
          <div data-testid="export-size">
            {#if previewBlob}
              Preview size: {formatBytes(previewBlob.size)}
            {:else if estimateBytes !== null}
              Estimated file size: ~{formatBytes(estimateBytes)}
            {:else if estimating}
              Estimating file size…
            {:else if format === "apng"}
              Exact file size is shown once the preview is made.
            {/if}
          </div>
        </div>

        {#if format === "apng" && memoryBytes >= MEMORY_WARN_BYTES}
          <div class={ui.alert.warning} role="alert">
            Building this needs about {formatBytes(memoryBytes)} of your computer's
            memory while it runs, so it may be slow or fail. The finished file is
            far smaller.
          </div>
        {/if}

        <!-- Info Blurb -->
        {#if format === "apng"}
          <div class={ui.alert.info}>
            <strong>Note:</strong> Animated PNGs support full 24-bit color and 8-bit
            transparency. However, they may not be supported by all web browsers and
            image viewers. Please ensure your target platform supports APNG before
            using this format.
          </div>
        {/if}

        <!-- Progress Bar -->
        {#if status === "generating"}
          <div class="flex flex-col gap-1">
            <div
              class="flex justify-between text-sm text-neutral-500 dark:text-neutral-400"
            >
              <span>{statusMessage}</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div
              class="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2.5"
            >
              <div
                class="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                style="width: {progress * 100}%"
              ></div>
            </div>
          </div>
        {:else if status === "error"}
          <div class="{ui.alert.danger} mb-4" role="alert">
            <span class="font-medium">Error!</span>
            {statusMessage}
          </div>
        {:else if status === "done"}
          <div class="{ui.alert.success} mb-4" role="alert">
            <span class="font-medium">Success!</span>
            {statusMessage}
          </div>
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
              alt="Animation Preview"
              class="shadow-sm"
              style="width: {previewFit.w}px; height: {previewFit.h}px; object-fit: contain;"
            />
          {:else}
            <div
              class="text-neutral-500 dark:text-neutral-400 flex flex-col items-center gap-2"
            >
              <PhotoIcon className="w-12 h-12" />
              <span>Preview will appear here</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div class="{ui.dialogFooter} justify-end">
        {#if $exportCycle}
          <ExportCycleActions
            exporter={exportForBatch}
            onclose={close}
            onaction={downloadAnimation}
            disabled={status === "generating"}
            >{previewUrl
              ? "Download / Save"
              : "Generate & Save"}</ExportCycleActions
          >
        {:else}
          <button class={ui.btn.ghost} onclick={handleCancel}> Cancel </button>

          <button
            class={ui.btn.secondary}
            onclick={generatePreview}
            disabled={status === "generating"}
          >
            {previewUrl ? "Regenerate Preview" : "Generate Preview"}
          </button>

          <button
            class={ui.btn.primary}
            onclick={downloadAnimation}
            disabled={status === "generating"}
          >
            {previewUrl ? "Download / Save" : "Generate & Save"}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
