<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import type { FileInfo, Settings } from "../../../types/index";
  import { fileManagerSessionState, currentDirectoryStore, gitStatusStore, showProjectBrowser, showSettings, showFeedbackDialog } from "../../../stores";
  import { get } from "svelte/store";
  import FileGrid from "../filemanager/FileGrid.svelte";
  import FileList from "../filemanager/FileList.svelte";
  import FileManagerToolbar from "../filemanager/FileManagerToolbar.svelte";
  import FileManagerBreadcrumbs from "../filemanager/FileManagerBreadcrumbs.svelte";
  import LoadingSpinner from "../common/LoadingSpinner.svelte";
  import { scanEventsInDirectory } from "../../../utils/eventScanner";
  import { saveAutoPathsDirectory } from "../../../utils/directorySettings";
  import { hookRegistry } from "../../registries";
  import GlobalEventManager from "./GlobalEventManager.svelte";

  export let settings: Settings;

  const dispatch = createEventDispatcher();

  const electronAPI = window.electronAPI;
  const supportedFileTypes = [".pp"];

  const session = get(fileManagerSessionState);
  let pathsSortMode: "name" | "date" = session.pathsSortMode ?? "date";
  let pathsViewMode: "list" | "grid" = session.pathsViewMode ?? "grid";
  let pathsSearchQuery = session.pathsSearchQuery ?? "";

  let autosSortMode: "name" | "date" = session.autosSortMode ?? "date";
  let autosViewMode: "list" | "grid" = session.autosViewMode ?? "grid";
  let autosSearchQuery = session.autosSearchQuery ?? "";

  let leftPaneWidth = session.leftPaneWidth ?? 50;
  
  let isResizing = false;

  function handleResizeMouseUp() {
      if(isResizing) {
          isResizing = false;
          window.removeEventListener('mousemove', handleResizeMouseMove);
          window.removeEventListener('mouseup', handleResizeMouseUp);
      }
  }

  function handleResizeMouseMove(e: MouseEvent) {
      if(!isResizing) return;
      const pct = (e.clientX / window.innerWidth) * 100;
      if(pct > 15 && pct < 85) {
          leftPaneWidth = pct;
      }
  }

  let currentDirectory = "";
  let baseDirectory = "";
  let files: FileInfo[] = [];
  let pathsFiltered: FileInfo[] = [];
  let autosFiltered: FileInfo[] = [];
  let loading = false;
  let errorMessage = "";
  let renamingFile: FileInfo | null = null;
  let selectedFile: FileInfo | null = null;
  
  let fileGridPaths: any;
  let fileListPaths: any;
  let fileGridAutos: any;
  let fileListAutos: any;

  let creatingNewFilePaths = false;
  let newFileNamePaths = "";
  let creatingNewFolderPaths = false;
  let newFolderNamePaths = "";

  let creatingNewFileAutos = false;
  let newFileNameAutos = "";
  let creatingNewFolderAutos = false;
  let newFolderNameAutos = "";
  
  let showGlobalEvents = false;

  import { fileManagerNewFileMode } from "../../../stores";

  $: if ($fileManagerNewFileMode) {
    // Default to putting new items on the path pane when triggered globally
    creatingNewFilePaths = true;
    fileManagerNewFileMode.set(false);
  }
  
  // Mock path utils
  const path = {
    join: (...parts: string[]) => parts.join("/"),
    basename: (p: string) => p.split(/[\\/]/).pop() || "",
    extname: (p: string) => {
      const m = p.match(/\.[^/.]+$/);
      return m ? m[0] : "";
    },
  };

  onMount(() => {
    if (settings?.fileManagerSortMode) {
      pathsSortMode = settings.fileManagerSortMode;
      autosSortMode = settings.fileManagerSortMode;
    }
    loadDirectory();
  });

  $: fileManagerSessionState.set({ 
    pathsSearchQuery, pathsViewMode, pathsSortMode,
    autosSearchQuery, autosViewMode, autosSortMode,
    leftPaneWidth
  });

  let globalSearchQuery = "";
  $: pathsSearchQuery = globalSearchQuery;
  $: autosSearchQuery = globalSearchQuery;

  $: {
    if (!pathsSearchQuery) {
      pathsFiltered = files.filter(f => !f.isDirectory || f.folderType === "path" || f.folderType === "any");
    } else {
      const q = pathsSearchQuery.toLowerCase();
      pathsFiltered = files.filter((f) => (f.name.toLowerCase().includes(q) || f.isDirectory) && (!f.isDirectory || f.folderType === "path" || f.folderType === "any"));
    }
    if (!autosSearchQuery) {
      autosFiltered = files.filter(f => !f.isDirectory || f.folderType === "auto" || f.folderType === "any");
    } else {
      const q = autosSearchQuery.toLowerCase();
      autosFiltered = files.filter((f) => (f.name.toLowerCase().includes(q) || f.isDirectory) && (!f.isDirectory || f.folderType === "auto" || f.folderType === "any"));
    }
  }

  $: if (currentDirectory) {
    currentDirectoryStore.set(currentDirectory);
  }

  function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  async function loadDirectory() {
    loading = true;
    errorMessage = "";
    try {
      if (!electronAPI || !electronAPI.getSavedDirectory) {
         loading = false;
         return; // If not in electron, just skip
      }
      const savedDir = await electronAPI.getSavedDirectory();
      if (savedDir && savedDir.trim() !== "") {
        currentDirectory = savedDir;
        baseDirectory = savedDir;
      } else {
        const dir = await electronAPI.getDirectory();
        currentDirectory = dir || "";
        baseDirectory = dir || "";
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
      if (settings.gitIntegration) {
        const statusMap: Record<string, string> = {};
        allFiles.forEach((f: any) => {
          if (f.gitStatus && f.gitStatus !== "clean") {
            statusMap[f.path] = f.gitStatus;
          }
        });
        gitStatusStore.update((store) => {
          const newStore = { ...store };
          allFiles.forEach((f) => {
            if (newStore[f.path] && !statusMap[f.path]) {
              delete newStore[f.path];
            }
          });
          Object.assign(newStore, statusMap);
          return newStore;
        });
      }

      const filtered = allFiles
        .map((file: any) => ({
          ...file,
          error: file.isDirectory || supportedFileTypes.includes(
            path.extname(file.name).toLowerCase(),
          )
            ? undefined
            : `Unsupported type`,
        }))
        .filter((file: any) => file.isDirectory || supportedFileTypes.includes(path.extname(file.name).toLowerCase()));

      // Read .folderMeta.json for directories to type them
      for (const f of filtered) {
        if (f.isDirectory) {
          try {
            const metaPath = path.join(f.path, ".folderMeta.json");
            if (await electronAPI.fileExists(metaPath)) {
              const metaResult = await electronAPI.readFile(metaPath);
              if (metaResult) {
                const meta = JSON.parse(metaResult);
                f.folderType = meta.type || "any";
              } else {
                f.folderType = "any";
              }
            } else {
              f.folderType = "any";
            }
          } catch (e) {
            f.folderType = "any";
          }
        }
      }
      
      
      if (currentDirectory !== baseDirectory) {
        const parentDir = await electronAPI.resolvePath(path.join(currentDirectory, "dummy.txt"), "..");
        if (parentDir) {
           filtered.unshift({
             name: "..",
             path: parentDir,
             size: 0,
             modified: new Date(),
             isDirectory: true,
             folderType: "any"
           });
        }
      }
      
      files = filtered;

      errorMessage = "";
      scanEventsInDirectory(currentDirectory);
    } catch (error) {
      console.error("Error refreshing directory:", error);
      errorMessage = `Error accessing directory: ${getErrorMessage(error)}`;
      files = [];
    }
  }

  import { isAutoStore } from "../../projectStore";

  function handleOpen(file: FileInfo, isAuto: boolean) {
    if (file.isDirectory) {
      currentDirectory = file.path;
      refreshDirectory();
    } else {
      isAutoStore.set(isAuto);
      dispatch("open-file", file);
      showProjectBrowser.set(false);
    }
  }

  async function renameFile(file: FileInfo, newName: string) {
    renamingFile = null;
    const cleanName = newName.trim();
    if (!cleanName) return;

    let fileName = cleanName;
    if (!file.isDirectory) {
      fileName = cleanName.endsWith(".pp") ? cleanName : cleanName + ".pp";
    }

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
        }
        showToast(`Renamed to: ${fileName}`, "success");
        await refreshDirectory();
      }
    } catch (error) {
      showToast(`Failed to rename: ${getErrorMessage(error)}`, "error");
    }
  }
  
  async function deleteFile(file: FileInfo) {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return;
    try {
      if(file.isDirectory) {
          // TODO recursive delete? Let's assume electronAPI.deleteFile handles or it fails if not empty
      }
      await electronAPI.deleteFile(file.path);
      if (selectedFile?.path === file.path) {
        selectedFile = null;
      }
      await refreshDirectory();
      showToast(`Deleted: ${file.name}`, "success");
    } catch (error) {
      showToast(`Failed to delete: ${getErrorMessage(error)}`, "error");
    }
  }

  async function createNewFolderPaths() {
    const name = newFolderNamePaths;
    if (!name.trim()) return;

    const dirPath = path.join(currentDirectory, name.trim());
    try {
      if (await electronAPI.fileExists(dirPath)) {
        showToast(`Folder "${name}" already exists.`, "error");
        return;
      }

      await electronAPI.createDirectory(dirPath);
      await electronAPI.writeFile(path.join(dirPath, ".folderMeta.json"), JSON.stringify({type: "path"}));
      creatingNewFolderPaths = false;
      newFolderNamePaths = "";
      await refreshDirectory();
      showToast(`Created folder: ${name}`, "success");
    } catch (error) {
      showToast(`Failed to create folder: ${getErrorMessage(error)}`, "error");
    }
  }

  async function createNewFolderAutos() {
    const name = newFolderNameAutos;
    if (!name.trim()) return;

    const dirPath = path.join(currentDirectory, name.trim());
    try {
      if (await electronAPI.fileExists(dirPath)) {
        showToast(`Folder "${name}" already exists.`, "error");
        return;
      }

      await electronAPI.createDirectory(dirPath);
      await electronAPI.writeFile(path.join(dirPath, ".folderMeta.json"), JSON.stringify({type: "auto"}));
      creatingNewFolderAutos = false;
      newFolderNameAutos = "";
      await refreshDirectory();
      showToast(`Created folder: ${name}`, "success");
    } catch (error) {
      showToast(`Failed to create folder: ${getErrorMessage(error)}`, "error");
    }
  }

  async function deleteCurrentDirectory() {
    if (currentDirectory === baseDirectory) return;
    if (!confirm(`Are you sure you want to delete the folder "${path.basename(currentDirectory)}"?`)) return;
    
    try {
      await electronAPI.deleteFile(currentDirectory);
      showToast(`Deleted folder: ${path.basename(currentDirectory)}`, "success");
      await goUpDirectory();
    } catch (e) {
      showToast(`Failed to delete folder: ${getErrorMessage(e)}`, "error");
    }
  }

  async function createNewFileGen(name: string, isAuto: boolean) {
    if (!name.trim()) return;

    const fileName = name.endsWith(".pp") ? name : name + ".pp";
    const filePath = path.join(currentDirectory, fileName);

    try {
      if (await electronAPI.fileExists(filePath)) {
        if (!confirm(`File "${fileName}" already exists. Overwrite?`)) return;
      }

      const data = {
        startPoint: {x: 0, y: 0, heading: "tangential", reverse: false},
        lines: [],
        shapes: [],
        sequence: [],
        type: isAuto ? "auto" : "path",
        version: "1.2.1",
        timestamp: new Date().toISOString(),
      };

      await hookRegistry.run("onSave", data);
      const content = JSON.stringify(data, null, 2);
      await electronAPI.writeFile(filePath, content);

      if (isAuto) {
        creatingNewFileAutos = false;
        newFileNameAutos = "";
      } else {
        creatingNewFilePaths = false;
        newFileNamePaths = "";
      }

      await refreshDirectory();

      const newFile = files.find((f) => f.name === fileName);
      if (newFile) {
        selectedFile = newFile;
        showToast(`Created: ${fileName}`, "success");
        isAutoStore.set(isAuto);
        dispatch("open-file", newFile);
      }
    } catch (error) {
      showToast(`Failed to create: ${getErrorMessage(error)}`, "error");
    }
  }

  async function duplicateFile(file: FileInfo) {
      // Just copy file
  }

  function handleMenuAction(e: any, isAuto: boolean) {
    const { action, file } = e.detail || e;
    switch (action) {
      case "open":
        handleOpen(file, isAuto);
        break;
      case "rename-start":
        renamingFile = file;
        break;
      case "delete":
        deleteFile(file);
        break;
      case "duplicate":
        //duplicateFile(file, "copy");
        break;
      case "mirror":
        //duplicateFile(file, "mirror");
        break;
      case "reverse":
        //duplicateFile(file, "reverse");
        break;
    }
  }

  async function goUpDirectory() {
    if (currentDirectory === baseDirectory) {
      return;
    }
    try {
      if (electronAPI.resolvePath) {
        const parentDir = await electronAPI.resolvePath(path.join(currentDirectory, "dummy.txt"), "..");
        if (parentDir && parentDir !== currentDirectory) {
          if (parentDir.startsWith(baseDirectory)) {
            currentDirectory = parentDir;
            await refreshDirectory();
          } else {
            currentDirectory = baseDirectory;
            await refreshDirectory();
          }
        }
      }
    } catch (err) {
      showToast(`Failed to go up directory: ${getErrorMessage(err)}`, "error");
    }
  }

  async function changeDirectoryManual(e: CustomEvent<string>) {
    const newDir = e.detail;
    if (!newDir) return;

    try {
      if (!newDir.startsWith(baseDirectory)) {
        showToast(`Cannot navigate outside the base directory`, "error");
        return;
      }

      currentDirectory = newDir;
      await refreshDirectory();

      if (!errorMessage) {
        showToast(`Directory changed`, "success");
      }
    } catch (err) {
      errorMessage = `Failed to change directory: ${getErrorMessage(err)}`;
    }
  }

  function showToast(message: string, type: "success" | "error" | "warning" | "info" = "info") {
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

  async function changeDirectoryDialog() {
    try {
      const newDir = await electronAPI.setDirectory();
      if (newDir) {
        currentDirectory = newDir;
        baseDirectory = newDir;
        await saveAutoPathsDirectory(newDir);
        await refreshDirectory();
        showToast(`Directory changed to: ${path.basename(newDir)}`, "success");
      }
    } catch (error) {
      errorMessage = `Failed to change directory: ${getErrorMessage(error)}`;
    }
  }
  
  function handleDragOver(e: DragEvent) {
      e.preventDefault();
  }
  
  async function handleDrop(e: DragEvent, fileInfo: FileInfo) {
      e.preventDefault();
      if(!fileInfo.isDirectory) return;
      
      const draggedFilePath = e.dataTransfer?.getData("text/plain");
      if(!draggedFilePath || draggedFilePath === fileInfo.path) return;
      
      const fileName = path.basename(draggedFilePath);
      const newPath = path.join(fileInfo.path, fileName);
      
      try {
          const result = await electronAPI.renameFile(draggedFilePath, newPath);
          if (result.success) {
              await refreshDirectory();
              showToast(`Moved to ${fileInfo.name}`, "success");
          }
      } catch (e) {
          showToast(`Move failed: ${getErrorMessage(e)}`, "error");
      }
  }
</script>

<div class="w-full h-full flex flex-col bg-neutral-100 dark:bg-neutral-900 absolute inset-0 z-[60]">
    <div class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm z-20">
      <h1 class="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-3">
        Project Browser
      </h1>
      <div class="flex items-center gap-1">
        <button
          title="Report Issue / Rating"
          aria-label="Report Issue / Rating"
          on:click={() => showFeedbackDialog.set(true)}
          class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5 text-purple-600 dark:text-purple-400">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
          </svg>
        </button>
        <button
          title="Settings"
          aria-label="Settings"
          on:click={() => showSettings.set(true)}
          class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </button>
      </div>
    </div>
    
    <!-- Top toolbar / Breadcrumbs container -->
    <div class="flex flex-col border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <FileManagerToolbar
          searchQuery={globalSearchQuery}
          sortMode={pathsSortMode}
          viewMode={pathsViewMode}
          on:search={(e) => (globalSearchQuery = e.detail)}
          on:sort-change={(e) => { pathsSortMode = e.detail; autosSortMode = e.detail; }}
          on:view-change={(e) => { pathsViewMode = e.detail; autosViewMode = e.detail; }}
          on:refresh={refreshDirectory}
          on:change-dir={changeDirectoryDialog}
          on:new-file={() => (creatingNewFilePaths = true)}
          on:new-folder={() => (creatingNewFolderPaths = true)}
        />
        <FileManagerBreadcrumbs
          currentPath={currentDirectory}
          isAtBase={currentDirectory === baseDirectory}
          on:change-dir={changeDirectoryManual}
          on:go-up={goUpDirectory}
        />
    </div>
    
    <!-- Error Display -->
    {#if errorMessage}
      <div
        class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400 border-b border-red-100 dark:border-red-900/30"
      >
        {errorMessage}
      </div>
    {/if}
    
    <!-- New Folder Input (Paths) -->
    {#if creatingNewFolderPaths}
      <div class="p-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700 w-full max-w-md mx-auto mt-4 rounded shadow-sm border z-30">
        <div class="text-xs font-medium text-neutral-500 mb-1">New Path Folder Name</div>
        <input bind:value={newFolderNamePaths} class="w-full px-2 py-1.5 text-sm border border-blue-400 rounded focus:outline-none bg-white dark:bg-neutral-700 mb-2" placeholder="New Folder" on:keydown={(e) => { if (e.key === "Enter") createNewFolderPaths(); if (e.key === "Escape") creatingNewFolderPaths = false; }} />
        <div class="flex gap-2">
          <button class="flex-1 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600" on:click={createNewFolderPaths}>Create</button>
          <button class="flex-1 py-1 text-xs bg-neutral-400 text-white rounded hover:bg-neutral-500" on:click={() => (creatingNewFolderPaths = false)}>Cancel</button>
        </div>
      </div>
    {/if}
    
    <!-- New Folder Input (Autos) -->
    {#if creatingNewFolderAutos}
      <div class="p-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700 w-full max-w-md mx-auto mt-4 rounded shadow-sm border z-30">
        <div class="text-xs font-medium text-neutral-500 mb-1">New Auto Folder Name</div>
        <input bind:value={newFolderNameAutos} class="w-full px-2 py-1.5 text-sm border border-blue-400 rounded focus:outline-none bg-white dark:bg-neutral-700 mb-2" placeholder="New Folder" on:keydown={(e) => { if (e.key === "Enter") createNewFolderAutos(); if (e.key === "Escape") creatingNewFolderAutos = false; }} />
        <div class="flex gap-2">
          <button class="flex-1 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600" on:click={createNewFolderAutos}>Create</button>
          <button class="flex-1 py-1 text-xs bg-neutral-400 text-white rounded hover:bg-neutral-500" on:click={() => (creatingNewFolderAutos = false)}>Cancel</button>
        </div>
      </div>
    {/if}

    <!-- New File Input (Paths) -->
    {#if creatingNewFilePaths}
      <div class="p-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700 w-full max-w-md mx-auto mt-4 rounded shadow-sm border z-30">
        <div class="text-xs font-medium text-neutral-500 mb-1">New Path Name</div>
        <input bind:value={newFileNamePaths} class="w-full px-2 py-1.5 text-sm border border-blue-400 rounded focus:outline-none bg-white dark:bg-neutral-700 mb-2" placeholder="path_name.pp" on:keydown={(e) => { if (e.key === "Enter") createNewFileGen(newFileNamePaths, false); if (e.key === "Escape") creatingNewFilePaths = false; }} />
        <div class="flex gap-2">
          <button class="flex-1 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600" on:click={() => createNewFileGen(newFileNamePaths, false)}>Create</button>
          <button class="flex-1 py-1 text-xs bg-neutral-400 text-white rounded hover:bg-neutral-500" on:click={() => (creatingNewFilePaths = false)}>Cancel</button>
        </div>
      </div>
    {/if}

    <!-- New File Input (Autos) -->
    {#if creatingNewFileAutos}
      <div class="p-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700 w-full max-w-md mx-auto mt-4 rounded shadow-sm border z-30">
        <div class="text-xs font-medium text-neutral-500 mb-1">New Auto Name</div>
        <input bind:value={newFileNameAutos} class="w-full px-2 py-1.5 text-sm border border-blue-400 rounded focus:outline-none bg-white dark:bg-neutral-700 mb-2" placeholder="auto_name.pp" on:keydown={(e) => { if (e.key === "Enter") createNewFileGen(newFileNameAutos, true); if (e.key === "Escape") creatingNewFileAutos = false; }} />
        <div class="flex gap-2">
          <button class="flex-1 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600" on:click={() => createNewFileGen(newFileNameAutos, true)}>Create</button>
          <button class="flex-1 py-1 text-xs bg-neutral-400 text-white rounded hover:bg-neutral-500" on:click={() => (creatingNewFileAutos = false)}>Cancel</button>
        </div>
      </div>
    {/if}

    <div class="flex-1 flex flex-row overflow-hidden relative">
      {#if loading}
        <div class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-neutral-900/50 z-10">
          <LoadingSpinner />
        </div>
      {/if}

      <!-- Left Pane (Paths) -->
      <div class="flex flex-col h-full overflow-hidden shrink-0" style="width: {leftPaneWidth}%">
        <div class="flex items-center justify-between p-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
          <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 ml-2">Paths</h2>
          <div class="flex gap-1">
            <button on:click={() => (pathsSortMode = pathsSortMode === 'name' ? 'date' : 'name')} class="p-1.5 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded" title="Sort By {pathsSortMode === 'name' ? 'Date' : 'Name'}">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0-3.75-3.75M17.25 21 21 17.25" /></svg>
            </button>
            <button on:click={() => (pathsViewMode = pathsViewMode === 'list' ? 'grid' : 'list')} class="p-1.5 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded" title="View as {pathsViewMode === 'list' ? 'Grid' : 'List'}">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25Z" /></svg>
            </button>
            <div class="w-px h-4 bg-neutral-300 dark:bg-neutral-600 mx-1 self-center"></div>
            {#if currentDirectory === baseDirectory}
              <button on:click={() => (creatingNewFolderPaths = true)} class="p-1.5 text-neutral-500 hover:text-blue-600 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded" title="New Folder">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
              </button>
            {:else}
              <button on:click={deleteCurrentDirectory} class="p-1.5 text-neutral-500 hover:text-red-600 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded" title="Delete Folder">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </button>
            {/if}
            <button on:click={() => (creatingNewFilePaths = true)} class="p-1.5 text-neutral-500 hover:text-green-600 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded" title="New Path">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-auto p-4" on:dragover={handleDragOver} role="region" aria-label="Paths Section">
          {#if pathsFiltered.length === 0}
            <div class="flex flex-col items-center justify-center text-neutral-400 p-8 text-center h-full">
              <p class="text-sm">No paths found</p>
            </div>
          {:else if pathsViewMode === "list"}
            <FileList
              bind:this={fileListPaths}
              files={pathsFiltered}
              selectedFilePath={selectedFile?.path ?? null}
              sortMode={pathsSortMode}
              fieldImage={settings.fieldMap}
              {renamingFile}
              fileType="path"
              showGitStatus={settings.gitIntegration}
              on:select={(e) => (selectedFile = e.detail)}
              on:open={(e) => handleOpen(e.detail, false)}
              on:rename-start={(e) => (renamingFile = e.detail)}
              on:rename-save={(e) => renamingFile && renameFile(renamingFile, e.detail)}
              on:rename-cancel={() => (renamingFile = null)}
              on:menu-action={(e) => handleMenuAction(e, false)}
            />
          {:else}
            <FileGrid
              bind:this={fileGridPaths}
              files={pathsFiltered}
              selectedFilePath={selectedFile?.path ?? null}
              sortMode={pathsSortMode}
              fieldImage={settings.fieldMap}
              {renamingFile}
              fileType="path"
              showGitStatus={settings.gitIntegration}
              on:select={(e) => (selectedFile = e.detail)}
              on:open={(e) => handleOpen(e.detail, false)}
              on:rename-start={(e) => (renamingFile = e.detail)}
              on:rename-save={(e) => renamingFile && renameFile(renamingFile, e.detail)}
              on:rename-cancel={() => (renamingFile = null)}
              on:menu-action={(e) => handleMenuAction(e, false)}
            />
          {/if}
        </div>
      </div>

      <!-- Resizer handle -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div 
        class="w-1 cursor-col-resize bg-neutral-200 dark:bg-neutral-700 hover:bg-blue-500 transition-colors z-[15]"
        on:mousedown={() => { 
          isResizing = true; 
          window.addEventListener('mousemove', handleResizeMouseMove); 
          window.addEventListener('mouseup', handleResizeMouseUp); 
        }}
      ></div>

      <!-- Right Pane (Autos) -->
      <div class="flex flex-col h-full overflow-hidden flex-1 shrink min-w-0">
        <div class="flex items-center justify-between p-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
          <h2 class="text-sm font-semibold text-neutral-700 dark:text-neutral-300 ml-2">Autos</h2>
          <div class="flex gap-1">
            <button on:click={() => (autosSortMode = autosSortMode === 'name' ? 'date' : 'name')} class="p-1.5 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded" title="Sort By {autosSortMode === 'name' ? 'Date' : 'Name'}">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0-3.75-3.75M17.25 21 21 17.25" /></svg>
            </button>
            <button on:click={() => (autosViewMode = autosViewMode === 'list' ? 'grid' : 'list')} class="p-1.5 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded" title="View as {autosViewMode === 'list' ? 'Grid' : 'List'}">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25Z" /></svg>
            </button>
            <div class="w-px h-4 bg-neutral-300 dark:bg-neutral-600 mx-1 self-center"></div>
            {#if currentDirectory === baseDirectory}
              <button on:click={() => (creatingNewFolderAutos = true)} class="p-1.5 text-neutral-500 hover:text-blue-600 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded" title="New Folder">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
              </button>
            {:else}
              <button on:click={deleteCurrentDirectory} class="p-1.5 text-neutral-500 hover:text-red-600 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded" title="Delete Folder">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </button>
            {/if}
            <button on:click={() => (creatingNewFileAutos = true)} class="p-1.5 text-neutral-500 hover:text-green-600 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded" title="New Auto">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-auto p-4" on:dragover={handleDragOver} role="region" aria-label="Autos Section">
          {#if autosFiltered.length === 0}
            <div class="flex flex-col items-center justify-center text-neutral-400 p-8 text-center h-full">
              <p class="text-sm">No autos found</p>
            </div>
          {:else if autosViewMode === "list"}
            <FileList
              bind:this={fileListAutos}
              files={autosFiltered}
              selectedFilePath={selectedFile?.path ?? null}
              sortMode={autosSortMode}
              fieldImage={settings.fieldMap}
              {renamingFile}
              fileType="auto"
              showGitStatus={settings.gitIntegration}
              on:select={(e) => (selectedFile = e.detail)}
              on:open={(e) => handleOpen(e.detail, true)}
              on:rename-start={(e) => (renamingFile = e.detail)}
              on:rename-save={(e) => renamingFile && renameFile(renamingFile, e.detail)}
              on:rename-cancel={() => (renamingFile = null)}
              on:menu-action={(e) => handleMenuAction(e, true)}
            />
          {:else}
            <FileGrid
              bind:this={fileGridAutos}
              files={autosFiltered}
              selectedFilePath={selectedFile?.path ?? null}
              sortMode={autosSortMode}
              fieldImage={settings.fieldMap}
              {renamingFile}
              fileType="auto"
              showGitStatus={settings.gitIntegration}
              on:select={(e) => (selectedFile = e.detail)}
              on:open={(e) => handleOpen(e.detail, true)}
              on:rename-start={(e) => (renamingFile = e.detail)}
              on:rename-save={(e) => renamingFile && renameFile(renamingFile, e.detail)}
              on:rename-cancel={() => (renamingFile = null)}
              on:menu-action={(e) => handleMenuAction(e, true)}
            />
          {/if}
        </div>
      </div>
    </div>
    
    <!-- Floating Action Button for Global Events -->
    <button
      class="absolute bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105"
      on:click={() => (showGlobalEvents = true)}
      title="Manage Named Commands & Linked Waypoints"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
      </svg>
    </button>
</div>

{#if showGlobalEvents}
  <GlobalEventManager
    bind:isOpen={showGlobalEvents}
    on:refresh-browser={() => refreshDirectory()}
  />
{/if}
