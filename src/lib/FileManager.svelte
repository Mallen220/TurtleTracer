<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts" context="module">
  declare global {
    interface Window {
      electronAPI: {
        getDirectory: () => Promise<string | null>;
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
        resolvePath?: (base: string, relative: string) => Promise<string>;
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
  } from "../types/index";
  import {
    currentFilePath,
    isUnsaved,
    fileManagerSessionState,
    fileManagerNewFileMode,
    currentDirectoryStore,
    gitStatusStore,
    showTelemetryDialog,
  } from "../stores";
  import {
    settingsStore,
    loadMacro,
    loadProjectData,
    macrosStore,
    updateMacroContent,
  } from "./projectStore";
  import { saveProject } from "../utils/fileHandlers";
  import { saveAutoPathsDirectory } from "../utils/directorySettings";
  import { hookRegistry } from "./registries";
  import { mirrorPathData, reversePathData } from "../utils/pathTransform";
  import { scanEventsInDirectory } from "../utils/eventScanner";
  import {
    DEFAULT_PROJECT_EXTENSION,
    SUPPORTED_PROJECT_EXTENSIONS,
    ensureDefaultProjectExtension,
    getProjectExtensionFromPath,
    isSupportedProjectFileName,
    stripProjectExtension,
  } from "../utils/fileExtensions";

  import FileManagerToolbar from "./components/filemanager/FileManagerToolbar.svelte";
  import FileManagerBreadcrumbs from "./components/filemanager/FileManagerBreadcrumbs.svelte";
  import FileList from "./components/filemanager/FileList.svelte";
  import FileGrid from "./components/filemanager/FileGrid.svelte";
  import LoadingSpinner from "./components/common/LoadingSpinner.svelte";
  import FolderIcon from "./components/icons/FolderIcon.svelte";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let shapes: Shape[];
  export let sequence: SequenceItem[];
  export let settings: Settings;

  // Initialize from session state
  const session = get(fileManagerSessionState);
  let sortMode: "name" | "date" = session.sortMode ?? "date";
  let sortModeInitialized = false;
  let viewMode: "list" | "grid" = session.viewMode;
  let currentDirectory = "";
  let baseDirectory = "";
  let files: FileInfo[] = [];
  let filteredFiles: FileInfo[] = [];
  let loading = false;
  let selectedFile: FileInfo | null = null;
  let errorMessage = "";
  let searchQuery = session.searchQuery;

  // Renaming state
  let renamingFile: FileInfo | null = null;
  // Reference to child components for preview refreshes
  let fileGrid: any;
  let fileList: any;

  // New file state
  let creatingNewFile = false;
  let newFileName = "";

  // New folder state
  let creatingNewFolder = false;
  let newFolderName = "";

  let fileInput: HTMLInputElement;
  let javaInput: HTMLInputElement;
  let showAddMenu = false;

  function handleAddMenuToggle(e: MouseEvent) {
    e.stopPropagation();
    showAddMenu = !showAddMenu;
  }

  function handleWindowClick(e: MouseEvent) {
    if (showAddMenu) {
      const target = e.target as HTMLElement;
      if (!target.closest(".floating-add-container")) {
        showAddMenu = false;
      }
    }
  }

  function onImportFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      handleImportFile({ detail: target.files[0] } as CustomEvent<File>);
      target.value = "";
    }
  }

  function onImportJavaSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      handleImportJava({ detail: target.files[0] } as CustomEvent<File>);
      target.value = "";
    }
  }

  const supportedFileTypes = [...SUPPORTED_PROJECT_EXTENSIONS];
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

  // Resizing state
  let sidebarWidth = 600; // default max-w-sm is roughly 655px (24rem)
  let isResizing = false;

  // New file input reference for programmatic focus
  import { tick } from "svelte";
  let newFileInput: HTMLInputElement | null = null;
  let newFolderInput: HTMLInputElement | null = null;

  $: if (creatingNewFile) {
    // Focus the input after it renders
    tick().then(() => newFileInput?.focus());
  }

  $: if (creatingNewFolder) {
    tick().then(() => newFolderInput?.focus());
  }

  $: if ($fileManagerNewFileMode) {
    creatingNewFile = true;
    fileManagerNewFileMode.set(false);
  }

  $: if (currentDirectory) {
    currentDirectoryStore.set(currentDirectory);
  }

  function startResize(e: MouseEvent) {
    isResizing = true;
    window.addEventListener("mousemove", handleResize);
    window.addEventListener("mouseup", stopResize);
  }

  function handleResize(e: MouseEvent) {
    if (isResizing) {
      // Constrain width
      const newWidth = Math.max(250, Math.min(e.clientX, 800));
      sidebarWidth = newWidth;
    }
  }

  function stopResize() {
    isResizing = false;
    window.removeEventListener("mousemove", handleResize);
    window.removeEventListener("mouseup", stopResize);
  }

  // Persist session state when changed
  $: fileManagerSessionState.set({ searchQuery, viewMode, sortMode });

  import { saveSettings } from "../utils/settingsPersistence";

  // Sync sortMode to settings only after initialization and persist it
  $: if (sortModeInitialized && settings && sortMode) {
    if (settings.fileManagerSortMode !== sortMode) {
      settings.fileManagerSortMode = sortMode;
      // Force update so Svelte reactivity at higher levels will detect the change
      settings = { ...settings };

      // Persist settings to disk (non-blocking)
      saveSettings(settings).catch((e) =>
        console.error("Failed to save settings fileManagerSortMode:", e),
      );

      // Re-sort files now that mode changed
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

  // Normalize trailing numeric duplicates like "shooter (2)" to maintain links
  function stripSuffix(name?: string | null): string {
    if (!name) return name ?? "";
    const match = name.match(/^(.*) \(\d+\)$/);
    return match ? match[1] : name;
  }

  // Normalize lines helper
  function normalizeLines(input: Line[] = []): Line[] {
    return (input || []).map((line) => {
      const baseName = line._linkedName ?? line.name ?? "";
      const beforeName =
        line.waitBeforeName ?? (line as any).waitBefore?.name ?? "";
      const afterName =
        line.waitAfterName ?? (line as any).waitAfter?.name ?? "";

      return {
        ...line,
        name: stripSuffix(baseName),
        id: line.id || `line-${Math.random().toString(36).slice(2)}`,
        waitBeforeMs: Math.max(
          0,
          Number(
            line.waitBeforeMs ?? (line as any).waitBefore?.durationMs ?? 0,
          ),
        ),
        waitAfterMs: Math.max(
          0,
          Number(line.waitAfterMs ?? (line as any).waitAfter?.durationMs ?? 0),
        ),
        waitBeforeName: stripSuffix(beforeName),
        waitAfterName: stripSuffix(afterName),
      };
    });
  }

  function deriveSequence(data: any, normalizedLines: Line[]): SequenceItem[] {
    const baseSeq: SequenceItem[] =
      Array.isArray(data?.sequence) && data.sequence.length
        ? (data.sequence as SequenceItem[])
        : normalizedLines.map((ln) => ({
            kind: "path",
            lineId: ln.id!,
          }));

    return baseSeq.map((item) => {
      if (item.kind === "wait") {
        const baseName = (item as any)._linkedName ?? item.name ?? "";
        return { ...item, name: stripSuffix(baseName) };
      }
      return item;
    });
  }

  async function loadDirectory() {
    loading = true;
    errorMessage = "";
    try {
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
      // Update Git Status Store
      if (settings.gitIntegration) {
        const statusMap: Record<string, string> = {};
        allFiles.forEach((f) => {
          if (f.gitStatus && f.gitStatus !== "clean") {
            statusMap[f.path] = f.gitStatus;
          }
        });
        gitStatusStore.update((store) => {
          const newStore = { ...store };
          // Remove entries that are in the current directory but are now clean
          allFiles.forEach((f) => {
            if (newStore[f.path] && !statusMap[f.path]) {
              delete newStore[f.path];
            }
          });
          // Add/Update new statuses
          Object.assign(newStore, statusMap);
          return newStore;
        });
      }

      files = allFiles
        .map((file) => ({
          ...file,
          error:
            file.isDirectory || isSupportedProjectFileName(file.name)
              ? undefined
              : `Unsupported type`,
        }))
        .filter(
          (file) => file.isDirectory || isSupportedProjectFileName(file.name),
        );

      if (currentDirectory !== baseDirectory) {
        files.unshift({
          name: "..",
          path: path.dirname(currentDirectory),
          isDirectory: true,
          size: 0,
          modified: new Date(),
        } as FileInfo);
      }

      sortFiles();
      errorMessage = "";
      scanEventsInDirectory(currentDirectory);
    } catch (error) {
      console.error("Error refreshing directory:", error);
      errorMessage = `Error accessing directory: ${getErrorMessage(error)}`;
      files = [];
    }
  }

  function sortFiles() {
    if (sortMode === "name") {
      files.sort((a, b) => {
        if (a.name === "..") return -1;
        if (b.name === "..") return 1;
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === "date") {
      files.sort((a, b) => {
        if (a.name === "..") return -1;
        if (b.name === "..") return 1;
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return new Date(b.modified).getTime() - new Date(a.modified).getTime();
      });
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
        baseDirectory = newDir;
        await saveAutoPathsDirectory(newDir);
        await refreshDirectory();
        showToast(`Directory changed to: ${path.basename(newDir)}`, "success");
      }
    } catch (error) {
      errorMessage = `Failed to change directory: ${getErrorMessage(error)}`;
    }
  }

  // New refresh handler: refresh directory and force preview reloads
  async function handleRefresh() {
    try {
      await refreshDirectory();

      // After directory is refreshed, request previews to refresh for both list and grid
      if (fileList && typeof fileList.refreshAllFailed === "function") {
        fileList.refreshAllFailed();
      } else if (fileList && typeof fileList.refreshAll === "function") {
        fileList.refreshAll();
      }

      if (fileGrid && typeof fileGrid.refreshAllFailed === "function") {
        fileGrid.refreshAllFailed();
      } else if (fileGrid && typeof fileGrid.refreshAll === "function") {
        fileGrid.refreshAll();
      }

      showToast("Refreshed files and previews", "success");
    } catch (err) {
      showToast(`Refresh failed: ${getErrorMessage(err)}`, "error");
    }
  }

  async function goUpDirectory() {
    if (currentDirectory === baseDirectory) {
      return; // Cannot go up beyond the base directory
    }
    try {
      if (electronAPI.resolvePath) {
        // electronAPI.resolvePath(base, relative) calls path.resolve(path.dirname(base), relative).
        // Since currentDirectory is a directory and not a file, passing it directly as `base`
        // would drop the last directory segment and then apply "..", going up TWO levels.
        // and then ".." correctly moves up exactly ONE level.
        const parentDir = await electronAPI.resolvePath(
          path.join(currentDirectory, "dummy.txt"),
          "..",
        );
        if (parentDir && parentDir !== currentDirectory) {
          // Additional safety check to prevent going outside baseDirectory
          // parentDir must start with baseDirectory
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

  // Handle directory change (manual input)
  async function changeDirectoryManual(e: CustomEvent<string>) {
    const newDir = e.detail;
    if (!newDir) return;

    try {
      // Ensure the manual directory is still within the base directory
      if (!newDir.startsWith(baseDirectory)) {
        showToast(`Cannot navigate outside the base directory`, "error");
        return;
      }

      currentDirectory = newDir;
      // Do NOT call saveAutoPathsDirectory(newDir) here to avoid changing the base
      await refreshDirectory();

      if (errorMessage) {
        // Keep error
      } else {
        showToast(`Directory changed`, "success");
      }
    } catch (err) {
      errorMessage = `Failed to change directory: ${getErrorMessage(err)}`;
    }
  }

  async function handleImportFile(e: CustomEvent<File>) {
    const file = e.detail;
    if (!file) return;

    if (!isSupportedProjectFileName(file.name)) {
      showToast("Please select a .turt or .pp file", "error");
      return;
    }

    if (get(isUnsaved)) {
      if (
        !confirm(
          "You have unsaved changes that will be lost. Are you sure you want to import a new file?",
        )
      ) {
        return;
      }
    }

    try {
      if (electronAPI && currentDirectory) {
        // Read file content first
        const sourcePath = (file as any).path;

        let content = "";
        if (sourcePath && electronAPI.readFile) {
          content = await electronAPI.readFile(sourcePath);
        } else {
          // Fallback to FileReader for web or if path missing
          content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(new Error("Failed to read file"));
            reader.readAsText(file);
          });
        }

        // Validate JSON
        const data = JSON.parse(content);
        if (!data.startPoint || !data.lines) {
          throw new Error("Invalid project file format");
        }

        // Determine destination path
        const fileName = file.name;
        const destPath = path.join(currentDirectory, fileName);

        // Check overwrite
        if (
          electronAPI.fileExists &&
          (await electronAPI.fileExists(destPath))
        ) {
          if (
            !confirm(
              `File "${fileName}" already exists in "${path.basename(currentDirectory)}". Overwrite?`,
            )
          ) {
            return;
          }
        }

        // Write to destination
        await electronAPI.writeFile(destPath, content);

        // Refresh and load
        await refreshDirectory();

        // Find the new file info object to pass to loadFile
        const newFile = files.find((f) => f.name === fileName);
        if (newFile) {
          await loadFile(newFile);
        } else {
          // Fallback if refresh failed or something
          showToast("File imported but not found in list", "warning");
        }
      } else {
        // Web mode / No directory: just load into memory
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          try {
            const data = JSON.parse(content);
            if (!data.startPoint || !data.lines)
              throw new Error("Invalid format");

            startPoint = data.startPoint;
            lines = normalizeLines(data.lines || []);
            shapes = data.shapes || [];
            sequence = deriveSequence(data, lines);

            currentFilePath.set(null);
            isUnsaved.set(true); // Treat as unsaved imported data
            selectedFile = null;

            showToast(`Imported: ${file.name}`, "success");
          } catch (err) {
            showToast("Invalid file content", "error");
          }
        };
        reader.readAsText(file);
      }
    } catch (err) {
      showToast(`Import failed: ${getErrorMessage(err)}`, "error");
    }
  }

  // File Operations
  async function handleMoveFile(
    e: CustomEvent<{ sourceFile: FileInfo; targetDir: FileInfo }>,
  ) {
    const { sourceFile, targetDir } = e.detail;
    if (!targetDir.isDirectory) return;
    if (sourceFile.path === targetDir.path) return;
    if (sourceFile.name === "..") return; // cannot move the .. directory itself

    try {
      let newDir = targetDir.path;
      if (targetDir.name === "..") {
        newDir = path.dirname(currentDirectory);
      }

      const newPath = path.join(newDir, sourceFile.name);

      const result = await electronAPI.renameFile(sourceFile.path, newPath);
      if (result.success) {
        if (selectedFile?.path === sourceFile.path) {
          selectedFile = { ...selectedFile, path: newPath };
          currentFilePath.set(newPath);
        }
        // Update sequence references if this file was used as a macro
        let macrosChanged = false;
        sequence = sequence.map((item) => {
          if (item.kind === "macro" && item.filePath === sourceFile.path) {
            macrosChanged = true;
            return { ...item, filePath: newPath };
          }
          return item;
        });

        // Update macrosStore
        const macros = get(macrosStore);
        if (macros.has(sourceFile.path)) {
          const macroData = macros.get(sourceFile.path);
          if (macroData) {
            updateMacroContent(newPath, macroData);
            macrosStore.update((m) => {
              m.delete(sourceFile.path);
              return m;
            });
          }
          macrosChanged = true;
        }

        if (macrosChanged) {
          isUnsaved.set(true); // Since modified sequence, the file needs saving
        }

        showToast(
          `Moved to ${targetDir.name === ".." ? "parent folder" : targetDir.name}`,
          "success",
        );
        await refreshDirectory();
      }
    } catch (error) {
      showToast(`Failed to move: ${getErrorMessage(error)}`, "error");
    }
  }

  async function renameFile(file: FileInfo, newName: string) {
    renamingFile = null;
    const cleanName = newName.trim();
    if (!cleanName) return;

    let fileName = cleanName;
    if (!file.isDirectory) {
      if (isSupportedProjectFileName(cleanName)) {
        fileName = cleanName;
      } else {
        const extension = getProjectExtensionFromPath(file.name);
        fileName = `${cleanName}${extension}`;
      }
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
          currentFilePath.set(newFilePath);
        }
        showToast(`Renamed to: ${fileName}`, "success");
        await refreshDirectory();
      }
    } catch (error) {
      showToast(`Failed to rename: ${getErrorMessage(error)}`, "error");
    }
  }

  function handleOpen(file: FileInfo) {
    if (file.isDirectory) {
      if (file.name === "..") {
        goUpDirectory();
        return;
      }
      currentDirectory = file.path;
      refreshDirectory();
    } else {
      loadFile(file);
    }
  }

  async function loadFile(file: FileInfo) {
    if (file.error) return;

    // Autosave on Close Logic
    const currentSettings = get(settingsStore);
    if (
      currentSettings.autosaveMode === "close" &&
      get(isUnsaved) &&
      get(currentFilePath)
    ) {
      await saveProject(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        { quiet: true },
      );
    }

    try {
      const content = await electronAPI.readFile(file.path);
      const data = JSON.parse(content);

      if (!data.startPoint || !data.lines)
        throw new Error("Invalid file format");

      await loadProjectData(data, file.path);

      currentFilePath.set(file.path);
      isUnsaved.set(false);
      selectedFile = file;
      showToast(`Loaded: ${file.name}`, "success");

      // Refresh the file preview so the latest content is reflected
      if (fileGrid && file && file.path) fileGrid.refreshPreview(file.path);
    } catch (error) {
      showToast(`Error loading file: ${getErrorMessage(error)}`, "error");
    }
  }

  async function handleImportJava(e: CustomEvent<File>) {
    const file = e.detail;
    if (!file) return;

    if (!file.name.endsWith(".java")) {
      showToast("Please select a .java file", "error");
      return;
    }

    if (get(isUnsaved)) {
      if (
        !confirm(
          "You have unsaved changes that will be lost. Are you sure you want to import a new Java file?",
        )
      ) {
        return;
      }
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoder = new TextDecoder("utf-8");
      const javaContent = decoder.decode(arrayBuffer);

      const { importJavaProject } = await import("../utils/javaImporter");
      const loadedData = importJavaProject(javaContent);

      startPoint = loadedData.startPoint;
      lines = loadedData.lines;
      shapes = loadedData.shapes || [];
      sequence = loadedData.sequence;
      if (loadedData.extraData?.settings) {
        settings = loadedData.extraData.settings;
      }

      // Optionally save it as a new .turt file right away if in desktop mode
      if (electronAPI && currentDirectory) {
        const newFileName = file.name.replace(".java", ".turt");
        const destPath = path.join(currentDirectory, newFileName);

        const savedDataStr = JSON.stringify(
          {
            startPoint,
            lines,
            shapes,
            sequence,
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        );

        await electronAPI.writeFile(destPath, savedDataStr);
        await refreshDirectory();

        currentFilePath.set(destPath);
        isUnsaved.set(false);
      } else {
        currentFilePath.set(file.name.replace(".java", ".turt"));
        isUnsaved.set(false);
      }

      showToast(`Successfully imported ${file.name}`, "success");
      isOpen = false;
    } catch (err: any) {
      console.error("Error importing Java file:", err);
      showToast(`Error importing Java file: ${err.message}`, "error");
    }
  }

  async function saveCurrentToFile(targetFile: FileInfo) {
    try {
      const data = {
        startPoint,
        lines,
        shapes,
        sequence,
        timestamp: new Date().toISOString(),
      };

      await hookRegistry.run("onSave", data);

      const content = JSON.stringify(data, null, 2);

      await electronAPI.writeFile(targetFile.path, content);
      await refreshDirectory();
      isUnsaved.set(false);
      showToast(`Saved to: ${targetFile.name}`, "success");

      // Reload macro if it's being used somewhere
      loadMacro(targetFile.path, true);

      // Updated saved file — refresh its preview
      if (fileGrid && targetFile && targetFile.path)
        fileGrid.refreshPreview(targetFile.path);
      if (fileList && targetFile && targetFile.path)
        fileList.refreshPreview(targetFile.path);
    } catch (error) {
      showToast(`Failed to save: ${getErrorMessage(error)}`, "error");
    }
  }

  async function createNewFolder(name: string) {
    if (!name.trim()) return;

    const dirPath = path.join(currentDirectory, name.trim());
    try {
      if (await electronAPI.fileExists(dirPath)) {
        showToast(`Folder "${name}" already exists.`, "error");
        return;
      }

      await electronAPI.createDirectory(dirPath);
      creatingNewFolder = false;
      newFolderName = "";
      await refreshDirectory();
      showToast(`Created folder: ${name}`, "success");
    } catch (error) {
      showToast(`Failed to create folder: ${getErrorMessage(error)}`, "error");
    }
  }

  async function createNewFile(name: string) {
    if (!name.trim()) return;

    const fileName = ensureDefaultProjectExtension(name);
    const filePath = path.join(currentDirectory, fileName);

    // Autosave on Close Logic
    const currentSettings = get(settingsStore);
    if (
      currentSettings.autosaveMode === "close" &&
      get(isUnsaved) &&
      get(currentFilePath)
    ) {
      await saveProject(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        { quiet: true },
      );
    }

    try {
      if (await electronAPI.fileExists(filePath)) {
        if (!confirm(`File "${fileName}" already exists. Overwrite?`)) return;
      }

      const data = {
        startPoint,
        lines: normalizeLines(lines),
        shapes,
        sequence,
        timestamp: new Date().toISOString(),
      };

      await hookRegistry.run("onSave", data);

      const content = JSON.stringify(data, null, 2);

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

        // New file created — ensure preview is generated
        if (fileGrid && newFile.path) fileGrid.refreshPreview(newFile.path);
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

  async function duplicateFile(
    file: FileInfo,
    mode: "copy" | "mirror" | "reverse" = "copy",
  ) {
    try {
      const content = await electronAPI.readFile(file.path);
      let data = JSON.parse(content);

      let suffix = "_copy";
      if (mode === "mirror") {
        data = mirrorPathData(data);
        suffix = "_mirrored";
      } else if (mode === "reverse") {
        data = reversePathData(data);
        suffix = "_reversed";
      }

      const baseName = stripProjectExtension(file.name);
      let newName = `${baseName}${suffix}${DEFAULT_PROJECT_EXTENSION}`;
      let counter = 1;

      while (
        await electronAPI.fileExists(path.join(currentDirectory, newName))
      ) {
        newName = `${baseName}${suffix}${counter}${DEFAULT_PROJECT_EXTENSION}`;
        counter++;
      }

      await hookRegistry.run("onSave", data);

      await electronAPI.writeFile(
        path.join(currentDirectory, newName),
        JSON.stringify(data, null, 2),
      );
      await refreshDirectory();

      let actionLabel = "Duplicated";
      if (mode === "mirror") actionLabel = "Mirrored";
      if (mode === "reverse") actionLabel = "Reversed";

      showToast(`${actionLabel}: ${newName}`, "success");

      // Refresh preview for the newly created copy/mirror
      const newFile = files.find((f) => f.name === newName);
      if (newFile) {
        if (fileGrid && newFile.path) fileGrid.refreshPreview(newFile.path);
        if (fileList && newFile.path) fileList.refreshPreview(newFile.path);
      }
    } catch (error) {
      showToast(`Failed to duplicate: ${getErrorMessage(error)}`, "error");
    }
  }

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
  function handleMenuAction(e: any) {
    // If called from template with detail extracted or raw event
    const { action, file } = e.detail || e;
    switch (action) {
      case "open":
        handleOpen(file);
        break;
      case "rename-start":
        renamingFile = file;
        break;
      case "delete":
        deleteFile(file);
        break;
      case "duplicate":
        duplicateFile(file, "copy");
        break;
      case "mirror":
        duplicateFile(file, "mirror");
        break;
      case "reverse":
        duplicateFile(file, "reverse");
        break;
      case "save-to":
        saveCurrentToFile(file);
        break;
    }
  }

  onMount(() => {
    loadDirectory();
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen && !creatingNewFile && !renamingFile) {
      isOpen = false;
    }
  }

  let isDraggingPath = false;

  // Mock path utils
  const path = {
    join: (...parts: string[]) => parts.join("/").replace(/\/\//g, "/"),
    basename: (p: string) => p.split(/[\\/]/).pop() || "",
    extname: (p: string) => {
      const m = p.match(/\.[^/.]+$/);
      return m ? m[0] : "";
    },
    dirname: (p: string) => {
      const parts = p.split(/[\\/]/);
      parts.pop();
      return parts.join("/") || "/";
    },
  };
</script>

<svelte:window on:keydown={handleKeydown} on:click={handleWindowClick} />

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

  <!-- Drop Zone (Right Area) -->
  {#if isOpen && isDraggingPath}
    <div
      class="fixed inset-0 pointer-events-none flex items-center justify-center bg-purple-500/10 backdrop-blur-[2px] z-[1015]"
      style="left: {sidebarWidth}px;"
    >
      <div
        class="bg-white dark:bg-neutral-800 p-8 rounded-xl shadow-2xl flex flex-col items-center border-4 border-dashed border-purple-500 animate-pulse"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-16 w-16 text-purple-600 dark:text-purple-400 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <h2 class="text-2xl font-bold mb-2 text-neutral-900 dark:text-white">
          Drop Zone
        </h2>
        <p class="text-neutral-500 dark:text-neutral-400">
          Drop file to add as a macro
        </p>
      </div>
    </div>
  {/if}

  <!-- Sidebar -->
  <div
    class="relative flex flex-col h-full bg-white dark:bg-neutral-900 shadow-2xl transform transition-transform duration-300 ease-in-out border-r border-neutral-200 dark:border-neutral-800 pointer-events-auto"
    style="width: {isOpen ? sidebarWidth : 384}px"
    class:translate-x-0={isOpen}
    class:-translate-x-full={!isOpen}
    role="presentation"
    on:dragstart={() => (isDraggingPath = true)}
    on:dragend={() => (isDraggingPath = false)}
    on:dragover|preventDefault|stopPropagation
    on:drop|preventDefault|stopPropagation
  >
    <!-- Resizer Handle -->
    <button
      type="button"
      class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-50 transition-colors appearance-none bg-transparent"
      on:mousedown={startResize}
      aria-label="Resize sidebar"
    ></button>

    <!-- Header -->
    <div
      class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 z-20"
    >
      <h2
        class="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2"
      >
        <FolderIcon className="size-5" />
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
    <div class="relative z-[60] overflow-visible">
      <FileManagerToolbar
        {searchQuery}
        {sortMode}
        {viewMode}
        on:search={(e) => (searchQuery = e.detail)}
        on:sort-change={(e) => (sortMode = e.detail)}
        on:view-change={(e) => {
          viewMode = e.detail;
          // If switching to list/grid view, retry any previously failed previews so icons repopulate reliably
          if (viewMode === "list") {
            if (fileList && typeof fileList.refreshAllFailed === "function") {
              fileList.refreshAllFailed();
            } else if (fileList && typeof fileList.refreshAll === "function") {
              // fallback: refresh everything
              fileList.refreshAll();
            }
          } else if (viewMode === "grid") {
            if (fileGrid && typeof fileGrid.refreshAllFailed === "function") {
              fileGrid.refreshAllFailed();
            } else if (fileGrid && typeof fileGrid.refreshAll === "function") {
              fileGrid.refreshAll();
            }
          }
        }}
      />
    </div>

    <!-- Breadcrumbs -->
    <FileManagerBreadcrumbs
      currentPath={currentDirectory}
      isAtBase={currentDirectory === baseDirectory}
      on:change-dir={changeDirectoryManual}
      on:change-dir-dialog={changeDirectoryDialog}
      on:go-up={goUpDirectory}
    />

    <!-- Error Display -->
    {#if errorMessage}
      <div
        class="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400 border-b border-red-100 dark:border-red-900/30"
      >
        {errorMessage}
      </div>
    {/if}

    <!-- New Folder Input -->
    {#if creatingNewFolder}
      <div
        class="p-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700"
      >
        <div class="text-xs font-medium text-neutral-500 mb-1">
          New Folder Name
        </div>
        <input
          bind:value={newFolderName}
          bind:this={newFolderInput}
          class="w-full px-2 py-1.5 text-sm border border-blue-400 rounded focus:outline-none bg-white dark:bg-neutral-700 mb-2"
          placeholder="New Folder"
          on:keydown={(e) => {
            if (e.key === "Enter") createNewFolder(newFolderName);
            if (e.key === "Escape") creatingNewFolder = false;
          }}
        />

        <div class="flex gap-2">
          <button
            class="flex-1 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            on:click={() => createNewFolder(newFolderName)}>Create</button
          >
          <button
            class="flex-1 py-1 text-xs bg-neutral-400 text-white rounded hover:bg-neutral-500"
            on:click={() => (creatingNewFolder = false)}>Cancel</button
          >
        </div>
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
          bind:this={newFileInput}
          class="w-full px-2 py-1.5 text-sm border border-blue-400 rounded focus:outline-none bg-white dark:bg-neutral-700 mb-2"
          placeholder="path_name.turt"
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

    <!-- File List / Grid Container with Floating Menu -->
    <div class="relative flex-1 overflow-hidden flex flex-col">
      <!-- Floating Add Dropdown -->
      <div class="absolute top-4 right-4 z-[100] floating-add-container">
        <button
          on:click={handleAddMenuToggle}
          class="flex items-center justify-center p-1.5 text-neutral-500 hover:text-green-600 dark:text-neutral-400 dark:hover:text-green-400 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          title="Add / Import"
          aria-label="Add / Import"
          aria-haspopup="true"
          aria-expanded={showAddMenu}
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
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
        </button>

        {#if showAddMenu}
          <div
            class="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-neutral-800 rounded-md shadow-xl border border-neutral-200 dark:border-neutral-700 py-1 flex flex-col overflow-hidden"
          >
            <button
              on:click={() => {
                creatingNewFile = true;
                showAddMenu = false;
              }}
              class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4 text-green-500"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
              New File
            </button>

            <button
              on:click={() => {
                creatingNewFolder = true;
                showAddMenu = false;
              }}
              class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4 text-blue-500"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                />
              </svg>
              New Folder
            </button>

            <div
              class="h-px bg-neutral-200 dark:bg-neutral-700 my-1 w-full"
              role="presentation"
              aria-hidden="true"
            ></div>

            <button
              on:click={() => {
                fileInput?.click();
                showAddMenu = false;
              }}
              class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4 text-purple-500"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                />
              </svg>
              Import File
            </button>

            <button
              on:click={() => {
                javaInput?.click();
                showAddMenu = false;
              }}
              class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4 text-orange-500"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
                />
              </svg>
              Import Java
            </button>

            <button
              on:click={() => {
                isOpen = false;
                showTelemetryDialog.set(true);
                showAddMenu = false;
              }}
              class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-4 text-blue-500"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
                />
              </svg>
              Import Telemetry
            </button>
          </div>
        {/if}
      </div>

      <!-- Hidden Inputs for Imports -->
      <input
        bind:this={javaInput}
        type="file"
        accept=".java"
        class="hidden"
        on:change={onImportJavaSelect}
        tabindex="-1"
      />
      <input
        bind:this={fileInput}
        type="file"
        accept=".turt,.pp"
        class="hidden"
        on:change={onImportFileSelect}
        tabindex="-1"
      />

      <!-- File List / Grid -->
      {#if loading}
        <div
          class="flex-1 flex items-center justify-center text-neutral-400 text-sm h-full"
        >
          <LoadingSpinner />
        </div>
      {:else if filteredFiles.length === 0}
        <div
          class="flex-1 flex flex-col items-center justify-center text-neutral-400 p-8 text-center h-full"
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
              on:click={() => (creatingNewFile = true)}
              >Create a new file</button
            >
          {/if}
        </div>
      {:else if viewMode === "list"}
        <FileList
          bind:this={fileList}
          files={filteredFiles}
          selectedFilePath={selectedFile?.path ?? null}
          {sortMode}
          fieldImage={settings.fieldMap}
          {renamingFile}
          on:select={(e) => (selectedFile = e.detail)}
          on:open={(e) => handleOpen(e.detail)}
          on:rename-start={(e) => (renamingFile = e.detail)}
          on:rename-save={(e) =>
            renamingFile && renameFile(renamingFile, e.detail)}
          on:rename-cancel={() => (renamingFile = null)}
          on:menu-action={handleMenuAction}
          on:move-file={handleMoveFile}
        />
      {:else}
        <FileGrid
          bind:this={fileGrid}
          files={filteredFiles}
          selectedFilePath={selectedFile?.path ?? null}
          {sortMode}
          fieldImage={settings.fieldMap}
          showGitStatus={settings.gitIntegration}
          {renamingFile}
          on:select={(e) => (selectedFile = e.detail)}
          on:open={(e) => handleOpen(e.detail)}
          on:rename-start={(e) => (renamingFile = e.detail)}
          on:rename-save={(e) =>
            renamingFile && renameFile(renamingFile, e.detail)}
          on:rename-cancel={() => (renamingFile = null)}
          on:menu-action={handleMenuAction}
          on:move-file={handleMoveFile}
        />
      {/if}
    </div>

    <!-- Footer Status -->
    <div
      class="p-2 text-xs text-neutral-400 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex justify-between items-center"
    >
      <div class="flex items-center gap-2">
        <button
          on:click={handleRefresh}
          class="p-1 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Refresh"
          aria-label="Refresh"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
        </button>
        <span
          >{filteredFiles.length} file{filteredFiles.length !== 1
            ? "s"
            : ""}</span
        >
      </div>
      {#if selectedFile}
        <span class="truncate max-w-[150px]">{selectedFile.name}</span>
      {/if}
    </div>
  </div>
</div>
