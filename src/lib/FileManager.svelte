<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { fade } from "svelte/transition";
  import { get } from "svelte/store";
  import type { FileInfo, Settings } from "../types/index";
  import {
    currentFilePath,
    isUnsaved,
    notification,
    fileManagerSessionState,
    fileManagerNewFileMode,
    currentDirectoryStore,
    gitStatusStore,
    showTelemetryDialog,
  } from "../stores";
  import {
    linesStore,
    loadMacro,
    loadProjectData,
    sequenceStore,
    shapesStore,
    startPointStore,
    updateAllMacroReferences,
  } from "./projectStore";
  import {
    autosaveBeforeLeaving,
    directoryOf,
    fileNameOf,
    joinPath,
    saveProject,
    writeProjectCopy,
  } from "../utils/fileHandlers";
  import {
    DEFAULT_PROJECT_EXTENSION,
    ensureDefaultProjectExtension,
    getProjectExtensionFromPath,
    isSupportedProjectFileName,
    stripProjectExtension,
  } from "../utils/fileExtensions";
  import { saveAutoPathsDirectory } from "../utils/directorySettings";
  import { saveSettings } from "../utils/settingsPersistence";
  import { mirrorPathData, reversePathData } from "../utils/pathTransform";
  import { scanEventsInDirectory } from "../utils/eventScanner";
  import { getElectronAPI } from "../utils/platform";
  import {
    githubPath,
    isGitHubPath,
    parseGitHubPath,
    repoKey,
  } from "../utils/github/paths";
  import {
    browsingRepo,
    githubRepos,
    type OpenedRepo,
    type UpdateResult,
  } from "../utils/github/repos";
  import { hookRegistry } from "./registries";
  import FileManagerToolbar from "./components/filemanager/FileManagerToolbar.svelte";
  import FileManagerBreadcrumbs from "./components/filemanager/FileManagerBreadcrumbs.svelte";
  import FileList from "./components/filemanager/FileList.svelte";
  import FileGrid from "./components/filemanager/FileGrid.svelte";
  import GitHubOpenDialog from "./components/github/GitHubOpenDialog.svelte";
  import GitHubRepoBar from "./components/github/GitHubRepoBar.svelte";
  import LoadingSpinner from "./components/common/LoadingSpinner.svelte";
  import { followJavaFile } from "./javaFollow";
  import { importJavaProject } from "../utils/javaImporter";
  import { filePreviews } from "./components/filemanager/fileBrowser.svelte";
  import {
    FolderIcon,
    CloudArrowDownIcon,
    CloseIcon,
    PlusIcon,
    DocumentIcon,
    FolderPlusIcon,
    ArrowDownTrayIcon,
    CodeBracketSquareIcon,
    EyeIcon,
    ServerStackIcon,
    ArrowCircleIcon,
    GithubIcon,
  } from "./components/icons";

  interface Props {
    isOpen?: boolean;
    settings: Settings;
  }

  let { isOpen = $bindable(false), settings = $bindable() }: Props = $props();

  const electronAPI = getElectronAPI();

  // Search, view and sort survive closing and reopening the panel.
  const session = get(fileManagerSessionState);
  let searchQuery = $state(session.searchQuery);
  let viewMode: "list" | "grid" = $state(session.viewMode);
  let sortMode: "name" | "date" = $state(
    settings.fileManagerSortMode ?? session.sortMode ?? "date",
  );
  let showJavaFiles = $state(session.showJavaFiles ?? false);

  /** The folder the user chose; browsing never goes above it. */
  let baseDirectory = $state("");
  let currentDirectory = $state("");
  let files: FileInfo[] = $state([]);
  let loading = $state(false);
  let errorMessage = $state("");
  let selectedFile: FileInfo | null = $state(null);
  let renamingFile: FileInfo | null = $state(null);

  let creatingNewFile = $state(false);
  let newFileName = $state("");
  let creatingNewFolder = $state(false);
  let newFolderName = $state("");

  let showAddMenu = $state(false);
  let isDraggingPath = $state(false);
  let sidebarWidth = $state(600);

  let fileInput: HTMLInputElement | undefined = $state();
  let javaInput: HTMLInputElement | undefined = $state();

  let showGitHubDialog = $state(false);
  /** The GitHub repository being browsed, if not this device's files. */
  let repo = $derived.by(() => {
    const parsed = parseGitHubPath(baseDirectory);
    return parsed && { owner: parsed.owner, repo: parsed.repo };
  });

  let visibleFiles = $derived.by(() => {
    const query = searchQuery.toLowerCase();
    return files
      .filter((f) => f.name.toLowerCase().includes(query))
      .sort((a, b) => {
        if (a.name === "..") return -1;
        if (b.name === "..") return 1;
        if (!!a.isDirectory !== !!b.isDirectory) return a.isDirectory ? -1 : 1;
        return sortMode === "name"
          ? a.name.localeCompare(b.name)
          : new Date(b.modified).getTime() - new Date(a.modified).getTime();
      });
  });

  $effect(() => {
    fileManagerSessionState.set({
      searchQuery,
      viewMode,
      sortMode,
      showJavaFiles,
    });
  });
  $effect(() => {
    if (currentDirectory) currentDirectoryStore.set(currentDirectory);
  });
  // Other parts of the app can ask for the "new file" form.
  $effect(() => {
    if ($fileManagerNewFileMode) {
      creatingNewFile = true;
      fileManagerNewFileMode.set(false);
    }
  });

  onMount(loadDirectory);

  function notify(
    message: string,
    type: "success" | "error" | "warning" | "info" = "info",
  ) {
    notification.set({ message, type, timeout: 3000 });
  }

  const errorText = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  function setSortMode(mode: "name" | "date") {
    sortMode = mode;
    if (settings.fileManagerSortMode === mode) return;
    settings = { ...settings, fileManagerSortMode: mode };
    saveSettings(settings).catch((e) =>
      console.error("Failed to save file manager sort mode:", e),
    );
  }

  // --- Browsing ---

  async function loadDirectory() {
    if (!electronAPI) {
      errorMessage = "File system API is not available";
      return;
    }
    loading = true;
    errorMessage = "";
    try {
      if (await showOpenRepo()) return;
      const saved = (await electronAPI.getSavedDirectory?.())?.trim();
      const dir = saved || (await electronAPI.getDirectory?.()) || "";
      baseDirectory = currentDirectory = dir;
      await refreshDirectory();
    } catch (error) {
      console.error("Error loading directory:", error);
      errorMessage = `Failed to load directory: ${errorText(error)}`;
    } finally {
      loading = false;
    }
  }

  /** Shows the repository the file manager was showing last, if it's still open. */
  async function showOpenRepo(): Promise<boolean> {
    const key = get(browsingRepo);
    if (!key) return false;
    const [owner, name] = key.split("/");
    const record = await githubRepos.get({ owner, repo: name });
    if (!record) {
      browsingRepo.set(null);
      return false;
    }
    baseDirectory = githubPath(record);
    currentDirectory = githubRepos.startFolder(record);
    await refreshDirectory();
    return true;
  }

  const javaImportCache = new Map<
    string,
    { mtime: number; hasImportablePaths: boolean }
  >();

  function toggleShowJavaFiles() {
    showJavaFiles = !showJavaFiles;
    refreshDirectory();
  }

  async function refreshDirectory() {
    if (!electronAPI || !currentDirectory.trim()) return;

    try {
      const listed = await electronAPI.listFiles(currentDirectory);
      // Repositories opened from GitHub always show what's been edited.
      if (settings.gitIntegration || isGitHubPath(currentDirectory)) {
        gitStatusStore.update((statuses) => {
          const next = { ...statuses };
          for (const f of listed) {
            if (f.gitStatus && f.gitStatus !== "clean") {
              next[f.path] = f.gitStatus;
            } else {
              delete next[f.path];
            }
          }
          return next;
        });
      }

      const validFiles: FileInfo[] = [];
      for (const f of listed) {
        if (f.isDirectory || isSupportedProjectFileName(f.name)) {
          validFiles.push(f);
        } else if (showJavaFiles && f.name.toLowerCase().endsWith(".java")) {
          const mtime = new Date(f.modified).getTime();
          const cached = javaImportCache.get(f.path);
          let hasPaths = false;
          if (cached && cached.mtime === mtime) {
            hasPaths = cached.hasImportablePaths;
          } else {
            try {
              const content = await electronAPI.readFile?.(f.path);
              if (content) {
                const imported = importJavaProject(content);
                hasPaths = !!(imported.lines && imported.lines.length > 0);
              }
            } catch {
              hasPaths = false;
            }
            javaImportCache.set(f.path, {
              mtime,
              hasImportablePaths: hasPaths,
            });
          }
          if (hasPaths) {
            validFiles.push(f);
          }
        }
      }

      files = validFiles;
      if (currentDirectory !== baseDirectory) {
        files.unshift({
          name: "..",
          path: directoryOf(currentDirectory),
          isDirectory: true,
          size: 0,
          modified: new Date(),
        });
      }
      errorMessage = "";
      scanEventsInDirectory(currentDirectory);
    } catch (error) {
      console.error("Error refreshing directory:", error);
      errorMessage = `Error accessing directory: ${errorText(error)}`;
      files = [];
    }
  }

  async function openDirectory(dir: string) {
    currentDirectory = dir;
    await refreshDirectory();
    if (isGitHubPath(dir)) void githubRepos.rememberFolder(dir);
  }

  async function showRepo({ record, folder, file }: OpenedRepo) {
    browsingRepo.set(repoKey(record));
    baseDirectory = githubPath(record);
    await openDirectory(folder);
    if (file) {
      await loadFile({
        name: fileNameOf(file),
        path: file,
        size: 0,
        modified: new Date(),
      });
    }
  }

  async function leaveRepo() {
    browsingRepo.set(null);
    await loadDirectory();
  }

  /** After a commit or an update from GitHub. */
  async function handleRepoChanged(update?: UpdateResult) {
    await refreshDirectory();
    if (update?.status !== "updated") return;

    const open = get(currentFilePath);
    if (!open || !update.changedOnGitHub.includes(open)) return;
    if (get(isUnsaved)) {
      notify(
        `${fileNameOf(open)} changed on GitHub. Your unsaved edits are still open; reopen the file to see GitHub's version.`,
        "warning",
      );
    } else if (await electronAPI?.fileExists(open)) {
      await loadFile({
        name: fileNameOf(open),
        path: open,
        size: 0,
        modified: new Date(),
      });
    }
  }

  async function chooseBaseDirectory() {
    if (!electronAPI?.setDirectory) {
      notify(
        "Directory selection is not supported in this environment",
        "error",
      );
      return;
    }
    try {
      const dir = await electronAPI.setDirectory();
      if (!dir) return;
      browsingRepo.set(null);
      baseDirectory = dir;
      await saveAutoPathsDirectory(dir);
      await openDirectory(dir);
      notify(`Directory changed to: ${fileNameOf(dir)}`, "success");
    } catch (error) {
      errorMessage = `Failed to change directory: ${errorText(error)}`;
    }
  }

  async function goUpDirectory() {
    if (currentDirectory === baseDirectory) return;
    const parent = directoryOf(currentDirectory);
    await openDirectory(
      parent.startsWith(baseDirectory) ? parent : baseDirectory,
    );
  }

  async function navigateTo(dir: string) {
    if (!dir) return;
    if (!dir.startsWith(baseDirectory)) {
      notify("Cannot navigate outside the base directory", "error");
      return;
    }
    await openDirectory(dir);
    if (!errorMessage) notify("Directory changed", "success");
  }

  async function handleRefresh() {
    await refreshDirectory();
    for (const f of files) {
      if (!f.isDirectory) filePreviews.reload(f.path);
    }
    notify("Refreshed files and previews", "success");
  }

  function handleOpen(file: FileInfo) {
    if (!file.isDirectory) loadFile(file);
    else if (file.name === "..") goUpDirectory();
    else openDirectory(file.path);
  }

  // --- Opening and importing ---

  async function loadFile(file: FileInfo) {
    if (file.name.toLowerCase().endsWith(".java")) {
      const ok = await followJavaFile(file.path);
      if (ok) {
        isOpen = false;
        selectedFile = file;
      }
      return;
    }
    await autosaveBeforeLeaving();
    try {
      if (!electronAPI?.readFile) {
        notify("File reading is not supported in this environment", "error");
        return;
      }
      const content = await electronAPI.readFile(file.path);
      if (!content) throw new Error("File is empty or could not be read");
      const data = JSON.parse(content);
      if (!data.startPoint || !data.lines) {
        throw new Error("Invalid file format");
      }

      await loadProjectData(data, file.path);
      currentFilePath.set(file.path);
      isUnsaved.set(false);
      selectedFile = file;
      notify(`Loaded: ${file.name}`, "success");
      filePreviews.reload(file.path);
    } catch (error) {
      notify(`Error loading file: ${errorText(error)}`, "error");
    }
  }

  const confirmDiscardChanges = (what: string) =>
    !get(isUnsaved) ||
    confirm(
      `You have unsaved changes that will be lost. Are you sure you want to import ${what}?`,
    );

  /** Copies a project file into the current folder and opens it. */
  async function importProjectFile(file: File) {
    if (!isSupportedProjectFileName(file.name)) {
      notify("Please select a .turt or .pp file", "error");
      return;
    }
    if (!confirmDiscardChanges("a new file")) return;

    try {
      const content = await file.text();
      const data = JSON.parse(content);
      if (!data.startPoint || !data.lines) {
        throw new Error("Invalid project file format");
      }

      // Without a folder (in the browser), just load it as unsaved work.
      if (!electronAPI || !currentDirectory) {
        await loadProjectData(data);
        currentFilePath.set(null);
        isUnsaved.set(true);
        selectedFile = null;
        notify(`Imported: ${file.name}`, "success");
        return;
      }

      const destination = joinPath(currentDirectory, file.name);
      if (
        (await electronAPI.fileExists?.(destination)) &&
        !confirm(
          `File "${file.name}" already exists in "${fileNameOf(currentDirectory)}". Overwrite?`,
        )
      ) {
        return;
      }
      await electronAPI.writeFile(destination, content);
      await refreshDirectory();
      const imported = files.find((f) => f.name === file.name);
      if (imported) await loadFile(imported);
      else notify("File imported but not found in list", "warning");
    } catch (error) {
      notify(`Import failed: ${errorText(error)}`, "error");
    }
  }

  /** Converts a Java auto file into a project, saved next to the others. */
  async function importJavaFile(file: File) {
    if (!file.name.endsWith(".java")) {
      notify("Please select a .java file", "error");
      return;
    }
    if (!confirmDiscardChanges("a new Java file")) return;

    try {
      const imported = importJavaProject(await file.text());
      startPointStore.set(imported.startPoint);
      linesStore.set(imported.lines);
      shapesStore.set(imported.shapes || []);
      sequenceStore.set(imported.sequence);
      if (imported.extraData?.settings) {
        settings = imported.extraData.settings;
      }

      const projectName = file.name.replace(
        /\.java$/,
        DEFAULT_PROJECT_EXTENSION,
      );
      if (electronAPI && currentDirectory) {
        await saveProject({
          path: joinPath(currentDirectory, projectName),
          quiet: true,
        });
        await refreshDirectory();
      } else {
        currentFilePath.set(projectName);
        isUnsaved.set(false);
      }

      notify(`Successfully imported ${file.name}`, "success");
      isOpen = false;
    } catch (error) {
      console.error("Error importing Java file:", error);
      notify(`Error importing Java file: ${errorText(error)}`, "error");
    }
  }

  function onFileChosen(e: Event, handle: (file: File) => void) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) handle(file);
    input.value = "";
  }

  // --- Creating and saving ---

  async function createNewFolder(name: string) {
    const folderName = name.trim();
    if (!folderName) return;
    if (!electronAPI?.createDirectory) {
      notify("Creating folders is not supported in this environment", "error");
      return;
    }

    const dirPath = joinPath(currentDirectory, folderName);
    try {
      if (await electronAPI.fileExists?.(dirPath)) {
        notify(`Folder "${folderName}" already exists.`, "error");
        return;
      }
      await electronAPI.createDirectory(dirPath);
      creatingNewFolder = false;
      newFolderName = "";
      await refreshDirectory();
      notify(`Created folder: ${folderName}`, "success");
    } catch (error) {
      notify(`Failed to create folder: ${errorText(error)}`, "error");
    }
  }

  /** Saves the current project as a new file in this folder and opens it. */
  async function createNewFile(name: string) {
    if (!name.trim()) return;
    if (!electronAPI?.writeFile) {
      notify("Creating files is not supported in this environment", "error");
      return;
    }

    const fileName = ensureDefaultProjectExtension(name.trim());
    const filePath = joinPath(currentDirectory, fileName);
    await autosaveBeforeLeaving();

    try {
      if (
        (await electronAPI.fileExists?.(filePath)) &&
        !confirm(`File "${fileName}" already exists. Overwrite?`)
      ) {
        return;
      }
      if (!(await saveProject({ path: filePath, quiet: true }))) return;

      creatingNewFile = false;
      newFileName = "";
      await refreshDirectory();
      selectedFile = files.find((f) => f.path === filePath) ?? null;
      notify(`Created: ${fileName}`, "success");
      filePreviews.reload(filePath);
    } catch (error) {
      notify(`Failed to create: ${errorText(error)}`, "error");
    }
  }

  /** Writes the current project over `target`, keeping the open file as is. */
  async function saveCurrentToFile(target: FileInfo) {
    if (!electronAPI?.writeFile) {
      notify("Saving files is not supported in this environment", "error");
      return;
    }
    try {
      await writeProjectCopy(target.path);
      await refreshDirectory();
      if (target.path === get(currentFilePath)) isUnsaved.set(false);
      notify(`Saved to: ${target.name}`, "success");
      // Projects that use this file as a macro should see the new contents.
      loadMacro(target.path, true);
      filePreviews.reload(target.path);
    } catch (error) {
      notify(`Failed to save: ${errorText(error)}`, "error");
    }
  }

  const DUPLICATE_MODES = {
    copy: { suffix: "_copy", label: "Duplicated", transform: (d: any) => d },
    mirror: {
      suffix: "_mirrored",
      label: "Mirrored",
      transform: mirrorPathData,
    },
    reverse: {
      suffix: "_reversed",
      label: "Reversed",
      transform: reversePathData,
    },
  };

  async function duplicateFile(
    file: FileInfo,
    mode: keyof typeof DUPLICATE_MODES,
  ) {
    if (!electronAPI?.readFile || !electronAPI.writeFile) {
      notify("File operations are not supported in this environment", "error");
      return;
    }
    const { suffix, label, transform } = DUPLICATE_MODES[mode];
    try {
      const content = await electronAPI.readFile(file.path);
      if (!content) throw new Error("File is empty or could not be read");
      const data = transform(JSON.parse(content));

      // name_copy.turt, then name_copy1.turt, name_copy2.turt, ...
      const base = stripProjectExtension(file.name) + suffix;
      let newName = base + DEFAULT_PROJECT_EXTENSION;
      for (
        let n = 1;
        await electronAPI.fileExists?.(joinPath(currentDirectory, newName));
        n++
      ) {
        newName = `${base}${n}${DEFAULT_PROJECT_EXTENSION}`;
      }

      await hookRegistry.run("onSave", data);
      const newPath = joinPath(currentDirectory, newName);
      await electronAPI.writeFile(newPath, JSON.stringify(data, null, 2));
      await refreshDirectory();
      notify(`${label}: ${newName}`, "success");
      filePreviews.reload(newPath);
    } catch (error) {
      notify(`Failed to duplicate: ${errorText(error)}`, "error");
    }
  }

  // --- Renaming, moving and deleting ---

  /**
   * Moves `from` to `to` on disk and updates everything that pointed at the
   * old location: the open file, the selection and macro references.
   */
  async function relocate(from: string, to: string): Promise<boolean> {
    if (!electronAPI?.renameFile) {
      notify("Moving files is not supported in this environment", "error");
      return false;
    }
    const result = await electronAPI.renameFile(from, to);
    if (!result.success) return false;

    // `from` may be the open file or a folder that contains it.
    const moved = (p: string) =>
      p === from || p.startsWith(from + "/") || p.startsWith(from + "\\")
        ? to + p.slice(from.length)
        : p;
    const openPath = get(currentFilePath);
    if (openPath) currentFilePath.set(moved(openPath));
    if (selectedFile) {
      selectedFile = {
        ...selectedFile,
        name: fileNameOf(moved(selectedFile.path)),
        path: moved(selectedFile.path),
      };
    }

    const { mainSequenceChanged } = await updateAllMacroReferences(from, to);
    // Save straight away so the open file doesn't keep a stale macro path.
    if (mainSequenceChanged) {
      isUnsaved.set(true);
      const current = get(currentFilePath);
      if (current) await saveProject({ path: current, quiet: true });
    }
    return true;
  }

  async function renameFile(file: FileInfo, newName: string) {
    renamingFile = null;
    const cleanName = newName.trim();
    if (!cleanName) return;

    // Keep the extension if the user leaves it off.
    const fileName =
      file.isDirectory ||
      isSupportedProjectFileName(cleanName) ||
      cleanName.toLowerCase().endsWith(".java")
        ? cleanName
        : cleanName + getProjectExtensionFromPath(file.name);
    if (fileName === file.name) return;

    const newPath = joinPath(currentDirectory, fileName);
    try {
      if (await electronAPI?.fileExists?.(newPath)) {
        notify(`File "${fileName}" already exists`, "error");
        return;
      }
      if (await relocate(file.path, newPath)) {
        notify(`Renamed to: ${fileName}`, "success");
        await refreshDirectory();
      }
    } catch (error) {
      notify(`Failed to rename: ${errorText(error)}`, "error");
    }
  }

  async function moveFile({
    sourceFile,
    targetDir,
  }: {
    sourceFile: FileInfo;
    targetDir: FileInfo;
  }) {
    if (!targetDir.isDirectory || sourceFile.name === "..") return;
    if (sourceFile.path === targetDir.path) return;

    const isParent = targetDir.name === "..";
    const destination = isParent
      ? directoryOf(currentDirectory)
      : targetDir.path;
    try {
      if (
        await relocate(sourceFile.path, joinPath(destination, sourceFile.name))
      ) {
        notify(
          `Moved to ${isParent ? "parent folder" : targetDir.name}`,
          "success",
        );
        await refreshDirectory();
      }
    } catch (error) {
      notify(`Failed to move: ${errorText(error)}`, "error");
    }
  }

  async function deleteFile(file: FileInfo) {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return;
    try {
      await electronAPI?.deleteFile?.(file.path);
      if (selectedFile?.path === file.path) {
        selectedFile = null;
        currentFilePath.set(null);
      }
      await refreshDirectory();
      notify(`Deleted: ${file.name}`, "success");
    } catch (error) {
      notify(`Failed to delete: ${errorText(error)}`, "error");
    }
  }

  function handleMenuAction({
    action,
    file,
  }: {
    action: string;
    file: FileInfo;
  }) {
    switch (action) {
      case "open":
        return handleOpen(file);
      case "rename-start":
        renamingFile = file;
        return;
      case "delete":
        return deleteFile(file);
      case "duplicate":
        return duplicateFile(file, "copy");
      case "mirror":
      case "reverse":
        return duplicateFile(file, action);
      case "save-to":
        return saveCurrentToFile(file);
    }
  }

  // --- Panel UI ---

  function startResize() {
    const resize = (e: MouseEvent) => {
      sidebarWidth = Math.max(250, Math.min(e.clientX, 800));
    };
    const stop = () => {
      globalThis.removeEventListener("mousemove", resize);
      globalThis.removeEventListener("mouseup", stop);
    };
    globalThis.addEventListener("mousemove", resize);
    globalThis.addEventListener("mouseup", stop);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen && !creatingNewFile && !renamingFile) {
      isOpen = false;
    }
  }

  function handleWindowClick(e: MouseEvent) {
    if (
      showAddMenu &&
      !(e.target as HTMLElement).closest(".floating-add-container")
    ) {
      showAddMenu = false;
    }
  }

  /** Focuses an input when it appears. */
  function autofocus(node: HTMLInputElement) {
    tick().then(() => node.focus());
  }
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleWindowClick} />

<div class="fixed inset-0 z-[1010] flex" class:pointer-events-none={!isOpen}>
  <!-- Backdrop -->
  {#if isOpen}
    <div
      transition:fade={{ duration: 200 }}
      class="fixed inset-0 bg-black/50"
      onclick={() => (isOpen = false)}
      role="button"
      tabindex="0"
      aria-label="Close file manager"
      onkeydown={(e) => {
        if (e.key === "Escape") isOpen = false;
      }}
    ></div>
  {/if}

  <!-- Drop Zone (Right Area) -->
  {#if isOpen && isDraggingPath}
    <div
      class="fixed inset-0 pointer-events-none flex items-center justify-center bg-purple-500/10 z-[1015]"
      style="left: {sidebarWidth}px;"
    >
      <div
        class="bg-white dark:bg-neutral-800 p-8 rounded-xl shadow-2xl flex flex-col items-center border-4 border-dashed border-purple-500 animate-pulse"
      >
        <CloudArrowDownIcon
          className="h-16 w-16 text-purple-600 dark:text-purple-400 mb-4"
        />
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
    ondragstart={() => (isDraggingPath = true)}
    ondragend={() => (isDraggingPath = false)}
    ondragover={(e) => {
      e.stopPropagation();
      e.preventDefault();
    }}
    ondrop={(e) => {
      e.stopPropagation();
      e.preventDefault();
    }}
  >
    <!-- Resizer Handle -->
    <button
      type="button"
      class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-50 transition-colors appearance-none bg-transparent"
      onmousedown={startResize}
      aria-label="Resize sidebar"
      title="Resize sidebar"
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
      <span class="flex-1"></span>
      <button
        onclick={() => (showGitHubDialog = true)}
        class="p-1.5 mr-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-700 dark:text-neutral-300"
        title="Open from GitHub"
        aria-label="Open from GitHub"
      >
        <GithubIcon className="size-5" />
      </button>
      <button
        onclick={() => (isOpen = false)}
        class="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        aria-label="Close"
      >
        <CloseIcon className="size-5" />
      </button>
    </div>

    <!-- Toolbar -->
    <div class="relative z-[60] overflow-visible">
      <FileManagerToolbar
        {searchQuery}
        {sortMode}
        {viewMode}
        {showJavaFiles}
        onsearch={(val) => (searchQuery = val)}
        onsortchange={setSortMode}
        onviewchange={(val) => {
          viewMode = val;
          filePreviews.reloadFailed();
        }}
        ontogglejava={toggleShowJavaFiles}
      />
    </div>

    <!-- Breadcrumbs -->
    <FileManagerBreadcrumbs
      currentPath={currentDirectory}
      isAtBase={currentDirectory === baseDirectory}
      onchangeDir={navigateTo}
      onchangeDirDialog={chooseBaseDirectory}
      ongoUp={goUpDirectory}
    />

    {#if repo}
      <GitHubRepoBar {repo} onleave={leaveRepo} onchanged={handleRepoChanged} />
    {/if}

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
          use:autofocus
          class="w-full px-2 py-1.5 text-sm border border-blue-400 rounded focus:outline-none bg-white dark:bg-neutral-700 mb-2"
          placeholder="New Folder"
          onkeydown={(e) => {
            if (e.key === "Enter") createNewFolder(newFolderName);
            if (e.key === "Escape") creatingNewFolder = false;
          }}
        />

        <div class="flex gap-2">
          <button
            class="flex-1 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            onclick={() => createNewFolder(newFolderName)}>Create</button
          >
          <button
            class="flex-1 py-1 text-xs bg-neutral-400 text-white rounded hover:bg-neutral-500"
            onclick={() => (creatingNewFolder = false)}>Cancel</button
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
          use:autofocus
          class="w-full px-2 py-1.5 text-sm border border-blue-400 rounded focus:outline-none bg-white dark:bg-neutral-700 mb-2"
          placeholder="path_name.turt"
          onkeydown={(e) => {
            if (e.key === "Enter") createNewFile(newFileName);
            if (e.key === "Escape") creatingNewFile = false;
          }}
        />

        <div class="flex gap-2">
          <button
            class="flex-1 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
            onclick={() => createNewFile(newFileName)}>Create</button
          >
          <button
            class="flex-1 py-1 text-xs bg-neutral-400 text-white rounded hover:bg-neutral-500"
            onclick={() => (creatingNewFile = false)}>Cancel</button
          >
        </div>
      </div>
    {/if}

    <!-- File List / Grid Container with Floating Menu -->
    <div class="relative flex-1 overflow-hidden flex flex-col">
      <!-- Floating Add Dropdown -->
      <div class="absolute top-4 right-4 z-[100] floating-add-container">
        <button
          onclick={() => (showAddMenu = !showAddMenu)}
          class="flex items-center justify-center p-1.5 text-neutral-500 hover:text-green-600 dark:text-neutral-400 dark:hover:text-green-400 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          title="Add / Import"
          aria-label="Add / Import"
          aria-haspopup="true"
          aria-expanded={showAddMenu}
        >
          <PlusIcon className="size-5" />
        </button>

        {#if showAddMenu}
          <div
            class="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-neutral-800 rounded-md shadow-xl border border-neutral-200 dark:border-neutral-700 py-1 flex flex-col overflow-hidden"
          >
            <button
              onclick={() => {
                creatingNewFile = true;
                showAddMenu = false;
              }}
              class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <DocumentIcon className="size-4 text-green-500" />
              New File
            </button>

            <button
              onclick={() => {
                creatingNewFolder = true;
                showAddMenu = false;
              }}
              class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <FolderPlusIcon className="size-4 text-blue-500" />
              New Folder
            </button>

            <div
              class="h-px bg-neutral-200 dark:bg-neutral-700 my-1 w-full"
              role="presentation"
              aria-hidden="true"
            ></div>

            <button
              onclick={() => {
                fileInput?.click();
                showAddMenu = false;
              }}
              class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <ArrowDownTrayIcon className="size-4 text-purple-500" />
              Import File
            </button>

            <button
              onclick={() => {
                javaInput?.click();
                showAddMenu = false;
              }}
              class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <CodeBracketSquareIcon className="size-4 text-orange-500" />
              Import Java
            </button>

            {#if electronAPI?.followJavaFile}
              <button
                onclick={async () => {
                  showAddMenu = false;
                  if (await followJavaFile()) isOpen = false;
                }}
                title="Show a Java file's paths on the field, updated each time you save it in your editor"
                class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
              >
                <EyeIcon className="size-4 text-green-600" />
                Follow Java File
              </button>
            {/if}

            <button
              onclick={() => {
                showGitHubDialog = true;
                showAddMenu = false;
              }}
              class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <GithubIcon className="size-4" />
              Open from GitHub
            </button>

            <button
              onclick={() => {
                isOpen = false;
                showTelemetryDialog.set(true);
                showAddMenu = false;
              }}
              class="px-4 py-2 text-sm text-left text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <ServerStackIcon className="size-4 text-blue-500" />
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
        onchange={(e) => onFileChosen(e, importJavaFile)}
        tabindex="-1"
      />
      <input
        bind:this={fileInput}
        type="file"
        accept=".turt,.pp"
        class="hidden"
        onchange={(e) => onFileChosen(e, importProjectFile)}
        tabindex="-1"
      />

      <!-- File List / Grid -->
      {#if loading}
        <div
          class="flex-1 flex items-center justify-center text-neutral-400 text-sm h-full"
        >
          <LoadingSpinner />
        </div>
      {:else if visibleFiles.length === 0}
        <div
          class="flex-1 flex flex-col items-center justify-center text-neutral-400 p-8 text-center h-full"
        >
          <DocumentIcon className="size-12 mb-2 opacity-30" />
          <p class="text-sm">No files found</p>
          {#if searchQuery}
            <button
              class="text-xs text-blue-500 mt-2 hover:underline"
              onclick={() => (searchQuery = "")}>Clear search</button
            >
          {:else}
            <button
              class="text-xs text-blue-500 mt-2 hover:underline"
              onclick={() => (creatingNewFile = true)}>Create a new file</button
            >
          {/if}
        </div>
      {:else if viewMode === "list"}
        <FileList
          files={visibleFiles}
          selectedFilePath={selectedFile?.path ?? null}
          {sortMode}
          fieldImage={settings.fieldMap}
          {renamingFile}
          onselect={(file) => (selectedFile = file)}
          onopen={(file) => handleOpen(file)}
          onrenameStart={(file) => (renamingFile = file)}
          onrenameSave={(name) =>
            renamingFile && renameFile(renamingFile, name)}
          onrenameCancel={() => (renamingFile = null)}
          onmenuAction={handleMenuAction}
          onmoveFile={moveFile}
          lockFolders={!!repo}
        />
      {:else}
        <FileGrid
          files={visibleFiles}
          selectedFilePath={selectedFile?.path ?? null}
          {sortMode}
          fieldImage={settings.fieldMap}
          showGitStatus={settings.gitIntegration || !!repo}
          {renamingFile}
          onselect={(file) => (selectedFile = file)}
          onopen={(file) => handleOpen(file)}
          onrenameStart={(file) => (renamingFile = file)}
          onrenameSave={(name) =>
            renamingFile && renameFile(renamingFile, name)}
          onrenameCancel={() => (renamingFile = null)}
          onmenuAction={handleMenuAction}
          onmoveFile={moveFile}
          lockFolders={!!repo}
        />
      {/if}
    </div>

    <!-- Footer Status -->
    <div
      class="p-2 text-xs text-neutral-400 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex justify-between items-center"
    >
      <div class="flex items-center gap-2">
        <button
          onclick={handleRefresh}
          class="p-1 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Refresh"
          aria-label="Refresh"
        >
          <ArrowCircleIcon className="size-4" />
        </button>
        <span
          >{visibleFiles.length} file{visibleFiles.length === 1
            ? ""
            : "s"}</span
        >
      </div>
      {#if selectedFile}
        <span class="truncate max-w-[150px]">{selectedFile.name}</span>
      {/if}
    </div>
  </div>
</div>

<GitHubOpenDialog bind:show={showGitHubDialog} onopened={showRepo} />
