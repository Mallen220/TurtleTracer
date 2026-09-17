// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  calculatePanToField,
  calculateZoomTo,
  createFieldScales,
} from "./FieldViewport";

describe("FieldViewport", () => {
  describe("calculatePanToField", () => {
    it("centers field origin when looking at center of field", () => {
      const pan = calculatePanToField({
        fx: 72,
        fy: 72,
        fieldW: 144,
        fieldH: 144,
        visualW: 720,
        visualH: 720,
        zoom: 1,
      });
      expect(pan.x).toBeCloseTo(0);
      expect(pan.y).toBeCloseTo(0);
    });

    it("pans right/up appropriately when focusing on a corner", () => {
      const pan = calculatePanToField({
        fx: 0,
        fy: 0,
        fieldW: 144,
        fieldH: 144,
        visualW: 720,
        visualH: 720,
        zoom: 2,
      });
      // fx = 0 -> 0.5 - 0 = 0.5 -> visualW * zoom * 0.5 = 720 * 2 * 0.5 = 720
      expect(pan.x).toBeCloseTo(720);
      // fy = 0 -> 0 - 0.5 = -0.5 -> visualH * zoom * -0.5 = 720 * 2 * -0.5 = -720
      expect(pan.y).toBeCloseTo(-720);
    });
  });

  describe("calculateZoomTo", () => {
    it("zooms into center by default with 0 pan if already centered", () => {
      const width = 800;
      const height = 800;
      const visualW = 720;
      const visualH = 720;
      const fieldW = 144;
      const fieldH = 144;

      const result = calculateZoomTo({
        newZoom: 1.5,
        width,
        height,
        fieldW,
        fieldH,
        visualW,
        visualH,
        xInvert: (px) => ((px - 40) / visualW) * fieldW,
        yInvert: (py) => fieldH - ((py - 40) / visualH) * fieldH,
      });

      expect(result.zoom).toBe(1.5);
      expect(result.pan.x).toBeCloseTo(0);
      expect(result.pan.y).toBeCloseTo(0);
    });
  });

  describe("createFieldScales", () => {
    it("creates linear D3 scales correctly mapping field inches to visual range", () => {
      const scales = createFieldScales({
        fieldW: 144,
        fieldH: 144,
        width: 800,
        height: 800,
        visualW: 720,
        visualH: 720,
        scaleFactor: 1,
        pan: { x: 0, y: 0 },
      });

      expect(scales.x(0)).toBe(40);
      expect(scales.x(144)).toBe(760);
      expect(scales.y(0)).toBe(760);
      expect(scales.y(144)).toBe(40);
    });
  });
});
