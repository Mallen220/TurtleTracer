<!-- src/lib/components/filemanager/FileManagerBreadcrumbs.svelte -->
<script lang="ts">
  export let currentPath: string;

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
</script>

<div
  class="px-4 py-2 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700 text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate select-all"
  title={currentPath}
>
  {formatPath(currentPath)}
</div>
