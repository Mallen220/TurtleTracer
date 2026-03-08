// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { getRandomColor } from "../utils/draw";

describe("Draw Utils", () => {
  describe("getRandomColor", () => {
    it("returns a string starting with #", () => {
      const color = getRandomColor();
      expect(color.startsWith("#")).toBe(true);
    });

    it("returns a valid hex color code", () => {
      const color = getRandomColor();
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    });

    it("returns different colors on subsequent calls", () => {
      const color1 = getRandomColor();
      const color2 = getRandomColor();
      // It's technically possible for them to be equal, but very unlikely
      // running it a few times to be safe
      let allEqual = true;
      for (let i = 0; i < 5; i++) {
        if (getRandomColor() !== getRandomColor()) {
          allEqual = false;
          break;
        }
      }
      expect(allEqual).toBe(false);
    });
  });
});
