// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { computeZoomStep } from "../lib/zoomHelpers";

describe("computeZoomStep", () => {
  it("returns base step when zoom <= 1 or zooming out", () => {
    expect(computeZoomStep(1, 1)).toBeCloseTo(0.1);
    expect(computeZoomStep(0.9, 1)).toBeCloseTo(0.1);
    expect(computeZoomStep(2, -1)).toBeCloseTo(0.1);
  });

  it("returns larger step when zoom > 1 and zooming in", () => {
    expect(computeZoomStep(1.1, 1)).toBeCloseTo(0.15);
    expect(computeZoomStep(2.5, 1)).toBeCloseTo(0.15);
  });
});
