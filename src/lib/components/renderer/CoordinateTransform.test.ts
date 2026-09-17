// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { getTransformedCoordinates } from "./CoordinateTransform";

describe("CoordinateTransform", () => {
  const rect = {
    left: 100,
    top: 50,
    width: 200,
    height: 200,
  };

  it("calculates coordinates with 0 rotation", () => {
    // Top-left of rect: clientX = 100, clientY = 50 -> (0, 0)
    const tl = getTransformedCoordinates(100, 50, rect, 0);
    expect(tl.x).toBeCloseTo(0);
    expect(tl.y).toBeCloseTo(0);

    // Center of rect: clientX = 200, clientY = 150 -> (100, 100)
    const center = getTransformedCoordinates(200, 150, rect, 0);
    expect(center.x).toBeCloseTo(100);
    expect(center.y).toBeCloseTo(100);

    // Bottom-right of rect: clientX = 300, clientY = 250 -> (200, 200)
    const br = getTransformedCoordinates(300, 250, rect, 0);
    expect(br.x).toBeCloseTo(200);
    expect(br.y).toBeCloseTo(200);
  });

  it("calculates coordinates with 90 degree rotation", () => {
    // With 90 deg rotation, the center stays at center
    const center = getTransformedCoordinates(200, 150, rect, 90);
    expect(center.x).toBeCloseTo(100);
    expect(center.y).toBeCloseTo(100);

    // Top-center in screen: clientX = 200, clientY = 50 (px = 100, py = 0; cx = 0, cy = -100)
    // rad = -90 deg (-pi/2) -> cos=0, sin=-1
    // nx = 0 - (-100)*(-1) = -100; ny = 0 + (-100)*0 = 0
    // newPx = -100 + 100 = 0, newPy = 0 + 100 = 100
    const topCenter = getTransformedCoordinates(200, 50, rect, 90);
    expect(topCenter.x).toBeCloseTo(0);
    expect(topCenter.y).toBeCloseTo(100);
  });

  it("calculates coordinates with 180 degree rotation", () => {
    // Center stays center
    const center = getTransformedCoordinates(200, 150, rect, 180);
    expect(center.x).toBeCloseTo(100);
    expect(center.y).toBeCloseTo(100);

    // Top-left screen (100, 50) maps to bottom-right (200, 200) in rotated space
    const tl = getTransformedCoordinates(100, 50, rect, 180);
    expect(tl.x).toBeCloseTo(200);
    expect(tl.y).toBeCloseTo(200);
  });
});
