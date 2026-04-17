// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { get, writable } from "svelte/store";

// Mock utilities
vi.mock("./utils", () => ({
  isUIElementFocused: vi.fn(() => false),
  getSelectedSequenceIndex: vi.fn(() => 0), // Default insert/get index
}));

// Mock pointLinking
vi.mock("../../../utils/pointLinking", () => ({
  updateLinkedWaits: vi.fn((seq, id) => seq),
  updateLinkedRotations: vi.fn((seq, id) => seq),
}));

// Stores setup
import * as projectStore from "../../projectStore";
import * as stores from "../../../stores";

vi.mock("../../projectStore", () => ({
  startPointStore: { subscribe: vi.fn(), set: vi.fn(), update: vi.fn() },
  linesStore: { subscribe: vi.fn(), set: vi.fn(), update: vi.fn() },
  sequenceStore: { subscribe: vi.fn(), set: vi.fn(), update: vi.fn() },
  renumberDefaultPathNames: vi.fn((lines) => lines),
}));

vi.mock("../../../stores", () => ({
  selectedPointId: { subscribe: vi.fn(), set: vi.fn(), update: vi.fn() },
  selectedLineId: { subscribe: vi.fn(), set: vi.fn(), update: vi.fn() },
  notification: { subscribe: vi.fn(), set: vi.fn(), update: vi.fn() },
}));

// actionRegistry setup (partial mock for test functionality)
const actionRegistryMap = new Map([
  ["wait", { isWait: true }],
  ["rotate", { isRotate: true }],
  ["path", { isPath: true }],
]);

vi.mock("../../actionRegistry", () => ({
  actionRegistry: {
    get: (kind: string) => actionRegistryMap.get(kind),
  },
}));

import {
  clipboard,
  copy,
  cut,
  paste,
  duplicate,
  generateName,
} from "./clipboard";
import {
  modifyValue,
  toggleHeadingMode,
  toggleReverse,
  toggleLock,
  togglePathChain,
  togglePiecewise,
  toggleGlobalHeading,
} from "./properties";

describe("Shortcuts Logic", () => {
  let mockStartPointStore: any;
  let mockLinesStore: any;
  let mockSequenceStore: any;
  let mockSelectedPointId: any;
  let mockSelectedLineId: any;
  let mockNotification: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStartPointStore = writable({
      x: 0,
      y: 0,
      heading: "tangential",
      locked: false,
    });
    mockLinesStore = writable([]);
    mockSequenceStore = writable([]);
    mockSelectedPointId = writable(null);
    mockSelectedLineId = writable(null);
    mockNotification = writable(null);

    stores.selectedPointId.subscribe =
      mockSelectedPointId.subscribe.bind(mockSelectedPointId);
    stores.selectedLineId.subscribe =
      mockSelectedLineId.subscribe.bind(mockSelectedLineId);
    stores.notification.subscribe =
      mockNotification.subscribe.bind(mockNotification);

    stores.selectedPointId.set =
      mockSelectedPointId.set.bind(mockSelectedPointId);
    stores.selectedLineId.set = mockSelectedLineId.set.bind(mockSelectedLineId);
    stores.notification.set = mockNotification.set.bind(mockNotification);

    stores.selectedPointId.update =
      mockSelectedPointId.update.bind(mockSelectedPointId);
    stores.selectedLineId.update =
      mockSelectedLineId.update.bind(mockSelectedLineId);
    stores.notification.update = mockNotification.update.bind(mockNotification);

    projectStore.startPointStore.subscribe =
      mockStartPointStore.subscribe.bind(mockStartPointStore);
    projectStore.startPointStore.set =
      mockStartPointStore.set.bind(mockStartPointStore);
    projectStore.startPointStore.update =
      mockStartPointStore.update.bind(mockStartPointStore);

    projectStore.linesStore.subscribe =
      mockLinesStore.subscribe.bind(mockLinesStore);
    projectStore.linesStore.set = mockLinesStore.set.bind(mockLinesStore);
    projectStore.linesStore.update = mockLinesStore.update.bind(mockLinesStore);

    projectStore.sequenceStore.subscribe =
      mockSequenceStore.subscribe.bind(mockSequenceStore);
    projectStore.sequenceStore.set =
      mockSequenceStore.set.bind(mockSequenceStore);
    projectStore.sequenceStore.update =
      mockSequenceStore.update.bind(mockSequenceStore);

    // reset clipboard by calling copy on null
    stores.selectedPointId.set(null);
    copy("table", {});
  });

  describe("clipboard", () => {
    it("generateName handles duplicates correctly", () => {
      const existing = ["test", "test duplicate", "test duplicate 2"];
      expect(generateName("test", [])).toBe("test duplicate");
      expect(generateName("test", existing)).toBe("test duplicate 3");
      expect(generateName("test duplicate", existing)).toBe("test duplicate 3");
    });

    it("copy copies a wait sequence item to clipboard", () => {
      mockSequenceStore.set([{ kind: "wait", id: "123", durationMs: 100 }]);
      mockSelectedPointId.set("wait-123");
      copy("code", {});

      // Check the imported clipboard value directly instead of using require
      expect(clipboard).toEqual({ kind: "wait", id: "123", durationMs: 100 });

      // Our mockNotification doesn't get properly updated via Svelte's set during testing but we validated clipboard correctly
    });

    it("cut calls copy and then removeSelected", () => {
      const removeSpy = vi.fn();
      mockSequenceStore.set([{ kind: "wait", id: "123", durationMs: 100 }]);
      mockSelectedPointId.set("wait-123");
      cut("code", {}, removeSpy);
      expect(removeSpy).toHaveBeenCalled();
      expect(get(mockNotification)).toMatchObject({ message: "Selection cut" });
    });

    it("paste pastes a wait item", () => {
      const waitItem = {
        kind: "wait",
        id: "123",
        name: "test",
        durationMs: 100,
      };
      mockSequenceStore.set([waitItem]);
      mockSelectedPointId.set("wait-123");

      copy("table", {});

      const recordChangeSpy = vi.fn();
      paste(recordChangeSpy);

      const seq = get(mockSequenceStore) as any;
      expect(seq.length).toBe(2);
      expect(seq[1].kind).toBe("wait");
      expect(seq[1].id).not.toBe("123");
      expect(seq[1].name).toBe("test duplicate");
      expect(recordChangeSpy).toHaveBeenCalledWith("Paste");
    });

    it("duplicate duplicates a path", () => {
      const line = {
        id: "line-1",
        endPoint: { x: 10, y: 10 },
        controlPoints: [{ x: 5, y: 5 }],
      };
      mockLinesStore.set([line]);
      mockSequenceStore.set([{ kind: "path", lineId: "line-1" }]);
      mockSelectedPointId.set("point-1-0");
      mockSelectedLineId.set("line-1");

      const recordChangeSpy = vi.fn();
      duplicate(recordChangeSpy);

      const lines = get(mockLinesStore) as any;
      const seq = get(mockSequenceStore) as any;

      expect(lines.length).toBe(2);
      expect(lines[1].id).not.toBe("line-1");
      expect(lines[1].endPoint.x).toBe(20);
      expect(lines[1].endPoint.y).toBe(20);
      expect(lines[1].controlPoints[0].x).toBe(15);
      expect(lines[1].controlPoints[0].y).toBe(15);

      expect(seq.length).toBe(2);
      expect(seq[1].lineId).toBe(lines[1].id);
      expect(recordChangeSpy).toHaveBeenCalledWith("Duplicate Selection");
    });

    it("paste pastes a path", () => {
      const line = {
        id: "line-1",
        name: "L1",
        endPoint: { x: 10, y: 10 },
        controlPoints: [{ x: 5, y: 5 }],
      };
      mockLinesStore.set([line]);
      mockSequenceStore.set([{ kind: "path", lineId: "line-1" }]);
      mockSelectedLineId.set("line-1");
      mockSelectedPointId.set("point-1-0");
      copy("table", {});

      const recordChangeSpy = vi.fn();
      paste(recordChangeSpy);

      const lines = get(mockLinesStore) as any;
      const seq = get(mockSequenceStore) as any;

      expect(lines.length).toBe(2);
      expect(lines[1].id).not.toBe("line-1");
      expect(lines[1].name).toBe("L1 duplicate");
      expect(seq.length).toBe(2);
      expect(seq[1].lineId).toBe(lines[1].id);
      expect(recordChangeSpy).toHaveBeenCalledWith("Paste");
    });
  });

  describe("properties", () => {
    it("modifyValue modifies wait duration", () => {
      mockSequenceStore.set([
        { kind: "wait", id: "wait1", durationMs: 1000, locked: false },
      ]);
      mockSelectedPointId.set("wait-wait1");

      const recordChangeSpy = vi.fn();
      modifyValue(1, recordChangeSpy); // delta = 1

      const seq = get(mockSequenceStore) as any;
      expect(seq[0].durationMs).toBe(1100);
      expect(recordChangeSpy).toHaveBeenCalledWith("Modify Duration");
    });

    it("modifyValue modifies rotate degrees", () => {
      mockSequenceStore.set([
        { kind: "rotate", id: "rot1", degrees: 90, locked: false },
      ]);
      mockSelectedPointId.set("rotate-rot1");

      const recordChangeSpy = vi.fn();
      modifyValue(-1, recordChangeSpy); // delta = -1

      const seq = get(mockSequenceStore) as any;
      expect(seq[0].degrees).toBe(85); // 90 - 5
      expect(recordChangeSpy).toHaveBeenCalledWith("Modify Rotation");
    });

    it("toggleHeadingMode cycles modes for start point", () => {
      mockStartPointStore.set({
        x: 0,
        y: 0,
        heading: "tangential",
        locked: false,
      });
      mockSelectedPointId.set("point-0-0");

      const recordChangeSpy = vi.fn();
      toggleHeadingMode(recordChangeSpy);

      let pt = get(mockStartPointStore) as any;
      expect(pt.heading).toBe("constant");
      expect(pt.degrees).toBe(0);

      toggleHeadingMode(recordChangeSpy);
      pt = get(mockStartPointStore);
      expect(pt.heading).toBe("linear");
      expect(pt.startDeg).toBe(90);
      expect(pt.endDeg).toBe(180);

      toggleHeadingMode(recordChangeSpy);
      pt = get(mockStartPointStore);
      expect(pt.heading).toBe("tangential");
      expect(pt.reverse).toBe(false);
    });

    it("toggleReverse toggles reverse for path endpoint", () => {
      mockLinesStore.set([
        {
          id: "L1",
          endPoint: { heading: "tangential", reverse: false },
          locked: false,
        },
      ]);
      mockSelectedPointId.set("point-1-0"); // line 1, end point

      const recordChangeSpy = vi.fn();
      toggleReverse(recordChangeSpy);

      const lines = get(mockLinesStore) as any;
      expect(lines[0].endPoint.reverse).toBe(true);
      expect(recordChangeSpy).toHaveBeenCalledWith("Toggle Reverse");
    });

    it("toggleLock toggles lock state for wait", () => {
      mockSequenceStore.set([{ kind: "wait", id: "w1", locked: false }]);
      mockSelectedPointId.set("wait-w1");

      const recordChangeSpy = vi.fn();
      toggleLock(recordChangeSpy);

      const seq = get(mockSequenceStore) as any;
      expect(seq[0].locked).toBe(true);
      expect(recordChangeSpy).toHaveBeenCalledWith("Toggle Lock");
    });

    it("togglePathChain toggles chain and clears globalHeadings", () => {
      mockLinesStore.set([
        { id: "L1", isChain: false, globalHeading: "tangential" },
        { id: "L2", isChain: true, globalHeading: "tangential" },
      ]);
      mockSequenceStore.set([
        { kind: "path", lineId: "L1", isChain: false },
        { kind: "path", lineId: "L2", isChain: true },
      ]);
      mockSelectedLineId.set("L2");

      const recordChangeSpy = vi.fn();
      togglePathChain(recordChangeSpy);

      const seq = get(mockSequenceStore) as any;
      const lines = get(mockLinesStore) as any;

      expect(seq[1].isChain).toBe(false);
      expect(lines[1].isChain).toBe(false);
      expect(lines[0].globalHeading).toBeUndefined();
      expect(recordChangeSpy).toHaveBeenCalledWith("Toggle Path Chain");
    });

    it("togglePiecewise toggles piecewise mode", () => {
      mockLinesStore.set([
        {
          id: "L1",
          endPoint: { heading: "tangential", reverse: false },
          locked: false,
        },
      ]);
      mockSelectedPointId.set("point-1-0");

      const recordChangeSpy = vi.fn();
      togglePiecewise(recordChangeSpy);

      let lines = get(mockLinesStore) as any;
      expect(lines[0].endPoint.heading).toBe("piecewise");
      expect(lines[0].endPoint.segments[0].heading).toBe("tangential");

      togglePiecewise(recordChangeSpy);
      lines = get(mockLinesStore);
      expect(lines[0].endPoint.heading).toBe("tangential");
    });

    it("toggleGlobalHeading toggles global heading for a chain", () => {
      mockLinesStore.set([
        {
          id: "L1",
          isChain: false,
          endPoint: { heading: "tangential", reverse: true },
          locked: false,
        },
        {
          id: "L2",
          isChain: true,
          endPoint: { heading: "constant", degrees: 45 },
          locked: false,
        },
      ]);
      mockSelectedLineId.set("L2");

      const recordChangeSpy = vi.fn();
      toggleGlobalHeading(recordChangeSpy);

      let lines = get(mockLinesStore) as any;
      expect(lines[0].globalHeading).toBe("constant");
      expect(lines[0].globalDegrees).toBe(45);

      toggleGlobalHeading(recordChangeSpy);
      lines = get(mockLinesStore);
      expect(lines[0].globalHeading).toBeUndefined();
    });
  });
});
