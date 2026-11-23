// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("electron", () => ({ app: { getPath: vi.fn(() => "/fake") } }));

const { writeFileAtomic } = await import("./utils.js");

let dir;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-atomic-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("writeFileAtomic", () => {
  it("creates a new file and leaves no temporary file behind", async () => {
    const file = path.join(dir, "a.turt");
    await writeFileAtomic(file, "hello", "utf-8");
    expect(await fs.readFile(file, "utf-8")).toBe("hello");
    expect(await fs.readdir(dir)).toEqual(["a.turt"]);
  });

  it("replaces an existing file", async () => {
    const file = path.join(dir, "a.turt");
    await fs.writeFile(file, "old");
    await writeFileAtomic(file, "new", "utf-8");
    expect(await fs.readFile(file, "utf-8")).toBe("new");
  });

  it("writes binary data", async () => {
    const file = path.join(dir, "a.png");
    await writeFileAtomic(file, Buffer.from([1, 2, 3]));
    expect([...(await fs.readFile(file))]).toEqual([1, 2, 3]);
  });

  it("keeps the old content when the write fails part-way", async () => {
    const file = path.join(dir, "a.turt");
    await fs.writeFile(file, "precious");
    const real = fs.writeFile.bind(fs);
    // The temporary file gets half its data, then the disk "fills up".
    vi.spyOn(fs, "writeFile").mockImplementation(async (target, data, enc) => {
      await real(target, String(data).slice(0, 2), enc);
      throw Object.assign(new Error("no space"), { code: "ENOSPC" });
    });
    await expect(writeFileAtomic(file, "replacement", "utf-8")).rejects.toThrow(
      "no space",
    );
    vi.restoreAllMocks();
    expect(await fs.readFile(file, "utf-8")).toBe("precious");
    expect(await fs.readdir(dir)).toEqual(["a.turt"]);
  });

  it("writes through a symlink instead of replacing it", async () => {
    const real = path.join(dir, "real.turt");
    const link = path.join(dir, "link.turt");
    await fs.writeFile(real, "old");
    await fs.symlink(real, link);
    await writeFileAtomic(link, "new", "utf-8");
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(real, "utf-8")).toBe("new");
  });

  it("falls back to writing in place when the file can't be replaced", async () => {
    const file = path.join(dir, "a.turt");
    await fs.writeFile(file, "old");
    vi.spyOn(fs, "rename").mockRejectedValue(
      Object.assign(new Error("busy"), { code: "EBUSY" }),
    );
    await writeFileAtomic(file, "new", "utf-8");
    vi.restoreAllMocks();
    expect(await fs.readFile(file, "utf-8")).toBe("new");
    expect(await fs.readdir(dir)).toEqual(["a.turt"]);
  });
});
