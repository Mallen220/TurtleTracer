// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Paths as the user sees them. Long ones are shortened to where they start
// and where they end (TeamCode/…/AutoPaths/Far.turt); PathText.svelte shows
// the rest when the "…" is clicked. Paths in messages are marked with
// pathInMessage (messagePaths.ts) so they can be shortened too.
import { GITHUB_ROOT, isGitHubPath } from "./github/paths";

const BROWSER_ROOT = "/browser_fs";

/**
 * How a path is shown: files in a repository as owner/repo/…, and the
 * browser's own files from "/".
 */
export function displayPath(path: string): string {
  if (isGitHubPath(path)) return path.slice(GITHUB_ROOT.length + 1);
  if (path === BROWSER_ROOT) return "/";
  if (path.startsWith(BROWSER_ROOT + "/"))
    return path.slice(BROWSER_ROOT.length);
  return path;
}

export interface ShortPath {
  /** Shown before the "…", ending with a separator. */
  start: string;
  /** Shown after it, starting with a separator. */
  end: string;
}

// Folders shown before the "…", after any root, "~" or "..".
const KEEP_START = 1;
// A repository's path starts with owner/repo.
const KEEP_START_IN_REPO = 2;
// Names shown after it: usually a folder and a file.
const KEEP_END = 2;
// Hiding a single folder saves too little to be worth a click.
const MIN_HIDDEN = 2;

const HOME =
  /^(?:\/Users\/[^/]+|\/home\/[^/]+|[a-z]:\\Users\\[^\\]+)(?=[\\/])/i;
// "" before a leading separator, or a home, parent or drive.
const ROOT_NAME = /^(?:~|\.\.?|[A-Za-z]:)?$/;

/**
 * The start and end of a long path, without the folders between them, or
 * null when it's short enough to show whole. A home folder becomes "~".
 */
export function shortenPath(path: string): ShortPath | null {
  let shown = displayPath(path);
  const home = HOME.exec(shown);
  if (home) shown = "~" + shown.slice(home[0].length);

  // Names, with the separator that follows each one between them.
  const pieces = shown.split(/([\\/])/);
  const names = pieces.filter((_, i) => i % 2 === 0);
  let rootNames = 0;
  while (rootNames < names.length && ROOT_NAME.test(names[rootNames]!)) {
    rootNames++;
  }
  const startNames =
    rootNames + (isGitHubPath(path) ? KEEP_START_IN_REPO : KEEP_START);
  const endNames = KEEP_END + (names.at(-1) === "" ? 1 : 0);
  if (names.length - startNames - endNames < MIN_HIDDEN) return null;
  return {
    start: pieces.slice(0, startNames * 2).join(""),
    end: pieces.slice((names.length - endNames) * 2 - 1).join(""),
  };
}

/** The shortened path as plain text, for places that can't expand it. */
export function shortPathText(path: string): string {
  const short = shortenPath(path);
  return short ? `${short.start}…${short.end}` : displayPath(path);
}
