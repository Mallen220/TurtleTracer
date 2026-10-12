// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The Java files this process has shown the page: one picked in the file dialog
// or listed in a folder. Only those can be followed, so a path the page makes
// up never reaches the file system watcher.
import path from "node:path";

/** Normalized full paths, by the form `path.normalize` gives them. */
const offered = new Set();

/** Records a Java file the page may now follow. Anything else is ignored. */
export function offerJavaFile(filePath, files = offered) {
  if (typeof filePath !== "string") return;
  if (!filePath.toLowerCase().endsWith(".java")) return;
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
