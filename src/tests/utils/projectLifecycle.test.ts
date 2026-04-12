// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resetPath,
  handleResetPathWithConfirmation,
} from "../../utils/projectLifecycle";
import { isUnsaved } from "../../stores";
import {
  startPointStore,
  linesStore,
  sequenceStore,
  shapesStore,
} from "../../lib/projectStore";

vi.mock("../../config", () => ({
  getDefaultStartPoint: vi.fn(() => ({ x: 0, y: 0 })),
  getDefaultLines: vi.fn(() => []),
  getDefaultShapes: vi.fn(() => []),
}));

vi.mock("../../utils/fileHandlers", () => ({
  saveProject: vi.fn().mockResolvedValue(true),
}));

describe("projectLifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resetPath properly", () => {
    resetPath();
    let lines;
    linesStore.subscribe((v) => (lines = v))();
    expect(lines).toEqual([]);
    let seq;
    sequenceStore.subscribe((v) => (seq = v))();
    expect(seq).toEqual([]);
    let start;
    startPointStore.subscribe((v) => (start = v))();
    expect(start).toEqual({ x: 0, y: 0 });
  });

  it("should handleResetPathWithConfirmation and reset if user confirms", async () => {
    isUnsaved.set(true);
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const cb = vi.fn();

    await handleResetPathWithConfirmation(cb);

    expect(globalThis.confirm).toHaveBeenCalled();
    expect(cb).toHaveBeenCalled();
  });

  it("should handleResetPathWithConfirmation and NOT reset if user denies", async () => {
    isUnsaved.set(true);
    vi.spyOn(globalThis, "confirm").mockReturnValue(false);
    const cb = vi.fn();

    await handleResetPathWithConfirmation(cb);

    expect(globalThis.confirm).toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
  });
});
