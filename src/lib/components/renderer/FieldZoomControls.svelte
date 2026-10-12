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
  import { ui } from "../../ui";

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
      class="absolute bottom-2 right-2 flex flex-col gap-1 z-30 bg-white/80 dark:bg-neutral-800/80 p-1 rounded-md shadow-sm border border-neutral-200 dark:border-neutral-700"
    >
      {#if isDirty}
        <button
          class="{isDiffMode
            ? ui.iconBtnSm.active
            : ui.iconBtnSm.neutral} w-7 h-7"
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
          class="{ui.iconBtnSm.neutral} w-7 h-7"
          onclick={onZoomIn}
          aria-label="Zoom in"
          title="Zoom In (Cmd/Ctrl + +)"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
        <button
          class="{ui.iconBtnSm.neutral} w-7 h-7"
          onclick={onZoomOut}
          aria-label="Zoom out"
          title="Zoom Out (Cmd/Ctrl + -)"
        >
          <MinusIcon className="w-4 h-4" />
        </button>
        <button
          class="{ui.iconBtnSm.neutral} w-7 h-7"
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
      class="flex flex-col gap-1 bg-white/90 dark:bg-neutral-800/90 p-1.5 rounded-md shadow-lg border border-neutral-200 dark:border-neutral-700"
    >
      {#if !lockFieldView}
        <button
          class="{ui.iconBtnSm.neutral} w-8 h-8"
          onclick={onZoomIn}
          aria-label="Zoom in"
          title="Zoom In"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
        <button
          class="{ui.iconBtnSm.neutral} w-8 h-8"
          onclick={onZoomOut}
          aria-label="Zoom out"
          title="Zoom Out"
        >
          <MinusIcon className="w-5 h-5" />
        </button>
        <button
          class="{ui.iconBtnSm.neutral} w-8 h-8"
          onclick={onResetZoom}
          aria-label="Reset zoom"
          title="Reset Zoom"
        >
          <ResetZoomIcon className="w-5 h-5" />
        </button>
        <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-0.5"></div>
      {/if}
      <button
        class="{ui.iconBtnSm.danger} w-8 h-8"
        onclick={onExitPresentation}
        aria-label="Exit Presentation Mode"
        title="Exit Presentation Mode (Alt+P)"
      >
        <ExitPresentationModeIcon className="w-5 h-5" />
      </button>
    </div>
  </div>
{/if}
