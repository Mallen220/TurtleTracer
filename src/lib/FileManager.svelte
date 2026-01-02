<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts" context="module">
  declare global {
    interface Window {
      electronAPI: {
        getDirectory: () => Promise<string>;
        setDirectory: (path?: string) => Promise<string | null>;
        listFiles: (directory: string) => Promise<FileInfo[]>;
        readFile: (filePath: string) => Promise<string>;
        writeFile: (filePath: string, content: string) => Promise<boolean>;
        deleteFile: (filePath: string) => Promise<boolean>;
        fileExists: (filePath: string) => Promise<boolean>;
        getSavedDirectory: () => Promise<string>;
        createDirectory: (dirPath: string) => Promise<boolean>;
        getDirectoryStats: (dirPath: string) => Promise<any>;
        renameFile: (
          oldPath: string,
          newPath: string,
        ) => Promise<{ success: boolean; newPath: string }>;
      };
    }
  }
</script>

<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fade } from "svelte/transition";
  import { get } from "svelte/store";
  import type {
    FileInfo,
    Point,
    Line,
    Shape,
    SequenceItem,
    Settings,
  } from "../types";
  import { currentFilePath, isUnsaved, fileManagerSessionState } from "../stores";
  import { saveAutoPathsDirectory } from "../utils/directorySettings";

  import FileManagerToolbar from "./components/filemanager/FileManagerToolbar.svelte";
  import FileManagerBreadcrumbs from "./components/filemanager/FileManagerBreadcrumbs.svelte";
  import FileList from "./components/filemanager/FileList.svelte";
  import FileGrid from "./components/filemanager/FileGrid.svelte";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let shapes: Shape[];
  export let sequence: SequenceItem[];
  export let settings: Settings;

  // Initialize from session state
  const session = get(fileManagerSessionState);
  let sortMode: "name" | "date" = "name";
  let sortModeInitialized = false;
  let viewMode: "list" | "grid" = session.viewMode;
  let currentDirectory = "";
  let files: FileInfo[] = [];
  let filteredFiles: FileInfo[] = [];
  let loading = false;
  let selectedFile: FileInfo | null = null;
  let errorMessage = "";
  let searchQuery = session.searchQuery;

  // Renaming state
  let renamingFile: FileInfo | null = null;

  // New file state
  let creatingNewFile = false;
  let newFileName = "";

  const supportedFileTypes = [".pp"];
  const electronAPI = window.electronAPI;

  function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  // Load settings on mount
  onMount(() => {
    if (settings?.fileManagerSortMode) {
      sortMode = settings.fileManagerSortMode;
    }
    sortModeInitialized = true;
  });

  // Persist session state when changed
  $: fileManagerSessionState.set({ searchQuery, viewMode });

  // Sync sortMode to settings only after initialization
  $: if (sortModeInitialized && settings && sortMode) {
    if (settings.fileManagerSortMode !== sortMode) {
      settings.fileManagerSortMode = sortMode;
      // Force update if needed, though bind should handle it
      sortFiles();
    }
  }

  // Update filtered files whenever files or searchQuery changes
  $: {
    if (!searchQuery) {
      filteredFiles = [...files];
    } else {
      const q = searchQuery.toLowerCase();
      filteredFiles = files.filter((f) => f.name.toLowerCase().includes(q));
    }
  }

  // Normalize lines helper
  function normalizeLines(input: Line[] = []): Line[] {
    return (input || []).map((line) => ({
      ...line,
      id: line.id || `line-${Math.random().toString(36).slice(2)}`,
      waitBeforeMs: Math.max(
        0,
        Number(line.waitBeforeMs ?? (line as any).waitBefore?.durationMs ?? 0),
      ),
      waitAfterMs: Math.max(
        0,
        Number(line.waitAfterMs ?? (line as any).waitAfter?.durationMs ?? 0),
      ),
      waitBeforeName:
        line.waitBeforeName ?? (line as any).waitBefore?.name ?? "",
      waitAfterName: line.waitAfterName ?? (line as any).waitAfter?.name ?? "",
    }));
  }

  function deriveSequence(data: any, normalizedLines: Line[]): SequenceItem[] {
    if (Array.isArray(data?.sequence) && data.sequence.length) {
      return data.sequence as SequenceItem[];
    }
    return normalizedLines.map((ln) => ({
      kind: "path",
      lineId: ln.id!,
    }));
  }

  async function loadDirectory() {
    loading = true;
    errorMessage = "";
    try {
      const savedDir = await electronAPI.getSavedDirectory();
      if (savedDir && savedDir.trim() !== "") {
        currentDirectory = savedDir;
      } else {
        currentDirectory = await electronAPI.getDirectory();
      }
      await refreshDirectory();
    } catch (error) {
      console.error("Error loading directory:", error);
      errorMessage = `Failed to load directory: ${getErrorMessage(error)}`;
    } finally {
      loading = false;
    }
  }

  async function refreshDirectory() {
    if (!currentDirectory || currentDirectory.trim() === "") return;

    try {
      const allFiles = await electronAPI.listFiles(currentDirectory);
      files = allFiles
        .map((file) => ({
          ...file,
          error: supportedFileTypes.includes(
            path.extname(file.name).toLowerCase(),
          )
            ? undefined
            : `Unsupported type`,
        }))
        .filter((file) =>
          supportedFileTypes.includes(path.extname(file.name).toLowerCase()),
        );

      sortFiles();
      errorMessage = "";
    } catch (error) {
      console.error("Error refreshing directory:", error);
      errorMessage = `Error accessing directory: ${getErrorMessage(error)}`;
      files = [];
    }
  }

  function sortFiles() {
    if (sortMode === "name") {
      files.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "date") {
      files.sort(
        (a, b) =>
          new Date(b.modified).getTime() - new Date(a.modified).getTime(),
      );
    }
    files = files; // trigger update
  }

  $: if (sortMode) {
    sortFiles();
  }

  // Handle directory change (dialog)
  async function changeDirectoryDialog() {
    try {
      const newDir = await electronAPI.setDirectory();
      if (newDir) {
        currentDirectory = newDir;
        await saveAutoPathsDirectory(newDir);
        await refreshDirectory();
        showToast(`Directory changed to: ${path.basename(newDir)}`, "success");
      }
    } catch (error) {
      errorMessage = `Failed to change directory: ${getErrorMessage(error)}`;
    }
  }

  // Handle directory change (manual input)
  async function changeDirectoryManual(e: CustomEvent<string>) {
     const newDir = e.detail;
     if (!newDir) return;

     try {
       // Ideally we verify if it exists first, but `listFiles` will fail if not
       // Or we can try to save it directly.
       // NOTE: `setDirectory` normally opens a dialog, so we can't use it for direct set if it doesn't take args.
       // However, `saveAutoPathsDirectory` saves to store.
       // Let's try to verify via listFiles or check directory existence if API allows.

       // Assuming user knows what they are doing or we catch error
       currentDirectory = newDir;
       await saveAutoPathsDirectory(newDir);
       await refreshDirectory();

       if (errorMessage) {
          // If refresh failed, revert? Or just show error?
          // Keeping error is fine.
       } else {
         showToast(`Directory changed`, "success");
       }
     } catch (err) {
        errorMessage = `Failed to change directory: ${getErrorMessage(err)}`;
     }
  }

  // File Operations
  async function renameFile(file: FileInfo, newName: string) {
    renamingFile = null;
    const cleanName = newName.trim();
    if (!cleanName) return;

    const fileName = cleanName.endsWith(".pp") ? cleanName : cleanName + ".pp";
    if (fileName === file.name) return;

    const newFilePath = path.join(currentDirectory, fileName);

    try {
      if (await electronAPI.fileExists(newFilePath)) {
        showToast(`File "${fileName}" already exists`, "error");
        return;
      }

      const result = await electronAPI.renameFile(file.path, newFilePath);
      if (result.success) {
        if (selectedFile?.path === file.path) {
          selectedFile = { ...selectedFile, name: fileName, path: newFilePath };
          currentFilePath.set(newFilePath);
        }
        showToast(`Renamed to: ${fileName}`, "success");
        await refreshDirectory();
      }
    } catch (error) {
      showToast(`Failed to rename: ${getErrorMessage(error)}`, "error");
    }
  }

  async function loadFile(file: FileInfo) {
    if (file.error) return;
    try {
      const content = await electronAPI.readFile(file.path);
      const data = JSON.parse(content);

      if (!data.startPoint || !data.lines)
        throw new Error("Invalid file format");

      startPoint = data.startPoint;
      lines = normalizeLines(data.lines || []);
      shapes = data.shapes || [];
      sequence = deriveSequence(data, lines);

      currentFilePath.set(file.path);
      isUnsaved.set(false);
      selectedFile = file;
      showToast(`Loaded: ${file.name}`, "success");
    } catch (error) {
      showToast(`Error loading file: ${getErrorMessage(error)}`, "error");
    }
  }

  async function saveCurrentToFile(targetFile: FileInfo) {
    try {
      const content = JSON.stringify(
        {
          startPoint,
          lines,
          shapes,
          sequence,
          version: "1.2.1",
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      );

      await electronAPI.writeFile(targetFile.path, content);
      await refreshDirectory();
      isUnsaved.set(false);
      showToast(`Saved to: ${targetFile.name}`, "success");
    } catch (error) {
      showToast(`Failed to save: ${getErrorMessage(error)}`, "error");
    }
  }

  async function createNewFile(name: string) {
    if (!name.trim()) return;

    const fileName = name.endsWith(".pp") ? name : name + ".pp";
    const filePath = path.join(currentDirectory, fileName);

    try {
      if (await electronAPI.fileExists(filePath)) {
        if (!confirm(`File "${fileName}" already exists. Overwrite?`)) return;
      }

      const content = JSON.stringify(
        {
          startPoint,
          lines: normalizeLines(lines),
          shapes,
          sequence,
          version: "1.2.1",
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      );

      await electronAPI.writeFile(filePath, content);
      creatingNewFile = false;
      newFileName = "";
      await refreshDirectory();

      const newFile = files.find((f) => f.name === fileName);
      if (newFile) {
        selectedFile = newFile;
        currentFilePath.set(newFile.path);
        isUnsaved.set(false);
        showToast(`Created: ${fileName}`, "success");
      }
    } catch (error) {
      showToast(`Failed to create: ${getErrorMessage(error)}`, "error");
    }
  }

  async function deleteFile(file: FileInfo) {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return;
    try {
      await electronAPI.deleteFile(file.path);
      if (selectedFile?.path === file.path) {
        selectedFile = null;
        currentFilePath.set(null);
      }
      await refreshDirectory();
      showToast(`Deleted: ${file.name}`, "success");
    } catch (error) {
      showToast(`Failed to delete: ${getErrorMessage(error)}`, "error");
    }
  }

  async function duplicateFile(file: FileInfo, mirror = false) {
    try {
      const content = await electronAPI.readFile(file.path);
      const data = JSON.parse(content);

      if (mirror) {
        // Mirror logic would go here, reuse existing logic
        // For brevity, assuming existing mirrorPathData function is available or we recreate it
        const mirrored = mirrorPathData(data);
        data.lines = mirrored.lines;
        data.startPoint = mirrored.startPoint;
        data.shapes = mirrored.shapes;
      }

      const baseName = file.name.replace(/\.pp$/, "");
      const suffix = mirror ? "_mirrored" : "_copy";
      let newName = `${baseName}${suffix}.pp`;
      let counter = 1;

      while (
        await electronAPI.fileExists(path.join(currentDirectory, newName))
      ) {
        newName = `${baseName}${suffix}${counter}.pp`;
        counter++;
      }

      await electronAPI.writeFile(
        path.join(currentDirectory, newName),
        JSON.stringify(data, null, 2),
      );
      await refreshDirectory();
      showToast(`${mirror ? "Mirrored" : "Duplicated"}: ${newName}`, "success");
    } catch (error) {
      showToast(`Failed to duplicate: ${getErrorMessage(error)}`, "error");
    }
  }

  // --- Mirror Logic Helpers (re-implemented efficiently) ---
  function mirrorPointHeading(point: Point): Point {
    if (point.heading === "linear")
      return {
        ...point,
        startDeg: 180 - point.startDeg,
        endDeg: 180 - point.endDeg,
      };
    if (point.heading === "constant")
      return { ...point, degrees: 180 - point.degrees };
    // Tangential reverse flag stays same
    return point;
  }

  function mirrorPathData(data: any) {
    const m = JSON.parse(JSON.stringify(data));
    if (m.startPoint) {
      m.startPoint.x = 144 - m.startPoint.x;
      m.startPoint = mirrorPointHeading(m.startPoint);
    }
    if (m.lines) {
      m.lines.forEach((line: any) => {
        if (line.endPoint) {
          line.endPoint.x = 144 - line.endPoint.x;
          line.endPoint = mirrorPointHeading(line.endPoint);
        }
        if (line.controlPoints) {
          line.controlPoints.forEach((cp: any) => (cp.x = 144 - cp.x));
        }
      });
    }
    if (m.shapes) {
      m.shapes.forEach((s: any) =>
        s.vertices?.forEach((v: any) => (v.x = 144 - v.x)),
      );
    }
    return m;
  }

  // ---

  function showToast(
    message: string,
    type: "success" | "error" | "warning" | "info" = "info",
  ) {
    // Standard toast logic
    const toast = document.createElement("div");
    toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg z-[1300] ${
      type === "success"
        ? "bg-green-500 text-white"
        : type === "error"
          ? "bg-red-500 text-white"
          : "bg-blue-500 text-white"
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Event handlers for child components
  function handleMenuAction(
    e: CustomEvent<{ action: string; file: FileInfo }>,
  ) {
    const { action, file } = e.detail;
    switch (action) {
      case "open":
        loadFile(file);
        break;
      case "rename-start":
        renamingFile = file;
        break;
      case "delete":
        deleteFile(file);
        break;
      case "duplicate":
        duplicateFile(file, false);
        break;
      case "mirror":
        duplicateFile(file, true);
        break;
      case "save-to":
        saveCurrentToFile(file);
        break;
    }
  }

  onMount(() => {
    loadDirectory();
  });

  // Mock path utils
  const path = {
    join: (...parts: string[]) => parts.join("/"),
    basename: (p: string) => p.split(/[\\/]/).pop() || "",
    extname: (p: string) => {
      const m = p.match(/\.[^/.]+$/);
      return m ? m[0] : "";
    },
  };
</script>

<div class="fixed inset-0 z-[1010] flex" class:pointer-events-none={!isOpen}>
  <!-- Backdrop -->
  {#if isOpen}
    <div
      transition:fade={{ duration: 200 }}
      class="fixed inset-0 bg-black/50 backdrop-blur-sm"
      on:click={() => (isOpen = false)}
      role="button"
      tabindex="0"
      aria-label="Close file manager"
      on:keydown={(e) => {
        if (e.key === "Escape") isOpen = false;
      }}
    />
  {/if}

  <!-- Sidebar -->
  <div
    class="relative flex flex-col w-full max-w-sm h-full bg-white dark:bg-neutral-900 shadow-2xl transform transition-transform duration-300 ease-in-out border-r border-neutral-200 dark:border-neutral-800"
    class:translate-x-0={isOpen}
    class:-translate-x-full={!isOpen}
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 z-20"
    >
      <h2
        class="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-5 text-blue-500"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
          />
        </svg>
        Files
      </h2>
      <button
        on:click={() => (isOpen = false)}
        class="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        aria-label="Close"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6 18 18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <!-- Toolbar -->
    <FileManagerToolbar
      {searchQuery}
      {sortMode}
      {viewMode}
      on:search={(e) => (searchQuery = e.detail)}
      on:sort-change={(e) => (sortMode = e.detail)}
      on:view-change={(e) => (viewMode = e.detail)}
      on:refresh={refreshDirectory}
      on:change-dir={changeDirectoryDialog}
      on:new-file={() => (creatingNewFile = true)}
    />

    <!-- Breadcrumbs -->
    <FileManagerBreadcrumbs
      currentPath={currentDirectory}
      on:change-dir={changeDirectoryManual}
    />

    <!-- Error Display -->
    {#if errorMessage}
      <div
        class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400 border-b border-red-100 dark:border-red-900/30"
      >
        {errorMessage}
      </div>
    {/if}

    <!-- New File Input -->
    {#if creatingNewFile}
      <div
        class="p-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700"
      >
        <div class="text-xs font-medium text-neutral-500 mb-1">
          New File Name
        </div>
        <input
          bind:value={newFileName}
          class="w-full px-2 py-1.5 text-sm border border-blue-400 rounded focus:outline-none bg-white dark:bg-neutral-700 mb-2"
          placeholder="path_name.pp"
          autoFocus
          on:keydown={(e) => {
            if (e.key === "Enter") createNewFile(newFileName);
            if (e.key === "Escape") creatingNewFile = false;
          }}
        />
        <div class="flex gap-2">
          <button
            class="flex-1 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
            on:click={() => createNewFile(newFileName)}>Create</button
          >
          <button
            class="flex-1 py-1 text-xs bg-neutral-400 text-white rounded hover:bg-neutral-500"
            on:click={() => (creatingNewFile = false)}>Cancel</button
          >
        </div>
      </div>
    {/if}

    <!-- File List / Grid -->
    {#if loading}
      <div
        class="flex-1 flex items-center justify-center text-neutral-400 text-sm"
      >
        Loading...
      </div>
    {:else if filteredFiles.length === 0}
      <div
        class="flex-1 flex flex-col items-center justify-center text-neutral-400 p-8 text-center"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1"
          stroke="currentColor"
          class="size-12 mb-2 opacity-30"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
          />
        </svg>
        <p class="text-sm">No files found</p>
        {#if searchQuery}
          <button
            class="text-xs text-blue-500 mt-2 hover:underline"
            on:click={() => (searchQuery = "")}>Clear search</button
          >
        {:else}
          <button
            class="text-xs text-blue-500 mt-2 hover:underline"
            on:click={() => (creatingNewFile = true)}>Create a new file</button
          >
        {/if}
      </div>
    {:else}
      {#if viewMode === 'list'}
        <FileList
          files={filteredFiles}
          selectedFilePath={selectedFile?.path ?? null}
          {sortMode}
          {renamingFile}
          on:select={(e) => (selectedFile = e.detail)}
          on:open={(e) => loadFile(e.detail)}
          on:rename-save={(e) =>
            renamingFile && renameFile(renamingFile, e.detail)}
          on:rename-cancel={() => (renamingFile = null)}
          on:menu-action={handleMenuAction}
        />
      {:else}
        <FileGrid
           files={filteredFiles}
           selectedFilePath={selectedFile?.path ?? null}
           {sortMode}
           on:select={(e) => (selectedFile = e.detail)}
           on:open={(e) => loadFile(e.detail)}
           on:menu-action={handleMenuAction}
        />
      {/if}
    {/if}

    <!-- Footer Status -->
    <div
      class="p-2 text-xs text-neutral-400 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex justify-between"
    >
      <span
        >{filteredFiles.length} file{filteredFiles.length !== 1
          ? "s"
          : ""}</span
      >
      {#if selectedFile}
        <span class="truncate max-w-[150px]">{selectedFile.name}</span>
      {/if}
    </div>
  </div>
</div>
