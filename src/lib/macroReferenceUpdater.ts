// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import type { TurtleData } from "../types/index";
import { getElectronAPI } from "../utils/platform";
import { notification, currentDirectoryStore } from "../stores";
import { sequenceStore, macrosStore } from "./projectStore";

/**
 * Helper to update paths when a file or folder is moved.
 */
export function getUpdatedPath(
  currentPath: string,
  oldPrefix: string,
  newPrefix: string,
): string | null {
  if (currentPath === oldPrefix) {
    return newPrefix;
  }
  // If it's a folder move, check if the currentPath is inside the old folder (support / and \ separators)
  if (
    currentPath.startsWith(oldPrefix + "/") ||
    currentPath.startsWith(oldPrefix + "\\")
  ) {
    return newPrefix + currentPath.slice(oldPrefix.length);
  }
  return null;
}

/**
 * Public repair function: scan project files and in-memory macros to update paths when a macro file or folder is moved.
 */
export async function updateAllMacroReferences(
  oldPath: string,
  newPath: string,
): Promise<{ totalUpdated: number; mainSequenceChanged: boolean }> {
  const api = getElectronAPI();
  if (!api?.writeFile || !api?.listFiles || !api?.readFile)
    return { totalUpdated: 0, mainSequenceChanged: false };

  const electron = api;

  let totalUpdated = 0;
  const errors: string[] = [];
  const processedFiles = new Set<string>();
  let mainSequenceChanged = false;

  // Update top-level sequence if it uses the macro
  sequenceStore.update((seq) => {
    let changed = false;
    const newSeq = seq.map((item) => {
      if (item.kind === "macro") {
        const updatedMacroPath = getUpdatedPath(
          item.filePath,
          oldPath,
          newPath,
        );
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
   */
  async function processFileData(
    actualFilePath: string,
    originalFilePath: string,
    data: TurtleData,
    dataHasAbsolutePaths: boolean,
  ) {
    if (processedFiles.has(actualFilePath)) return;
    processedFiles.add(actualFilePath);

    if (!data.sequence?.length) return;

    let fileChanged = false;

    // Build a new sequence with updated paths.
    // Paths coming from disk are relative; resolve them to absolute before comparison,
    // then re-relativize the updated path before writing back out.
    const resolvePath = electron.resolvePath;
    const makeRelativePath = electron.makeRelativePath;
    const newSeq = await Promise.all(
      data.sequence.map(async (item) => {
        if (item.kind !== "macro") return item;

        // Resolve relative → absolute so getUpdatedPath works correctly.
        let absoluteItemPath = item.filePath;
        if (!dataHasAbsolutePaths && resolvePath) {
          try {
            absoluteItemPath = await resolvePath(actualFilePath, item.filePath);
          } catch {
            absoluteItemPath = item.filePath;
          }
        }

        const updatedAbsPath = getUpdatedPath(
          absoluteItemPath,
          oldPath,
          newPath,
        );
        if (!updatedAbsPath) return item;

        // If the data came from disk, re-relativize the path before saving
        let diskPath = updatedAbsPath;
        if (!dataHasAbsolutePaths && makeRelativePath) {
          try {
            diskPath = await makeRelativePath(actualFilePath, updatedAbsPath);
          } catch {
            diskPath = updatedAbsPath;
          }
        }

        fileChanged = true;
        totalUpdated++;

        // In-memory data keeps absolute paths; on-disk data stores relative paths.
        return {
          ...item,
          filePath: dataHasAbsolutePaths ? updatedAbsPath : diskPath,
        };
      }),
    );

    if (!fileChanged) return;

    const updatedData = { ...data, sequence: newSeq };

    // Stage an absolute-path version for macrosStore (if this file is currently loaded).
    const currentMacros = get(macrosStore);
    if (currentMacros.has(originalFilePath)) {
      macrosStoreChanged = true;
      if (!dataHasAbsolutePaths && resolvePath) {
        // Build an absolute-path version of the updated sequence for macrosStore.
        const absoluteSeq = await Promise.all(
          newSeq.map(async (item) => {
            if (item.kind !== "macro") return item;
            try {
              const abs = await resolvePath(actualFilePath, item.filePath);
              return { ...item, filePath: abs };
            } catch {
              return item;
            }
          }),
        );
        updatedMacros.set(originalFilePath, {
          ...updatedData,
          sequence: absoluteSeq,
        });
      } else {
        updatedMacros.set(originalFilePath, updatedData);
      }
    }

    // Write the updated file to disk (relative paths for disk-sourced data).
    try {
      const content = JSON.stringify(updatedData, null, 2);
      await electron.writeFile(actualFilePath, content);
    } catch (e) {
      console.error(
        `Failed to save updated macro reference to ${actualFilePath}`,
        e,
      );
      errors.push(actualFilePath);
    }
  }

  // 1. Check all currently loaded macros in memory (paths are already absolute).
  const currentMacros = get(macrosStore);
  for (const [macroFilePath, macroData] of currentMacros.entries()) {
    const actualDiskPath =
      getUpdatedPath(macroFilePath, oldPath, newPath) || macroFilePath;
    await processFileData(actualDiskPath, macroFilePath, macroData, true);
  }

  // 2. Scan every project file in the base directory tree (O(NM) as required).
  const baseDirectory =
    (await electron.getSavedDirectory?.()) || get(currentDirectoryStore);
  if (baseDirectory) {
    async function scanDirectory(dir: string) {
      try {
        const files = await electron.listFiles(dir);
        for (const f of files) {
          if (f.isDirectory && f.name !== "..") {
            await scanDirectory(f.path);
          } else if (
            !f.isDirectory &&
            !processedFiles.has(f.path) &&
            (f.name.endsWith(".turt") || f.name.endsWith(".pp"))
          ) {
            try {
              const content = await electron.readFile(f.path);
              const data = JSON.parse(content);
              await processFileData(f.path, f.path, data, false);
            } catch (err) {
              console.error(
                `Failed to read/parse file during macro scan: ${f.path}`,
                err,
              );
            }
          }
        }
      } catch (e) {
        console.error(`Failed to scan directory for macros: ${dir}`, e);
      }
    }
    await scanDirectory(baseDirectory);
  }

  // 3. Update macrosStore: remap moved keys and apply any reference-updated data.
  const anyKeyNeedsRename = Array.from(currentMacros.keys()).some((k) =>
    getUpdatedPath(k, oldPath, newPath),
  );
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
