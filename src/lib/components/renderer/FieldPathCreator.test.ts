// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  createPathAtPoint,
  tryCreatePathFromDoubleClick,
} from "./FieldPathCreator";
import type { Line } from "../../../types/index";

describe("FieldPathCreator", () => {
  it("creates a tangential line when there are no existing lines", () => {
    const line = createPathAtPoint({
      inchX: 20,
      inchY: 30,
      existingLines: [],
    });
    expect(line.endPoint.x).toBe(20);
    expect(line.endPoint.y).toBe(30);
    expect(line.endPoint.heading).toBe("tangential");
    expect(line.color).toBeTruthy();
    expect(line.id).toMatch(/^line-/);
  });

  it("inherits linear heading properties from preceding line", () => {
    const prevLine: Line = {
      id: "prev",
      name: "prev",
      endPoint: {
        x: 10,
        y: 10,
        heading: "linear",
        startDeg: 45,
        endDeg: 90,
      },
      controlPoints: [],
      color: "#ff0000",
      locked: false,
    };
    const line = createPathAtPoint({
      inchX: 50,
      inchY: 60,
      existingLines: [prevLine],
    });
    expect(line.endPoint.heading).toBe("linear");
    if (line.endPoint.heading === "linear") {
      expect(line.endPoint.startDeg).toBe(90);
      expect(line.endPoint.endDeg).toBe(90);
    }
  });

  it("inherits constant heading degrees from preceding line", () => {
    const prevLine: Line = {
      id: "prev",
      name: "prev",
      endPoint: {
        x: 10,
        y: 10,
        heading: "constant",
        degrees: 180,
      },
      controlPoints: [],
      color: "#ff0000",
      locked: false,
    };
    const line = createPathAtPoint({
      inchX: 50,
      inchY: 60,
      existingLines: [prevLine],
    });
    expect(line.endPoint.heading).toBe("constant");
    if (line.endPoint.heading === "constant") {
      expect(line.endPoint.degrees).toBe(180);
    }
  });

  describe("tryCreatePathFromDoubleClick", () => {
    const domRect = {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    } as DOMRect;

    it("ignores double clicks on interactive elements", () => {
      const line = tryCreatePathFromDoubleClick({
        targetId: "point-1-0",
        clientX: 50,
        clientY: 50,
        domRect,
        fieldRotation: 0,
        xInvert: (v) => v,
        yInvert: (v) => v,
        snapToGrid: false,
        showGrid: false,
        gridSize: 0,
        restrictDraggingToField: false,
        fieldW: 144,
        fieldH: 144,
        existingLines: [],
      });
      expect(line).toBeNull();
    });

    it("creates a new path on empty field space", () => {
      const line = tryCreatePathFromDoubleClick({
        targetId: "field-canvas",
        clientX: 50,
        clientY: 50,
        domRect,
        fieldRotation: 0,
        xInvert: (v) => v,
        yInvert: (v) => v,
        snapToGrid: false,
        showGrid: false,
        gridSize: 0,
        restrictDraggingToField: false,
        fieldW: 144,
        fieldH: 144,
        existingLines: [],
      });
      expect(line).toBeDefined();
      expect(line?.endPoint.x).toBe(50);
      expect(line?.endPoint.y).toBe(50);
    });
  });
});
