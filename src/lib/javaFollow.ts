// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Following a Java file (desktop app): the field shows the paths in a Java
// file open in the team's editor, read again each time it's saved there.
// The file is the source of truth while it's followed: its paths are locked,
// no project file is changed, and nothing is exported over it. Saving the
// view as a project, or opening one, ends it.
import { get, writable } from "svelte/store";
import {
  currentDirectoryStore,
  currentFilePath,
  isUnsaved,
  notification,
  selectedPointId,
  selectedLineId,
  multiSelectedPointIds,
  multiSelectedLineIds,
} from "../stores";
import {
  linesStore,
  sequenceStore,
  shapesStore,
  startPointStore,
} from "./projectStore";
import { getElectronAPI } from "../utils/platform";
import type { ReadNote } from "../utils/javaImporter/pedroReader";
import type { TurtleData } from "../types";

export interface FollowedJava {
  /** The file being followed. */
  path: string;
  name: string;
  /** When the file was last read without a problem, in ms since 1970. */
  updatedAt: number | null;
  /** Why the latest save couldn't be shown, if it couldn't. */
  error: ReadNote | null;
  /** Things in the file the reader skipped. */
  notes: ReadNote[];
  /** How many paths the field shows. */
  paths: number;
}

export const followedJava = writable<FollowedJava | null>(null);

let stopWatching: (() => void) | null = null;
let stopOnOpen: (() => void) | null = null;
/** Counts reads, so a slow one doesn't overwrite a newer one. */
let reads = 0;

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** `parts` joined onto `dir` with whichever separator `dir` uses. */
function joinPath(dir: string, ...parts: string[]) {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return [dir.replace(/[\\/]$/, ""), ...parts].join(sep);
}

/**
 * java-parser's error put plainly: "Expecting --> ';' <-- but found -->
 * 'foo' <--" as "Expected ; but found foo". A missing ";" is reported, as
 * javac and editors do, on the line that's missing it rather than where the
 * next token is.
 */
export function syntaxProblem(message: string, source = ""): ReadNote {
  let line = Number(/line: (\d+)/.exec(message)?.[1] ?? 0);
  const column = Number(/column: (\d+)/.exec(message)?.[1] ?? 0);
  const expected =
    /Expecting --> '?(.+?)'? <-- but found --> '?(.+?)'? <--/.exec(message);
  const lines = source.split("\n");
  const firstOnLine =
    line > 0 &&
    lines[line - 1]?.slice(0, Math.max(0, column - 1)).trim() === "";
  if (expected?.[1] === ";" && firstOnLine) {
    // Back to the last line with code on it.
    let previous = line - 1;
    while (previous > 1 && /^\s*(\/\/.*)?$/.test(lines[previous - 1] ?? "")) {
      previous--;
    }
    if (previous >= 1) line = previous;
  }
  const text = expected
    ? `Expected ${expected[1]} but found ${expected[2]}.`
    : "The Java doesn't compile here.";
  return { line, message: text };
}

/**
 * The project files a `new TurtleTracerReader("Far.turt", ...)` in the code
 * loads its poses from, found where the library looks (the module's
 * src/main/assets/AutoPaths), next to the Java file, or in the app's folder.
 */
async function projectFilesFor(
  source: string,
  javaPath: string,
): Promise<Map<string, TurtleData>> {
  const api = getElectronAPI();
  const found = new Map<string, TurtleData>();
  const names = [
    ...source.matchAll(/new\s+TurtleTracerReader\s*\(\s*"([^"]+)"/g),
  ].map((m) => m[1]!);
  const module = javaPath.split(/[\\/]src[\\/]main[\\/]java[\\/]/)[0]!;
  const javaDir = javaPath.slice(
    0,
    Math.max(javaPath.lastIndexOf("/"), javaPath.lastIndexOf("\\")),
  );
  const appDir = get(currentDirectoryStore);
  for (const name of new Set(names)) {
    const places = [
      joinPath(module, "src", "main", "assets", "AutoPaths", name),
      joinPath(javaDir, name),
      ...(appDir ? [joinPath(appDir, name)] : []),
    ];
    for (const place of places) {
      try {
        if (!(await api?.fileExists?.(place))) continue;
        found.set(name, JSON.parse(await api!.readFile(place)));
        break;
      } catch {
        // Not here, or not a project; try the next place.
      }
    }
  }
  return found;
}

/** Puts a project read from the file on the field, locked. */
function show(project: TurtleData) {
  startPointStore.set({ ...project.startPoint, locked: true });
  linesStore.set(project.lines.map((line) => ({ ...line, locked: true })));
  sequenceStore.set(project.sequence);
  selectedPointId?.set?.(null);
  selectedLineId?.set?.(null);
  multiSelectedPointIds?.set?.([]);
  multiSelectedLineIds?.set?.([]);
}

/** Reads the followed file and shows it, or says why it can't. */
export async function readFollowed(path: string): Promise<void> {
  const read = ++reads;
  const update = (change: Partial<FollowedJava>) => {
    if (read !== reads) return false;
    followedJava.update((f) => (f?.path === path ? { ...f, ...change } : f));
    return true;
  };

  let source: string;
  try {
    source = await getElectronAPI()!.readFile(path);
  } catch {
    update({
      error: {
        line: 0,
        message: "Couldn't read the file. Has it been moved or deleted?",
      },
    });
    return;
  }

  // A save that doesn't compile yet keeps the last version on the field.
  try {
    const { parse } = await import("java-parser");
    parse(source);
  } catch (error) {
    update({
      error: syntaxProblem(String((error as Error)?.message ?? error), source),
    });
    return;
  }

  const [{ readPedroJava }, projects] = await Promise.all([
    import("../utils/javaImporter/pedroReader"),
    projectFilesFor(source, path),
  ]);
  const { project, notes } = readPedroJava(source, {
    projectFile: (name) => projects.get(name) ?? null,
  });
  if (read !== reads || get(followedJava)?.path !== path) return;
  if (project.lines.length === 0) {
    if (!get(followedJava)?.updatedAt) {
      show(project);
    } else {
      selectedPointId?.set?.(null);
      selectedLineId?.set?.(null);
      multiSelectedPointIds?.set?.([]);
      multiSelectedLineIds?.set?.([]);
    }
    update({
      error: { line: 0, message: "No paths found in this file." },
      notes,
    });
    return;
  }
  show(project);
  update({
    error: null,
    notes,
    updatedAt: Date.now(),
    paths: project.lines.length,
  });
}

/**
 * Starts following a Java file: `path`, or one the user picks. Returns
 * whether it started.
 */
export async function followJavaFile(path?: string): Promise<boolean> {
  const api = getElectronAPI();
  if (!api?.followJavaFile || !api.onJavaFileChanged) return false;
  const file = path ?? (await api.chooseJavaFile?.());
  if (!file) return false;
  if (
    get(isUnsaved) &&
    !confirm(
      `Your unsaved changes will be lost if you follow ${fileName(file)}. Continue?`,
    )
  ) {
    return false;
  }

  stopFollowing({ editable: false });
  await api.followJavaFile(file);
  stopWatching = api.onJavaFileChanged((changed) => {
    if (changed === file) void readFollowed(file);
  });

  currentFilePath.set(null);
  isUnsaved.set(false);
  shapesStore.set([]);
  followedJava.set({
    path: file,
    name: fileName(file),
    updatedAt: null,
    error: null,
    notes: [],
    paths: 0,
  });
  await readFollowed(file);
  // Opening a project ends it.
  stopOnOpen = currentFilePath.subscribe((opened) => {
    if (opened) stopFollowing({ editable: false });
  });

  notification.set({
    message: `Following ${fileName(file)}. Save it in your editor and the field updates.`,
    type: "success",
    timeout: 4000,
  });
  return true;
}

/**
 * Stops following. With `editable`, the paths on the field stay, unlocked,
 * as a new project that hasn't been saved.
 */
export function stopFollowing({ editable = true } = {}) {
  const followed = get(followedJava);
  stopWatching?.();
  stopWatching = null;
  stopOnOpen?.();
  stopOnOpen = null;
  if (!followed) return;
  void getElectronAPI()?.unfollowJavaFile?.();
  followedJava.set(null);
  reads++;
  if (editable) {
    startPointStore.update((s) => ({ ...s, locked: false }));
    linesStore.update((lines) => lines.map((l) => ({ ...l, locked: false })));
    isUnsaved.set(true);
  }
}

/** Stops following and saves what's on the field as a new project. */
export async function saveFollowedAsProject(): Promise<boolean> {
  stopFollowing();
  const { saveProject } = await import("../utils/fileHandlers");
  return saveProject({ saveAs: true });
}

/**
 * Prompts the user if they try to edit the visualizer while following a Java file.
 * Warns that editing will stop following the Java file and create an unsaved project copy.
 * Returns true if editing can proceed (user confirmed or not following), false if cancelled.
 */
export function confirmFollowedJavaEdit(): boolean {
  const followed = get(followedJava);
  if (!followed) return true;
  const confirmed = confirm(
    `Editing on the field will stop following ${followed.name} and create an unsaved project copy. Your changes will not be saved back to the Java file. Continue?`,
  );
  if (confirmed) {
    stopFollowing({ editable: true });
    return true;
  }
  return false;
}
