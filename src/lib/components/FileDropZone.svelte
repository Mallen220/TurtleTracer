<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { get } from "svelte/store";
  import { isUnsaved } from "../../stores";
  import { handleExternalFileOpen } from "../../utils/fileHandlers";
  import { isSupportedProjectFileName } from "../../utils/fileExtensions";
  import { diskPathOf, getElectronAPI } from "../../utils/platform";
  import { CloudArrowDownIcon } from "./icons";

  interface Props {
    /** Saves the open project; resolves false if that failed or was cancelled. */
    saveBeforeContinuing: () => Promise<boolean>;
    /** Called after a dropped project has been opened. */
    onOpened: () => void;
  }

  let { saveBeforeContinuing, onOpened }: Props = $props();

  let isDraggingFile = $state(false);
  // dragenter/dragleave fire for every child element, so count them.
  let dragDepth = 0;

  const carriesFiles = (e: DragEvent) =>
    e.dataTransfer?.types?.includes("Files");

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    if (carriesFiles(e)) {
      dragDepth++;
      isDraggingFile = true;
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) isDraggingFile = false;
  }

  /** Asks what to do with unsaved changes. Returns false to abort opening. */
  async function resolveUnsavedChanges(): Promise<boolean> {
    if (!get(isUnsaved)) return true;

    const saveFirst = confirm(
      "You have unsaved changes. Press OK to save them before opening. Press Cancel to proceed without saving.",
    );
    if (saveFirst) return saveBeforeContinuing();

    return confirm(
      "This will discard your unsaved changes. Are you sure you want to open the new file?",
    );
  }

  async function handleDrop(e: DragEvent) {
    dragDepth = 0;
    isDraggingFile = false;

    // Leave internal drags (e.g. reordering) alone.
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer?.files[0];
    if (!file || !getElectronAPI()) return;

    if (!isSupportedProjectFileName(file.name)) {
      alert("Please drop a .turt or .pp file.");
      return;
    }

    const path = diskPathOf(file);
    if (!path) {
      alert(
        "Cannot determine file path. If you are running in a browser, this feature is not supported.",
      );
      return;
    }

    try {
      if (!(await resolveUnsavedChanges())) return;
      await handleExternalFileOpen(path);
      onOpened();
    } catch (err) {
      console.error("Error opening dropped file:", err);
      alert("Failed to open file: " + err);
    }
  }
</script>

<svelte:window
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondragover={(e) => e.preventDefault()}
  ondrop={handleDrop}
/>

{#if isDraggingFile}
  <div
    class="fixed inset-0 z-[100] bg-purple-500/20 border-4 border-purple-500 flex items-center justify-center pointer-events-none"
  >
    <div
      class="bg-white dark:bg-neutral-800 p-8 rounded-xl shadow-2xl flex flex-col items-center animate-bounce-slight"
    >
      <CloudArrowDownIcon
        className="h-16 w-16 text-purple-600 dark:text-purple-400 mb-4"
      />
      <h2 class="text-2xl font-bold mb-2 dark:text-white">Drop to Open</h2>
      <p class="text-neutral-500 dark:text-neutral-400">
        Release the file to open project
      </p>
    </div>
  </div>
{/if}
