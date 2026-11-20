// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

const api = vi.hoisted(() => ({
  readFile: vi.fn(),
  selectDirectory: vi.fn(),
  writeFile: vi.fn(),
  writeFileBase64: vi.fn(),
  fileExists: vi.fn(),
}));
vi.mock("../utils/platform", () => ({ getElectronAPI: () => api }));

import { runBatch, cancelBatch } from "../utils/batchExport";
import { exportFiles } from "../utils/exportFromFile";
import {
  batchProgress,
  currentFilePath,
  exportCycle,
  exportSwap,
  notification,
} from "../stores";
import { startPointStore } from "../lib/projectStore";

const project = (x: number) =>
  JSON.stringify({
    startPoint: { x, y: 0, heading: "tangential", reverse: false },
    lines: [],
  });
const files = ["a", "b", "c"].map((n, i) => ({
  name: `${n}.turt`,
  path: `/${n}.turt`,
  x: 10 * (i + 1),
}));

// jsdom has no animation frames worth waiting for.
vi.stubGlobal("requestAnimationFrame", (cb: () => void) => setTimeout(cb, 0));

describe("runBatch", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    exportSwap.set(null);
    currentFilePath.set("/mine.turt");
    startPointStore.set({ x: 1, y: 1, heading: "tangential", reverse: false });
    api.readFile.mockImplementation(async (p: string) =>
      project(files.find((f) => f.path === p)!.x),
    );
    api.selectDirectory.mockResolvedValue("/out");
    api.fileExists.mockResolvedValue(false);
    await exportFiles(files, "java");
  });

  it("exports every file from the current one, using each file's data", async () => {
    const seen: number[] = [];
    await runBatch(async () => {
      seen.push(get(startPointStore).x);
      return { suffix: ".java", data: "code" };
    }, vi.fn());

    expect(seen).toEqual([10, 20, 30]);
    expect(api.writeFile.mock.calls.map((c) => c[0])).toEqual([
      "/out/a.java",
      "/out/b.java",
      "/out/c.java",
    ]);
    expect(get(notification)?.message).toContain("Exported 3 of 3");
    // The open project is back, the cycle is over and the progress is gone.
    expect(get(currentFilePath)).toBe("/mine.turt");
    expect(get(startPointStore).x).toBe(1);
    expect(get(exportCycle)).toBeNull();
    expect(get(batchProgress)).toBeNull();
  });

  it("doesn't redo files already skipped", async () => {
    const { advanceExportCycle } = await import("../utils/exportFromFile");
    await advanceExportCycle(); // skip a
    const finished = vi.fn();
    await runBatch(async () => ({ suffix: ".java", data: "x" }), finished);
    expect(api.writeFile.mock.calls.map((c) => c[0])).toEqual([
      "/out/b.java",
      "/out/c.java",
    ]);
    expect(finished).toHaveBeenCalled();
  });

  it("never overwrites: a name clash gets a number", async () => {
    api.fileExists.mockImplementation(async (p: string) => p === "/out/a.java");
    await runBatch(async () => ({ name: "a.java", data: "x" }), vi.fn());
    // a.java exists, so the first file becomes a1.java; the next two are free.
    expect(api.writeFile.mock.calls[0][0]).toBe("/out/a1.java");
  });

  it("carries on past a failing file and names it in the summary", async () => {
    let n = 0;
    await runBatch(async () => {
      if (++n === 2) throw new Error("boom");
      return { suffix: ".java", data: "x" };
    }, vi.fn());
    expect(api.writeFile).toHaveBeenCalledTimes(2);
    expect(get(notification)?.message).toContain("Exported 2 of 3");
    expect(get(notification)?.message).toContain("Failed: b.turt");
  });

  it("does nothing, and stays in the dialog, if no folder is chosen", async () => {
    api.selectDirectory.mockResolvedValue(null);
    const exporter = vi.fn();
    const finished = vi.fn();
    await runBatch(exporter, finished);
    expect(exporter).not.toHaveBeenCalled();
    expect(finished).not.toHaveBeenCalled();
    expect(get(exportCycle)).not.toBeNull();
  });

  it("stops when cancelled and keeps what was written", async () => {
    await runBatch(async (signal) => {
      cancelBatch();
      signal.throwIfAborted();
      return { suffix: ".java", data: "x" };
    }, vi.fn());
    expect(api.writeFile).not.toHaveBeenCalled();
    expect(get(notification)?.message).toContain("Cancelled");
    expect(get(currentFilePath)).toBe("/mine.turt");
  });
});
