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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import {
  sequenceStore,
  macrosStore,
  updateAllMacroReferences,
} from "../lib/projectStore";
import { currentDirectoryStore, notification } from "../stores";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { SequenceMacroItem, TurtleData } from "../types";

// ─── helpers ────────────────────────────────────────────────────────────────

const macroKind = (): SequenceMacroItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isMacro)
    ?.kind as SequenceMacroItem["kind"]) ?? "macro";

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
  const dir = contextFile.slice(0, Math.max(0, contextFile.lastIndexOf("/")));
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
  const fromDir = fromFile
    .slice(0, Math.max(0, fromFile.lastIndexOf("/")))
    .split("/");
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
    readFile: vi.fn(async (path: string) =>
      JSON.stringify(diskFiles[path] ?? {}),
    ),
    listFiles: vi.fn(async (dir: string) => {
      // Return entries whose paths start with dir
      return (
        Object.keys(diskFiles)
          .filter((p) => p.startsWith(dir + "/"))
          .map((p) => {
            const rest = p.slice(dir.length + 1);
            const isNested = rest.includes("/");
            if (isNested) {
              const subdir = dir + "/" + rest.split("/")[0];
              return {
                path: subdir,
                name: rest.split("/")[0],
                isDirectory: true,
              };
            }
            return { path: p, name: rest, isDirectory: false };
          })
          // deduplicate directories
          .filter(
            (item, idx, arr) =>
              arr.findIndex((x) => x.path === item.path) === idx,
          )
      );
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
    (globalThis as any).electronAPI = setupElectronAPI(diskFiles, writes);

    const result = await updateAllMacroReferences(OLD_ABS, NEW_ABS);

    expect(result.totalUpdated).toBe(0);
    expect(result.mainSequenceChanged).toBe(false);
    expect(Object.keys(writes)).toHaveLength(0);
  });

  it("updates sequenceStore when the open project references the moved file", async () => {
    sequenceStore.set([makeMacroItem(OLD_ABS)]);

    const diskFiles = {}; // no files on disk need scanning
    (globalThis as any).electronAPI = setupElectronAPI(diskFiles);

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
    (globalThis as any).electronAPI = setupElectronAPI(diskFiles, writes);

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
    (globalThis as any).electronAPI = setupElectronAPI(diskFiles, writes);

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

    (globalThis as any).electronAPI = setupElectronAPI({});

    await updateAllMacroReferences(OLD_ABS, NEW_ABS);

    const map = get(macrosStore);
    expect(map.has(NEW_ABS)).toBe(true);
    expect(map.has(OLD_ABS)).toBe(false);
  });

  it("handles a folder move by updating all paths with the old folder prefix", async () => {
    const OLD_FOLDER = `${BASE}/macros`;
    const NEW_FOLDER = `${BASE}/lib`;
    // const OLD_FILE = `${OLD_FOLDER}/macro.turt`;
    // const NEW_FILE = `${NEW_FOLDER}/macro.turt`;

    const projectPath = `${BASE}/project.turt`;
    const relRef = "macros/macro.turt";

    const diskFiles = {
      [projectPath]: {
        ...makeEmptyData(),
        sequence: [makeMacroItem(relRef)],
      },
    };
    const writes: Record<string, string> = {};
    (globalThis as any).electronAPI = setupElectronAPI(diskFiles, writes);

    await updateAllMacroReferences(OLD_FOLDER, NEW_FOLDER);

    expect(writes[projectPath]).toBeDefined();
    const written = JSON.parse(writes[projectPath]);
    const newRef = (written.sequence[0] as SequenceMacroItem).filePath;
    expect(newRef).toBe("lib/macro.turt");
  });
});

// ─── more cases ──────────────────────────────────────────────────────────────

import { getUpdatedPath } from "../lib/macroReferenceUpdater";

describe("getUpdatedPath", () => {
  it("replaces an exact match", () => {
    expect(getUpdatedPath("/a/b.turt", "/a/b.turt", "/c/d.turt")).toBe(
      "/c/d.turt",
    );
  });

  it("moves everything inside a renamed folder, with either separator", () => {
    expect(getUpdatedPath("/a/macros/x.turt", "/a/macros", "/a/lib")).toBe(
      "/a/lib/x.turt",
    );
    expect(
      getUpdatedPath(
        String.raw`C:\a\macros\x.turt`,
        String.raw`C:\a\macros`,
        String.raw`C:\a\lib`,
      ),
    ).toBe(String.raw`C:\a\lib\x.turt`);
  });

  it("doesn't touch paths that only share a prefix, or are unrelated", () => {
    expect(
      getUpdatedPath("/a/macros2/x.turt", "/a/macros", "/a/lib"),
    ).toBeNull();
    expect(getUpdatedPath("/other/x.turt", "/a/macros", "/a/lib")).toBeNull();
  });
});

describe("updateAllMacroReferences edge cases", () => {
  const projectPath = `${BASE}/project.turt`;
  const withMacroRef = (ref = "macros/macro.turt") => ({
    ...makeEmptyData(),
    sequence: [makeMacroItem(ref)],
  });

  beforeEach(() => {
    actionRegistry.reset();
    registerCoreUI();
    sequenceStore.set([]);
    macrosStore.set(new Map());
    currentDirectoryStore.set(null as any);
    notification.set(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    delete (globalThis as any).electronAPI;
    vi.restoreAllMocks();
  });

  it("does nothing when the file API isn't available", async () => {
    (globalThis as any).electronAPI = { readFile: vi.fn() }; // no listFiles or writeFile
    expect(await updateAllMacroReferences(OLD_ABS, NEW_ABS)).toEqual({
      totalUpdated: 0,
      mainSequenceChanged: false,
    });
  });

  it("reports whether the open project's sequence changed", async () => {
    sequenceStore.set([makeMacroItem(OLD_ABS)]);
    (globalThis as any).electronAPI = setupElectronAPI({});
    const result = await updateAllMacroReferences(OLD_ABS, NEW_ABS);
    expect(result).toEqual({ totalUpdated: 1, mainSequenceChanged: true });
    expect((get(sequenceStore)[0] as SequenceMacroItem).filePath).toBe(NEW_ABS);
  });

  it("tells the user how many references were updated", async () => {
    (globalThis as any).electronAPI = setupElectronAPI({
      [projectPath]: withMacroRef(),
    });
    (globalThis as any).electronAPI.getSavedDirectory = vi.fn(async () => BASE);
    await updateAllMacroReferences(OLD_ABS, NEW_ABS);
    expect(get(notification)).toMatchObject({
      type: "success",
      message: "Updated 1 macro reference(s) to new location.",
    });
  });

  it("warns, but still counts the update, when a file can't be written", async () => {
    const api = setupElectronAPI({ [projectPath]: withMacroRef() });
    api.writeFile.mockRejectedValue(new Error("read-only"));
    (globalThis as any).electronAPI = api;
    const result = await updateAllMacroReferences(OLD_ABS, NEW_ABS);
    expect(result.totalUpdated).toBe(1);
    expect(get(notification)).toMatchObject({ type: "warning" });
    expect(get(notification)!.message).toContain(
      "failed to save to disk in 1 file(s)",
    );
  });

  it("stays quiet when nothing referred to the moved file", async () => {
    (globalThis as any).electronAPI = setupElectronAPI({
      [projectPath]: withMacroRef("other/elsewhere.turt"),
    });
    await updateAllMacroReferences(OLD_ABS, NEW_ABS);
    expect(get(notification)).toBeNull();
  });

  it("keeps going when one project file is unreadable", async () => {
    const good = `${BASE}/good.turt`;
    const bad = `${BASE}/bad.turt`;
    const writes: Record<string, string> = {};
    const api = setupElectronAPI({ [bad]: {}, [good]: withMacroRef() }, writes);
    const read = api.readFile.getMockImplementation()!;
    api.readFile.mockImplementation(async (p: string) => {
      if (p === bad) return "{not json";
      return read(p);
    });
    (globalThis as any).electronAPI = api;

    const result = await updateAllMacroReferences(OLD_ABS, NEW_ABS);
    expect(result.totalUpdated).toBe(1);
    expect(writes[good]).toBeDefined();
    expect(writes[bad]).toBeUndefined();
  });

  it("scans sub-folders, and skips other file types and parent links", async () => {
    const nested = `${BASE}/team/auto.turt`;
    const writes: Record<string, string> = {};
    const api = setupElectronAPI(
      {
        [nested]: withMacroRef("../macros/macro.turt"),
        [`${BASE}/notes.txt`]: withMacroRef(),
      },
      writes,
    );
    const list = api.listFiles.getMockImplementation()!;
    api.listFiles.mockImplementation(async (dir: string) => [
      { path: `${dir}/..`, name: "..", isDirectory: true },
      ...(await list(dir)),
    ]);
    (globalThis as any).electronAPI = api;

    await updateAllMacroReferences(OLD_ABS, NEW_ABS);
    expect(JSON.parse(writes[nested]).sequence[0].filePath).toBe(
      "../macro.turt",
    );
    expect(writes[`${BASE}/notes.txt`]).toBeUndefined();
  });

  it("carries on if a folder can't be listed", async () => {
    const api = setupElectronAPI({ [projectPath]: withMacroRef() });
    api.listFiles.mockRejectedValue(new Error("denied"));
    (globalThis as any).electronAPI = api;
    await expect(
      updateAllMacroReferences(OLD_ABS, NEW_ABS),
    ).resolves.toMatchObject({
      totalUpdated: 0,
    });
  });

  it("falls back to the open folder when no folder has been saved", async () => {
    const api = setupElectronAPI({ [projectPath]: withMacroRef() });
    api.getSavedDirectory.mockResolvedValue("" as any);
    currentDirectoryStore.set(BASE);
    (globalThis as any).electronAPI = api;
    expect(
      (await updateAllMacroReferences(OLD_ABS, NEW_ABS)).totalUpdated,
    ).toBe(1);
  });

  it("leaves a reference alone if its path can't be resolved", async () => {
    const writes: Record<string, string> = {};
    const api = setupElectronAPI({ [projectPath]: withMacroRef() }, writes);
    api.resolvePath.mockRejectedValue(new Error("nope"));
    (globalThis as any).electronAPI = api;
    const result = await updateAllMacroReferences(OLD_ABS, NEW_ABS);
    expect(result.totalUpdated).toBe(0);
    expect(writes[projectPath]).toBeUndefined();
  });

  it("updates a loaded macro's own references, including the copy held in memory", async () => {
    const holder = `${BASE}/holder.turt`;
    macrosStore.set(
      new Map([
        [holder, { ...makeEmptyData(), sequence: [makeMacroItem(OLD_ABS)] }],
      ]),
    );
    const writes: Record<string, string> = {};
    (globalThis as any).electronAPI = setupElectronAPI({}, writes);

    const result = await updateAllMacroReferences(OLD_ABS, NEW_ABS);

    expect(result.totalUpdated).toBe(1);
    const inMemory = get(macrosStore).get(holder)!;
    expect((inMemory.sequence[0] as SequenceMacroItem).filePath).toBe(NEW_ABS);

    // On disk the reference stays relative to the file that holds it, so the
    // project folder can still be moved or shared.
    const onDisk = JSON.parse(writes[holder]);
    expect(onDisk.sequence[0].filePath).toBe("macro.turt");
  });

  it("writes a loaded macro's reference as an absolute path if it can't be made relative", async () => {
    const holder = `${BASE}/holder.turt`;
    macrosStore.set(
      new Map([
        [holder, { ...makeEmptyData(), sequence: [makeMacroItem(OLD_ABS)] }],
      ]),
    );
    const writes: Record<string, string> = {};
    const api = setupElectronAPI({}, writes);
    api.makeRelativePath.mockRejectedValue(new Error("different drives"));
    (globalThis as any).electronAPI = api;

    await updateAllMacroReferences(OLD_ABS, NEW_ABS);
    expect(JSON.parse(writes[holder]).sequence[0].filePath).toBe(NEW_ABS);
  });

  it("writes each file once even when it is both loaded and on disk", async () => {
    const holder = `${BASE}/holder.turt`;
    macrosStore.set(
      new Map([
        [holder, { ...makeEmptyData(), sequence: [makeMacroItem(OLD_ABS)] }],
      ]),
    );
    const api = setupElectronAPI({
      [holder]: withMacroRef("macros/macro.turt"),
    });
    (globalThis as any).electronAPI = api;
    await updateAllMacroReferences(OLD_ABS, NEW_ABS);
    expect(api.writeFile.mock.calls.filter(([p]) => p === holder)).toHaveLength(
      1,
    );
  });
});
