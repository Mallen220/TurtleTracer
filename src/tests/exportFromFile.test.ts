// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

const api = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("../utils/platform", () => ({ getElectronAPI: () => api }));

import { exportFile } from "../utils/exportFromFile";
import {
  currentFilePath,
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
