// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The Java and Kotlin files this process has shown the page: one picked in the
// file dialog or listed in a folder. Only those can be followed, so a path the
// page makes up never reaches the file system watcher.
import path from "node:path";

/** Normalized full paths, by the form `path.normalize` gives them. */
const offered = new Set();

/** Whether a path is a Java or Kotlin file, the kinds the page can follow. */
export const isCodeFilePath = (filePath) => /\.(java|kt)$/i.test(filePath);

/** Records a code file the page may now follow. Anything else is ignored. */
export function offerJavaFile(filePath, files = offered) {
  if (typeof filePath !== "string") return;
  if (!isCodeFilePath(filePath)) return;
  files.add(path.normalize(filePath));
}

/**
 * The offered path equal to `filePath`, or undefined if it was never offered.
 * The result comes from the registry, not from the caller.
 */
export function findOfferedJavaFile(filePath, files = offered) {
  const wanted = path.normalize(filePath);
  return [...files].find((known) => known === wanted);
}

export { offered as sharedOfferedJavaFiles };
