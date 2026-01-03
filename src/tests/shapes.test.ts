// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  createTriangle,
  createRectangle,
  createNGon,
  createEventMarker,
} from "../utils/shapes";

describe("Shape Utilities", () => {
  describe("createTriangle", () => {
    it("should create a triangle with default properties", () => {
      const shape = createTriangle(0);
      expect(shape.id).toBe("triangle-1");
      expect(shape.name).toBe("");
      expect(shape.vertices).toHaveLength(3);
      expect(shape.vertices[0]).toEqual({ x: 60, y: 60 });
      expect(shape.vertices[1]).toEqual({ x: 84, y: 60 });
      expect(shape.vertices[2]).toEqual({ x: 72, y: 84 });
      expect(shape.color).toBe("#dc2626");
      expect(shape.fillColor).toBe("#fca5a5");
    });

    it("should increment ID based on existing shapes count", () => {
      const shape = createTriangle(5);
      expect(shape.id).toBe("triangle-6");
    });
  });

  describe("createRectangle", () => {
    it("should create a rectangle with default properties", () => {
      const shape = createRectangle(0);
      expect(shape.id).toBe("rectangle-1");
      expect(shape.name).toBe("Obstacle 1");
      expect(shape.vertices).toHaveLength(4);
      expect(shape.vertices[0]).toEqual({ x: 30, y: 30 });
      expect(shape.vertices[1]).toEqual({ x: 60, y: 30 });
      expect(shape.vertices[2]).toEqual({ x: 60, y: 50 });
      expect(shape.vertices[3]).toEqual({ x: 30, y: 50 });
      expect(shape.color).toBe("#dc2626");
      expect(shape.fillColor).toBe("#fca5a5");
    });

    it("should increment ID and name based on existing shapes count", () => {
      const shape = createRectangle(2);
      expect(shape.id).toBe("rectangle-3");
      expect(shape.name).toBe("Obstacle 3");
    });
  });

  describe("createNGon", () => {
    it("should create a pentagon (5-sided polygon)", () => {
      const shape = createNGon(5, 0);
      expect(shape.id).toBe("5-gon-1");
      expect(shape.name).toBe("Obstacle 1");
      expect(shape.vertices).toHaveLength(5);
      // Check first vertex (angle 0)
      expect(shape.vertices[0].x).toBeCloseTo(45 + 15, 5); // 60
      expect(shape.vertices[0].y).toBeCloseTo(45, 5);
    });

    it("should create an octagon (8-sided polygon)", () => {
      const shape = createNGon(8, 3);
      expect(shape.id).toBe("8-gon-4");
      expect(shape.name).toBe("Obstacle 4");
      expect(shape.vertices).toHaveLength(8);
    });

    it("should calculate vertices correctly using radius 15 around (45, 45)", () => {
      const shape = createNGon(4, 0);
      // Square rotated by 0 rads (aligned with axes if we consider starting at 0)
      // Actually starting at 0 rads (right), then PI/2 (bottom), PI (left), 3PI/2 (top)
      // 0: (60, 45)
      // 1: (45, 60)
      // 2: (30, 45)
      // 3: (45, 30)
      expect(shape.vertices[0].x).toBeCloseTo(60);
      expect(shape.vertices[0].y).toBeCloseTo(45);
      expect(shape.vertices[1].x).toBeCloseTo(45);
      expect(shape.vertices[1].y).toBeCloseTo(60);
      expect(shape.vertices[2].x).toBeCloseTo(30);
      expect(shape.vertices[2].y).toBeCloseTo(45);
      expect(shape.vertices[3].x).toBeCloseTo(45);
      expect(shape.vertices[3].y).toBeCloseTo(30);
    });
  });

  describe("createEventMarker", () => {
    it("should create an event marker with default properties", () => {
      const marker = createEventMarker(0);
      expect(marker.id).toMatch(/^event-\d+-[a-z0-9]+$/);
      expect(marker.name).toBe("Event_1");
      expect(marker.position).toBe(0.5);
      expect(marker.lineIndex).toBe(0);
      expect(marker.parameters).toEqual({});
    });

    it("should clamp position between 0 and 1", () => {
      const low = createEventMarker(0, -0.5);
      expect(low.position).toBe(0);

      const high = createEventMarker(0, 1.5);
      expect(high.position).toBe(1);
    });

    it("should set name based on line index", () => {
      const marker = createEventMarker(5);
      expect(marker.name).toBe("Event_6");
    });
  });
});
