<!-- src/lib/components/filemanager/FileManagerBreadcrumbs.svelte -->
<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";

  export let currentPath: string;

  const dispatch = createEventDispatcher<{
    "change-dir": string;
  }>();

  let isEditing = false;
  let inputPath = "";
  let inputElement: HTMLInputElement;

  // Format path for display - tries to be smart about common paths
  function formatPath(pathStr: string): string {
    if (!pathStr) return "";

    // Handle home directory alias
    const home = process.env.HOME || "~";
    if (pathStr.startsWith(home)) {
      pathStr = "~" + pathStr.substring(home.length);
    }

    // Handle specific project markers like "AutoPaths" or "GitHub"
    // This makes deep paths more readable
    const markers = ["AutoPaths", "GitHub", "Documents"];
    for (const marker of markers) {
      const idx = pathStr.indexOf(marker);
      if (idx !== -1) {
        // Keep the marker and everything after
        return "..." + pathStr.substring(idx - 1); // include the slash before marker
      }
    }

    return pathStr;
  }

  async function startEditing() {
    isEditing = true;
    inputPath = currentPath;
    await tick();
    if (inputElement) {
      inputElement.select();
    }
  }

  function finishEditing() {
    if (!isEditing) return;
    isEditing = false;
    if (inputPath !== currentPath && inputPath.trim() !== "") {
      dispatch("change-dir", inputPath.trim());
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      finishEditing();
    } else if (e.key === "Escape") {
      isEditing = false;
    }
  }
</script>

{#if isEditing}
  <div class="px-2 py-1 bg-white dark:bg-neutral-900 border-b border-blue-500">
    <input
      bind:this={inputElement}
      bind:value={inputPath}
      on:blur={finishEditing}
      on:keydown={handleKeydown}
      class="w-full text-xs font-mono bg-transparent border-none focus:outline-none focus:ring-0 p-1 text-neutral-900 dark:text-neutral-100"
    />
  </div>
{:else}
  <div
    class="px-4 py-2 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate cursor-text hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
    title="Click to edit path"
    on:click={startEditing}
    role="button"
    tabindex="0"
    on:keydown={(e) => e.key === "Enter" && startEditing()}
  >
    {formatPath(currentPath)}
  </div>
{/if}
