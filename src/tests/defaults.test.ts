// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { getDefaultLines, getDefaultShapes, DEFAULT_SETTINGS } from "../config/defaults";

describe("Defaults Utilities", () => {
  describe("getDefaultShapes", () => {
    it("returns copies of shapes when preset-decode-2025 is present", () => {
      // This is the default scenario as preset-decode-2025 is in DEFAULT_SETTINGS
      const shapes = getDefaultShapes();
      expect(shapes.length).toBeGreaterThan(0);
      expect(shapes[0].name).toBe("Red Goal");

      // Ensure it returns a copy
      const decodePreset = DEFAULT_SETTINGS.obstaclePresets!.find(
        (p) => p.id === "preset-decode-2025",
      )!;
      expect(shapes[0]).not.toBe(decodePreset.shapes[0]); // Object identity check
      expect(shapes[0].vertices[0]).not.toBe(decodePreset.shapes[0].vertices[0]); // Vertex identity check
    });

    it("returns an empty array when preset-decode-2025 is missing", () => {
      // We need to temporarily remove the preset to test this behavior
      const originalPresets = DEFAULT_SETTINGS.obstaclePresets;
      DEFAULT_SETTINGS.obstaclePresets = DEFAULT_SETTINGS.obstaclePresets?.filter(
        (p) => p.id !== "preset-decode-2025",
      );

      const shapes = getDefaultShapes();
      expect(shapes).toEqual([]);

      // Restore the presets
      DEFAULT_SETTINGS.obstaclePresets = originalPresets;
    });

    it("returns an empty array when obstaclePresets is undefined", () => {
      const originalPresets = DEFAULT_SETTINGS.obstaclePresets;
      // Simulate obstaclePresets missing completely
      DEFAULT_SETTINGS.obstaclePresets = undefined;

      const shapes = getDefaultShapes();
      expect(shapes).toEqual([]);

      // Restore the presets
      DEFAULT_SETTINGS.obstaclePresets = originalPresets;
    });
  });

  describe("getDefaultLines", () => {
    it("should return an array with exactly one line by default", () => {
      const lines = getDefaultLines();
      expect(lines).toHaveLength(1);
    });

    it("should set properties correctly on the default line", () => {
      const lines = getDefaultLines();
      const line = lines[0];

      expect(line.id).toMatch(/^line-[a-z0-9]+$/);
      expect(line.name).toBe("");

      expect(line.endPoint).toEqual({
        x: 56,
        y: 36,
        heading: "linear",
        startDeg: 90,
        endDeg: 180,
      });

      expect(line.controlPoints).toEqual([]);

      // Check color is a valid hex color string
      expect(typeof line.color).toBe("string");
      expect(line.color).toMatch(/^#[0-9A-Fa-f]{6}$/);

      expect(line.eventMarkers).toEqual([]);
      expect(line.locked).toBe(false);
      expect(line.waitBeforeMs).toBe(0);
      expect(line.waitAfterMs).toBe(0);
      expect(line.waitBeforeName).toBe("");
      expect(line.waitAfterName).toBe("");
    });

    it("should generate a random id each time", () => {
      const lines1 = getDefaultLines();
      const lines2 = getDefaultLines();

      expect(lines1[0].id).not.toBe(lines2[0].id);
    });
  });
});
