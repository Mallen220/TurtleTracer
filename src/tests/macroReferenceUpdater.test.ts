// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/**
 * Tests for updateAllMacroReferences in projectStore.ts.
 *
 * Critical invariant being verified: files stored on disk use RELATIVE macro paths (written
 * by makeRelativePath at save time).  updateAllMacroReferences must:
 *   1. Resolve the relative path to absolute before comparing against oldPath/newPath.
 *   2. Re-relativize the updated absolute path before writing back to disk.
 *   3. Always keep sequenceStore and macrosStore in absolute-path form.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import {
  sequenceStore,
  macrosStore,
  updateAllMacroReferences,
} from "../lib/projectStore";
import { currentDirectoryStore } from "../stores";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { SequenceMacroItem, TurtleData } from "../types";

// ─── helpers ────────────────────────────────────────────────────────────────

const macroKind = (): SequenceMacroItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isMacro)?.kind as SequenceMacroItem["kind"]) ??
  "macro";

function makeMacroItem(filePath: string): SequenceMacroItem {
  return { kind: macroKind(), id: "m1", name: "Test Macro", filePath };
}

function makeEmptyData(): TurtleData {
  return {
    startPoint: { x: 0, y: 0, heading: "tangential", reverse: false },
    lines: [],
    shapes: [],
    sequence: [],
  };
}

// ─── mock electronAPI ────────────────────────────────────────────────────────

const BASE = "/projects";
const OLD_ABS = `${BASE}/macros/macro.turt`;
const NEW_ABS = `${BASE}/macro.turt`; // moved to root

/** Simulate path.resolve(base, relative) the way Electron does it */
function simulateResolve(contextFile: string, relative: string): string {
  // contextFile is the file that contains the reference.
  // We resolve relative against its directory.
  const dir = contextFile.substring(0, contextFile.lastIndexOf("/"));
  if (relative.startsWith("/")) return relative; // already absolute
  const parts = (dir + "/" + relative).split("/");
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === "..") resolved.pop();
    else if (p !== ".") resolved.push(p);
  }
  return resolved.join("/");
}

/** Simulate path.relative(from, to) — makeRelativePath(fromFile, toFile) returns
 *  the path from fromFile's directory to toFile. */
function simulateMakeRelative(fromFile: string, toFile: string): string {
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/")).split("/");
  const toDir = toFile.split("/");

  let common = 0;
  while (common < fromDir.length && fromDir[common] === toDir[common]) common++;

  const ups = fromDir.length - common;
  const rel = [...Array(ups).fill(".."), ...toDir.slice(common)].join("/");
  return rel || ".";
}

function setupElectronAPI(
  diskFiles: Record<string, any>,
  writes: Record<string, string> = {},
) {
  return {
    writeFile: vi.fn(async (path: string, content: string) => {
      writes[path] = content;
      return true;
    }),
    readFile: vi.fn(async (path: string) => JSON.stringify(diskFiles[path] ?? {})),
    listFiles: vi.fn(async (dir: string) => {
      // Return entries whose paths start with dir
      return Object.keys(diskFiles)
        .filter((p) => p.startsWith(dir + "/"))
        .map((p) => {
          const rest = p.slice(dir.length + 1);
          const isNested = rest.includes("/");
          if (isNested) {
            const subdir = dir + "/" + rest.split("/")[0];
            return { path: subdir, name: rest.split("/")[0], isDirectory: true };
          }
          return { path: p, name: rest, isDirectory: false };
        })
        // deduplicate directories
        .filter((item, idx, arr) => arr.findIndex((x) => x.path === item.path) === idx);
    }),
    fileExists: vi.fn(async () => false),
    getSavedDirectory: vi.fn(async () => BASE),
    resolvePath: vi.fn(async (contextFile: string, relative: string) =>
      simulateResolve(contextFile, relative),
    ),
    makeRelativePath: vi.fn(async (fromFile: string, toFile: string) =>
      simulateMakeRelative(fromFile, toFile),
    ),
  };
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe("updateAllMacroReferences", () => {
  beforeEach(() => {
    actionRegistry.reset();
    registerCoreUI();

    // Reset stores
    sequenceStore.set([]);
    macrosStore.set(new Map());
    currentDirectoryStore.set(BASE);
  });

  it("no-op when no file references the moved path", async () => {
    const diskFiles = {
      [`${BASE}/project.turt`]: {
        ...makeEmptyData(),
        sequence: [makeMacroItem("other_macro.turt")],
      },
    };
    const writes: Record<string, string> = {};
    (window as any).electronAPI = setupElectronAPI(diskFiles, writes);

    const result = await updateAllMacroReferences(OLD_ABS, NEW_ABS);

    expect(result.totalUpdated).toBe(0);
    expect(result.mainSequenceChanged).toBe(false);
    expect(Object.keys(writes)).toHaveLength(0);
  });

  it("updates sequenceStore when the open project references the moved file", async () => {
    sequenceStore.set([makeMacroItem(OLD_ABS)]);

    const diskFiles = {}; // no files on disk need scanning
    (window as any).electronAPI = setupElectronAPI(diskFiles);

    const result = await updateAllMacroReferences(OLD_ABS, NEW_ABS);

    expect(result.mainSequenceChanged).toBe(true);
    const seq = get(sequenceStore);
    expect((seq[0] as SequenceMacroItem).filePath).toBe(NEW_ABS);
  });

  it("resolves RELATIVE paths in disk files to absolute before comparison", async () => {
    // project.turt is at /projects/project.turt and references macro via relative path
    const projectPath = `${BASE}/project.turt`;
    const relativeRef = "macros/macro.turt"; // relative from /projects/ → oldPath

    const diskFiles = {
      [projectPath]: {
        ...makeEmptyData(),
        sequence: [makeMacroItem(relativeRef)],
      },
    };
    const writes: Record<string, string> = {};
    (window as any).electronAPI = setupElectronAPI(diskFiles, writes);

    const result = await updateAllMacroReferences(OLD_ABS, NEW_ABS);

    expect(result.totalUpdated).toBeGreaterThan(0);
    // Disk file should have been rewritten
    expect(writes[projectPath]).toBeDefined();

    const written = JSON.parse(writes[projectPath]);
    const newRef = (written.sequence[0] as SequenceMacroItem).filePath;
    // Should be re-relativized: from /projects/project.turt to /projects/macro.turt → "macro.turt"
    expect(newRef).toBe("macro.turt");
  });

  it("updates a file in a sub-directory with correct relative paths", async () => {
    // sub/project.turt → references ../macros/macro.turt
    const subProjectPath = `${BASE}/sub/project.turt`;
    const relFromSub = "../macros/macro.turt"; // resolves to OLD_ABS

    const diskFiles = {
      [subProjectPath]: {
        ...makeEmptyData(),
        sequence: [makeMacroItem(relFromSub)],
      },
    };
    const writes: Record<string, string> = {};
    (window as any).electronAPI = setupElectronAPI(diskFiles, writes);

    await updateAllMacroReferences(OLD_ABS, NEW_ABS);

    expect(writes[subProjectPath]).toBeDefined();
    const written = JSON.parse(writes[subProjectPath]);
    const newRef = (written.sequence[0] as SequenceMacroItem).filePath;
    // From /projects/sub/project.turt to /projects/macro.turt → "../macro.turt"
    expect(newRef).toBe("../macro.turt");
  });

  it("updates macrosStore keys when the moved file was loaded as a macro", async () => {
    const macroData: TurtleData = { ...makeEmptyData() };
    macrosStore.set(new Map([[OLD_ABS, macroData]]));

    (window as any).electronAPI = setupElectronAPI({});

    await updateAllMacroReferences(OLD_ABS, NEW_ABS);

    const map = get(macrosStore);
    expect(map.has(NEW_ABS)).toBe(true);
    expect(map.has(OLD_ABS)).toBe(false);
  });

  it("handles a folder move by updating all paths with the old folder prefix", async () => {
    const OLD_FOLDER = `${BASE}/macros`;
    const NEW_FOLDER = `${BASE}/lib`;
    const OLD_FILE = `${OLD_FOLDER}/macro.turt`;
    const NEW_FILE = `${NEW_FOLDER}/macro.turt`;

    const projectPath = `${BASE}/project.turt`;
    const relRef = "macros/macro.turt";

    const diskFiles = {
      [projectPath]: {
        ...makeEmptyData(),
        sequence: [makeMacroItem(relRef)],
      },
    };
    const writes: Record<string, string> = {};
    (window as any).electronAPI = setupElectronAPI(diskFiles, writes);

    await updateAllMacroReferences(OLD_FOLDER, NEW_FOLDER);

    expect(writes[projectPath]).toBeDefined();
    const written = JSON.parse(writes[projectPath]);
    const newRef = (written.sequence[0] as SequenceMacroItem).filePath;
    expect(newRef).toBe("lib/macro.turt");
  });
});
