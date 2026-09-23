// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { FileInfo } from "../../../types";
import { isSupportedProjectFileName } from "../../../utils/fileExtensions";
import { loadRecentFile } from "../../../utils/fileHandlers";
import { getElectronAPI } from "../../../utils/platform";

export interface FileCommandItem {
  id: string;
  label: string;
  action: () => void;
  category: string;
}

/**
 * Fetches recent project files from the saved directory for the command palette.
 */
export async function fetchProjectFileCommands(): Promise<FileCommandItem[]> {
  const api = getElectronAPI();
  if (!api) return [];
  try {
    let dir: string | null = (await api.getSavedDirectory?.()) ?? null;
    if (!dir) dir = (await api.getDirectory?.()) ?? null;
    if (dir) {
      const files: FileInfo[] = await api.listFiles(dir);
      return files
        .filter((f: FileInfo) => isSupportedProjectFileName(f.name))
        .map((f: FileInfo) => ({
          id: `file-${f.name}`,
          label: `Open File: ${f.name}`,
          action: () => loadRecentFile(f.path),
          category: "File",
        }));
    }
  } catch (err) {
    console.warn("Failed to fetch files for command palette", err);
  }
  return [];
}
