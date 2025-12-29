<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { scale } from "svelte/transition";
  import type { ExportGifOptions } from "../../utils/exportGif";
  import { exportPathToGif } from "../../utils/exportGif";

  export let show = false;
  export let twoInstance: any;
  export let animationController: any;
  export let settings: any;
  export let robotLengthPx: number;
  export let robotWidthPx: number;
  export let robotStateFunction: (percent: number) => {
    x: number;
    y: number;
    heading: number;
  };
  export let electronAPI: any;

  const dispatch = createEventDispatcher();

  let fps = 15;
  let resolutionScale = 0.5; // Default 50%
  let quality = 10; // 1-30, default 10 (good balance)
  let status = "idle"; // idle, generating, done, error
  let progress = 0;
  let statusMessage = "";
  let previewBlob: Blob | null = null;
  let previewUrl: string | null = null;

  function close() {
    if (status === "generating") return;
    show = false;
    // Clean up
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    previewBlob = null;
    status = "idle";
    progress = 0;
    dispatch("close");
  }

  async function generatePreview() {
    if (status === "generating") return;
    status = "generating";
    progress = 0;
    statusMessage = "Capturing frames...";
    previewBlob = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;

    try {
      const blob = await exportPathToGif({
        two: twoInstance,
        animationController,
        durationSec: animationController.getDuration(),
        fps: fps,
        scale: resolutionScale,
        quality: quality,
        backgroundImageSrc: settings.fieldMap
          ? `/fields/${settings.fieldMap}`
          : "/fields/decode.webp",
        robotImageSrc: settings.robotImage || "/robot.png",
        robotLengthPx: robotLengthPx,
        robotWidthPx: robotWidthPx,
        getRobotState: robotStateFunction,
        onProgress: (p) => {
          progress = p;
          if (p < 0.5)
            statusMessage = `Capturing frames... ${Math.round(p * 200)}%`;
          else
            statusMessage = `Encoding GIF... ${Math.round((p - 0.5) * 200)}%`;
        },
      });

      previewBlob = blob;
      previewUrl = URL.createObjectURL(blob);
      status = "done";
      statusMessage = "Preview ready!";
    } catch (err) {
      console.error(err);
      status = "error";
      statusMessage = "Error: " + err;
    }
  }

  async function downloadGif() {
    if (!previewBlob) {
      await generatePreview();
    }

    if (!previewBlob) return;

    if (
      electronAPI &&
      electronAPI.showSaveDialog &&
      electronAPI.writeFileBase64
    ) {
      const dest = await electronAPI.showSaveDialog({
        defaultPath: "path.gif",
        filters: [{ name: "GIF", extensions: ["gif"] }],
      });
      if (dest) {
        const reader = new FileReader();
        reader.onload = async () => {
          const b64 = (reader.result as string).split(",")[1];
          await electronAPI.writeFileBase64!(dest, b64);
          statusMessage = "Saved successfully!";
          // Optionally close after saving?
          setTimeout(close, 2000);
        };
        reader.readAsDataURL(previewBlob);
      }
    } else {
      const a = document.createElement("a");
      a.href = previewUrl!;
      a.download = "path.gif";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      statusMessage = "Downloaded!";
      setTimeout(close, 2000);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
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
          Export GIF
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
      <div class="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
        <!-- Controls Row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- FPS Control -->
          <div class="flex flex-col gap-2">
            <label
              for="gif-fps"
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Frame Rate (FPS): {fps}
            </label>
            <input
              id="gif-fps"
              type="range"
              min="5"
              max="60"
              step="1"
              bind:value={fps}
              disabled={status === "generating"}
              class="w-full accent-purple-600"
            />
          </div>

          <!-- Resolution Scale -->
          <div class="flex flex-col gap-2">
            <label
              for="gif-scale"
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Scale: {Math.round(resolutionScale * 100)}%
            </label>
            <select
              id="gif-scale"
              bind:value={resolutionScale}
              disabled={status === "generating"}
              class="bg-neutral-100 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block w-full p-2.5"
            >
              <option value={0.25}>25% (Smallest)</option>
              <option value={0.5}>50% (Recommended)</option>
              <option value={0.75}>75%</option>
              <option value={1.0}>100% (Original)</option>
              <option value={1.5}>150% (High Res)</option>
            </select>
          </div>

          <!-- Quality -->
          <div class="flex flex-col gap-2">
            <label
              for="gif-quality"
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Quality: {quality <= 5
                ? "Best"
                : quality <= 15
                  ? "Good"
                  : "Draft"}
            </label>
            <input
              id="gif-quality"
              type="range"
              min="1"
              max="30"
              step="1"
              bind:value={quality}
              disabled={status === "generating"}
              class="w-full accent-purple-600 dir-rtl"
              title="Lower is better quality"
            />
            <div
              class="text-xs text-neutral-500 dark:text-neutral-400 flex justify-between"
            >
              <span>Best (Slower)</span>
              <span>Draft (Faster)</span>
            </div>
          </div>
        </div>

        <!-- Progress Bar -->
        {#if status === "generating"}
          <div class="flex flex-col gap-1">
            <div
              class="flex justify-between text-sm text-neutral-600 dark:text-neutral-400"
            >
              <span>{statusMessage}</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div
              class="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2.5"
            >
              <div
                class="bg-purple-600 h-2.5 rounded-full transition-all duration-300"
                style="width: {progress * 100}%"
              ></div>
            </div>
          </div>
        {:else if status === "error"}
          <div
            class="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400"
            role="alert"
          >
            <span class="font-medium">Error!</span>
            {statusMessage}
          </div>
        {:else if status === "done"}
          <div
            class="p-4 mb-4 text-sm text-green-800 rounded-lg bg-green-50 dark:bg-gray-800 dark:text-green-400"
            role="alert"
          >
            <span class="font-medium">Success!</span>
            {statusMessage}
          </div>
        {/if}

        <!-- Preview Area -->
        <div
          class="flex-1 min-h-[200px] flex items-center justify-center bg-neutral-100 dark:bg-neutral-900 rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden relative p-2"
        >
          {#if previewUrl}
            <img
              src={previewUrl}
              alt="GIF Preview"
              class="max-w-full max-h-[40vh] object-contain shadow-sm"
            />
          {:else}
            <div
              class="text-neutral-400 dark:text-neutral-500 flex flex-col items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="w-12 h-12"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
              </svg>
              <span>Preview will appear here</span>
            </div>
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
          disabled={status === "generating"}
        >
          Cancel
        </button>

        <button
          class="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          on:click={generatePreview}
          disabled={status === "generating"}
        >
          {previewUrl ? "Regenerate Preview" : "Generate Preview"}
        </button>

        <button
          class="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          on:click={downloadGif}
          disabled={status === "generating" || !previewUrl}
        >
          Download / Save
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Reverse range input for quality (lower is better) */
  /* Note: input[type=range] direction can be tricky, relying on label instead */
</style>
