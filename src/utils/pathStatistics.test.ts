// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { computePathStatistics } from "./pathStatistics";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem } from "../types";

beforeAll(() => registerCoreUI());

const start: Point = { x: 10, y: 10, heading: "tangential" };
const straight: Line = {
  id: "a",
  name: "Out",
  endPoint: { x: 130, y: 10, heading: "tangential" },
  controlPoints: [],
  color: "#f00",
};

describe("computePathStatistics", () => {
  it("lists a row per path and wait with matching totals", () => {
    const sequence: SequenceItem[] = [
      { kind: "path", lineId: "a" },
      { kind: "wait", id: "w", name: "Hold", durationMs: 500 },
    ];
    const stats = computePathStatistics(start, [straight], sequence, {
      ...DEFAULT_SETTINGS,
    });

    expect(stats.segments.map((s) => s.name)).toEqual(["Out", "Hold"]);
    expect(stats.segments[0].length).toBeCloseTo(120);
    expect(stats.segments[1].time).toBeCloseTo(0.5);
    const segmentTime = stats.segments.reduce((sum, s) => sum + s.time, 0);
    expect(segmentTime).toBeCloseTo(stats.totalTime);
  });

  it("reports one insight for each stretch at top speed", () => {
    const stats = computePathStatistics(
      start,
      [straight],
      [{ kind: "path", lineId: "a" }],
      { ...DEFAULT_SETTINGS },
    );
    const topSpeed = stats.insights.filter(
      (i) => i.message === "Max Velocity Reached",
    );
    expect(topSpeed).toHaveLength(1);
    expect(topSpeed[0].endTime!).toBeGreaterThan(topSpeed[0].startTime);
  });
});
