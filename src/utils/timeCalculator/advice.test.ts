// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import { SCENARIO_MOTION } from "../../tests/helpers/motion";
import type { Excursion, PiecewiseShortfall } from "../../types";
import {
  bendAdvice,
  fallsShort,
  shortfallAdvice,
  type SegmentFixes,
} from "./advice";

const shortfall = (
  over: Partial<PiecewiseShortfall> = {},
): PiecewiseShortfall => ({
  heading: "linear",
  degrees: 159,
  turn: 270,
  seconds: 1.5,
  turnRate: 90,
  ...over,
});

const none: SegmentFixes = { start: null, speed: null };

describe("shortfallAdvice", () => {
  it("compares the turn asked for with what the robot manages in the time it has", () => {
    const text = shortfallAdvice(shortfall(), none);
    expect(text).toContain(
      "from the way the robot is facing when this segment starts",
    );
    expect(text).toContain("has to turn 270°");
    expect(text).toContain("in the 1.5 s it has the robot manages 111°");
    expect(text).toContain("turns at most 90°/s");
    expect(text).toContain("ends 159° short");
  });

  it("says where to start the segment, and what that does to the ones before it", () => {
    const start = (passes: number): SegmentFixes => ({
      start: { t: 0.39, passes },
      speed: null,
    });
    expect(shortfallAdvice(shortfall(), start(0))).toContain(
      "set the t = value above it to 0.39 or less.",
    );
    expect(shortfallAdvice(shortfall(), start(1))).toContain(
      "shorten the segment above it that starts later than that",
    );
    expect(shortfallAdvice(shortfall(), start(2))).toContain(
      "shorten the 2 segments above it that start later than that",
    );
  });

  it("offers a Max Speed when one works", () => {
    const text = shortfallAdvice(shortfall(), { start: null, speed: 6 });
    expect(text).toContain("set this path's Max Speed to 6 in/s or less");
    expect(text).not.toContain("Rotate");
  });

  it("points to turning less, and a Rotate step, when nothing else clears it", () => {
    const text = shortfallAdvice(shortfall(), none);
    expect(text).toContain("turn less: about 111° fits");
    expect(text).toContain("add a Rotate step");
    expect(text).not.toContain("Max Speed");
    expect(text).not.toContain("t = value");
  });

  it("names the setting that would be wrong if the robot really turns faster", () => {
    expect(shortfallAdvice(shortfall())).toContain(
      "raise Angular Velocity in Settings",
    );
  });

  it("explains a segment that follows the path differently", () => {
    const text = shortfallAdvice(shortfall({ heading: "tangential" }), {
      start: null,
      speed: 12,
    });
    expect(text).toContain("the path turns faster than the robot can");
    expect(text).toContain("gentler");
    expect(text).toContain("Max Speed to 12 in/s or less");
  });

  it("never tells the user to slow the path down without a speed to set", () => {
    for (const heading of ["linear", "tangential"] as const) {
      expect(shortfallAdvice(shortfall({ heading }), none)).not.toMatch(
        /slow|Max Speed/i,
      );
    }
  });
});

describe("fallsShort", () => {
  it("ignores a shortfall too small to matter", () => {
    expect(fallsShort(shortfall({ degrees: 1 }))).toBe(false);
    expect(fallsShort(shortfall({ degrees: 5 }))).toBe(true);
    expect(fallsShort(undefined)).toBe(false);
  });
});

describe("bendAdvice", () => {
  const excursion = {
    startTime: 1,
    duration: 3.3,
    maxOffset: 21.6,
    settled: true,
    tightest: { radius: 0.58, x: 99.4, y: 52.1, speed: 38, time: 2 },
  } as Excursion;
  const advise = (speed: number | null = null, over = {}) =>
    bendAdvice(
      "Hairpin",
      excursion,
      { ...DEFAULT_SETTINGS, ...SCENARIO_MOTION, ...over },
      speed,
    );

  it("gives the radius needed at the speed, from the wheels' grip", () => {
    const text = advise();
    // 38 in/s with 0.4 * 386.22 in/s² of grip.
    expect(text).toContain("a radius of 0.6 in near (99.4, 52.1)");
    expect(text).toContain("radius of 10 in or more");
    expect(text).toContain("run 21.6 in wide");
    expect(text).toContain("3.3 s to get back on it");
  });

  it("offers reshaping the bend, or splitting the path there", () => {
    const text = advise();
    expect(text).toContain("moving its control points");
    expect(text).toContain("press K");
    expect(text).toContain("un-chained");
    expect(text).not.toContain("Max Speed");
  });

  it("offers a Max Speed when one works", () => {
    expect(advise(9)).toContain(
      "set this path's Max Speed to 9 in/s or less (under Chain Motion on the path)",
    );
  });

  it("says so when the robot never gets back on the path", () => {
    const text = bendAdvice(
      "Hairpin",
      { ...excursion, settled: false },
      { ...DEFAULT_SETTINGS, ...SCENARIO_MOTION },
    );
    expect(text).toContain("never gets back on it");
  });

  it("talks about the robot's own limit without a friction coefficient", () => {
    expect(advise(null, { kFriction: 0 })).toContain(
      "it can manage about 30 in/s² sideways",
    );
  });
});
