<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { currentFilePath, isUnsaved } from "../../stores";
  import { loadProjectData } from "../projectStore";
  import { handleExternalFileOpen } from "../../utils/fileHandlers";
  import { isSupportedProjectFileName } from "../../utils/fileExtensions";
  import { diskPathOf, getElectronAPI } from "../../utils/platform";
  import { CloudArrowDownIcon } from "./icons";
  import { ui } from "../ui";

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

  // Where the desktop app reports file drags itself (with the files' paths),
  // the page's own drag events never carry files.
  onMount(() =>
    getElectronAPI()?.onFileDrag?.(({ type, paths }) => {
      if (type === "enter") isDraggingFile = true;
      else if (type === "leave") isDraggingFile = false;
      else if (type === "drop") {
        isDraggingFile = false;
        if (paths[0]) void openDropped(paths[0]);
      }
    }),
  );

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
    if (path) {
      await openDropped(path);
      return;
    }

    // No path (the Windows desktop app): open the contents as a new,
    // unsaved project, so saving asks where it goes.
    try {
      const data = JSON.parse(await file.text());
      if (!(await resolveUnsavedChanges())) return;
      currentFilePath.set(null);
      await loadProjectData(data);
      isUnsaved.set(true);
      onOpened();
    } catch (err) {
      console.error("Error opening dropped file:", err);
      alert("Failed to open file: " + err);
    }
  }

  async function openDropped(path: string) {
    if (!isSupportedProjectFileName(path)) {
      alert("Please drop a .turt or .pp file.");
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
    class="fixed inset-0 z-[100] bg-emerald-500/20 border-4 border-emerald-500 flex items-center justify-center pointer-events-none"
  >
    <div
      class="{ui.popover} p-8 flex flex-col items-center animate-bounce-slight"
    >
      <CloudArrowDownIcon
        className="h-16 w-16 text-emerald-600 dark:text-emerald-400 mb-4"
      />
      <h2 class="text-2xl font-bold mb-2 dark:text-white">Drop to Open</h2>
      <p class="text-neutral-500 dark:text-neutral-400">
        Release the file to open project
      </p>
    </div>
  </div>
{/if}
