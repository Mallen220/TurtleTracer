// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { get } from "svelte/store";
import {
  currentFilePath,
  isUnsaved,
  notification,
  projectMetadataStore,
} from "../stores";
import {
  startPointStore,
  linesStore,
  shapesStore,
  sequenceStore,
  settingsStore,
} from "../lib/projectStore";
import { loadTrajectoryFromFile, downloadTrajectory } from "./index";
import type { Line, Point, SequenceItem, Settings, Shape } from "../types";
import { makeId } from "./nameGenerator";

interface ExtendedElectronAPI {
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  writeFileBase64?: (
    filePath: string,
    base64Content: string,
  ) => Promise<boolean>;
  showSaveDialog?: (options: any) => Promise<string | null>;
  getDirectory?: () => Promise<string>;
  getSavedDirectory?: () => Promise<string>;
  fileExists?: (filePath: string) => Promise<boolean>;
  readFile?: (filePath: string) => Promise<string>;
  onMenuAction?: (callback: (action: string) => void) => void;
  copyFile?: (src: string, dest: string) => Promise<boolean>;
  saveFile?: (
    content: string,
    path?: string,
  ) => Promise<{ success: boolean; filepath: string; error?: string }>;
}

// Access electronAPI dynamically to allow mocking/runtime changes
function getElectronAPI(): ExtendedElectronAPI | undefined {
  return (window as any).electronAPI as ExtendedElectronAPI | undefined;
}

export function loadProjectData(data: any) {
  if (data.startPoint) startPointStore.set(data.startPoint);
  // Helper to strip " (##)" suffix from names to restore linkage
  const stripSuffix = (name: string) => {
    if (!name) return name;
    const match = name.match(/^(.*) \(\d+\)$/);
    return match ? match[1] : name;
  };

  let loadedLines: Line[] = [];

  if (data.lines) {
    // Ensure loaded lines have IDs and restore linked names
    loadedLines = (data.lines as Line[]).map((l) => {
      const newLine = { ...l, id: l.id || makeId() };
      // Restore name from metadata if present
      if (newLine._linkedName) {
        newLine.name = newLine._linkedName;
      } else if (newLine.name) {
        // Attempt to strip suffix to restore linkage for older files
        newLine.name = stripSuffix(newLine.name);
      }
      return newLine;
    });
    linesStore.set(loadedLines);
  }
  if (data.settings) settingsStore.set(data.settings);
  if (data.sequence) {
    // Note: If no lines were loaded (loadedLines empty), we should probably use linesStore if data.sequence exists?
    // But usually sequence depends on lines from the same file.
    // If lines were missing but sequence exists, we might have issues.
    // But we are focusing on suffix stripping here.

    const seq = (data.sequence as SequenceItem[]).map((s) => {
      if (s.kind === "wait") {
        const newWait = { ...s };
        if (!newWait.id) newWait.id = makeId();
        // Restore name from metadata if present
        if ((newWait as any)._linkedName) {
          newWait.name = (newWait as any)._linkedName;
        } else if (newWait.name) {
          // Attempt to strip suffix
          newWait.name = stripSuffix(newWait.name);
        }
        return newWait;
      }
      return s;
    });
    sequenceStore.set(seq);
  }
  if (data.shapes) shapesStore.set(data.shapes);
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
    loadProjectData(data);
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
) {
  const electronAPI = getElectronAPI();
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

    // Create the project data structure
    const projectData = {
      version: 1,
      startPoint,
      lines: linesToSave,
      settings,
      sequence: sequenceToSave,
      shapes,
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
        notification.set({
          message: `Project saved to ${result.filepath}`,
          type: "success",
          timeout: 3000,
        });
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
      // Fallback to legacy writeFile if saveFile not present
      if (!targetPath) {
        // We need a path. If not provided (Save As), we might need dialog.
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

      await electronAPI.writeFile(targetPath, jsonString);
      projectMetadataStore.update((m) => ({ ...m, filepath: targetPath! }));
      currentFilePath.set(targetPath);
      addToRecentFiles(targetPath, settings);
      isUnsaved.set(false);
      notification.set({
        message: `Project saved to ${targetPath}`,
        type: "success",
        timeout: 3000,
      });
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
) {
  const electronAPI = getElectronAPI();
  // If arguments are missing, grab from stores (UI behavior)
  const sp = startPoint || get(startPointStore);
  const ln = lines || get(linesStore);
  const st = settings || get(settingsStore);
  const seq = sequence || get(sequenceStore);
  const sh = shapes || get(shapesStore);

  let targetPath = get(currentFilePath) || undefined;
  if (saveAs) {
    targetPath = undefined;
  }

  if (!electronAPI) {
    saveFileAs();
    return true;
  }

  return await performSave(sp, ln, st, seq, sh, targetPath);
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

  const jsonString = JSON.stringify(
    {
      startPoint: get(startPointStore),
      lines: get(linesStore),
      shapes: get(shapesStore),
      sequence: get(sequenceStore),
    },
    null,
    2,
  );

  if (electronAPI) {
    // Prefer the exported convenience method if available
    if ((electronAPI as any).exportPP) {
      try {
        const exportedPath = await (electronAPI as any).exportPP(
          jsonString,
          defaultName,
        );
        if (exportedPath) console.log("Exported to", exportedPath);
        return;
      } catch (err) {
        console.error("exportPP failed, falling back:", err);
      }
    }

    // Fallback: use save dialog + writeFile
    if (electronAPI.showSaveDialog && electronAPI.writeFile) {
      const filePath = await electronAPI.showSaveDialog({
        title: "Export .pp File",
        defaultPath: defaultName,
        filters: [{ name: "Pedro Path", extensions: ["pp"] }],
      });
      if (!filePath) return;
      await electronAPI.writeFile(filePath, jsonString);
      console.log("Exported to", filePath);
      return;
    }
  }

  // Browser fallback
  downloadTrajectory(
    get(startPointStore),
    get(linesStore),
    get(shapesStore),
    get(sequenceStore),
    defaultName,
  );
}

export async function handleExternalFileOpen(filePath: string) {
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
      loadProjectData(data);
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
      loadProjectData(data);
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
            loadProjectData(data);
            currentFilePath.set(filePath);
            addToRecentFiles(filePath);
            return;
          }
        }

        // Perform Copy
        if (electronAPI.copyFile) {
          await electronAPI.copyFile(filePath, destPath);
          // Load the NEW path
          loadProjectData(data); // data is same
          currentFilePath.set(destPath);
          addToRecentFiles(destPath);
        } else {
          // Fallback if copyFile not available (should be)
          await electronAPI.writeFile(destPath, content);
          loadProjectData(data);
          currentFilePath.set(destPath);
          addToRecentFiles(destPath);
        }
      } else {
        // User said no to copy
        loadProjectData(data);
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
            loadProjectData(data);
            return;
          }
        }
        await electronAPI.writeFile(destPath, content);
        loadProjectData(data);
        currentFilePath.set(destPath);
        addToRecentFiles(destPath);
      };
      reader.readAsText(file);
    } catch (error) {
      alert("Error loading file: " + (error as Error).message);
    }
  } else {
    // Web load
    loadTrajectoryFromFile(evt, (data) => {
      if ((file as any).path) {
        addToRecentFiles((file as any).path);
        currentFilePath.set((file as any).path);
      }
      loadProjectData(data);
      isUnsaved.set(false);
    });
  }
  elem.value = "";
}
