// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  getDefaultLines,
  getDefaultShapes,
  getDefaultStartPoint,
  DEFAULT_SETTINGS,
} from "../config/defaults";

describe("Defaults Utilities", () => {
  describe("getDefaultShapes", () => {
    it("returns copies of shapes when preset-biobuzz-2026 is present", () => {
      // This is the default scenario as preset-biobuzz-2026 is in DEFAULT_SETTINGS
      const shapes = getDefaultShapes();
      expect(shapes.length).toBeGreaterThan(0);
      expect(shapes[0].name).toBe("HiveRedSide");
      expect(shapes[0].vertices).toEqual([
        { x: 46.5, y: 92 },
        { x: 46.5, y: 52 },
        { x: 49, y: 52 },
        { x: 49, y: 92 },
      ]);
      expect(shapes[1].name).toBe("HiveBlueSide");
      expect(shapes[1].vertices).toEqual([
        { x: 95, y: 92 },
        { x: 95, y: 52 },
        { x: 97.5, y: 52 },
        { x: 97.5, y: 92 },
      ]);

      // Ensure it returns a copy
      const biobuzzPreset = DEFAULT_SETTINGS.obstaclePresets!.find(
        (p) => p.id === "preset-biobuzz-2026",
      )!;
      expect(shapes[0]).not.toBe(biobuzzPreset.shapes[0]); // Object identity check
      expect(shapes[0].vertices[0]).not.toBe(
        biobuzzPreset.shapes[0].vertices[0],
      ); // Vertex identity check
    });

    it("returns an empty array when preset-biobuzz-2026 is missing", () => {
      // We need to temporarily remove the preset to test this behavior
      const originalPresets = DEFAULT_SETTINGS.obstaclePresets;
      DEFAULT_SETTINGS.obstaclePresets =
        DEFAULT_SETTINGS.obstaclePresets?.filter(
          (p) => p.id !== "preset-biobuzz-2026",
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

  describe("getDefaultStartPoint", () => {
    it("should return the default start point correctly", () => {
      const startPoint = getDefaultStartPoint();
      expect(startPoint).toEqual({
        x: 9,
        y: 25,
        heading: "constant",
        degrees: 0,
        locked: false,
      });
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
      expect(line.name).toBe("DriveToShoot");

      expect(line.endPoint).toEqual({
        x: 60,
        y: 25,
        heading: "linear",
        startDeg: 0,
        endDeg: 90,
      });

      expect(line.controlPoints).toEqual([]);

      // Check color is a valid hex color string
      expect(typeof line.color).toBe("string");
      expect(line.color).toBe("#8CD6B8");

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
