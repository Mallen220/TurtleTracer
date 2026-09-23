// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { getUpdatedLinearStartHeading } from "./LinearHeadingSync";
import type { Line, Point } from "../../../types/index";

describe("LinearHeadingSync", () => {
  it("returns null if startPoint is null or undefined", () => {
    expect(getUpdatedLinearStartHeading(null, [])).toBeNull();
    expect(getUpdatedLinearStartHeading(undefined, [])).toBeNull();
  });

  it("returns null if startPoint heading is not linear", () => {
    const pt: Point = { x: 0, y: 0, heading: "tangential" };
    const line: Line = {
      id: "l1",
      name: "Line 1",
      endPoint: { x: 10, y: 10, heading: "tangential" },
      controlPoints: [],
      color: "#ff0000",
      locked: false,
    };
    expect(getUpdatedLinearStartHeading(pt, [line])).toBeNull();
  });

  it("returns null if lines array is empty", () => {
    const pt: Point = {
      x: 0,
      y: 0,
      heading: "linear",
      startDeg: 45,
      endDeg: 45,
    };
    expect(getUpdatedLinearStartHeading(pt, [])).toBeNull();
  });

  it("returns derived heading if startPoint.startDeg is missing or undefined", () => {
    const pt: Point = { x: 0, y: 0, heading: "linear" } as any;
    const line: Line = {
      id: "l1",
      name: "Line 1",
      endPoint: { x: 10, y: 0, heading: "linear", startDeg: 0, endDeg: 0 },
      controlPoints: [],
      color: "#ff0000",
      locked: false,
    };
    const derived = getUpdatedLinearStartHeading(pt, [line]);
    expect(derived).not.toBeNull();
    expect(typeof derived).toBe("number");
  });

  it("returns null if startPoint.startDeg matches derived heading within epsilon", () => {
    const pt: Point = { x: 0, y: 0, heading: "linear", startDeg: 0, endDeg: 0 };
    const line: Line = {
      id: "l1",
      name: "Line 1",
      endPoint: { x: 10, y: 0, heading: "linear", startDeg: 0, endDeg: 0 },
      controlPoints: [],
      color: "#ff0000",
      locked: false,
    };
    // From (0,0) to (10,0), heading is 0 rad / 0 deg
    const derived = getUpdatedLinearStartHeading(pt, [line]);
    expect(derived).toBeNull();
  });

  it("returns derived heading if startPoint.startDeg differs from derived heading", () => {
    const pt: Point = {
      x: 0,
      y: 0,
      heading: "linear",
      startDeg: 90,
      endDeg: 90,
    };
    const line: Line = {
      id: "l1",
      name: "Line 1",
      endPoint: { x: 10, y: 0, heading: "linear", startDeg: 0, endDeg: 0 },
      controlPoints: [],
      color: "#ff0000",
      locked: false,
    };
    const derived = getUpdatedLinearStartHeading(pt, [line]);
    expect(derived).not.toBeNull();
    expect(derived).toBeCloseTo(0, 1);
  });
});
