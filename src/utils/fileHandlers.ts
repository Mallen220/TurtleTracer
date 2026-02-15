// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  currentFilePath,
  isUnsaved,
  notification,
  projectMetadataStore,
  currentDirectoryStore,
} from "../stores";
import { scanEventsInDirectory } from "./eventScanner";
import {
  startPointStore,
  linesStore,
  shapesStore,
  sequenceStore,
  settingsStore,
  extraDataStore,
  macrosStore,
  updateMacroContent,
  loadProjectData,
} from "../lib/projectStore";
import { loadTrajectoryFromFile, downloadTrajectory } from "./index";
import {
  generateJavaCode,
  generatePointsArray,
  generateSequentialCommandCode,
} from "./codeExporter";
import type { Line, Point, SequenceItem, Settings, Shape } from "../types";
import { makeId } from "./nameGenerator";
import pkg from "../../package.json";

export { loadProjectData };

interface ExtendedElectronAPI {
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  writeFileBase64?: (
    filePath: string,
    base64Content: string,
  ) => Promise<boolean>;
  showSaveDialog?: (options: any) => Promise<string | null>;
  getDirectory?: () => Promise<string | null>;
  getSavedDirectory?: () => Promise<string>;
  fileExists?: (filePath: string) => Promise<boolean>;
  readFile?: (filePath: string) => Promise<string>;
  onMenuAction?: (callback: (action: string) => void) => void;
  copyFile?: (src: string, dest: string) => Promise<boolean>;
  saveFile?: (
    content: string,
    path?: string,
  ) => Promise<{ success: boolean; filepath: string; error?: string }>;
  makeRelativePath?: (base: string, target: string) => Promise<string>;
  resolvePath?: (base: string, relative: string) => Promise<string>;
  createDirectory?: (dirPath: string) => Promise<boolean>;
}

// Access electronAPI dynamically to allow mocking/runtime changes
function getElectronAPI(): ExtendedElectronAPI | undefined {
  return (window as any).electronAPI as ExtendedElectronAPI | undefined;
}

function addToRecentFiles(path: string, settings?: Settings) {
  const currentSettings = settings || get(settingsStore);
  let recent = currentSettings.recentFiles || [];

  // Remove if exists
  recent = recent.filter((f) => f !== path);
  // Add to top
  recent.unshift(path);
  // Limit to 10
  if (recent.length > 10) recent = recent.slice(0, 10);

  settingsStore.update((s) => ({ ...s, recentFiles: recent }));
}

export async function loadRecentFile(path: string) {
  // Autosave on Close Logic
  const settings = get(settingsStore);
  if (
    settings.autosaveMode === "close" &&
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

  const electronAPI = getElectronAPI();
  if (!electronAPI || !electronAPI.readFile) {
    alert("Cannot load files in this environment");
    return;
  }
  try {
    if (electronAPI.fileExists && !(await electronAPI.fileExists(path))) {
      if (
        confirm(
          `File not found: ${path}\nDo you want to remove it from recent files?`,
        )
      ) {
        const settings = get(settingsStore);
        settings.recentFiles = settings.recentFiles?.filter((p) => p !== path);
        settingsStore.set({ ...settings });
      }
      return;
    }
    const content = await electronAPI.readFile(path);
    const data = JSON.parse(content);
    await loadProjectData(data, path);
    currentFilePath.set(path);
    projectMetadataStore.set({ filepath: path, lastSaved: new Date() });
    addToRecentFiles(path);
  } catch (err) {
    console.error("Error loading recent file:", err);
    alert("Failed to load file: " + (err as Error).message);
  }
}

// Internal implementation of save logic
async function performSave(
  startPoint: Point,
  lines: Line[],
  settings: Settings,
  sequence: SequenceItem[],
  shapes: Shape[],
  targetPath: string | undefined,
  options: { quiet?: boolean } = {},
) {
  const electronAPI = getElectronAPI();
  const extraData = get(extraDataStore);
  try {
    // Basic validation
    if (!sequence || sequence.length === 0) {
      // Auto-generate sequence if missing
      sequence = lines.map((l) => ({ kind: "path", lineId: l.id! }));
    }

    // Ensure all items have IDs
    lines.forEach((l) => {
      if (!l.id) l.id = makeId();
    });
    sequence.forEach((s) => {
      if (s.kind === "wait" && !s.id) s.id = makeId();
    });

    // --- PREPARE FOR SAVE: Handle Linked Names ---
    // Deep copy lines and sequence to modify names for saving without affecting the UI
    const linesToSave = structuredClone(lines);
    const sequenceToSave = structuredClone(sequence);

    // Track usage of names to detect duplicates
    const nameGroups = new Map<string, Array<Line | any>>(); // any for SequenceWaitItem

    // Helper to collect items
    const collectItems = (items: Array<Line | any>, type: "line" | "wait") => {
      items.forEach((item) => {
        const name = item.name?.trim();
        if (name) {
          if (!nameGroups.has(name)) {
            nameGroups.set(name, []);
          }
          nameGroups.get(name)!.push(item);
        }
      });
    };

    collectItems(linesToSave, "line");
    const waits = sequenceToSave.filter((s) => s.kind === "wait");
    collectItems(waits, "wait");

    // Process groups
    nameGroups.forEach((group, name) => {
      if (group.length > 1) {
        // We have duplicates. Assign unique names and store original in metadata.
        group.forEach((item, index) => {
          item._linkedName = name;
          item.name = `${name} (${index + 1})`;
        });
      }
    });

    // --- DETERMINE SAVE PATH EARLY ---
    // Always try to get the path first so we can relativize macros
    if (!targetPath && electronAPI) {
      if (electronAPI.showSaveDialog) {
        const filePath = await electronAPI.showSaveDialog({
          title: "Save Project",
          defaultPath: "trajectory.pp",
          filters: [{ name: "Pedro Path", extensions: ["pp"] }],
        });
        if (!filePath) return false;
        targetPath = filePath;
      } else {
        return false;
      }
    }

    // --- RELATIVIZE MACRO PATHS ---
    // Now that we have a target path, convert macro paths to be relative
    if (targetPath && electronAPI && electronAPI.makeRelativePath) {
      for (const item of sequenceToSave) {
        if (item.kind === "macro") {
          item.filePath = await electronAPI.makeRelativePath(
            targetPath,
            item.filePath,
          );
        }
      }
    }

    // Create the project data structure
    const projectData = {
      version: pkg.version,
      header: {
        info: "Created with Pedro Pathing Plus Visualizer",
        copyright:
          "Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.",
        link: "https://github.com/Mallen220/PedroPathingPlusVisualizer",
      },
      startPoint,
      lines: linesToSave,
      sequence: sequenceToSave,
      shapes,
      extraData,
    };

    const jsonString = JSON.stringify(projectData, null, 2);

    if (electronAPI && electronAPI.saveFile) {
      // Use the new saveFile API if available (mocked in tests)
      const result = await electronAPI.saveFile(jsonString, targetPath);
      if (result.success) {
        projectMetadataStore.update((m) => ({
          ...m,
          filepath: result.filepath,
        }));
        currentFilePath.set(result.filepath);
        addToRecentFiles(result.filepath, settings);
        isUnsaved.set(false);
        if (!options.quiet) {
          notification.set({
            message: `Project saved to ${result.filepath}`,
            type: "success",
            timeout: 3000,
          });
        }

        // Update macro cache if this file is being used as a macro in the current project
        const macros = get(macrosStore);
        if (result.filepath && macros.has(result.filepath)) {
          updateMacroContent(result.filepath, projectData as any);
        }

        const dir = get(currentDirectoryStore);
        if (dir) scanEventsInDirectory(dir);

        await handleAutoExport(
          startPoint,
          lines,
          sequence,
          settings,
          shapes,
          projectData,
          result.filepath,
        );
        return true;
      } else {
        if (result.error !== "canceled") {
          notification.set({
            message: `Failed to save: ${result.error}`,
            type: "error",
            timeout: 5000,
          });
        }
        return false;
      }
    } else if (electronAPI && electronAPI.writeFile) {
      if (!targetPath) return false; // Should have been determined above

      await electronAPI.writeFile(targetPath, jsonString);
      projectMetadataStore.update((m) => ({ ...m, filepath: targetPath! }));
      currentFilePath.set(targetPath);
      addToRecentFiles(targetPath, settings);
      isUnsaved.set(false);
      if (!options.quiet) {
        notification.set({
          message: `Project saved to ${targetPath}`,
          type: "success",
          timeout: 3000,
        });
      }

      // Update macro cache if this file is being used as a macro
      const macros = get(macrosStore);
      if (targetPath && macros.has(targetPath)) {
        updateMacroContent(targetPath, projectData as any);
      }

      const dir = get(currentDirectoryStore);
      if (dir) scanEventsInDirectory(dir);

      await handleAutoExport(
        startPoint,
        lines,
        sequence,
        settings,
        shapes,
        projectData,
        targetPath,
      );
      return true;
    }

    return false;
  } catch (err: any) {
    console.error("Save error:", err);
    notification.set({
      message: `Save failed: ${err.message}`,
      type: "error",
    });
    return false;
  }
}

// Used by UI
export async function saveProject(
  startPoint?: Point,
  lines?: Line[],
  settings?: Settings,
  sequence?: SequenceItem[],
  shapes?: Shape[],
  saveAs: boolean = false,
  specificPath?: string,
  options: { quiet?: boolean } = {},
) {
  // If called with just one argument that happens to be options (common if optional args are skipped)
  // This signature is getting messy. Let's fix usage in calls instead or detect it.
  // Actually, standard usage in App.svelte is saveProject().
  // If I change signature, I must be careful.
  // Let's support an overload-like approach or just named args in future.
  // For now, let's assume if the first arg is an object with 'quiet', it's options.
  // BUT the first arg is Point.
  // To avoid breaking changes, let's append options at the end.

  const electronAPI = getElectronAPI();
  // If arguments are missing, grab from stores (UI behavior)
  const sp = startPoint || get(startPointStore);
  const ln = lines || get(linesStore);
  const st = settings || get(settingsStore);
  const seq = sequence || get(sequenceStore);
  const sh = shapes || get(shapesStore);

  let targetPath = specificPath || get(currentFilePath) || undefined;
  if (saveAs) {
    targetPath = undefined;
  }

  if (!electronAPI) {
    saveFileAs();
    return true;
  }

  return await performSave(sp, ln, st, seq, sh, targetPath, options);
}

export function saveFileAs() {
  const filePath = get(currentFilePath);
  // Extract just the filename without the path and .pp extension
  let filename = "trajectory";
  if (filePath) {
    const baseName = filePath.split(/[\\/]/).pop() || "";
    filename = baseName.replace(".pp", "");
  }

  downloadTrajectory(
    get(startPointStore),
    get(linesStore),
    get(shapesStore),
    get(sequenceStore),
    get(extraDataStore),
    `${filename}.pp`,
  );
}

export async function exportAsPP() {
  const electronAPI = getElectronAPI();
  const filePath = get(currentFilePath);
  // Extract just the filename without the path and .pp extension
  let filename = "trajectory";
  if (filePath) {
    const baseName = filePath.split(/[\\\/]/).pop() || "";
    filename = baseName.replace(".pp", "");
  }
  const defaultName = `${filename}.pp`;

  if (electronAPI) {
    // Prefer the exported convenience method if available
    // BUT we skip it now because we need to relativize paths, which requires knowing the target path first.
    // The main process exportPP helper doesn't support that logic injection.

    // Use save dialog + writeFile
    if (electronAPI.showSaveDialog && electronAPI.writeFile) {
      const filePath = await electronAPI.showSaveDialog({
        title: "Export .pp File",
        defaultPath: defaultName,
        filters: [{ name: "Pedro Path", extensions: ["pp"] }],
      });
      if (!filePath) return;

      // Relativize paths
      const sequence = structuredClone(get(sequenceStore));
      if (electronAPI.makeRelativePath) {
        for (const item of sequence) {
          if (item.kind === "macro") {
            item.filePath = await electronAPI.makeRelativePath(
              filePath,
              item.filePath,
            );
          }
        }
      }

      const jsonString = JSON.stringify(
        {
          version: pkg.version,
          header: {
            info: "Created with Pedro Pathing Plus Visualizer",
            copyright:
              "Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.",
            link: "https://github.com/Mallen220/PedroPathingPlusVisualizer",
          },
          startPoint: get(startPointStore),
          lines: get(linesStore),
          shapes: get(shapesStore),
          sequence: sequence,
          extraData: get(extraDataStore),
        },
        null,
        2,
      );

      await electronAPI.writeFile(filePath, jsonString);
      console.log("Exported to", filePath);
      return;
    }
  }

  const jsonString = JSON.stringify(
    {
      version: pkg.version,
      header: {
        info: "Created with Pedro Pathing Plus Visualizer",
        copyright:
          "Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.",
        link: "https://github.com/Mallen220/PedroPathingPlusVisualizer",
      },
      startPoint: get(startPointStore),
      lines: get(linesStore),
      shapes: get(shapesStore),
      sequence: get(sequenceStore),
      extraData: get(extraDataStore),
    },
    null,
    2,
  );

  // Browser fallback
  downloadTrajectory(
    get(startPointStore),
    get(linesStore),
    get(shapesStore),
    get(sequenceStore),
    get(extraDataStore),
    defaultName,
  );
}

export async function handleExternalFileOpen(filePath: string) {
  // Autosave on Close Logic
  const settings = get(settingsStore);
  if (
    settings.autosaveMode === "close" &&
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

  const electronAPI = getElectronAPI();
  if (!electronAPI || !electronAPI.readFile) return;

  try {
    // 1. Load the file content
    const content = await electronAPI.readFile(filePath);
    const data = JSON.parse(content);

    // 2. Check if we have a working directory
    const savedDir = await electronAPI.getSavedDirectory?.();
    const fileName = filePath.split(/[\\/]/).pop() || "unknown.pp";

    // If no directory saved, just load it
    if (!savedDir) {
      await loadProjectData(data, filePath);
      currentFilePath.set(filePath);
      addToRecentFiles(filePath);
      return;
    }

    // 3. Check if file is already in the working directory
    const normFilePath = filePath.replace(/\\/g, "/").toLowerCase();
    let normSavedDir = savedDir.replace(/\\/g, "/").toLowerCase();
    if (!normSavedDir.endsWith("/")) normSavedDir += "/";

    if (normFilePath.startsWith(normSavedDir)) {
      // Already in directory
      await loadProjectData(data, filePath);
      currentFilePath.set(filePath);
      addToRecentFiles(filePath);
    } else {
      // Not in directory. Prompt copy.
      if (
        confirm(
          `The file "${fileName}" is not in your configured AutoPaths directory.\nWould you like to copy it there?`,
        )
      ) {
        const separator = savedDir.includes("\\") ? "\\" : "/";
        const cleanSavedDir = savedDir.endsWith(separator)
          ? savedDir.slice(0, -1)
          : savedDir;
        const destPath = cleanSavedDir + separator + fileName;

        // Check if overwrite
        if (
          electronAPI.fileExists &&
          (await electronAPI.fileExists(destPath))
        ) {
          if (
            !confirm(
              `File "${fileName}" already exists in the destination. Overwrite?`,
            )
          ) {
            // User cancelled overwrite, just load original
            await loadProjectData(data, filePath);
            currentFilePath.set(filePath);
            addToRecentFiles(filePath);
            return;
          }
        }

        // Perform Copy
        if (electronAPI.copyFile) {
          await electronAPI.copyFile(filePath, destPath);
          // Load the NEW path
          await loadProjectData(data, destPath); // data is same
          currentFilePath.set(destPath);
          addToRecentFiles(destPath);
        } else {
          // Fallback if copyFile not available (should be)
          await electronAPI.writeFile(destPath, content);
          await loadProjectData(data, destPath);
          currentFilePath.set(destPath);
          addToRecentFiles(destPath);
        }
      } else {
        // User said no to copy
        await loadProjectData(data, filePath);
        currentFilePath.set(filePath);
        addToRecentFiles(filePath);
      }
    }
  } catch (err) {
    console.error("Error handling external file open:", err);
    alert("Failed to load file: " + (err as Error).message);
  }
}

export async function loadFile(evt: Event) {
  // Autosave on Close Logic
  const settings = get(settingsStore);
  if (
    settings.autosaveMode === "close" &&
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

  const electronAPI = getElectronAPI();
  const elem = evt.target as HTMLInputElement;
  const file = elem.files?.[0];
  if (!file) return;

  if (!file.name.endsWith(".pp")) {
    alert("Please select a .pp file");
    elem.value = "";
    return;
  }

  const currPath = get(currentFilePath);

  if (electronAPI && currPath) {
    // Electron copy logic
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        const currentDir = currPath.substring(0, currPath.lastIndexOf("/"));
        const destPath = currentDir + "/" + file.name;

        const exists = await electronAPI.fileExists?.(destPath);
        if (exists) {
          if (
            !confirm(
              `File "${file.name}" already exists in the current directory. Overwrite?`,
            )
          ) {
            await loadProjectData(data);
            return;
          }
        }
        await electronAPI.writeFile(destPath, content);
        await loadProjectData(data, destPath);
        currentFilePath.set(destPath);
        addToRecentFiles(destPath);
      };
      reader.readAsText(file);
    } catch (error) {
      alert("Error loading file: " + (error as Error).message);
    }
  } else {
    // Web load
    loadTrajectoryFromFile(evt, async (data) => {
      let path = undefined;
      if ((file as any).path) {
        path = (file as any).path;
        addToRecentFiles(path);
        currentFilePath.set(path);
      }
      await loadProjectData(data, path);
      isUnsaved.set(false);
    });
  }
  elem.value = "";
}

async function handleAutoExport(
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  settings: Settings,
  shapes: Shape[],
  projectData: any, // passed for JSON export
  targetPath: string,
) {
  const electronAPI = getElectronAPI();
  if (!settings.autoExportCode || !electronAPI || !electronAPI.resolvePath)
    return;

  try {
    const exportDirName = settings.autoExportPath || "GeneratedCode";
    // Resolve export directory relative to the target .pp file
    const exportDir = await electronAPI.resolvePath(targetPath, exportDirName);

    // Create directory
    if (electronAPI.createDirectory) {
      await electronAPI.createDirectory(exportDir);
    }

    // Determine content and extension
    let content = "";
    let extension = "txt";
    const baseName =
      targetPath.split(/[\\/]/).pop()?.replace(".pp", "") || "AutoPath";

    switch (settings.autoExportFormat) {
      case "java":
        content = await generateJavaCode(
          startPoint,
          lines,
          settings.autoExportFullClass ?? true,
          sequence,
          settings.javaPackageName,
          settings.telemetryImplementation,
        );
        extension = "java";
        break;
      case "sequential":
        content = await generateSequentialCommandCode(
          startPoint,
          lines,
          baseName,
          sequence,
          settings.autoExportTargetLibrary ?? "SolversLib",
          settings.javaPackageName,
          settings.autoExportEmbedPoseData,
        );
        extension = "java";
        break;
      case "points":
        content = generatePointsArray(startPoint, lines);
        extension = "txt";
        break;
      case "json":
        content = JSON.stringify(projectData, null, 2);
        extension = "json";
        break;
    }

    // Determine filename
    // If Java/Sequential, we might want to match class name if possible, but baseName is safe default
    // generateJavaCode/Sequential uses internal logic for class name based on filename usually.
    // If we use baseName + extension, it matches.

    const filename = `${baseName}.${extension}`;

    // Resolve final file path. resolvePath resolves base (file) + relative (path).
    // So we need to construct relative path from targetPath's dir.
    // We already have exportDir as absolute path (likely).
    // If resolvePath returned absolute path for exportDir, we can't use it as base for resolvePath if resolvePath expects a FILE base.
    // Wait, electronAPI.resolvePath(base, relative) -> path.resolve(dirname(base), relative).
    // If exportDir is absolute, we can just join it with filename.
    // But we don't have path.join.
    // We can assume exportDir has no trailing slash usually?
    // Let's use resolvePath again?
    // resolvePath(exportDir, filename) -> path.resolve(dirname(exportDir), filename) -> SIBLING of exportDir?
    // NO. If exportDir is a directory, dirname(exportDir) is its parent.
    // So resolvePath(exportDir, filename) puts it outside GeneratedCode!
    // We need to append filename to exportDir.
    // Since we don't have path.join, and separators vary...
    // We can rely on a relative path from the original .pp file.
    // relativePath = exportDirName + separator + filename.
    // separator: / works on Windows for path.resolve usually?
    // or just use "/"
    const relativePath = `${exportDirName}/${filename}`;
    const finalPath = await electronAPI.resolvePath(targetPath, relativePath);

    await electronAPI.writeFile(finalPath, content);

    notification.set({
      message: `Code auto-exported to ${filename}`,
      type: "success",
      timeout: 2000,
    });
  } catch (err: any) {
    console.error("Auto Export Failed:", err);
    notification.set({
      message: `Auto Export Failed: ${err.message}`,
      type: "warning", // Warning so we don't think save failed
      timeout: 5000,
    });
  }
}
