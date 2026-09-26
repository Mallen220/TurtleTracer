// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FileInfo } from "../../../types";
import {
  filePreviews,
  formatFileSize,
  groupFilesByDate,
} from "./fileBrowser.svelte";

const readFile = vi.fn();
vi.stubGlobal("electronAPI", { readFile });

const validProject = JSON.stringify({ startPoint: { x: 1, y: 2 }, lines: [] });

describe("filePreviews", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readFile.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads a preview once and caches it", async () => {
    readFile.mockResolvedValue(validProject);
    filePreviews.load("/a.turt");
    filePreviews.load("/a.turt");
    await vi.runAllTimersAsync();

    expect(filePreviews.previews["/a.turt"]?.startPoint).toEqual({
      x: 1,
      y: 2,
    });
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it("retries unreadable files a limited number of times", async () => {
    readFile.mockRejectedValue(new Error("busy"));
    filePreviews.load("/broken.turt");
    await vi.runAllTimersAsync();

    expect(filePreviews.previews["/broken.turt"]).toBeNull();
    // The first read plus five retries, then it gives up.
    expect(readFile).toHaveBeenCalledTimes(6);
  });

  it("reloads a failed preview on request", async () => {
    readFile.mockRejectedValue(new Error("busy"));
    filePreviews.load("/later.turt");
    await vi.runAllTimersAsync();

    readFile.mockResolvedValue(validProject);
    filePreviews.reloadFailed();
    await vi.runAllTimersAsync();

    expect(filePreviews.previews["/later.turt"]).not.toBeNull();
  });
});

describe("formatFileSize", () => {
  it("uses the largest unit that keeps the number at least 1", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
  });
});

describe("groupFilesByDate", () => {
  const file = (name: string, daysOld: number, isDirectory = false) =>
    ({
      name,
      path: `/${name}`,
      size: 0,
      isDirectory,
      modified: new Date(Date.now() - daysOld * 86_400_000),
    }) as FileInfo;

  it("puts folders first, then files by age, skipping empty groups", () => {
    const groups = groupFilesByDate([
      file("old", 10),
      file("new", 0),
      file("dir", 3, true),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["Folders", "Today", "Older"]);
    expect(groups[1].files.map((f) => f.name)).toEqual(["new"]);
  });
});
