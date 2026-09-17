// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  detectClickedElement,
  resolveSelectionOnDown,
  inferDragAction,
} from "./FieldSelection";
import type { Line } from "../../../types";

describe("FieldSelection", () => {
  describe("detectClickedElement", () => {
    it("returns null for non-element or empty target", () => {
      expect(detectClickedElement(null)).toBeNull();
      expect(detectClickedElement({} as any)).toBeNull();
    });

    it("detects point, obstacle, and targetpoint IDs", () => {
      const elPoint = { id: "point-1-0" } as any;
      const elObs = { id: "obstacle-0-1" } as any;
      const elTarget = { id: "targetpoint-1" } as any;

      expect(detectClickedElement(elPoint)).toBe("point-1-0");
      expect(detectClickedElement(elObs)).toBe("obstacle-0-1");
      expect(detectClickedElement(elTarget)).toBe("targetpoint-1");
    });

    it("normalizes event element IDs", () => {
      const elEvent = { id: "event-circle-0-1" } as any;
      expect(detectClickedElement(elEvent)).toBe("event-0-1");
    });

    it("returns null for unrelated IDs", () => {
      const elOther = { id: "canvas-background" } as any;
      expect(detectClickedElement(elOther)).toBeNull();
    });
  });

  describe("resolveSelectionOnDown", () => {
    const sampleLines: Line[] = [
      {
        id: "line-1",
        color: "#ff0000",
        endPoint: { x: 10, y: 10, heading: "tangential" },
        controlPoints: [{ x: 5, y: 5 }],
      },
      {
        id: "line-2",
        color: "#0000ff",
        controlPoints: [],
        endPoint: { x: 20, y: 20, heading: "tangential" },
      },
    ];

    it("selects a single point when not modifier key", () => {
      const result = resolveSelectionOnDown({
        clickedElem: "point-1-0",
        lines: sampleLines,
        currentPointIds: ["point-2-0"],
        currentLineIds: ["line-2"],
        currentSelectedPointId: "point-2-0",
        currentSelectedLineId: "line-2",
        isModifierKey: false,
      });

      expect(result.selectedPointId).toBe("point-1-0");
      expect(result.selectedLineId).toBe("line-1");
      expect(result.multiSelectedPointIds).toEqual(["point-1-0"]);
      expect(result.multiSelectedLineIds).toEqual(["line-1"]);
    });

    it("toggles point selection when modifier key is pressed", () => {
      // Adding to multi-selection
      const resultAdd = resolveSelectionOnDown({
        clickedElem: "point-2-0",
        lines: sampleLines,
        currentPointIds: ["point-1-0"],
        currentLineIds: ["line-1"],
        currentSelectedPointId: "point-1-0",
        currentSelectedLineId: "line-1",
        isModifierKey: true,
      });

      expect(resultAdd.multiSelectedPointIds).toEqual([
        "point-1-0",
        "point-2-0",
      ]);
      expect(resultAdd.multiSelectedLineIds).toEqual(["line-1", "line-2"]);

      // Removing from multi-selection
      const resultRemove = resolveSelectionOnDown({
        clickedElem: "point-2-0",
        lines: sampleLines,
        currentPointIds: ["point-1-0", "point-2-0"],
        currentLineIds: ["line-1", "line-2"],
        currentSelectedPointId: "point-2-0",
        currentSelectedLineId: "line-2",
        isModifierKey: true,
      });

      expect(resultRemove.multiSelectedPointIds).toEqual(["point-1-0"]);
    });

    it("handles start point point-0-0 selection", () => {
      const result = resolveSelectionOnDown({
        clickedElem: "point-0-0",
        lines: sampleLines,
        currentPointIds: [],
        currentLineIds: [],
        currentSelectedPointId: null,
        currentSelectedLineId: null,
        isModifierKey: false,
      });

      expect(result.selectedPointId).toBe("point-0-0");
      expect(result.selectedLineId).toBeNull();
      expect(result.multiSelectedPointIds).toEqual(["point-0-0"]);
    });

    it("handles targetpoint selection", () => {
      const result = resolveSelectionOnDown({
        clickedElem: "targetpoint-2",
        lines: sampleLines,
        currentPointIds: [],
        currentLineIds: [],
        currentSelectedPointId: null,
        currentSelectedLineId: null,
        isModifierKey: false,
      });

      expect(result.selectedPointId).toBe("targetpoint-2");
      expect(result.selectedLineId).toBe("line-2");
    });

    it("handles event selection", () => {
      const result = resolveSelectionOnDown({
        clickedElem: "event-0-1",
        lines: sampleLines,
        currentPointIds: [],
        currentLineIds: [],
        currentSelectedPointId: null,
        currentSelectedLineId: null,
        isModifierKey: false,
      });

      expect(result.selectedPointId).toBe("event-0-1");
      expect(result.selectedLineId).toBe("line-1");
    });

    it("handles wait-event selection", () => {
      const result = resolveSelectionOnDown({
        clickedElem: "wait-event-wait123-0",
        lines: sampleLines,
        currentPointIds: [],
        currentLineIds: [],
        currentSelectedPointId: null,
        currentSelectedLineId: null,
        isModifierKey: false,
      });

      expect(result.selectedPointId).toBe("wait-wait123");
      expect(result.selectedLineId).toBeNull();
    });
  });

  describe("inferDragAction", () => {
    it("returns appropriate action names", () => {
      expect(inferDragAction(null)).toBe("Move Object");
      expect(inferDragAction("point-0-0")).toBe("Move Start Point");
      expect(inferDragAction("point-1-0")).toBe("Move Endpoint");
      expect(inferDragAction("point-1-1")).toBe("Move Control Point");
      expect(inferDragAction("targetpoint-1")).toBe("Move Facing Target");
      expect(inferDragAction("obstacle-0-0")).toBe("Edit Obstacle");
      expect(inferDragAction("event-0-1")).toBe("Move Event Marker");
      expect(inferDragAction("wait-event-w1-0")).toBe("Move Event Marker");
      expect(inferDragAction("rotate-event-r1-0")).toBe("Move Event Marker");
      expect(inferDragAction("unknown-id")).toBe("Move Object");
    });
  });
});
