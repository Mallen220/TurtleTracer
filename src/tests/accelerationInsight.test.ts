// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { computePathStatistics } from "../utils/pathStatistics";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line, Point, SequenceItem, Settings } from "../types";

// A timeline whose speed jumps from 0 to 40 in/s in a tenth of a second, the
// kind of result a broken speed profile would produce.
vi.mock("../utils/timeCalculator", async (original) => {
  const real = await original<typeof import("../utils/timeCalculator")>();
  return {
    ...real,
    calculatePathTime: () => ({
      totalTime: 1,
      totalDistance: 40,
      timeline: [
        {
          type: "travel",
          lineIndex: 0,
          startTime: 0,
          endTime: 1,
          duration: 1,
          motionProfile: [0, 0.1, 1],
          velocityProfile: [0, 40, 40],
        },
      ],
    }),
  };
});

describe("impossible acceleration", () => {
  const start = { x: 0, y: 0, heading: "tangential" } as Point;
  const line: Line = {
    id: "a",
    name: "a",
    endPoint: { x: 40, y: 0, heading: "tangential" } as Point,
    controlPoints: [],
    color: "#000",
  };
  const sequence: SequenceItem[] = [{ kind: "path", lineId: "a" }];
  const settings = { ...DEFAULT_SETTINGS } as Settings;

  it("is reported with the worst value and when it happens", () => {
    const { insights } = computePathStatistics(
      start,
      [line],
      sequence,
      settings,
    );
    const found = insights.filter((i) =>
      i.message.startsWith("Acceleration beyond"),
    );
    expect(found).toHaveLength(1);
    expect(found[0].type).toBe("warning");
    expect(found[0].startTime).toBeCloseTo(0);
    expect(found[0].value).toBeCloseTo(400);
  });

  it("is not reported when no acceleration limit is set", () => {
    const { insights } = computePathStatistics(start, [line], sequence, {
      ...settings,
      maxAcceleration: 0,
      maxDeceleration: 0,
    });
    expect(insights.some((i) => i.message.startsWith("Acceleration"))).toBe(
      false,
    );
  });
});
