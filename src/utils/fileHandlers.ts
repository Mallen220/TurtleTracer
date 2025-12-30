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
  fileExists?: (filePath: string) => Promise<boolean>;
  readFile?: (filePath: string) => Promise<string>;
  onMenuAction?: (callback: (action: string) => void) => void;
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
          settings: get(settingsStore),
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
  downloadTrajectory(
    get(startPointStore),
    get(linesStore),
    get(shapesStore),
    get(sequenceStore),
  );
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
