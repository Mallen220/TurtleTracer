// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { writable, get } from "svelte/store";
import type {
  Line,
  Point,
  SequenceItem,
  Shape,
  Settings,
  SequencePathItem,
  TurtleData,
  RobotProfile,
} from "../types/index";
import {
  getDefaultStartPoint,
  getDefaultLines,
  getDefaultShapes,
  DEFAULT_SETTINGS,
} from "../config/defaults";
import { getRandomColor } from "../utils";
import { regenerateProjectMacros } from "./macroUtils";
import { notification } from "../stores";
import { hookRegistry } from "./registries";
import { actionRegistry } from "./actionRegistry";
import { currentDirectoryStore, currentFilePath } from "../stores";

export function normalizeLines(input: Line[]): Line[] {
  return (input || []).map((line) => ({
    ...line,
    id: line.id || `line-${Math.random().toString(36).slice(2)}`,
    controlPoints: line.controlPoints || [],
    eventMarkers: line.eventMarkers || [],
    color: line.color || getRandomColor(),
    name: line.name || "",
    waitBeforeMs: Math.max(
      0,
      Number(line.waitBeforeMs ?? line.waitBefore?.durationMs ?? 0),
    ),
    waitAfterMs: Math.max(
      0,
      Number(line.waitAfterMs ?? line.waitAfter?.durationMs ?? 0),
    ),
    waitBeforeName: line.waitBeforeName ?? line.waitBefore?.name ?? "",
    waitAfterName: line.waitAfterName ?? line.waitAfter?.name ?? "",
  }));
}

// Helper: sanitize sequence to remove references to non-existent lines and append any missing lines
export function sanitizeSequence(
  lines: Line[],
  seq: SequenceItem[] | undefined,
): SequenceItem[] {
  const candidate = Array.isArray(seq) ? [...seq] : [];
  const lineIds = new Set(lines.map((l) => l.id));

  // Remove path entries that reference lines not present
  const pruned = candidate.filter(
    (s) =>
      !actionRegistry.get(s.kind)?.isPath || lineIds.has((s as any).lineId),
  );

  // Append any lines that are missing from the sequence
  const presentIds = new Set(
    pruned
      .filter((s) => actionRegistry.get(s.kind)?.isPath)
      .map((s) => (s as any).lineId),
  );
  const missing = lines.filter(
    (l) => !presentIds.has(l.id) && !l.isMacroElement,
  );

  return [
    ...pruned,
    ...missing.map((l) => ({ kind: "path", lineId: l.id }) as SequencePathItem),
  ];
}

// Helper: renumber default path names to match display order
export function renumberDefaultPathNames(lines: Line[]): Line[] {
  return lines.map((l, idx) => {
    if (/^Path \d+$/.test(l.name || "")) {
      return { ...l, name: `Path ${idx + 1}` };
    }
    return l;
  });
}

// Create writable stores for the project state
export const startPointStore = writable<Point>(getDefaultStartPoint());

// Ensure using the exact same default lines instance for both linesStore and sequenceStore
// to prevent ID mismatches when getDefaultLines() generates random IDs.
const initialDefaultLines = normalizeLines(getDefaultLines());

export const linesStore = writable<Line[]>(initialDefaultLines);
export const shapesStore = writable<Shape[]>(getDefaultShapes());

export const sequenceStore = writable<SequenceItem[]>(
  initialDefaultLines.map((ln) => ({
    kind: "path",
    lineId: ln.id!,
  })),
);
export const settingsStore = writable<Settings>({ ...DEFAULT_SETTINGS });
export const extraDataStore = writable<Record<string, any>>({});
export const macrosStore = writable<Map<string, TurtleData>>(new Map());

// Track currently loading macros to prevent infinite recursion
const loadingMacros = new Set<string>();

// Animation state
export const percentStore = writable(0);
export const playingStore = writable(false);
export const playbackSpeedStore = writable(1.0);
export const loopAnimationStore = writable(true);
export const loopRangeActiveStore = writable(true);
export const loopRangeStore = writable<[number, number]>([0, 100]);

// Robot State (derived or managed)
export const robotXYStore = writable({ x: 0, y: 0 });
export const robotHeadingStore = writable(0);
export const followRobotStore = writable(false);

// Robot Profiles Store
const STORAGE_KEY_PROFILES = "turtle_tracer_robot_profiles";
const LEGACY_STORAGE_KEY_PROFILES = "pedro_robot_profiles";
let initialProfiles: RobotProfile[] = [];
try {
  if (typeof localStorage !== "undefined") {
    let stored = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (!stored) {
      const legacyStored = localStorage.getItem(LEGACY_STORAGE_KEY_PROFILES);
      if (legacyStored) {
        stored = legacyStored;
        localStorage.setItem(STORAGE_KEY_PROFILES, legacyStored);
        localStorage.removeItem(LEGACY_STORAGE_KEY_PROFILES);
      }
    }
    if (stored) {
      initialProfiles = JSON.parse(stored);
    }
  }
} catch (e) {
  console.error("Failed to load robot profiles from localStorage", e);
}

export const robotProfilesStore = writable<RobotProfile[]>(initialProfiles);

// Subscribe to changes and persist
robotProfilesStore.subscribe((profiles) => {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
    }
  } catch (e) {
    console.error("Failed to save robot profiles to localStorage", e);
  }
});

export function resetProject() {
  startPointStore.set(getDefaultStartPoint());
  const newLines = normalizeLines(getDefaultLines());
  linesStore.set(newLines);
  shapesStore.set(getDefaultShapes());
  sequenceStore.set(
    newLines.map((ln) => ({
      kind: "path",
      lineId: ln.id!,
    })),
  );
  extraDataStore.set({});
  macrosStore.set(new Map());
}

export function updateMacroContent(filePath: string, data: TurtleData) {
  macrosStore.update((map) => {
    const newMap = new Map(map);
    // Normalize before storing
    if (data.lines) {
      data.lines = normalizeLines(data.lines);
    }
    newMap.set(filePath, data);
    return newMap;
  });
  refreshMacros();
}

export function refreshMacros() {
  const lines = get(linesStore);
  const sequence = get(sequenceStore);
  const startPoint = get(startPointStore);
  const macros = get(macrosStore);

  // Optimization: Check if any macros exist or if there are leftover macro elements before doing heavy work
  const hasMacro = sequence.some((s) => actionRegistry.get(s.kind)?.isMacro);
  const hasMacroElements = lines.some((l) => l.isMacroElement);

  if (!hasMacro && !hasMacroElements) return;

  try {
    const result = regenerateProjectMacros(
      startPoint,
      lines,
      sequence,
      macros,
      get(currentFilePath),
    );

    const oldLinesJson = JSON.stringify(lines);
    const newLinesJson = JSON.stringify(result.lines);

    if (oldLinesJson !== newLinesJson) {
      linesStore.set(result.lines);
    }

    const oldSeqJson = JSON.stringify(sequence);
    const newSeqJson = JSON.stringify(result.sequence);

    if (oldSeqJson !== newSeqJson) {
      sequenceStore.set(result.sequence);
    }
  } catch (error: any) {
    console.error("Failed to regenerate macros:", error);
    notification.set({
      message: `Macro Error: ${error.message}`,
      type: "error",
      timeout: 5000,
    });
  }
}

export async function loadMacro(filePath: string, force = false) {
  // Check if already loaded
  const currentMacros = get(macrosStore);
  if (!force && currentMacros.has(filePath)) {
    refreshMacros();
    return;
  }

  // Prevent infinite recursion during loading cycle
  if (loadingMacros.has(filePath)) {
    console.warn(
      `[projectStore] Cyclic dependency detected while loading: ${filePath}`,
    );
    return;
  }

  loadingMacros.add(filePath);

  // Use electronAPI to read file
  const api = (window as any).electronAPI;
  if (api && api.readFile) {
    try {
      const content = await api.readFile(filePath);
      const data = JSON.parse(content);
      // Validate data
      if (data.startPoint && data.lines) {
        // Normalize lines in macro
        data.lines = normalizeLines(data.lines);
        macrosStore.update((map) => {
          const newMap = new Map(map);
          newMap.set(filePath, data);
          return newMap;
        });

        // Recursively load any macros nested within this macro
        const promises: Promise<void>[] = [];
        if (data.sequence && data.sequence.length > 0) {
          for (const item of data.sequence) {
            if (actionRegistry.get(item.kind)?.isMacro) {
              if (api.resolvePath) {
                // Resolve potential relative paths against the current macro file path
                promises.push(
                  (async () => {
                    const resolved = await api.resolvePath(
                      filePath,
                      item.filePath,
                    );
                    // Update the sequence item to use the absolute path for this session
                    item.filePath = resolved;
                    await loadMacro(resolved);
                  })(),
                );
              } else {
                promises.push(loadMacro(item.filePath));
              }
            }
          }
        }
        await Promise.all(promises);

        refreshMacros();
      }
    } catch (e) {
      console.error("Failed to load macro:", filePath, e);
      notification.set({
        message: `Macro file not found or failed to load: ${filePath}. Please update references.`,
        type: "warning",
        timeout: 5000,
      });
    } finally {
      loadingMacros.delete(filePath);
    }
  } else {
    loadingMacros.delete(filePath);
  }
}

export async function loadProjectData(data: any, projectFilePath?: string) {
  await hookRegistry.run("onLoad", data);

  const sp = data.startPoint || {
    x: 72,
    y: 72,
    heading: "tangential",
    reverse: false,
  };
  startPointStore.set(sp);

  // Helper to strip " (##)" suffix from names to restore linkage
  const stripSuffix = (name?: string) => {
    if (!name) return name ?? "";
    const match = name.match(/^(.*) \(\d+\)$/);
    return match ? match[1] : name;
  };

  const normLines = normalizeLines(data.lines || []).map((l) => {
    const baseName = l._linkedName ?? l.name;
    return {
      ...l,
      name: stripSuffix(baseName),
      waitBeforeName: stripSuffix(l.waitBeforeName),
      waitAfterName: stripSuffix(l.waitAfterName),
    };
  });

  // Sanitize sequence with respect to normalized lines and set both stores
  const seqCandidate = (
    data.sequence && data.sequence.length
      ? data.sequence
      : normLines.map((ln) => ({ kind: "path", lineId: ln.id! }))
  ) as SequenceItem[];

  // Also apply name stripping to sequence items (waits)
  const processedSeq = seqCandidate.map((s) => {
    if (s.kind === "wait") {
      const newWait = { ...s };
      const baseName = (newWait as any)._linkedName ?? newWait.name;
      newWait.name = stripSuffix(baseName);
      return newWait;
    }
    return s;
  });

  const sanitized = sanitizeSequence(normLines, processedSeq);

  // Renumber default names to match displayed order
  const renamedLines = renumberDefaultPathNames(normLines);

  linesStore.set(renamedLines);
  shapesStore.set(data.shapes || []);
  extraDataStore.set(data.extraData || {});

  // Load referenced macros
  const api = (window as any).electronAPI;
  const promises: Promise<void>[] = [];
  for (const item of sanitized) {
    if (item.kind === "macro") {
      if (projectFilePath && api && api.resolvePath) {
        promises.push(
          (async () => {
            try {
              const resolved = await api.resolvePath(
                projectFilePath,
                item.filePath,
              );
              if (resolved) {
                // Update the sequence item to use the absolute path for this session
                item.filePath = resolved;
                await loadMacro(resolved);
              } else {
                throw new Error("Failed to resolve relative macro path");
              }
            } catch (err) {
              console.error("Error resolving macro path:", item.filePath, err);
              notification.set({
                message: `Failed to resolve macro path: ${item.filePath}`,
                type: "warning",
                timeout: 5000,
              });
            }
          })(),
        );
      } else {
        promises.push(
          loadMacro(item.filePath).catch((err) => {
            console.error("Error loading macro:", item.filePath, err);
          }),
        );
      }
    }
  }

  // Wait for macros to load before refreshing to prevent flickering/clearing
  if (promises.length > 0) {
    await Promise.all(promises);
  }

  // Set sequence store AFTER updating paths to absolute
  sequenceStore.set(sanitized);

  // Refresh macros immediately in case they are already loaded
  refreshMacros();

  // settings are usually loaded separately or merged?
  // In App.svelte loadData does NOT load settings from the file data usually,
  // except if it's a full project save.
}

// Helper to update paths when a file or folder is moved
function getUpdatedPath(currentPath: string, oldPrefix: string, newPrefix: string): string | null {
  if (currentPath === oldPrefix) {
    return newPrefix;
  }
  // If it's a folder move, check if the currentPath is inside the old folder (support / and \ separators)
  if (currentPath.startsWith(oldPrefix + "/") || currentPath.startsWith(oldPrefix + "\\")) {
    return newPrefix + currentPath.slice(oldPrefix.length);
  }
  return null;
}

// Public repair function: ensure sequence and line names are consistent at runtime
export async function updateAllMacroReferences(
  oldPath: string,
  newPath: string,
): Promise<{ totalUpdated: number; mainSequenceChanged: boolean }> {
  const api = (window as any).electronAPI;
  if (!api || !api.writeFile || !api.listFiles || !api.readFile) return { totalUpdated: 0, mainSequenceChanged: false };

  let totalUpdated = 0;
  const errors: string[] = [];
  const processedFiles = new Set<string>();
  let mainSequenceChanged = false;

  // Update top-level sequence if it uses the macro
  sequenceStore.update((seq) => {
    let changed = false;
    const newSeq = seq.map((item) => {
      if (item.kind === "macro") {
        const updatedMacroPath = getUpdatedPath(item.filePath, oldPath, newPath);
        if (updatedMacroPath) {
          changed = true;
          totalUpdated++;
          return { ...item, filePath: updatedMacroPath };
        }
      }
      return item;
    });
    if (changed) mainSequenceChanged = true;
    return changed ? newSeq : seq;
  });

  const updatedMacros = new Map<string, TurtleData>();
  let macrosStoreChanged = false;

  /**
   * Process a single project file's data.
   *
   * @param actualFilePath        Absolute path where the file currently lives on disk.
   * @param originalFilePath      Key used for this file in macrosStore (may be the old path
   *                              if the file was just moved).
   * @param data                  Parsed project JSON.
   * @param dataHasAbsolutePaths  True when data came from the in-memory macrosStore (paths
   *                              are already absolute). False when data was freshly read from
   *                              disk (paths are relative and must be resolved first).
   */
  async function processFileData(
    actualFilePath: string,
    originalFilePath: string,
    data: TurtleData,
    dataHasAbsolutePaths: boolean,
  ) {
    if (processedFiles.has(actualFilePath)) return;
    processedFiles.add(actualFilePath);

    if (!data.sequence || data.sequence.length === 0) return;

    let fileChanged = false;

    // Build a new sequence with updated paths.
    // Paths coming from disk are relative; resolve them to absolute before comparison,
    // then re-relativize the updated path before writing back out.
    const newSeq = await Promise.all(
      data.sequence.map(async (item) => {
        if (item.kind !== "macro") return item;

        // Resolve relative → absolute so getUpdatedPath works correctly.
        let absoluteItemPath = item.filePath;
        if (!dataHasAbsolutePaths && api.resolvePath) {
          try {
            absoluteItemPath = await api.resolvePath(actualFilePath, item.filePath);
          } catch {
            // Leave as-is if resolution fails; getUpdatedPath will simply not match.
          }
        }

        const updatedAbsPath = getUpdatedPath(absoluteItemPath, oldPath, newPath);
        if (!updatedAbsPath) return item;

        // Re-relativize for on-disk storage (mirrors what performSave / makeRelativePath does).
        let diskPath = updatedAbsPath;
        if (!dataHasAbsolutePaths && api.makeRelativePath) {
          try {
            diskPath = await api.makeRelativePath(actualFilePath, updatedAbsPath);
          } catch {
            diskPath = updatedAbsPath;
          }
        }

        fileChanged = true;
        totalUpdated++;

        // In-memory data keeps absolute paths; on-disk data stores relative paths.
        return { ...item, filePath: dataHasAbsolutePaths ? updatedAbsPath : diskPath };
      }),
    );

    if (!fileChanged) return;

    const updatedData = { ...data, sequence: newSeq };

    // Stage an absolute-path version for macrosStore (if this file is currently loaded).
    const currentMacros = get(macrosStore);
    if (currentMacros.has(originalFilePath)) {
      macrosStoreChanged = true;
      if (!dataHasAbsolutePaths && api.resolvePath) {
        // Build an absolute-path version of the updated sequence for macrosStore.
        const absoluteSeq = await Promise.all(
          newSeq.map(async (item) => {
            if (item.kind !== "macro") return item;
            try {
              const abs = await api.resolvePath(actualFilePath, item.filePath);
              return { ...item, filePath: abs };
            } catch {
              return item;
            }
          }),
        );
        updatedMacros.set(originalFilePath, { ...updatedData, sequence: absoluteSeq });
      } else {
        updatedMacros.set(originalFilePath, updatedData);
      }
    }

    // Write the updated file to disk (relative paths for disk-sourced data).
    try {
      const content = JSON.stringify(updatedData, null, 2);
      await api.writeFile(actualFilePath, content);
    } catch (e) {
      console.error(
        `Failed to save updated macro reference to ${actualFilePath}`,
        e,
      );
      errors.push(actualFilePath);
    }
  }


  // 1. Check all currently loaded macros in memory (paths are already absolute).
  // A loaded macro might be the one that was moved; its disk path is newPath but its key is oldPath.
  const currentMacros = get(macrosStore);
  for (const [macroFilePath, macroData] of currentMacros.entries()) {
    const actualDiskPath = getUpdatedPath(macroFilePath, oldPath, newPath) || macroFilePath;
    await processFileData(actualDiskPath, macroFilePath, macroData, true);
  }

  // 2. Scan every project file in the base directory tree (O(NM) as required).
  //    Files on disk store macro paths as RELATIVE strings — processFileData resolves them
  //    to absolute before comparing and re-relativizes before writing back.
  const baseDirectory = await api.getSavedDirectory?.() || get(currentDirectoryStore);
  if (baseDirectory) {
    async function scanDirectory(dir: string) {
      try {
        const files = await api.listFiles(dir);
        for (const f of files) {
          if (f.isDirectory && f.name !== "..") {
            await scanDirectory(f.path);
          } else if (
            !f.isDirectory &&
            !processedFiles.has(f.path) &&
            (f.name.endsWith(".turt") || f.name.endsWith(".pp"))
          ) {
            try {
              const content = await api.readFile(f.path);
              const data = JSON.parse(content);
              // dataHasAbsolutePaths = false because this came fresh from disk
              await processFileData(f.path, f.path, data, false);
            } catch (err) {
              console.error(
                `Failed to read/parse file during macro scan: ${f.path}`,
                err,
              );
            }
          }
        }
      } catch (err) {
        console.error(
          `Failed to scan directory for macro updates: ${dir}`,
          err,
        );
      }
    }
    await scanDirectory(baseDirectory);
  }

  // 3. Update macrosStore: remap moved keys and apply any reference-updated data.
  const anyKeyNeedsRename = Array.from(currentMacros.keys()).some(k => getUpdatedPath(k, oldPath, newPath));
  if (macrosStoreChanged || anyKeyNeedsRename) {
    macrosStore.update((map) => {
      const newMap = new Map();

      // Remap keys first (handles folder moves where many keys share a prefix).
      for (const [k, v] of map.entries()) {
        const mappedKey = getUpdatedPath(k, oldPath, newPath) || k;
        newMap.set(mappedKey, v);
      }

      // Apply updated references (in-memory absolute-path versions).
      for (const [k, v] of updatedMacros.entries()) {
        const mappedKey = getUpdatedPath(k, oldPath, newPath) || k;
        newMap.set(mappedKey, v);
      }
      return newMap;
    });
  }

  if (totalUpdated > 0) {
    if (errors.length === 0) {
      notification.set({
        message: `Updated ${totalUpdated} macro reference(s) to new location.`,
        type: "success",
        timeout: 4000,
      });
    } else {
      notification.set({
        message: `Updated ${totalUpdated} reference(s), but failed to save to disk in ${errors.length} file(s).`,
        type: "warning",
        timeout: 6000,
      });
    }
  }

  return { totalUpdated, mainSequenceChanged };
}

// Public repair function: ensure sequence and line names are consistent at runtime
export function ensureSequenceConsistency() {
  const lines = get(linesStore);
  const seq = get(sequenceStore);
  const sanitized = sanitizeSequence(lines, seq);

  if (JSON.stringify(sanitized) !== JSON.stringify(seq)) {
    console.warn("[projectStore] ensureSequenceConsistency: updating sequence");
    sequenceStore.set(sanitized);
  }

  const renamed = renumberDefaultPathNames(lines);
  if (JSON.stringify(renamed) !== JSON.stringify(lines)) {
    console.warn(
      "[projectStore] ensureSequenceConsistency: renaming default path names",
    );
    linesStore.set(renamed);
  }
}
// The App.svelte `loadData` function DOES NOT update settings.
