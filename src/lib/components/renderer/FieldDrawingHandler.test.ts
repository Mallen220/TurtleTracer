// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  snapDrawingCoordinate,
  initDrawingPoints,
  continueDrawing,
  completeDrawingStroke,
  formatDrawingSvgPath,
  type DrawingGridConfig,
} from "./FieldDrawingHandler";

describe("FieldDrawingHandler", () => {
  const gridOn: DrawingGridConfig = {
    snapToGrid: true,
    showGrid: true,
    gridSize: 6,
  };

  const gridOff: DrawingGridConfig = {
    snapToGrid: false,
    showGrid: true,
    gridSize: 6,
  };

  describe("snapDrawingCoordinate", () => {
    it("snaps coordinate when grid snapping is enabled", () => {
      expect(snapDrawingCoordinate(7.2, gridOn)).toBe(6);
      expect(snapDrawingCoordinate(10.1, gridOn)).toBe(12);
    });

    it("leaves coordinate unchanged when grid snapping is disabled", () => {
      expect(snapDrawingCoordinate(7.2, gridOff)).toBe(7.2);
    });
  });

  describe("initDrawingPoints", () => {
    it("creates duplicate initial points with snapping", () => {
      const pts = initDrawingPoints(12.8, 23.4, gridOn);
      expect(pts).toEqual([
        { x: 12, y: 24 },
        { x: 12, y: 24 },
      ]);
    });
  });

  describe("continueDrawing", () => {
    it("does nothing when points array is empty", () => {
      const pts: { x: number; y: number }[] = [];
      const added = continueDrawing(pts, 10, 10, gridOff);
      expect(added).toBe(false);
      expect(pts.length).toBe(0);
    });

    it("adds point if moved by at least minDistance", () => {
      const pts = [{ x: 0, y: 0 }];
      const added = continueDrawing(pts, 2.5, 0, gridOff, 2);
      expect(added).toBe(true);
      expect(pts).toHaveLength(2);
      expect(pts[1]).toEqual({ x: 2.5, y: 0 });
    });

    it("rejects point if moved by less than minDistance", () => {
      const pts = [{ x: 0, y: 0 }];
      const added = continueDrawing(pts, 1, 0, gridOff, 2);
      expect(added).toBe(false);
      expect(pts).toHaveLength(1);
    });
  });

  describe("completeDrawingStroke", () => {
    it("returns null when stroke has <= 1 points", () => {
      const res = completeDrawingStroke(
        [{ x: 0, y: 0 }],
        { x: 0, y: 0 } as any,
        [],
        [],
        {},
      );
      expect(res).toBeNull();
    });
  });

  describe("formatDrawingSvgPath", () => {
    const scale = (v: number) => v * 2;

    it("returns empty string for empty points", () => {
      expect(formatDrawingSvgPath([], scale, scale)).toBe("");
    });

    it("formats SVG path string for multiple points", () => {
      const pts = [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
        { x: 5, y: 6 },
      ];
      expect(formatDrawingSvgPath(pts, scale, scale)).toBe(
        "M 2 4 L 6 8 L 10 12",
      );
    });
  });
});
