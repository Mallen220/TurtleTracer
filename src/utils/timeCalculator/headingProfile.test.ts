// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { calculatePathTime } from "./index";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import type { Line, Point, PiecewiseSegment } from "../../types";

const start: Point = { x: 10, y: 10, heading: "constant", degrees: 10 };

function finalHeading(endPoint: Point): number {
  const line: Line = {
    id: "a",
    endPoint,
    controlPoints: [],
    color: "red",
  };
  const { timeline } = calculatePathTime(start, [line], {
    ...DEFAULT_SETTINGS,
  });
  const profile = timeline.find((e) => e.type === "travel")!.headingProfile!;
  return profile.at(-1)!;
}

describe("heading profile", () => {
  it("turns a piecewise linear segment the short way, like a plain linear heading", () => {
    const segment: PiecewiseSegment = {
      tStart: 0,
      tEnd: 1,
      heading: "linear",
      startDeg: 10,
      endDeg: 350,
    };
    const piecewise = finalHeading({
      x: 100,
      y: 10,
      heading: "piecewise",
      segments: [segment],
    });
    const linear = finalHeading({
      x: 100,
      y: 10,
      heading: "linear",
      startDeg: 10,
      endDeg: 350,
    });
    expect(linear).toBeCloseTo(-10);
    expect(piecewise).toBeCloseTo(linear);
  });
});

// --- Each heading mode, end to end ---

/** Heading profile of every path the robot drives, in order. */
function profiles(
  lines: Line[],
  settings: Partial<typeof DEFAULT_SETTINGS> = {},
): number[][] {
  const { timeline } = calculatePathTime(start, lines, {
    ...DEFAULT_SETTINGS,
    ...settings,
  });
  return timeline
    .filter((e) => e.type === "travel")
    .map((e) => e.headingProfile!);
}

const straight = (
  id: string,
  endPoint: Point,
  over: Partial<Line> = {},
): Line => ({
  id,
  endPoint,
  controlPoints: [],
  color: "red",
  ...over,
});

const eastTo = (x: number, y = 10) => ({ x, y });
const norm = (deg: number) => ((deg % 360) + 360) % 360;

describe("heading profile per heading mode", () => {
  it("tangential: faces the direction of travel, or backwards when reversed", () => {
    const [forward] = profiles([
      straight("a", { ...eastTo(100), heading: "tangential" } as Point),
    ]);
    expect(forward.at(-1)).toBeCloseTo(0);

    const [backward] = profiles([
      straight("a", {
        ...eastTo(100),
        heading: "tangential",
        reverse: true,
      } as Point),
    ]);
    expect(norm(backward.at(-1)!)).toBeCloseTo(180);
  });

  it("constant: holds the heading, plus half a turn when reversed", () => {
    const [plain] = profiles([
      straight("a", { ...eastTo(100), heading: "constant", degrees: 45 }),
    ]);
    expect(new Set(plain.map((h) => Math.round(h)))).toEqual(new Set([45]));

    const [reversed] = profiles([
      straight("a", {
        ...eastTo(100),
        heading: "constant",
        degrees: 45,
        reverse: true,
      } as Point),
    ]);
    expect(norm(reversed.at(-1)!)).toBeCloseTo(225);
  });

  it("linear: sweeps steadily from the start to the end heading", () => {
    const [profile] = profiles([
      straight("a", {
        ...eastTo(100),
        heading: "linear",
        startDeg: 0,
        endDeg: 90,
      }),
    ]);
    expect(profile[0]).toBeCloseTo(0);
    expect(profile.at(-1)).toBeCloseTo(90);
    const middle = profile[Math.floor(profile.length / 2)];
    expect(middle).toBeGreaterThan(30);
    expect(middle).toBeLessThan(60);
    expect(profile).toEqual([...profile].sort((a, b) => a - b));
  });

  it("linear: a reversed sweep takes the long way round", () => {
    const [profile] = profiles([
      straight("a", {
        ...eastTo(100),
        heading: "linear",
        startDeg: 0,
        endDeg: 90,
        reverse: true,
      } as Point),
    ]);
    expect(profile.at(-1)! - profile[0]).toBeCloseTo(-270);
  });

  it("facingPoint: keeps the robot pointed at the target as it moves", () => {
    const target = { targetX: 100, targetY: 60 };
    const [profile] = profiles([
      straight("a", {
        ...eastTo(100),
        heading: "facingPoint",
        ...target,
      } as Point),
    ]);
    // At the end of the path the target is straight up (90 degrees).
    expect(profile.at(-1)).toBeCloseTo(90);
    // Earlier on, it was off to the upper right, so the heading was lower.
    expect(profile[Math.floor(profile.length / 4)]).toBeLessThan(80);

    const [backwards] = profiles([
      straight("a", {
        ...eastTo(100),
        heading: "facingPoint",
        ...target,
        reverse: true,
      } as Point),
    ]);
    expect(norm(backwards.at(-1)!)).toBeCloseTo(270);
  });

  it("never jumps by more than half a turn between samples", () => {
    const [profile] = profiles([
      straight("a", {
        ...eastTo(100),
        heading: "facingPoint",
        targetX: 55,
        targetY: 10.5,
      } as Point),
    ]);
    for (let i = 1; i < profile.length; i++) {
      expect(Math.abs(profile[i] - profile[i - 1])).toBeLessThanOrEqual(180);
    }
  });
});

describe("heading profile in chains", () => {
  const first = (over: Partial<Line> = {}) =>
    straight("a", { ...eastTo(100), heading: "constant", degrees: 0 }, over);
  const second = (endPoint: Point, over: Partial<Line> = {}) =>
    straight("b", endPoint, { isChain: true, ...over });

  it("turns gradually into the next heading instead of stopping to turn", () => {
    const [, profile] = profiles([
      first(),
      second({ x: 100, y: 100, heading: "constant", degrees: 90 }),
    ]);
    expect(profile[0]).toBeCloseTo(0);
    expect(profile.at(-1)).toBeCloseTo(90);
    expect(profile).toEqual([...profile].sort((a, b) => a - b));
    expect(profile.some((h) => h > 5 && h < 85)).toBe(true);
  });

  it("follows a tangential path, taking longer if the robot turns slowly", () => {
    const b = second({ x: 100, y: 100, heading: "tangential" } as Point);
    const travelTime = (aVelocity: number) =>
      calculatePathTime(start, [first(), b], {
        ...DEFAULT_SETTINGS,
        aVelocity,
      }).timeline.findLast((e) => e.type === "travel")!.duration;

    const [, quick] = profiles([first(), b]);
    expect(quick.at(-1)).toBeCloseTo(90, 0);

    // At about 3 degrees per second the quarter turn can't fit in the
    // normal travel time, so the path is stretched until it does.
    const [, slow] = profiles([first(), b], { aVelocity: 0.05 });
    expect(slow.at(-1)).toBeCloseTo(90, 0);
    expect(travelTime(0.05)).toBeGreaterThan(travelTime(Math.PI / 2) * 5);
  });

  it("linear in a chain: turns from the start to the end heading", () => {
    const [, profile] = profiles([
      first(),
      second({ x: 100, y: 100, heading: "linear", startDeg: 0, endDeg: 90 }),
    ]);
    expect(profile.at(-1)).toBeCloseTo(90);
  });

  it("facingPoint in a chain: keeps pointing at the target", () => {
    const [, profile] = profiles([
      first(),
      second({
        x: 100,
        y: 100,
        heading: "facingPoint",
        targetX: 0,
        targetY: 100,
      } as Point),
    ]);
    expect(norm(profile.at(-1)!)).toBeCloseTo(180);
  });

  it("a global linear heading is spread over the whole chain", () => {
    const [a, b] = profiles([
      first({
        globalHeading: "linear",
        globalStartDeg: 0,
        globalEndDeg: 90,
      }),
      second({ x: 100, y: 100, heading: "constant", degrees: 10 }),
    ]);
    // Both paths are 90 inches long, so the first ends half way round.
    expect(a.at(-1)).toBeCloseTo(45, 0);
    expect(b.at(-1)).toBeCloseTo(90, 0);
  });
});

describe("heading profile with piecewise headings", () => {
  const piecewise = (segments: PiecewiseSegment[]) =>
    straight("a", { ...eastTo(100), heading: "piecewise", segments } as Point);

  it("turns towards each segment's heading as the path progresses", () => {
    const [profile] = profiles(
      [
        piecewise([
          { tStart: 0, tEnd: 0.5, heading: "constant", degrees: 60 },
          { tStart: 0.5, tEnd: 1, heading: "constant", degrees: 0 },
        ]),
      ],
      { aVelocity: Math.PI * 4 },
    );
    const half = Math.floor(profile.length / 2);
    expect(profile[half]).toBeCloseTo(60, 0);
    expect(profile.at(-1)).toBeCloseTo(0, 0);
  });

  it("holds the last heading where no segment applies", () => {
    const [profile] = profiles(
      [piecewise([{ tStart: 0, tEnd: 0.3, heading: "constant", degrees: 30 }])],
      { aVelocity: Math.PI * 4 },
    );
    const tail = profile.slice(Math.ceil(profile.length * 0.4));
    expect(new Set(tail.map((h) => h.toFixed(6))).size).toBe(1);
    expect(tail[0]).toBeCloseTo(30, 0);
  });

  it("supports tangential, linear and facingPoint segments", () => {
    const [profile] = profiles(
      [
        piecewise([
          { tStart: 0, tEnd: 0.3, heading: "tangential" },
          {
            tStart: 0.3,
            tEnd: 0.6,
            heading: "linear",
            startDeg: 0,
            endDeg: 60,
          },
          {
            tStart: 0.6,
            tEnd: 1,
            heading: "facingPoint",
            targetX: 100,
            targetY: 60,
          },
        ]),
      ],
      { aVelocity: Math.PI * 8 },
    );
    // Tangential on a flat path starts at 0; facing straight up ends at 90.
    expect(profile[1]).toBeCloseTo(0, 0);
    expect(profile.at(-1)).toBeCloseTo(90, 0);
  });

  it("adds half a turn to a reversed constant segment", () => {
    const [profile] = profiles(
      [
        piecewise([
          {
            tStart: 0,
            tEnd: 1,
            heading: "constant",
            degrees: 0,
            reverse: true,
          },
        ]),
      ],
      { aVelocity: Math.PI * 8 },
    );
    expect(norm(profile.at(-1)!)).toBeCloseTo(180, 0);
  });

  it("uses chain-wide progress for a global piecewise heading", () => {
    const a = straight(
      "a",
      { ...eastTo(100), heading: "tangential" } as Point,
      {
        globalHeading: "piecewise",
        globalSegments: [
          { tStart: 0, tEnd: 0.5, heading: "constant", degrees: 20 },
          { tStart: 0.5, tEnd: 1, heading: "constant", degrees: 70 },
        ],
      },
    );
    const b = straight(
      "b",
      { x: 100, y: 100, heading: "tangential" } as Point,
      { isChain: true },
    );
    const [first, second] = profiles([a, b], { aVelocity: Math.PI * 8 });
    expect(first.at(-2)).toBeCloseTo(20, 0);
    expect(second.at(-1)).toBeCloseTo(70, 0);
  });
});
