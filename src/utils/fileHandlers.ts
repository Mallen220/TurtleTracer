// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Opening, saving and auto-exporting project files.
import { get } from "svelte/store";
import {
  currentFilePath,
  isUnsaved,
  notification,
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
import { exporterRegistry } from "../lib/exporters";
import type {
  Line,
  Point,
  SequenceItem,
  Settings,
  Shape,
  TurtleData,
} from "../types";
import { makeId } from "./nameGenerator";
import { getLineEndHeading } from "./math";
import { startingHeading } from "./timeCalculator/pathCalculator";
import {
  DEFAULT_PROJECT_EXTENSION,
  ensureDefaultProjectExtension,
  isLegacyProjectFileName,
  isSupportedProjectFileName,
  stripProjectExtension,
} from "./fileExtensions";
import { diskPathOf, getElectronAPI } from "./platform";
import { hookRegistry } from "../lib/registries";
import pkg from "../../package.json";

export interface SaveOptions {
  /** Save to this path instead of the currently open file. */
  path?: string;
  /** Ask where to save even if the project already has a file. */
  saveAs?: boolean;
  /** Don't show a notification when the save succeeds. */
  quiet?: boolean;
}

export const fileNameOf = (path: string) => path.split(/[\\/]/).pop() || "";

export const directoryOf = (path: string) =>
  path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));

/** Joins a directory and file name using whichever separator the directory uses. */
export function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

/**
 * The saved start point describes the whole path as a linear heading from
 * the start heading to the last line's end heading. The start heading is the
 * one playback and generated code start with: that of the first path the
 * robot drives, which isn't the first line when the sequence is reordered.
 */
function withPathHeadings(
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
): Point {
  if (!lines || lines.length === 0) return startPoint;

  const { degrees: _degrees, ...rest } = startPoint as Point & {
    degrees?: number;
  };
  return {
    ...rest,
    heading: "linear",
    startDeg: startingHeading(startPoint, lines, sequence),
    endDeg: getLineEndHeading(
      lines.at(-1),
      lines.at(-2)?.endPoint ?? startPoint,
    ),
  } as Point;
}

function addToRecentFiles(path: string) {
  settingsStore.update((s) => ({
    ...s,
    recentFiles: [
      path,
      ...(s.recentFiles ?? []).filter((f) => f !== path),
    ].slice(0, 10),
  }));
}

/** Saves the current file first if the user has "save on close" autosave on. */
export async function autosaveBeforeLeaving() {
  if (
    get(settingsStore).autosaveMode === "close" &&
    get(isUnsaved) &&
    get(currentFilePath)
  ) {
    await saveProject({ quiet: true });
  }
}

function createProjectData(
  startPoint: Point,
  lines: Line[],
  shapes: Shape[],
  sequence: SequenceItem[],
  extraData: Record<string, any>,
) {
  return {
    version: pkg.version,
    header: {
      info: "Created with Turtle Tracer",
      copyright:
        "Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.",
      link: "https://github.com/Mallen220/TurtleTracer",
    },
    startPoint,
    lines,
    sequence,
    shapes,
    extraData,
  };
}

/**
 * Project data built from the current stores, exactly as it's written to
 * disk. Macro paths are made relative to `targetPath` so projects can be
 * moved.
 */
async function buildProjectFile(targetPath?: string) {
  const electronAPI = getElectronAPI();
  const lines = structuredClone(get(linesStore));
  const sequence = structuredClone(get(sequenceStore));
  if (targetPath && electronAPI?.makeRelativePath) {
    for (const item of sequence) {
      if (item.kind === "macro") {
        item.filePath = await electronAPI.makeRelativePath(
          targetPath,
          item.filePath,
        );
      }
    }
  }
  const sequenceToSave =
    sequence.length > 0
      ? sequence
      : lines.map((l): SequenceItem => ({ kind: "path", lineId: l.id! }));
  const data = createProjectData(
    withPathHeadings(get(startPointStore), lines, sequenceToSave),
    lines,
    get(shapesStore),
    sequenceToSave,
    get(extraDataStore),
  );
  encodeLinkedNames(data);
  return data;
}

/** Project data to save at `targetPath`, after plugins' onSave hooks have run. */
async function projectFileForSave(targetPath: string) {
  const data = await buildProjectFile(targetPath);
  await hookRegistry.run("onSave", data);
  return data;
}

/** Writes the project to `path` without making it the open file. */
export async function writeProjectCopy(path: string) {
  const data = await projectFileForSave(path);
  await getElectronAPI()!.writeFile(path, JSON.stringify(data, null, 2));
}

/** The project file's contents, as saving it to `targetPath` would write. */
export async function projectFileJson(targetPath?: string): Promise<string> {
  return JSON.stringify(await buildProjectFile(targetPath), null, 2);
}

/** Loads project `data` as the open file at `path`. */
async function openProject(data: TurtleData, path: string) {
  await loadProjectData(data, path);
  currentFilePath.set(path);
  addToRecentFiles(path);
  await autoExportCurrentProject(data, path);
}

export async function loadRecentFile(path: string) {
  await autosaveBeforeLeaving();

  const electronAPI = getElectronAPI();
  if (!electronAPI?.readFile) {
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
        settingsStore.update((s) => ({
          ...s,
          recentFiles: s.recentFiles?.filter((p) => p !== path),
        }));
      }
      return;
    }
    const data = JSON.parse(await electronAPI.readFile(path));
    await openProject(data, path);
  } catch (err) {
    console.error("Error loading recent file:", err);
    alert("Failed to load file: " + (err as Error).message);
  }
}

/**
 * Gives every line and wait an id. This changes the live project, not just
 * the saved copy, because the sequence refers to lines by id.
 */
function ensureIds() {
  for (const line of get(linesStore)) line.id ||= makeId();
  for (const item of get(sequenceStore)) {
    if (item.kind === "wait") item.id ||= makeId();
  }
}

/**
 * Items that share a name share a position ("linked" points), but names must
 * be unique on disk. Duplicates are saved as "Name (1)", "Name (2)" with the
 * real name kept in `_linkedName`; loadProjectData reverses this.
 */
function encodeLinkedNames(data: { lines: Line[]; sequence: SequenceItem[] }) {
  const groups = new Map<
    string,
    Array<{ name?: string; _linkedName?: string }>
  >();
  const named = [
    ...data.lines,
    ...data.sequence.filter((s) => s.kind === "wait"),
  ] as Array<{ name?: string; _linkedName?: string }>;

  for (const item of named) {
    const name = item.name?.trim();
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(item);
  }
  groups.forEach((items, name) => {
    if (items.length < 2) return;
    items.forEach((item, i) => {
      item._linkedName = name;
      item.name = `${name} (${i + 1})`;
    });
  });
}

/** Writes `json` to `path`. Returns the path actually written, or null. */
async function writeProjectFile(
  json: string,
  path: string,
): Promise<string | null> {
  const electronAPI = getElectronAPI()!;

  // The in-browser file system provides saveFile; Electron provides writeFile.
  if (electronAPI.saveFile) {
    const result = await electronAPI.saveFile(json, path);
    if (result.success) return result.filepath;
    if (result.error !== "canceled") {
      notification.set({
        message: `Failed to save: ${result.error}`,
        type: "error",
        timeout: 5000,
      });
    }
    return null;
  }

  await electronAPI.writeFile(path, json);
  return path;
}

/**
 * Saves the project to its file, asking for a location if it doesn't have
 * one yet. Returns whether it was saved.
 */
export async function saveProject({
  path,
  saveAs = false,
  quiet = false,
}: SaveOptions = {}): Promise<boolean> {
  const electronAPI = getElectronAPI();
  if (!electronAPI) {
    saveFileAs();
    return true;
  }

  try {
    let targetPath = saveAs
      ? undefined
      : path || get(currentFilePath) || undefined;
    if (!targetPath) {
      targetPath =
        (await electronAPI.showSaveDialog?.({
          title: "Save Project",
          defaultPath: `trajectory${DEFAULT_PROJECT_EXTENSION}`,
          filters: [{ name: "Turtle Tracer Project", extensions: ["turt"] }],
        })) ?? undefined;
      if (!targetPath) return false;
    }

    // Old .pp projects are always re-saved in the current .turt format.
    const convertedFromLegacy = isLegacyProjectFileName(targetPath);
    targetPath = ensureDefaultProjectExtension(targetPath);

    ensureIds();
    const projectData = await projectFileForSave(targetPath);

    const savedPath = await writeProjectFile(
      JSON.stringify(projectData, null, 2),
      targetPath,
    );
    if (!savedPath) return false;

    currentFilePath.set(savedPath);
    addToRecentFiles(savedPath);
    isUnsaved.set(false);

    if (!quiet) {
      notification.set(
        convertedFromLegacy
          ? {
              message:
                "Legacy .pp file detected. Saved as .turt. Use the .turt file going forward.",
              type: "warning",
              timeout: 6000,
            }
          : {
              message: `Project saved to ${savedPath}`,
              type: "success",
              timeout: 3000,
            },
      );
    }

    // Other open projects may use this file as a macro.
    if (get(macrosStore).has(savedPath)) {
      updateMacroContent(savedPath, projectData);
    }

    const dir = get(currentDirectoryStore);
    if (dir) void scanEventsInDirectory(dir);

    await handleAutoExport(
      get(startPointStore),
      get(linesStore),
      get(sequenceStore),
      get(settingsStore),
      get(shapesStore),
      projectData,
      savedPath,
    );
    return true;
  } catch (err) {
    console.error("Save error:", err);
    notification.set({
      message: `Save failed: ${(err as Error).message}`,
      type: "error",
    });
    return false;
  }
}

function currentFileBaseName(): string {
  const filePath = get(currentFilePath);
  return filePath ? stripProjectExtension(fileNameOf(filePath)) : "trajectory";
}

/** Downloads the project through the browser. */
export function saveFileAs() {
  const filePath = get(currentFilePath);
  if (filePath && isLegacyProjectFileName(filePath)) {
    notification.set({
      message:
        "Legacy .pp file detected. Save As will create a .turt file. Use the .turt file going forward.",
      type: "warning",
      timeout: 6000,
    });
  }

  downloadTrajectory(
    get(startPointStore),
    get(linesStore),
    get(shapesStore),
    get(sequenceStore),
    get(extraDataStore),
    `${currentFileBaseName()}${DEFAULT_PROJECT_EXTENSION}`,
  );
}

/** Writes a copy of the project somewhere else without switching to it. */
export async function exportAsProjectFile() {
  const electronAPI = getElectronAPI();
  const defaultName = `${currentFileBaseName()}${DEFAULT_PROJECT_EXTENSION}`;

  if (electronAPI && !electronAPI.isVirtual && electronAPI.showSaveDialog) {
    const chosen = await electronAPI.showSaveDialog({
      title: "Export .turt File",
      defaultPath: defaultName,
      filters: [{ name: "Turtle Tracer Project", extensions: ["turt"] }],
    });
    if (!chosen) return;

    await writeProjectCopy(ensureDefaultProjectExtension(chosen));
    return;
  }

  downloadTrajectory(
    get(startPointStore),
    get(linesStore),
    get(shapesStore),
    get(sequenceStore),
    get(extraDataStore),
    defaultName,
  );
}

const isInsideDirectory = (filePath: string, dir: string) => {
  const normalize = (p: string) => p.replaceAll("\\", "/").toLowerCase();
  const normDir = normalize(dir).replace(/\/?$/, "/");
  return normalize(filePath).startsWith(normDir);
};

/**
 * Opens a project the OS asked us to open (double-click, drag and drop).
 * Files from outside the project folder can be copied into it first.
 */
export async function handleExternalFileOpen(filePath: string) {
  await autosaveBeforeLeaving();

  const electronAPI = getElectronAPI();
  if (!electronAPI?.readFile) return;

  try {
    const content = await electronAPI.readFile(filePath);
    const data = JSON.parse(content);
    const savedDir = await electronAPI.getSavedDirectory?.();
    const fileName =
      fileNameOf(filePath) || `unknown${DEFAULT_PROJECT_EXTENSION}`;

    if (
      !savedDir ||
      isInsideDirectory(filePath, savedDir) ||
      !confirm(
        `The file "${fileName}" is not in your configured AutoPaths directory.\nWould you like to copy it there?`,
      )
    ) {
      await openProject(data, filePath);
      return;
    }

    const destPath = joinPath(savedDir, fileName);
    if (
      (await electronAPI.fileExists?.(destPath)) &&
      !confirm(
        `File "${fileName}" already exists in the destination. Overwrite?`,
      )
    ) {
      await openProject(data, filePath);
      return;
    }

    if (electronAPI.copyFile) {
      await electronAPI.copyFile(filePath, destPath);
    } else {
      await electronAPI.writeFile(destPath, content);
    }
    await openProject(data, destPath);
  } catch (err) {
    console.error("Error handling external file open:", err);
    alert("Failed to load file: " + (err as Error).message);
  }
}

/** Handles the "Open" file picker. */
export async function loadFile(evt: Event) {
  await autosaveBeforeLeaving();

  const electronAPI = getElectronAPI();
  const input = evt.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!isSupportedProjectFileName(file.name)) {
    alert("Please select a .turt or .pp file");
    input.value = "";
    return;
  }

  const currentPath = get(currentFilePath);

  if (electronAPI && currentPath) {
    // Copy the chosen file next to the open project, then open the copy.
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      let data;
      try {
        data = JSON.parse(content);
      } catch (parseError) {
        alert("Error parsing file: " + (parseError as Error).message);
        return;
      }

      const destPath = joinPath(directoryOf(currentPath), file.name);
      if (
        (await electronAPI.fileExists?.(destPath)) &&
        !confirm(
          `File "${file.name}" already exists in the current directory. Overwrite?`,
        )
      ) {
        await loadProjectData(data);
        return;
      }
      await electronAPI.writeFile(destPath, content);
      await openProject(data, destPath);
    };
    reader.readAsText(file);
  } else {
    loadTrajectoryFromFile(evt, async (data) => {
      const path = diskPathOf(file);
      if (path) {
        addToRecentFiles(path);
        currentFilePath.set(path);
      }
      await loadProjectData(data, path);
      isUnsaved.set(false);
    });
  }
  input.value = "";
}

async function autoExportCurrentProject(data: TurtleData, path: string) {
  await handleAutoExport(
    get(startPointStore),
    get(linesStore),
    get(sequenceStore),
    get(settingsStore),
    get(shapesStore),
    data,
    path,
  );
}

/** Auto-exports the open project at `path` after an edit, if that's turned on. */
export function autoExportAfterChange(path: string) {
  return autoExportCurrentProject(
    createProjectData(
      get(startPointStore),
      get(linesStore),
      get(shapesStore),
      get(sequenceStore),
      get(extraDataStore),
    ),
    path,
  );
}

/**
 * If auto-export is on, writes the project's code (or JSON) into the export
 * folder next to `targetPath`.
 */
export async function handleAutoExport(
  startPoint: Point,
  lines: Line[],
  sequence: SequenceItem[],
  settings: Settings,
  shapes: Shape[],
  projectData: TurtleData,
  targetPath: string,
) {
  const electronAPI = getElectronAPI();
  if (!settings.autoExportCode || !electronAPI?.resolvePath) return;

  try {
    const exportDirName = settings.autoExportPath || "GeneratedCode";
    const exportDir = await electronAPI.resolvePath(targetPath, exportDirName);
    await electronAPI.createDirectory?.(exportDir);

    const baseName =
      stripProjectExtension(fileNameOf(targetPath)) || "AutoPath";
    let content: string;
    let extension: string;

    if (settings.autoExportFormat === "json") {
      content = JSON.stringify(projectData, null, 2);
      extension = "json";
    } else {
      const exporter =
        get(exporterRegistry)[settings.autoExportFormat as string];
      if (!exporter) {
        throw new Error(
          `Auto export format ${settings.autoExportFormat} not found.`,
        );
      }
      content = await exporter.exportCode(
        { startPoint, lines, shapes: projectData.shapes ?? shapes, sequence },
        {
          ...settings,
          fileName: baseName,
          exportFullCode: settings.autoExportFullClass ?? true,
          packageName: settings.javaPackageName,
          telemetryImpl: settings.telemetryImplementation,
          hardcodeValues: settings.autoExportEmbedPoseData,
          targetLibrary: settings.autoExportTargetLibrary ?? "SolversLib",
        },
      );
      extension = settings.autoExportFormat === "points" ? "txt" : "java";
    }

    const filename = `${baseName}.${extension}`;
    const finalPath = await electronAPI.resolvePath(
      targetPath,
      `${exportDirName}/${filename}`,
    );
    await electronAPI.writeFile(finalPath, content);

    notification.set({
      message: `Code auto-exported to ${filename}`,
      type: "success",
      timeout: 2000,
    });
  } catch (err) {
    console.error("Auto Export Failed:", err);
    // A warning rather than an error, so it isn't mistaken for a failed save.
    notification.set({
      message: `Auto Export Failed: ${(err as Error).message}`,
      type: "warning",
      timeout: 5000,
    });
  }
}

export { loadProjectData } from "../lib/projectStore";
