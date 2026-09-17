// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  calculateRotatedPan,
  calculateSmartSnapAndBounds,
  applyDragToElement,
  computeMultiDragOffsets,
  executeMultiDragIteration,
  resolveHoverCursor,
} from "./FieldDragHandler";
import type { Line, Point, Shape, Settings } from "../../../types/index";

import { DEFAULT_SETTINGS } from "../../../config/defaults";

describe("FieldDragHandler", () => {
  describe("calculateRotatedPan", () => {
    it("returns direct delta when rotation is 0", () => {
      const pan = calculateRotatedPan(150, 200, { x: 100, y: 150 }, 0);
      expect(pan.rdx).toBeCloseTo(50);
      expect(pan.rdy).toBeCloseTo(50);
    });

    it("rotates delta correctly for 90 degree field rotation", () => {
      const pan = calculateRotatedPan(150, 100, { x: 100, y: 100 }, 90);
      // dx = 50, dy = 0, rad = -PI/2
      // rdx = 50 * cos(-90) - 0 = 0
      // rdy = 50 * sin(-90) + 0 = -50
      expect(pan.rdx).toBeCloseTo(0);
      expect(pan.rdy).toBeCloseTo(-50);
    });
  });

  describe("calculateSmartSnapAndBounds", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      restrictDraggingToField: true,
      smartSnapping: true,
      rLength: 18,
      rWidth: 18,
      safetyMargin: 2,
    };
    const startPoint: Point = { x: 20, y: 20, heading: "tangential" };

    it("snaps to grid when enabled", () => {
      const res = calculateSmartSnapAndBounds({
        id: "point-1-0",
        rawInchX: 25.3,
        rawInchY: 34.8,
        snapToGrid: true,
        showGrid: true,
        gridSize: 5,
        smartSnappingEnabled: false,
        isAltKey: false,
        startPoint,
        lines: [],
        shapes: [],
        fieldW: 144,
        fieldH: 144,
        settings: { ...settings, restrictDraggingToField: false },
      });
      expect(res.inchX).toBe(25);
      expect(res.inchY).toBe(35);
    });

    it("clamps anchor point to field boundary plus margins", () => {
      const res = calculateSmartSnapAndBounds({
        id: "point-1-0", // line endpoint -> robotMargin (9) + safety (2) = 11 margin
        rawInchX: 2,
        rawInchY: 142,
        snapToGrid: false,
        showGrid: false,
        gridSize: 0,
        smartSnappingEnabled: false,
        isAltKey: false,
        startPoint,
        lines: [],
        shapes: [],
        fieldW: 144,
        fieldH: 144,
        settings,
      });
      expect(res.inchX).toBe(11);
      expect(res.inchY).toBe(133);
    });
  });

  describe("applyDragToElement", () => {
    const startPoint: Point = { x: 10, y: 10, heading: "tangential" };
    const line1: Line = {
      id: "l1",
      name: "l1",
      endPoint: { x: 30, y: 30, heading: "tangential" },
      controlPoints: [{ x: 20, y: 25 }],
      color: "#ffffff",
      locked: false,
    };
    const shape: Shape = {
      id: "s1",
      name: "s1",
      color: "#ff0000",
      fillColor: "#ff0000",
      vertices: [{ x: 50, y: 50 }],
      locked: false,
    };

    it("updates start point correctly", () => {
      const res = applyDragToElement({
        id: "point-0-0",
        inchX: 15,
        inchY: 18,
        lines: [line1],
        shapes: [shape],
        startPoint,
        sequence: [],
        currentElem: "point-0-0",
      });
      expect(res.startPointChanged).toBe(true);
      expect(res.startPoint.x).toBe(15);
      expect(res.startPoint.y).toBe(18);
    });

    it("updates line endpoint correctly", () => {
      const res = applyDragToElement({
        id: "point-1-0",
        inchX: 40,
        inchY: 45,
        lines: [line1],
        shapes: [shape],
        startPoint,
        sequence: [],
        currentElem: "point-1-0",
      });
      expect(res.linesChanged).toBe(true);
      expect(res.lines[0].endPoint.x).toBe(40);
      expect(res.lines[0].endPoint.y).toBe(45);
    });

    it("updates obstacle vertex correctly", () => {
      const res = applyDragToElement({
        id: "obstacle-0-0",
        inchX: 60,
        inchY: 70,
        lines: [line1],
        shapes: [shape],
        startPoint,
        sequence: [],
        currentElem: "obstacle-0-0",
      });
      expect(res.shapesChanged).toBe(true);
      expect(res.shapes[0].vertices[0].x).toBe(60);
      expect(res.shapes[0].vertices[0].y).toBe(70);
    });
  });

  describe("computeMultiDragOffsets", () => {
    const startPoint: Point = { x: 10, y: 15, heading: "tangential" };
    const line1: Line = {
      id: "l1",
      name: "l1",
      endPoint: { x: 30, y: 35, heading: "tangential" },
      controlPoints: [{ x: 20, y: 25 }],
      color: "#ffffff",
      locked: false,
    };
    const shape: Shape = {
      id: "s1",
      name: "s1",
      color: "#ff0000",
      fillColor: "#ff0000",
      vertices: [{ x: 50, y: 55 }],
      locked: false,
    };

    it("calculates offsets relative to mouse coordinates", () => {
      const offsets = computeMultiDragOffsets(
        ["point-0-0", "point-1-0", "obstacle-0-0"],
        10,
        10,
        {
          lines: [line1],
          shapes: [shape],
          startPoint,
          sequence: [],
        },
      );

      expect(offsets.get("point-0-0")).toEqual({ x: 0, y: 5 });
      expect(offsets.get("point-1-0")).toEqual({ x: 20, y: 25 });
      expect(offsets.get("obstacle-0-0")).toEqual({ x: 40, y: 45 });
    });
  });

  describe("resolveHoverCursor", () => {
    const lines = [
      {
        eventMarkers: [{ id: "em1" }],
      },
    ];

    it("returns pointer for point, obstacle, targetpoint", () => {
      expect(resolveHoverCursor("point-1-0", lines, [])).toEqual({
        cursor: "pointer",
        currentElem: "point-1-0",
        hoveredMarkerId: null,
      });
      expect(resolveHoverCursor("obstacle-0-0", lines, [])).toEqual({
        cursor: "pointer",
        currentElem: "obstacle-0-0",
        hoveredMarkerId: null,
      });
      expect(resolveHoverCursor("targetpoint-1", lines, [])).toEqual({
        cursor: "pointer",
        currentElem: "targetpoint-1",
        hoveredMarkerId: null,
      });
    });

    it("returns pointer and resolves marker ID for event markers", () => {
      const res = resolveHoverCursor("event-0-0", lines, []);
      expect(res.cursor).toBe("pointer");
      expect(res.currentElem).toBe("event-0-0");
      expect(res.hoveredMarkerId).toBe("em1");
    });

    it("returns grab for background or null", () => {
      expect(resolveHoverCursor(null, lines, [])).toEqual({
        cursor: "grab",
        currentElem: null,
        hoveredMarkerId: null,
      });
      expect(resolveHoverCursor("canvas", lines, [])).toEqual({
        cursor: "grab",
        currentElem: null,
        hoveredMarkerId: null,
      });
    });
  });

  describe("executeMultiDragIteration", () => {
    const startPoint: Point = { x: 10, y: 15, heading: "tangential" };
    const line1: Line = {
      id: "l1",
      name: "l1",
      endPoint: { x: 30, y: 35, heading: "tangential" },
      controlPoints: [],
      color: "#ffffff",
      locked: false,
    };

    it("executes drag update across selected elements", () => {
      const offsets = new Map<string, { x: number; y: number }>();
      offsets.set("point-0-0", { x: 0, y: 0 });

      const res = executeMultiDragIteration({
        multiSelectedPointIds: ["point-0-0"],
        multiDragOffsets: offsets,
        xPos: 12,
        yPos: 16,
        xInvert: (v) => v,
        yInvert: (v) => v,
        snapToGrid: false,
        showGrid: false,
        gridSize: 0,
        smartSnappingEnabled: false,
        isAltKey: false,
        lines: [line1],
        shapes: [],
        startPoint,
        sequence: [],
        timePrediction: null,
        currentElem: "point-0-0",
        fieldW: 144,
        fieldH: 144,
        settings: {},
      });

      expect(res.startPointChanged).toBe(true);
      expect(res.startPoint.x).toBe(12);
      expect(res.startPoint.y).toBe(16);
    });
  });

  describe("createSnapGuides", () => {
    it("creates vertical and horizontal Two.Line objects with correct coordinates", async () => {
      const { createSnapGuides } = await import("./FieldDragHandler");
      const guides = createSnapGuides(
        [
          { type: "vertical", coord: 72 },
          { type: "horizontal", coord: 36 },
        ],
        (v) => v * 2,
        (v) => v * 3,
        144,
        144,
        (v) => v,
      );

      expect(guides).toHaveLength(2);
      expect(guides[0].stroke).toBe("#f59e0b");
      expect(guides[0].vertices[0].x).toBe(144);
      expect(guides[0].vertices[0].y).toBe(0);
      expect(guides[0].vertices[1].x).toBe(144);
      expect(guides[0].vertices[1].y).toBe(432);

      expect(guides[1].vertices[0].x).toBe(0);
      expect(guides[1].vertices[0].y).toBe(108);
      expect(guides[1].vertices[1].x).toBe(288);
      expect(guides[1].vertices[1].y).toBe(108);
    });
  });
});
