<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import {
    SpinnerIcon,
    DocumentIcon,
    PlusIcon,
    MinusIcon,
    ResetZoomIcon,
    ExitPresentationModeIcon,
  } from "../icons";

  interface Props {
    isPresentationMode?: boolean;
    isDirty?: boolean;
    isDiffMode?: boolean;
    isLoadingDiff?: boolean;
    lockFieldView?: boolean;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetZoom: () => void;
    onToggleDiff: () => void;
    onExitPresentation: () => void;
  }

  let {
    isPresentationMode = false,
    isDirty = false,
    isDiffMode = false,
    isLoadingDiff = false,
    lockFieldView = false,
    onZoomIn,
    onZoomOut,
    onResetZoom,
    onToggleDiff,
    onExitPresentation,
  }: Props = $props();
</script>

{#if !isPresentationMode}
  {#if isDirty || !lockFieldView}
    <!-- Zoom Controls -->
    <div
      class="absolute bottom-2 right-2 flex flex-col gap-1 z-30 bg-white/80 dark:bg-neutral-800/80 p-1 rounded-md shadow-sm border border-neutral-200 dark:border-neutral-700 backdrop-blur-sm"
    >
      {#if isDirty}
        <button
          class="w-7 h-7 flex items-center justify-center rounded transition-colors {isDiffMode
            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50'
            : 'hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200'}"
          onclick={onToggleDiff}
          aria-label={isDiffMode ? "Exit Visual Diff" : "Toggle Visual Diff"}
          title={isDiffMode ? "Exit Diff Mode" : "Compare with Saved"}
        >
          {#if isLoadingDiff}
            <SpinnerIcon className="animate-spin w-4 h-4" />
          {:else}
            <DocumentIcon className="w-4 h-4" />
          {/if}
        </button>
        {#if !lockFieldView}
          <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-0.5"></div>
        {/if}
      {/if}
      {#if !lockFieldView}
        <button
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
          onclick={onZoomIn}
          aria-label="Zoom in"
          title="Zoom In (Cmd/Ctrl + +)"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
        <button
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
          onclick={onZoomOut}
          aria-label="Zoom out"
          title="Zoom Out (Cmd/Ctrl + -)"
        >
          <MinusIcon className="w-4 h-4" />
        </button>
        <button
          class="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
          onclick={onResetZoom}
          aria-label="Reset zoom"
          title="Reset Zoom (Cmd/Ctrl + 0)"
        >
          <ResetZoomIcon className="w-4 h-4" />
        </button>
      {/if}
    </div>
  {/if}
{:else}
  <!-- Presentation Mode Controls (Hover to show) -->
  <div
    class="absolute bottom-4 right-4 flex flex-col items-end gap-2 z-50 opacity-0 hover:opacity-100 transition-opacity duration-300"
  >
    <div
      class="flex flex-col gap-1 bg-white/90 dark:bg-neutral-800/90 p-1.5 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 backdrop-blur-sm"
    >
      {#if !lockFieldView}
        <button
          class="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
          onclick={onZoomIn}
          aria-label="Zoom in"
          title="Zoom In"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
        <button
          class="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
          onclick={onZoomOut}
          aria-label="Zoom out"
          title="Zoom Out"
        >
          <MinusIcon className="w-5 h-5" />
        </button>
        <button
          class="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition-colors"
          onclick={onResetZoom}
          aria-label="Reset zoom"
          title="Reset Zoom"
        >
          <ResetZoomIcon className="w-5 h-5" />
        </button>
        <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-0.5"></div>
      {/if}
      <button
        class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
        onclick={onExitPresentation}
        aria-label="Exit Presentation Mode"
        title="Exit Presentation Mode (Alt+P)"
      >
        <ExitPresentationModeIcon className="w-5 h-5" />
      </button>
    </div>
  </div>
{/if}
