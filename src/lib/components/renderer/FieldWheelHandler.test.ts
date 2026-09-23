// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { calculateNextZoom, calculateWheelZoom } from "./FieldWheelHandler";

describe("FieldWheelHandler", () => {
  describe("calculateNextZoom", () => {
    it("zooms in by step", () => {
      const zoom = calculateNextZoom(1, 1);
      expect(zoom).toBeGreaterThan(1);
      expect(zoom).toBeLessThanOrEqual(5);
    });

    it("zooms out by step", () => {
      const zoom = calculateNextZoom(1, -1);
      expect(zoom).toBeLessThan(1);
      expect(zoom).toBeGreaterThanOrEqual(0.1);
    });

    it("clamps to maxZoom", () => {
      const zoom = calculateNextZoom(5, 1, 0.1, 5);
      expect(zoom).toBe(5);
    });

    it("clamps to minZoom", () => {
      const zoom = calculateNextZoom(0.1, -1, 0.1, 5);
      expect(zoom).toBe(0.1);
    });
  });

  describe("calculateWheelZoom", () => {
    const mockRect = {
      left: 100,
      top: 100,
      width: 500,
      height: 500,
      right: 600,
      bottom: 600,
      x: 100,
      y: 100,
      toJSON: () => {},
    } as DOMRect;

    it("calculates zoom and focus for negative deltaY (wheel up)", () => {
      const res = calculateWheelZoom({
        clientX: 200,
        clientY: 200,
        deltaY: -100,
        wrapperRect: mockRect,
        fieldRotation: 0,
        currentZoom: 1,
      });

      expect(res.newZoom).toBeGreaterThan(1);
      expect(res.focus.x).toBe(100);
      expect(res.focus.y).toBe(100);
    });

    it("calculates zoom and focus for positive deltaY (wheel down)", () => {
      const res = calculateWheelZoom({
        clientX: 200,
        clientY: 200,
        deltaY: 100,
        wrapperRect: mockRect,
        fieldRotation: 0,
        currentZoom: 1,
      });

      expect(res.newZoom).toBeLessThan(1);
      expect(res.focus.x).toBe(100);
      expect(res.focus.y).toBe(100);
    });
  });
});
