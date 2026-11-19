// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

const api = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("../utils/platform", () => ({ getElectronAPI: () => api }));

import {
  advanceExportCycle,
  exportFile,
  exportFiles,
} from "../utils/exportFromFile";
import {
  currentFilePath,
  exportCycle,
  exportDialogState,
  exportSwap,
  isUnsaved,
  notification,
  showExportImage,
  showFileManager,
} from "../stores";
import { linesStore, percentStore, startPointStore } from "../lib/projectStore";

const other = {
  startPoint: { x: 10, y: 20, heading: "tangential", reverse: false },
  lines: [
    {
      id: "l1",
      name: "Other",
      endPoint: { x: 50, y: 50, heading: "tangential" },
      controlPoints: [],
      color: "#fff",
    },
  ],
};

describe("exportFile", () => {
  beforeEach(() => {
    exportSwap.set(null);
    exportDialogState.set({ isOpen: false, format: "java" });
    showExportImage.set(false);
    showFileManager.set(true);
    startPointStore.set({ x: 1, y: 2, heading: "tangential", reverse: false });
    linesStore.set([]);
    percentStore.set(37);
    currentFilePath.set("/mine.turt");
    isUnsaved.set(true);
    notification.set(null as any);
    api.readFile.mockReset();
    api.readFile.mockResolvedValue(JSON.stringify(other));
  });

  it("exports the open file as it is, with no swap", async () => {
    await exportFile({ name: "mine.turt", path: "/mine.turt" }, "image");
    expect(api.readFile).not.toHaveBeenCalled();
    expect(get(exportSwap)).toBeNull();
    expect(get(showExportImage)).toBe(true);
  });

  it("swaps the file in without marking it unsaved, then restores everything", async () => {
    await exportFile({ name: "other.turt", path: "/other.turt" }, "points");

    expect(get(exportDialogState)).toMatchObject({
      isOpen: true,
      format: "points",
    });
    expect(get(currentFilePath)).toBe("/other.turt");
    expect(get(startPointStore).x).toBe(10);
    expect(get(linesStore)).toHaveLength(1);
    expect(get(isUnsaved)).toBe(false);
    expect(get(showFileManager)).toBe(false);

    get(exportSwap)!();

    expect(get(exportSwap)).toBeNull();
    expect(get(currentFilePath)).toBe("/mine.turt");
    expect(get(startPointStore).x).toBe(1);
    expect(get(linesStore)).toEqual([]);
    expect(get(percentStore)).toBe(37);
    expect(get(isUnsaved)).toBe(true);
  });

  it("restores a stale swap before starting the next one", async () => {
    await exportFile({ name: "other.turt", path: "/other.turt" }, "points");
    await exportFile({ name: "other.turt", path: "/other.turt" }, "json");
    get(exportSwap)!();
    expect(get(currentFilePath)).toBe("/mine.turt");
    expect(get(isUnsaved)).toBe(true);
  });

  it("shows an error and changes nothing when the file can't be read", async () => {
    api.readFile.mockResolvedValue("not json");
    await exportFile({ name: "bad.turt", path: "/bad.turt" }, "java");

    expect(get(notification)?.type).toBe("error");
    expect(get(exportSwap)).toBeNull();
    expect(get(currentFilePath)).toBe("/mine.turt");
    expect(get(exportDialogState).isOpen).toBe(false);
  });
});

describe("exportFiles (several files in turn)", () => {
  const files = ["one", "two", "three"].map((n) => ({
    name: `${n}.turt`,
    path: `/${n}.turt`,
  }));
  const project = (x: number) =>
    JSON.stringify({ ...other, startPoint: { ...other.startPoint, x } });

  beforeEach(() => {
    exportSwap.set(null);
    exportCycle.set(null);
    exportDialogState.set({ isOpen: false, format: "java" });
    startPointStore.set({ x: 1, y: 2, heading: "tangential", reverse: false });
    currentFilePath.set("/mine.turt");
    isUnsaved.set(true);
    api.readFile.mockReset();
    api.readFile.mockImplementation(async (path: string) =>
      project({ "/one.turt": 11, "/two.turt": 22, "/three.turt": 33 }[path]!),
    );
  });

  it("shows each file in turn and restores the open project after the last", async () => {
    await exportFiles(files, "points");
    expect(get(exportCycle)).toMatchObject({ index: 0 });
    expect(get(currentFilePath)).toBe("/one.turt");
    expect(get(startPointStore).x).toBe(11);
    expect(get(exportDialogState)).toMatchObject({
      isOpen: true,
      format: "points",
    });

    exportDialogState.set({ isOpen: false, format: "points" });
    await advanceExportCycle();
    expect(get(exportCycle)?.index).toBe(1);
    expect(get(startPointStore).x).toBe(22);
    expect(get(isUnsaved)).toBe(false);

    await advanceExportCycle();
    expect(get(startPointStore).x).toBe(33);

    await advanceExportCycle(); // past the last
    expect(get(exportCycle)).toBeNull();
    expect(get(exportSwap)).toBeNull();
    expect(get(currentFilePath)).toBe("/mine.turt");
    expect(get(startPointStore).x).toBe(1);
    expect(get(isUnsaved)).toBe(true);
  });

  it("exports the open file live, edits included, when it is one of them", async () => {
    await exportFiles(
      [files[0], { name: "mine.turt", path: "/mine.turt" }],
      "java",
    );
    await advanceExportCycle();
    expect(get(currentFilePath)).toBe("/mine.turt");
    expect(get(startPointStore).x).toBe(1); // the live project, not a re-read
    expect(get(isUnsaved)).toBe(true);
    expect(api.readFile).toHaveBeenCalledTimes(1);
  });

  it("skips a file that can't be read and carries on", async () => {
    api.readFile.mockImplementation(async (path: string) => {
      if (path === "/one.turt") throw new Error("gone");
      return project(22);
    });
    await exportFiles(files, "java");
    expect(get(notification)?.type).toBe("error");
    expect(get(exportCycle)?.index).toBe(1);
    expect(get(startPointStore).x).toBe(22);
  });

  it("cancelling restores everything", async () => {
    await exportFiles(files, "java");
    get(exportSwap)!();
    expect(get(exportCycle)).toBeNull();
    expect(get(currentFilePath)).toBe("/mine.turt");
    expect(get(startPointStore).x).toBe(1);
  });
});
