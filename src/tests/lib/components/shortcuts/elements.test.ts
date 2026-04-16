// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addNewLine,
  addWait,
  addRotate,
  addEventMarker,
  addControlPoint,
  removeControlPoint,
} from "../../../../lib/components/shortcuts/elements";
import { linesStore, sequenceStore } from "../../../../lib/projectStore";
import { selectedLineId, selectedPointId } from "../../../../stores";

vi.mock("../../../../lib/components/shortcuts/utils", () => ({
  getSelectedSequenceIndex: vi.fn(() => null),
  isUIElementFocused: vi.fn(() => false),
}));

describe("elements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    linesStore.set([]);
    sequenceStore.set([]);
    selectedLineId.set(null);
    selectedPointId.set(null);
  });

  describe("addNewLine", () => {
    it("should append a new line to stores", () => {
      const cb = vi.fn();
      addNewLine(cb);
      expect(cb).toHaveBeenCalledWith("Add Path");

      let lines: any;
      linesStore.subscribe((v) => (lines = v))();
      expect(lines.length).toBe(1);

      let seq: any;
      sequenceStore.subscribe((v) => (seq = v))();
      expect(seq.length).toBe(1);
    });
  });

  const testSequenceAddition = (
    addFn: (cb: any) => void,
    actionName: string,
    kind: string,
  ) => {
    const cb = vi.fn();
    addFn(cb);
    expect(cb).toHaveBeenCalledWith(actionName);

    let seq: any;
    sequenceStore.subscribe((v) => (seq = v))();
    expect(seq.length).toBe(1);
    expect(seq[0].kind).toBe(kind);
  };

  describe("addWait", () => {
    it("should append a new wait sequence item", () => {
      testSequenceAddition(addWait, "Add Wait", "wait");
    });
  });

  describe("addRotate", () => {
    it("should append a new rotate sequence item", () => {
      testSequenceAddition(addRotate, "Add Rotate", "rotate");
    });
  });
});
