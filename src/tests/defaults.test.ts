// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { getDefaultLines } from "../config/defaults";

describe("Defaults Utilities", () => {
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
