// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { computePathStatistics } from "../utils/pathStatistics";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line, Point, SequenceItem, Settings } from "../types";

// A travel event with no motion profile, as a plugin's own timeline might have.
vi.mock("../utils/timeCalculator", async (original) => {
  const real = await original<typeof import("../utils/timeCalculator")>();
  return {
    ...real,
    calculatePathTime: () => ({
      totalTime: 4,
      totalDistance: 120,
      timeline: [
        {
          type: "travel",
          lineIndex: 0,
          startTime: 0,
          endTime: 4,
          duration: 4,
        },
      ],
    }),
  };
});

describe("Path Statistics for a travel event with no motion profile", () => {
  const start = { x: 10, y: 10, heading: "tangential" } as Point;
  const line: Line = {
    id: "a",
    name: "Out",
    endPoint: { x: 130, y: 10, heading: "tangential" } as Point,
    controlPoints: [],
    color: "#f00",
  };
  const sequence: SequenceItem[] = [{ kind: "path", lineId: "a" }];

  it("assumes constant speed across the path", () => {
    const stats = computePathStatistics(start, [line], sequence, {
      ...DEFAULT_SETTINGS,
    } as Settings);
    const [segment] = stats.segments;
    expect(segment.length).toBeCloseTo(120);
    expect(segment.maxVel).toBeCloseTo(segment.length / segment.time);
    expect(segment.degrees).toBeCloseTo(0);
    expect(stats.maxLinearVelocity).toBeCloseTo(segment.maxVel);
    // Flat graph: two points at the same speed.
    expect(stats.velocityData.filter((p) => p.value > 0)).toHaveLength(2);
  });
});
