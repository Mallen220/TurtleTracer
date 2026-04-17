// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cycleGridSize,
  cycleGridSizeReverse,
  modifyZoom,
} from "../../../../lib/components/shortcuts/view";
import { gridSize, fieldZoom } from "../../../../stores";
import * as utils from "../../../../lib/components/shortcuts/utils";

vi.mock("../../../../lib/components/shortcuts/utils", () => ({
  isUIElementFocused: vi.fn(() => false),
}));

vi.mock("../../../../lib/zoomHelpers", () => ({
  computeZoomStep: vi.fn(() => 0.1),
}));

describe("view shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("cycleGridSize", () => {
    it("should cycle through grid sizes forward", () => {
      gridSize.set(0.5);
      cycleGridSize();
      let size: any;
      gridSize.subscribe((v) => (size = v))();
      expect(size).toBe(1);

      gridSize.set(24);
      cycleGridSize();
      gridSize.subscribe((v) => (size = v))();
      expect(size).toBe(0.5);
    });
  });

  describe("cycleGridSizeReverse", () => {
    it("should cycle through grid sizes backward", () => {
      gridSize.set(1);
      cycleGridSizeReverse();
      let size: any;
      gridSize.subscribe((v) => (size = v))();
      expect(size).toBe(0.5);

      gridSize.set(0.5);
      cycleGridSizeReverse();
      gridSize.subscribe((v) => (size = v))();
      expect(size).toBe(24);
    });
  });

  describe("modifyZoom", () => {
    it("should zoom in and out", () => {
      fieldZoom.set(1);
      modifyZoom(1);
      let zoom: any;
      fieldZoom.subscribe((v) => (zoom = v))();
      expect(zoom).toBe(1.1);

      modifyZoom(-1);
      fieldZoom.subscribe((v) => (zoom = v))();
      expect(zoom).toBe(1);
    });
  });
});
