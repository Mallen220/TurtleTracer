// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const handlers = vi.hoisted(() => new Map());

vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showSaveDialog: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
  app: { getPath: () => "/fake" },
}));

const { registerFileHandlers } = await import("./fileHandlers.js");
const { dialog } = await import("electron");

const call = (channel, ...args) =>
  handlers.get(channel)({ sender: {} }, ...args);

let dir;
beforeEach(async () => {
  handlers.clear();
  registerFileHandlers();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-files-"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("file:write and file:read", () => {
  it("round-trips a project and leaves no temporary file", async () => {
    const file = path.join(dir, "Auto.turt");
    expect(await call("file:write", file, '{"a":1}')).toBe(true);
    expect(await call("file:read", file)).toBe('{"a":1}');
    expect(await fs.readdir(dir)).toEqual(["Auto.turt"]);
  });

  it("keeps the old file when the new content can't be written", async () => {
    const file = path.join(dir, "Auto.turt");
    await fs.writeFile(file, "precious");
    // Not a string or buffer: the write fails before the file is replaced.
    await expect(call("file:write", file, { not: "text" })).rejects.toThrow();
    expect(await fs.readFile(file, "utf-8")).toBe("precious");
    expect(await fs.readdir(dir)).toEqual(["Auto.turt"]);
  });

  it("refuses a relative path", async () => {
    await expect(call("file:write", "Auto.turt", "x")).rejects.toThrow(
      "must be absolute",
    );
  });

  it("writes base64 data as bytes", async () => {
    const file = path.join(dir, "a.png");
    await call(
      "file:write-base64",
      file,
      Buffer.from([9, 8, 7]).toString("base64"),
    );
    expect([...(await fs.readFile(file))]).toEqual([9, 8, 7]);
  });

  it("exports a .pp file to the chosen place", async () => {
    const file = path.join(dir, "out.pp");
    dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: file,
    });
    expect(await call("export:pp", { content: "pp" })).toBe(file);
    expect(await fs.readFile(file, "utf-8")).toBe("pp");
    dialog.showSaveDialog.mockResolvedValue({ canceled: true });
    expect(await call("export:pp", { content: "pp" })).toBeNull();
  });
});

describe("file:list", () => {
  it("lists folders and project or code files, and nothing else", async () => {
    await fs.mkdir(path.join(dir, "Blue"));
    await fs.writeFile(path.join(dir, "a.turt"), "abc");
    await fs.writeFile(path.join(dir, "b.pp"), "");
    await fs.writeFile(path.join(dir, "Auto.java"), "");
    await fs.writeFile(path.join(dir, "notes.txt"), "");

    const entries = await call("file:list", dir);
    expect(entries.map((e) => e.name).sort()).toEqual([
      "Auto.java",
      "Blue",
      "a.turt",
      "b.pp",
    ]);
    const turt = entries.find((e) => e.name === "a.turt");
    expect(turt).toMatchObject({
      path: path.join(dir, "a.turt"),
      size: 3,
      isDirectory: false,
      gitStatus: "clean",
    });
    expect(entries.find((e) => e.name === "Blue")).toMatchObject({
      isDirectory: true,
      size: 0,
    });
  });

  it.skipIf(process.platform === "win32")(
    "still lists the rest when one entry is a broken link",
    async () => {
      await fs.writeFile(path.join(dir, "good.turt"), "x");
      await fs.symlink(path.join(dir, "gone"), path.join(dir, "broken.turt"));

      const entries = await call("file:list", dir);
      expect(entries.map((e) => e.name)).toEqual(["good.turt"]);
    },
  );

  it.each([undefined, "", "   ", "relative/dir", 42])(
    "gives an empty list for %j",
    async (directory) => {
      expect(await call("file:list", directory)).toEqual([]);
    },
  );

  it("gives an empty list for a folder that isn't there", async () => {
    expect(await call("file:list", path.join(dir, "nope"))).toEqual([]);
  });
});

describe("renaming, copying, deleting", () => {
  it("renames, and won't overwrite an existing file", async () => {
    const a = path.join(dir, "a.turt");
    const b = path.join(dir, "b.turt");
    await fs.writeFile(a, "A");
    await fs.writeFile(b, "B");
    await expect(call("file:rename", a, b)).rejects.toThrow("already exists");
    expect(await fs.readFile(b, "utf-8")).toBe("B");

    const c = path.join(dir, "c.turt");
    expect(await call("file:rename", a, c)).toEqual({
      success: true,
      newPath: c,
    });
    expect(await fs.readFile(c, "utf-8")).toBe("A");
  });

  it("copies a file", async () => {
    const a = path.join(dir, "a.turt");
    const b = path.join(dir, "b.turt");
    await fs.writeFile(a, "A");
    await call("file:copy", a, b);
    expect(await fs.readFile(b, "utf-8")).toBe("A");
  });

  it("deletes a file, and a folder with what's in it", async () => {
    const file = path.join(dir, "a.turt");
    await fs.writeFile(file, "A");
    await call("file:delete", file);
    expect(await call("file:exists", file)).toBe(false);

    const sub = path.join(dir, "sub");
    await fs.mkdir(sub);
    await fs.writeFile(path.join(sub, "x.turt"), "x");
    await call("file:delete", sub);
    expect(await call("file:exists", sub)).toBe(false);
  });

  it("file:exists is false rather than an error for a bad path", async () => {
    expect(await call("file:exists", "relative")).toBe(false);
    expect(await call("file:exists", 5)).toBe(false);
  });
});

describe("relative paths", () => {
  it("resolves against the folder of the base file, and back", async () => {
    const base = path.join(dir, "Auto.turt");
    const target = path.join(dir, "sub", "Other.turt");
    const relative = await call("file:make-relative-path", base, target);
    expect(relative).toBe(path.join("sub", "Other.turt"));
    expect(await call("file:resolve-path", base, relative)).toBe(target);
  });
});
