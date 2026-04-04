// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { browserFileSystem } from "../../utils/browserFileSystem";
import "fake-indexeddb/auto";

describe("browserFileSystem", () => {
  beforeEach(async () => {});

  const uniqueId = () => Math.random().toString(36).substring(7);

  it("should return true for isVirtual", () => {
    expect(browserFileSystem.isVirtual).toBe(true);
  });

  it("should getDirectory and setDirectory", async () => {
    const dir = await browserFileSystem.getDirectory();
    expect(dir).toBe("/browser_fs");

    const newDir = await browserFileSystem.setDirectory("/custom_dir");
    expect(newDir).toBe("/custom_dir");
  });

  it("should list root files with listFiles", async () => {
    const id = uniqueId();
    await browserFileSystem.writeFile(`/browser_fs/test1_${id}.json`, "{}");
    await browserFileSystem.writeFile(`/browser_fs/test2_${id}.json`, "[]");

    const files = await browserFileSystem.listFiles("/browser_fs");
    expect(files.some((f) => f.name === `test1_${id}.json`)).toBe(true);
    expect(files.some((f) => f.name === `test2_${id}.json`)).toBe(true);
  });

  it("should readFile and return contents", async () => {
    const id = uniqueId();
    await browserFileSystem.writeFile(
      `/browser_fs/read_${id}.json`,
      "file data",
    );
    const data = await browserFileSystem.readFile(
      `/browser_fs/read_${id}.json`,
    );
    expect(data).toBe("file data");
  });

  it("should throw error if reading non-existent file", async () => {
    await expect(
      browserFileSystem.readFile(`/browser_fs/nope_${uniqueId()}.json`),
    ).rejects.toThrow();
  });

  it("should deleteFile", async () => {
    const id = uniqueId();
    await browserFileSystem.writeFile(`/browser_fs/del_${id}.json`, "data");
    await browserFileSystem.deleteFile(`/browser_fs/del_${id}.json`);
    await expect(
      browserFileSystem.readFile(`/browser_fs/del_${id}.json`),
    ).rejects.toThrow();
  });

  it("should renameFile", async () => {
    const id = uniqueId();
    await browserFileSystem.writeFile(`/browser_fs/old_${id}.json`, "data");
    await browserFileSystem.renameFile(
      `/browser_fs/old_${id}.json`,
      `/browser_fs/new_${id}.json`,
    );

    await expect(
      browserFileSystem.readFile(`/browser_fs/old_${id}.json`),
    ).rejects.toThrow();
    expect(await browserFileSystem.readFile(`/browser_fs/new_${id}.json`)).toBe(
      "data",
    );
  });
});
