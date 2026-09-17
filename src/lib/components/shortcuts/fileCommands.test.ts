// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchProjectFileCommands } from "./fileCommands";
import * as platform from "../../../utils/platform";

describe("fileCommands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty array if Electron API is unavailable", async () => {
    vi.spyOn(platform, "getElectronAPI").mockReturnValue(undefined);
    const items = await fetchProjectFileCommands();
    expect(items).toEqual([]);
  });

  it("fetches and maps supported files from directory", async () => {
    vi.spyOn(platform, "getElectronAPI").mockReturnValue({
      getSavedDirectory: vi.fn().mockResolvedValue("/test/dir"),
      listFiles: vi.fn().mockResolvedValue([
        { name: "test1.turt", path: "/test/dir/test1.turt" },
        { name: "image.png", path: "/test/dir/image.png" },
        { name: "path2.pp", path: "/test/dir/path2.pp" },
      ]),
    } as any);

    const items = await fetchProjectFileCommands();
    expect(items).toHaveLength(2);
    expect(items[0].label).toBe("Open File: test1.turt");
    expect(items[1].label).toBe("Open File: path2.pp");
  });

  it("handles errors gracefully and returns empty array", async () => {
    vi.spyOn(platform, "getElectronAPI").mockReturnValue({
      getSavedDirectory: vi.fn().mockRejectedValue(new Error("disk error")),
    } as any);

    const items = await fetchProjectFileCommands();
    expect(items).toEqual([]);
  });
});
