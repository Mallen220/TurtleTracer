// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The way out when edits can't be committed (the branch or repository is
// gone, or there's no access): copies of them on this device.
import { getElectronAPI } from "../platform";
import { repoKey, type RepoRef } from "./paths";
import { githubRepos } from "./repos";

/** `parts` joined onto `dir` with whichever separator `dir` uses. */
const join = (dir: string, ...parts: string[]) => {
  const sep = dir.includes("\\") ? "\\" : "/";
  return [dir.replace(/[\\/]+$/, ""), ...parts].join(sep);
};

/**
 * Copies every file edited in a repository into "From GitHub/<owner>-<repo>"
 * in this device's project folder. Returns that folder and how many files
 * were copied.
 */
export async function saveCopiesOnDevice(
  ref: RepoRef,
): Promise<{ folder: string; count: number }> {
  const api = getElectronAPI();
  const root =
    (await api?.getSavedDirectory?.())?.trim() ||
    (await api?.getDirectory?.())?.trim();
  if (!api || !root) {
    throw new Error(
      "There's no project folder on this device to save copies in. Choose one in the file manager first.",
    );
  }
  const folder = join(root, "From GitHub", repoKey(ref).replace("/", "-"));
  const files = await githubRepos.changedFiles(ref);
  for (const { repoPath, content } of files) {
    const parts = repoPath.split("/");
    await api.createDirectory?.(join(folder, ...parts.slice(0, -1)));
    await api.writeFile(join(folder, ...parts), content);
  }
  return { folder, count: files.length };
}
