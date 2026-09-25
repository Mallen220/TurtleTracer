// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import {
  addNewLine,
  addWait,
  addRotate,
  addEventMarker,
} from "../../../../lib/components/shortcuts/elements";
import { getSelectedSequenceIndex } from "../../../../lib/components/shortcuts/utils";
import { linesStore, sequenceStore } from "../../../../lib/projectStore";
import type { Line, SequenceItem } from "../../../../types";
import { selectedLineId, selectedPointId } from "../../../../stores";

vi.mock("../../../../lib/components/shortcuts/utils", () => ({
  getSelectedSequenceIndex: vi.fn(() => null),
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

  describe("inserting after the selection", () => {
    const line = (id: string, x: number): Line => ({
      id,
      name: "",
      endPoint: { x, y: 0, heading: "constant", degrees: 90 },
      controlPoints: [],
      color: "#f00",
    });

    it("puts a new path after the selected one, in both lists", () => {
      linesStore.set([line("a", 10), line("b", 20)]);
      sequenceStore.set([
        { kind: "path", lineId: "a" },
        { kind: "path", lineId: "b" },
      ]);
      vi.mocked(getSelectedSequenceIndex).mockReturnValue(0);

      addNewLine(vi.fn());

      const lines = get(linesStore);
      const seq = get(sequenceStore) as { lineId: string }[];
      expect(seq.map((s) => s.lineId)).toEqual(lines.map((l) => l.id));
      // Somewhere near the middle, turning the way path "a" does
      const { x, y } = lines[1].endPoint;
      expect(x).toBeGreaterThanOrEqual(36);
      expect(x).toBeLessThanOrEqual(108);
      expect(y).toBeGreaterThanOrEqual(36);
      expect(y).toBeLessThanOrEqual(108);
      expect(lines[1].endPoint).toMatchObject({
        heading: "constant",
        degrees: 90,
      });
      expect(get(selectedLineId)).toBe(lines[1].id);
      expect(get(selectedPointId)).toBe("point-2-0");
    });
  });

  it("doesn't put every new path in the same spot", () => {
    for (let i = 0; i < 5; i++) addNewLine(vi.fn());
    const ends = get(linesStore).map((l) => `${l.endPoint.x},${l.endPoint.y}`);
    expect(new Set(ends).size).toBeGreaterThan(1);
  });

  describe("addEventMarker", () => {
    it("adds a marker to the selected turn without changing the old state", () => {
      const turn: SequenceItem = {
        kind: "rotate",
        id: "r1",
        name: "",
        degrees: 0,
        eventMarkers: [],
      };
      sequenceStore.set([turn]);
      selectedPointId.set("rotate-r1");
      const cb = vi.fn();

      addEventMarker(cb);

      const [updated] = get(sequenceStore);
      expect(updated).toMatchObject({ eventMarkers: [{ position: 0.5 }] });
      expect(turn.eventMarkers).toEqual([]);
      expect(get(selectedPointId)).toBe("event-rotate-r1-0");
      expect(cb).toHaveBeenCalledWith("Add Event Marker");
    });

    it("leaves locked items alone", () => {
      sequenceStore.set([
        { kind: "wait", id: "w1", name: "", durationMs: 1, locked: true },
      ]);
      selectedPointId.set("wait-w1");
      const cb = vi.fn();
      addEventMarker(cb);
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
