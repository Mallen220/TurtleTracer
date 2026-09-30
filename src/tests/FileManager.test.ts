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

// fireEvent wants a Window; the lint rules want globalThis.
const win = globalThis as unknown as Window;

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
    notification.set(null);
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

  // --- Guard rails around destructive or pointless actions ---

  const lastNote = () =>
    get(notification) as { message: string; type: string } | null;
  const expectNote = (message: string | RegExp) =>
    waitFor(() => {
      const text = lastNote()?.message ?? "";
      if (typeof message === "string") expect(text).toBe(message);
      else expect(text).toMatch(message);
    });
  const importInput = () =>
    document.querySelector<HTMLInputElement>('input[accept=".turt,.pp"]')!;
  const chooseFile = async (input: HTMLInputElement, file: File) => {
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    await fireEvent.change(input);
  };

  describe("renaming", () => {
    it("ignores an empty name or the name it already has", async () => {
      list().onrenameStart(fileNamed("alpha.turt"));
      list().onrenameSave("   ");
      list().onrenameStart(fileNamed("alpha.turt"));
      list().onrenameSave("alpha");
      list().onrenameStart(fileNamed("alpha.turt"));
      list().onrenameSave("alpha.turt");
      await new Promise((r) => setTimeout(r, 20));
      expect(disk.api.renameFile).not.toHaveBeenCalled();
    });

    it("won't overwrite a file that already has the new name", async () => {
      list().onrenameStart(fileNamed("alpha.turt"));
      list().onrenameSave("beta");
      await waitFor(() =>
        expect(lastNote()?.message).toContain('"beta.turt" already exists'),
      );
      expect(lastNote()?.type).toBe("error");
      expect(disk.fs.has("/proj/alpha.turt")).toBe(true);
      expect(disk.api.renameFile).not.toHaveBeenCalled();
    });

    it("doesn't add a project extension to a folder name", async () => {
      list().onrenameStart(fileNamed("sub"));
      list().onrenameSave("stuff");
      await waitFor(() => expect(disk.folders.has("/proj/stuff")).toBe(true));
      await expectNote("Renamed to: stuff");
    });

    it("keeps the project extension when the user types a different supported one", async () => {
      list().onrenameStart(fileNamed("alpha.turt"));
      list().onrenameSave("old.pp");
      await waitFor(() => expect(disk.fs.has("/proj/old.pp")).toBe(true));
      await expectNote("Renamed to: old.pp");
    });

    it("reports a failed rename and leaves the file where it was", async () => {
      disk.api.renameFile.mockResolvedValueOnce({ success: false });
      list().onrenameStart(fileNamed("alpha.turt"));
      list().onrenameSave("gamma");
      await waitFor(() => expect(disk.api.renameFile).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 20));
      expect(disk.fs.has("/proj/alpha.turt")).toBe(true);
      expect(lastNote()).toBeNull();
    });

    it("reports an error when the rename throws", async () => {
      disk.api.renameFile.mockRejectedValueOnce(new Error("locked"));
      list().onrenameStart(fileNamed("alpha.turt"));
      list().onrenameSave("gamma");
      await waitFor(() =>
        expect(lastNote()?.message).toBe("Failed to rename: locked"),
      );
    });

    it("cancelling ends the rename without touching the disk", async () => {
      list().onrenameStart(fileNamed("alpha.turt"));
      await waitFor(() => expect(list().renamingFile?.name).toBe("alpha.turt"));
      list().onrenameCancel();
      await waitFor(() => expect(list().renamingFile).toBeNull());
      expect(disk.api.renameFile).not.toHaveBeenCalled();
    });

    it("the menu's rename action starts renaming that file", async () => {
      list().onmenuAction({
        action: "rename-start",
        file: fileNamed("beta.turt"),
      });
      await waitFor(() => expect(list().renamingFile?.name).toBe("beta.turt"));
    });
  });

  describe("moving", () => {
    it("ignores a drop on something that isn't a folder, on itself, or of the parent link", async () => {
      list().onmoveFile({
        sourceFile: fileNamed("alpha.turt"),
        targetDir: fileNamed("beta.turt"),
      });
      list().onmoveFile({
        sourceFile: fileNamed("sub"),
        targetDir: fileNamed("sub"),
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(disk.api.renameFile).not.toHaveBeenCalled();
    });

    it("moves a file up into the parent folder", async () => {
      list().onopen(fileNamed("sub"));
      await waitFor(() =>
        expect(list().files.some((f: FileInfo) => f.name === "..")).toBe(true),
      );
      list().onmoveFile({
        sourceFile: fileNamed("inner.turt"),
        targetDir: fileNamed(".."),
      });
      await waitFor(() => expect(disk.fs.has("/proj/inner.turt")).toBe(true));
      expect(disk.fs.has("/proj/sub/inner.turt")).toBe(false);
      await expectNote("Moved to parent folder");
    });

    it("never moves the parent link itself", async () => {
      list().onopen(fileNamed("sub"));
      await waitFor(() =>
        expect(list().files.some((f: FileInfo) => f.name === "..")).toBe(true),
      );
      list().onmoveFile({
        sourceFile: fileNamed(".."),
        targetDir: fileNamed("inner.turt"),
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(disk.api.renameFile).not.toHaveBeenCalled();
    });

    it("reports an error when the move throws", async () => {
      disk.api.renameFile.mockRejectedValueOnce(new Error("busy"));
      list().onmoveFile({
        sourceFile: fileNamed("beta.turt"),
        targetDir: fileNamed("sub"),
      });
      await waitFor(() =>
        expect(lastNote()?.message).toBe("Failed to move: busy"),
      );
    });

    it("says so when the move is into a named folder", async () => {
      list().onmoveFile({
        sourceFile: fileNamed("beta.turt"),
        targetDir: fileNamed("sub"),
      });
      await expectNote("Moved to sub");
    });
  });

  describe("deleting", () => {
    it("keeps the file when the user doesn't confirm", async () => {
      vi.spyOn(globalThis, "confirm").mockReturnValue(false);
      list().onmenuAction({ action: "delete", file: fileNamed("alpha.turt") });
      await new Promise((r) => setTimeout(r, 20));
      expect(disk.api.deleteFile).not.toHaveBeenCalled();
      expect(disk.fs.has("/proj/alpha.turt")).toBe(true);
    });

    it("deleting another file doesn't close the open one", async () => {
      currentFilePath.set("/proj/alpha.turt");
      list().onselect(fileNamed("alpha.turt"));
      list().onmenuAction({ action: "delete", file: fileNamed("beta.turt") });
      await waitFor(() => expect(disk.fs.has("/proj/beta.turt")).toBe(false));
      expect(get(currentFilePath)).toBe("/proj/alpha.turt");
      await expectNote("Deleted: beta.turt");
    });

    it("reports an error when the delete fails", async () => {
      disk.api.deleteFile.mockRejectedValueOnce(new Error("in use"));
      list().onmenuAction({ action: "delete", file: fileNamed("alpha.turt") });
      await waitFor(() =>
        expect(lastNote()?.message).toBe("Failed to delete: in use"),
      );
    });
  });

  describe("opening", () => {
    it("rejects an empty or incomplete project file with a clear message", async () => {
      disk.fs.set("/proj/empty.turt", "");
      disk.fs.set("/proj/partial.turt", JSON.stringify({ hello: "world" }));
      await fireEvent.click(document.querySelector('[aria-label="Refresh"]')!);
      await waitFor(() => expect(fileNamed("empty.turt")).toBeTruthy());

      list().onopen(fileNamed("empty.turt"));
      await waitFor(() =>
        expect(lastNote()?.message).toContain("File is empty"),
      );

      list().onopen(fileNamed("partial.turt"));
      await waitFor(() =>
        expect(lastNote()?.message).toContain("Invalid file format"),
      );
      expect(get(currentFilePath)).toBeNull();
    });

    it("saves the open file first when autosave-on-close is on", async () => {
      settingsStore.set({ ...DEFAULT_SETTINGS, autosaveMode: "close" } as any);
      currentFilePath.set("/proj/beta.turt");
      isUnsaved.set(true);
      list().onopen(fileNamed("alpha.turt"));
      await waitFor(() =>
        expect(get(currentFilePath)).toBe("/proj/alpha.turt"),
      );
      // beta was saved with the project that was open, before alpha replaced it.
      expect(JSON.parse(disk.fs.get("/proj/beta.turt")!).lines[0].name).toBe(
        "Current",
      );
    });

    it("opens a folder by browsing into it, and ..  goes back up", async () => {
      list().onopen(fileNamed("sub"));
      await waitFor(() =>
        expect(list().files.map((f: FileInfo) => f.name)).toContain(
          "inner.turt",
        ),
      );
      list().onopen(fileNamed(".."));
      await waitFor(() =>
        expect(list().files.map((f: FileInfo) => f.name)).toContain(
          "alpha.turt",
        ),
      );
      expect(list().files.some((f: FileInfo) => f.name === "..")).toBe(false);
    });
  });

  describe("creating files", () => {
    const openNewFileForm = async () => {
      const { fileManagerNewFileMode } = await import("../stores");
      fileManagerNewFileMode.set(true);
      return waitFor(() => {
        const el = document.querySelector<HTMLInputElement>(
          'input[placeholder="path_name.turt"]',
        );
        expect(el).not.toBeNull();
        return el!;
      });
    };

    it("does nothing for an empty name", async () => {
      const input = await openNewFileForm();
      await fireEvent.input(input, { target: { value: "   " } });
      await fireEvent.keyDown(input, { key: "Enter" });
      await new Promise((r) => setTimeout(r, 20));
      expect(disk.api.writeFile).not.toHaveBeenCalled();
    });

    it("asks before overwriting a file, and leaves it alone if declined", async () => {
      vi.spyOn(globalThis, "confirm").mockReturnValue(false);
      const input = await openNewFileForm();
      await fireEvent.input(input, { target: { value: "alpha" } });
      await fireEvent.keyDown(input, { key: "Enter" });
      await waitFor(() => expect(globalThis.confirm).toHaveBeenCalled());
      expect(JSON.parse(disk.fs.get("/proj/alpha.turt")!).lines[0].name).toBe(
        "Alpha",
      );
    });

    it("overwrites when the user agrees", async () => {
      const input = await openNewFileForm();
      await fireEvent.input(input, { target: { value: "alpha.turt" } });
      await fireEvent.keyDown(input, { key: "Enter" });
      await waitFor(() =>
        expect(JSON.parse(disk.fs.get("/proj/alpha.turt")!).lines[0].name).toBe(
          "Current",
        ),
      );
    });

    it("Escape closes the form without creating anything", async () => {
      const input = await openNewFileForm();
      await fireEvent.keyDown(input, { key: "Escape" });
      await waitFor(() =>
        expect(
          document.querySelector('input[placeholder="path_name.turt"]'),
        ).toBeNull(),
      );
    });
  });

  describe("importing", () => {
    it("rejects a file that isn't a project", async () => {
      await chooseFile(importInput(), new File(["x"], "notes.txt"));
      await waitFor(() =>
        expect(lastNote()?.message).toBe("Please select a .turt or .pp file"),
      );
    });

    it("rejects a project file with the wrong contents", async () => {
      await chooseFile(importInput(), new File(["{}"], "bad.turt"));
      await waitFor(() =>
        expect(lastNote()?.message).toContain("Invalid project file format"),
      );
      expect(disk.fs.has("/proj/bad.turt")).toBe(false);
    });

    it("asks before throwing away unsaved changes, and stops if declined", async () => {
      isUnsaved.set(true);
      vi.spyOn(globalThis, "confirm").mockReturnValue(false);
      await chooseFile(
        importInput(),
        new File([project("Imported")], "new.turt"),
      );
      await waitFor(() => expect(globalThis.confirm).toHaveBeenCalled());
      expect(disk.fs.has("/proj/new.turt")).toBe(false);
    });

    it("copies the project into the folder and opens it", async () => {
      await chooseFile(
        importInput(),
        new File([project("Imported")], "new.turt"),
      );
      await waitFor(() => expect(get(currentFilePath)).toBe("/proj/new.turt"));
      expect(get(linesStore)[0].name).toBe("Imported");
    });

    it("asks before replacing a file with the same name", async () => {
      vi.spyOn(globalThis, "confirm").mockReturnValue(false);
      await chooseFile(
        importInput(),
        new File([project("Other")], "alpha.turt"),
      );
      await waitFor(() => expect(globalThis.confirm).toHaveBeenCalled());
      expect(JSON.parse(disk.fs.get("/proj/alpha.turt")!).lines[0].name).toBe(
        "Alpha",
      );
    });
  });

  describe("the panel", () => {
    it("closes on Escape, but not while a new file name is being typed", async () => {
      const { fileManagerNewFileMode } = await import("../stores");
      fileManagerNewFileMode.set(true);
      await waitFor(() =>
        expect(
          document.querySelector('input[placeholder="path_name.turt"]'),
        ).not.toBeNull(),
      );
      await fireEvent.keyDown(win, { key: "Escape" });
      expect(
        document.querySelector('[aria-label="Close file manager"]'),
      ).not.toBeNull();
    });

    it("refreshing tells the user the list was reloaded", async () => {
      disk.fs.set("/proj/late.turt", project("Late"));
      await fireEvent.click(document.querySelector('[aria-label="Refresh"]')!);
      await waitFor(() => expect(fileNamed("late.turt")).toBeTruthy());
      expect(lastNote()?.message).toBe("Refreshed files and previews");
    });
  });
});
