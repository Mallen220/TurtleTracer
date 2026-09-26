// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, waitFor, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import FileManager from "../lib/FileManager.svelte";
import { currentFilePath, isUnsaved, notification } from "../stores";
import {
  linesStore,
  sequenceStore,
  shapesStore,
  startPointStore,
  settingsStore,
} from "../lib/projectStore";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { FileInfo, Line } from "../types";

vi.mock(
  "../lib/components/filemanager/FileList.svelte",
  () => import("./FileListStub.svelte"),
);
vi.mock(
  "../lib/components/filemanager/FileGrid.svelte",
  () => import("./FileListStub.svelte"),
);

const project = (name: string) =>
  JSON.stringify({
    startPoint: { x: 1, y: 2, heading: "tangential", reverse: false },
    lines: [
      {
        id: `line-${name}`,
        name,
        endPoint: { x: 50, y: 60, heading: "tangential", reverse: false },
        controlPoints: [],
        color: "#fff",
      },
    ],
    shapes: [],
    sequence: [],
  });

/** An in-memory file system behind the electronAPI methods FileManager uses. */
function fakeFileSystem(files: Record<string, string>, dirs: string[]) {
  const fs = new Map(Object.entries(files));
  const folders = new Set(dirs);
  const parentOf = (p: string) => p.slice(0, p.lastIndexOf("/"));
  return {
    fs,
    folders,
    api: {
      getSavedDirectory: vi.fn(async () => "/proj"),
      listFiles: vi.fn(async (dir: string) => [
        ...[...folders]
          .filter((d) => parentOf(d) === dir)
          .map((d) => ({
            name: d.split("/").pop()!,
            path: d,
            isDirectory: true,
            size: 0,
            modified: new Date(0),
          })),
        ...[...fs.keys()]
          .filter((p) => parentOf(p) === dir)
          .map((p, i) => ({
            name: p.split("/").pop()!,
            path: p,
            isDirectory: false,
            size: fs.get(p)!.length,
            modified: new Date(1000 * (i + 1)),
          })),
      ]),
      readFile: vi.fn(async (p: string) => fs.get(p) ?? ""),
      writeFile: vi.fn(async (p: string, content: string) => {
        fs.set(p, content);
      }),
      fileExists: vi.fn(async (p: string) => fs.has(p) || folders.has(p)),
      deleteFile: vi.fn(async (p: string) => fs.delete(p)),
      createDirectory: vi.fn(async (p: string) => folders.add(p)),
      renameFile: vi.fn(async (from: string, to: string) => {
        for (const [p, c] of [...fs]) {
          if (p === from || p.startsWith(from + "/")) {
            fs.delete(p);
            fs.set(to + p.slice(from.length), c);
          }
        }
        if (folders.delete(from)) folders.add(to);
        return { success: true };
      }),
      makeRelativePath: vi.fn(async (_base: string, p: string) => p),
    },
  };
}

const list = () => (globalThis as any).__fileList;
const fileNamed = (name: string): FileInfo =>
  list().files.find((f: FileInfo) => f.name === name);

describe("FileManager", () => {
  let disk: ReturnType<typeof fakeFileSystem>;
  const originalAPI = (globalThis as any).electronAPI;

  beforeEach(async () => {
    disk = fakeFileSystem(
      {
        "/proj/alpha.turt": project("Alpha"),
        "/proj/beta.turt": project("Beta"),
        "/proj/sub/inner.turt": project("Inner"),
      },
      ["/proj/sub"],
    );
    (globalThis as any).electronAPI = disk.api;
    (globalThis as any).__fileList = undefined;
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    currentFilePath.set(null);
    isUnsaved.set(false);
    settingsStore.set({ ...DEFAULT_SETTINGS, autosaveMode: "never" } as any);
    startPointStore.set({ x: 5, y: 5, heading: "tangential", reverse: false });
    linesStore.set([
      {
        id: "line-current",
        name: "Current",
        endPoint: { x: 20, y: 20, heading: "tangential", reverse: false },
        controlPoints: [],
        color: "#000",
      } as Line,
    ]);
    sequenceStore.set([{ kind: "path", lineId: "line-current" }]);
    shapesStore.set([]);

    render(FileManager, { isOpen: true, settings: get(settingsStore) });
    await waitFor(() => expect(list()?.files?.length).toBeGreaterThan(0));
  });

  afterEach(() => {
    (globalThis as any).electronAPI = originalAPI;
    vi.restoreAllMocks();
  });

  it("lists folders first, then project files", () => {
    expect(list().files.map((f: FileInfo) => f.name)).toEqual([
      "sub",
      "beta.turt",
      "alpha.turt",
    ]);
  });

  it("opens a project", async () => {
    list().onopen(fileNamed("alpha.turt"));
    await waitFor(() => expect(get(currentFilePath)).toBe("/proj/alpha.turt"));
    expect(get(linesStore)[0].name).toBe("Alpha");
    expect(get(isUnsaved)).toBe(false);
  });

  it("follows the open file when it's renamed", async () => {
    currentFilePath.set("/proj/alpha.turt");
    list().onrenameStart(fileNamed("alpha.turt"));
    list().onrenameSave("gamma");
    await waitFor(() => expect(get(currentFilePath)).toBe("/proj/gamma.turt"));
    expect(disk.fs.has("/proj/gamma.turt")).toBe(true);
    expect(disk.fs.has("/proj/alpha.turt")).toBe(false);
  });

  it("follows the open file when its folder is renamed", async () => {
    currentFilePath.set("/proj/sub/inner.turt");
    list().onrenameStart(fileNamed("sub"));
    list().onrenameSave("renamed");
    await waitFor(() =>
      expect(get(currentFilePath)).toBe("/proj/renamed/inner.turt"),
    );
  });

  it("follows the open file when it's moved into a folder", async () => {
    currentFilePath.set("/proj/beta.turt");
    list().onmoveFile({
      sourceFile: fileNamed("beta.turt"),
      targetDir: fileNamed("sub"),
    });
    await waitFor(() =>
      expect(get(currentFilePath)).toBe("/proj/sub/beta.turt"),
    );
    expect(disk.fs.has("/proj/sub/beta.turt")).toBe(true);
  });

  it("clears the open file when it's deleted", async () => {
    currentFilePath.set("/proj/alpha.turt");
    list().onselect(fileNamed("alpha.turt"));
    list().onmenuAction({ action: "delete", file: fileNamed("alpha.turt") });
    await waitFor(() => expect(disk.fs.has("/proj/alpha.turt")).toBe(false));
    expect(get(currentFilePath)).toBeNull();
  });

  it("duplicates and mirrors without overwriting", async () => {
    list().onmenuAction({ action: "duplicate", file: fileNamed("beta.turt") });
    await waitFor(() => expect(disk.fs.has("/proj/beta_copy.turt")).toBe(true));
    list().onmenuAction({ action: "duplicate", file: fileNamed("beta.turt") });
    await waitFor(() =>
      expect(disk.fs.has("/proj/beta_copy1.turt")).toBe(true),
    );
    list().onmenuAction({ action: "mirror", file: fileNamed("beta.turt") });
    await waitFor(() =>
      expect(disk.fs.has("/proj/beta_mirrored.turt")).toBe(true),
    );
    const mirrored = JSON.parse(disk.fs.get("/proj/beta_mirrored.turt")!);
    expect(mirrored.lines[0].endPoint.x).toBe(144 - 50);
  });

  it("saves the current project over another file", async () => {
    currentFilePath.set("/proj/alpha.turt");
    list().onmenuAction({ action: "save-to", file: fileNamed("beta.turt") });
    await waitFor(() =>
      expect(JSON.parse(disk.fs.get("/proj/beta.turt")!).lines[0].name).toBe(
        "Current",
      ),
    );
    expect(get(currentFilePath)).toBe("/proj/alpha.turt");
  });

  it("creates a new file from the current project and opens it", async () => {
    const { fileManagerNewFileMode } = await import("../stores");
    fileManagerNewFileMode.set(true);
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>(
        'input[placeholder="path_name.turt"]',
      );
      expect(el).not.toBeNull();
      return el!;
    });
    await fireEvent.input(input, { target: { value: "fresh" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(get(currentFilePath)).toBe("/proj/fresh.turt"));
    const saved = JSON.parse(disk.fs.get("/proj/fresh.turt")!);
    expect(saved.lines[0].name).toBe("Current");
    expect(saved.startPoint).toMatchObject({ x: 5, y: 5 });
  });

  it("leaves the open file alone when a different, selected file is renamed", async () => {
    currentFilePath.set("/proj/alpha.turt");
    list().onselect(fileNamed("beta.turt"));
    list().onrenameStart(fileNamed("beta.turt"));
    list().onrenameSave("delta");
    await waitFor(() => expect(disk.fs.has("/proj/delta.turt")).toBe(true));
    expect(get(currentFilePath)).toBe("/proj/alpha.turt");
  });

  it("keeps unsaved changes flagged after saving a copy elsewhere", async () => {
    currentFilePath.set("/proj/alpha.turt");
    isUnsaved.set(true);
    list().onmenuAction({ action: "save-to", file: fileNamed("beta.turt") });
    await waitFor(() =>
      expect(JSON.parse(disk.fs.get("/proj/beta.turt")!).lines[0].name).toBe(
        "Current",
      ),
    );
    expect(get(isUnsaved)).toBe(true);
  });

  it("writes complete project files", async () => {
    list().onmenuAction({ action: "save-to", file: fileNamed("beta.turt") });
    await waitFor(() =>
      expect(JSON.parse(disk.fs.get("/proj/beta.turt")!).version).toBeTruthy(),
    );
    const saved = JSON.parse(disk.fs.get("/proj/beta.turt")!);
    expect(saved.header.info).toBe("Created with Turtle Tracer");
    expect(saved.sequence).toEqual([{ kind: "path", lineId: "line-current" }]);
  });

  it("imports a Java auto as a project file and opens it", async () => {
    const java = `
      public class RedAuto {
        public static class Paths {
          public PathChain a;
          public Paths(Follower follower) {
            a = follower.pathBuilder().addPath(new BezierLine(new Pose(56.000, 8.000), new Pose(56.000, 36.000))).setConstantHeadingInterpolation(Math.toRadians(90)).build();
          }
        }
      }`;
    const input = document.querySelector<HTMLInputElement>(
      'input[accept=".java"]',
    )!;
    Object.defineProperty(input, "files", {
      value: [new File([java], "RedAuto.java")],
      configurable: true,
    });
    await fireEvent.change(input);
    await waitFor(() =>
      expect(get(currentFilePath)).toBe("/proj/RedAuto.turt"),
    );
    const saved = JSON.parse(disk.fs.get("/proj/RedAuto.turt")!);
    expect(saved.version).toBeTruthy();
    expect(saved.lines.length).toBeGreaterThan(0);
    expect(get(isUnsaved)).toBe(false);
  });

  it("reports failures through the app's notifications", async () => {
    disk.api.readFile.mockRejectedValueOnce(new Error("disk on fire"));
    const seen: string[] = [];
    const unsubscribe = notification.subscribe((n: any) => {
      if (n?.message) seen.push(n.message);
    });
    list().onopen(fileNamed("alpha.turt"));
    await waitFor(() =>
      expect(seen.some((m) => m.includes("disk on fire"))).toBe(true),
    );
    unsubscribe();
  });
});
