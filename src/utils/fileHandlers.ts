import { get } from "svelte/store";
import { currentFilePath, isUnsaved } from "../stores";
import {
  startPointStore,
  linesStore,
  shapesStore,
  sequenceStore,
  settingsStore,
  loadProjectData,
} from "../lib/projectStore";
import { loadTrajectoryFromFile, downloadTrajectory } from "./index";

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
}
const electronAPI = (window as any).electronAPI as
  | ExtendedElectronAPI
  | undefined;

function addToRecentFiles(path: string) {
  const settings = get(settingsStore);
  if (!settings.recentFiles) settings.recentFiles = [];

  // Remove if exists
  const existingIdx = settings.recentFiles.indexOf(path);
  if (existingIdx !== -1) settings.recentFiles.splice(existingIdx, 1);

  // Add to top
  settings.recentFiles.unshift(path);
  if (settings.recentFiles.length > 10)
    settings.recentFiles = settings.recentFiles.slice(0, 10);

  settingsStore.set({ ...settings });
}

export async function loadRecentFile(path: string) {
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
    addToRecentFiles(path);
  } catch (err) {
    console.error("Error loading recent file:", err);
    alert("Failed to load file: " + (err as Error).message);
  }
}

export async function saveProject() {
  const path = get(currentFilePath);
  if (path && electronAPI) {
    try {
      const jsonString = JSON.stringify(
        {
          startPoint: get(startPointStore),
          lines: get(linesStore),
          sequence: get(sequenceStore),
          shapes: get(shapesStore),
        },
        null,
        2,
      );
      await electronAPI.writeFile(path, jsonString);
      isUnsaved.set(false);
      addToRecentFiles(path);
      console.log("Saved to", path);
    } catch (e) {
      console.error("Failed to save", e);
      alert("Failed to save file.");
    }
  } else {
    saveFileAs();
  }
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
    // Normalize paths to compare
    // Note: This is simple string check, might need path.resolve in main process if we want robust cross-platform path equality,
    // but typically Electron paths are absolute.
    // We check if filePath starts with savedDir.
    // Handle potential slash mismatch (Windows vs POSIX)
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
        // Use savedDir (original case) for constructing the destination path
        // Be careful with slashes. savedDir might not end with slash.
        // Normalized savedDir replaced backslashes with slashes. We should probably stick to standard slash for destPath or use path.join if available (not available in browser context directly, but we can assume / for simple concatenation or just use what we have).
        // The savedDir comes from electron, which usually gives absolute path with OS specific separators or normalized.
        // Let's just append safely.
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
