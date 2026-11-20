// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  handlers: new Map(),
  userData: "",
  documents: "",
  chosen: null,
}));

vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => mocks.handlers.set(channel, fn) },
  BrowserWindow: { fromWebContents: () => null },
  dialog: {
    showOpenDialog: async () =>
      mocks.chosen
        ? { canceled: false, filePaths: [mocks.chosen] }
        : { canceled: true, filePaths: [] },
  },
  app: {
    getPath: (name) =>
      name === "documents" ? mocks.documents : mocks.userData,
  },
}));

const { registerDirectoryHandlers } = await import("./directoryHandlers.js");

const call = (channel, ...args) =>
  mocks.handlers.get(channel)({ sender: {} }, ...args);

let root;
const originalHome = process.env.HOME;
beforeEach(async () => {
  mocks.handlers.clear();
  registerDirectoryHandlers();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tt-dirs-"));
  mocks.userData = path.join(root, "userData");
  mocks.documents = path.join(root, "Documents");
  await fs.mkdir(mocks.userData);
  await fs.mkdir(mocks.documents);
  mocks.chosen = null;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  process.env.HOME = originalHome;
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("file:get-directory", () => {
  it("falls back to AutoPaths in the Documents folder, with no HOME set (as on Windows)", async () => {
    delete process.env.HOME;
    const autoPaths = path.join(mocks.documents, "AutoPaths");
    await fs.mkdir(autoPaths);
    expect(await call("file:get-directory")).toBe(autoPaths);
  });

  it("is null when there is no saved folder and no AutoPaths folder", async () => {
    delete process.env.HOME;
    expect(await call("file:get-directory")).toBeNull();
  });

  it("prefers the saved folder when it can still be reached", async () => {
    const saved = path.join(root, "mine");
    await fs.mkdir(saved);
    mocks.chosen = saved;
    await call("file:set-directory");
    expect(await call("file:get-directory")).toBe(saved);
    expect(await call("directory:get-saved-directory")).toBe(saved);
  });

  it("falls back when the saved folder is gone", async () => {
    const saved = path.join(root, "mine");
    await fs.mkdir(saved);
    mocks.chosen = saved;
    await call("file:set-directory");
    await fs.rm(saved, { recursive: true });
    const autoPaths = path.join(mocks.documents, "AutoPaths");
    await fs.mkdir(autoPaths);
    expect(await call("file:get-directory")).toBe(autoPaths);
  });
});

describe("choosing folders", () => {
  it("returns null when the dialog is cancelled", async () => {
    expect(await call("file:set-directory")).toBeNull();
    expect(await call("file:select-directory")).toBeNull();
  });

  it("selecting a folder doesn't save it", async () => {
    mocks.chosen = path.join(root, "x");
    expect(await call("file:select-directory")).toBe(mocks.chosen);
    expect(await call("directory:get-saved-directory")).toBe("");
  });

  it("saving the folder keeps the other settings", async () => {
    await call("directory:save-settings", {
      autoPathsDirectory: "",
      plugins: { "a.js": true },
    });
    mocks.chosen = path.join(root, "x");
    await call("file:set-directory");
    const settings = await call("directory:get-settings");
    expect(settings.plugins).toEqual({ "a.js": true });
    expect(settings.autoPathsDirectory).toBe(mocks.chosen);
    expect(await fs.readdir(mocks.userData)).toEqual([
      "directory-settings.json",
    ]);
  });
});

describe("file:create-directory and file:get-directory-stats", () => {
  it("creates nested folders", async () => {
    const nested = path.join(root, "a", "b");
    await call("file:create-directory", nested);
    expect((await fs.stat(nested)).isDirectory()).toBe(true);
  });

  it.each(["", "  ", undefined, "relative"])("refuses %j", async (value) => {
    await expect(call("file:create-directory", value)).rejects.toThrow();
  });

  it("counts project files only", async () => {
    const dir = path.join(root, "stats");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "a.turt"), "123");
    await fs.writeFile(path.join(dir, "b.pp"), "45");
    await fs.writeFile(path.join(dir, "c.txt"), "6789");
    const stats = await call("file:get-directory-stats", dir);
    expect(stats.totalFiles).toBe(2);
    expect(stats.totalSize).toBe(5);
    expect(stats.lastModified.getTime()).toBeGreaterThan(0);
  });

  it("gives zeros for a folder that isn't there", async () => {
    const stats = await call("file:get-directory-stats", path.join(root, "no"));
    expect(stats).toMatchObject({ totalFiles: 0, totalSize: 0 });
  });
});
