// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import {
  brakingDistance,
  speedToSlowWithin,
} from "../utils/timeCalculator/braking";
import {
  speedAtAngle,
  stepSpeedScales,
} from "../utils/timeCalculator/directionalSpeed";
import { calculateMotionProfileDetailed } from "../utils/timeCalculator/motionProfile";
import { mergeSettings } from "../utils/settingsPersistence";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings } from "../types";
import type { PathStep } from "../utils/timeCalculator/types";
import {
  chained,
  constantHeading,
  separately,
  tangentialHeading,
  travelsIn,
} from "./helpers/sequences";

beforeAll(() => registerCoreUI());

const base = { ...DEFAULT_SETTINGS } as Settings;
const constantStart = {
  x: 10,
  y: 10,
  heading: "constant",
  degrees: 0,
} as Point;
const tangentStart = { x: 10, y: 10, heading: "tangential" } as Point;

const line = (
  id: string,
  endPoint: Partial<Point>,
  controlPoints: { x: number; y: number }[] = [],
): Line => ({
  id,
  name: id,
  endPoint: endPoint as Point,
  controlPoints,
  color: "#0af",
});

const constant = constantHeading;
const tangential = tangentialHeading;
const steps = separately;

const run = (
  start: Point,
  lines: Line[],
  sequence: SequenceItem[],
  over: Partial<Settings> = {},
) => calculatePathTime(start, lines, { ...base, ...over }, sequence);

const travels = travelsIn;

describe("time to settle at the end of a path", () => {
  const lines = [line("a", constant(90, 10)), line("b", constant(90, 80))];

  it("adds the settle time to each path that ends in a hold", () => {
    const none = run(constantStart, lines, steps("a", "b"), {
      pathSettleTime: 0,
    });
    const settled = run(constantStart, lines, steps("a", "b"), {
      pathSettleTime: 0.1,
    });
    expect(settled.totalTime - none.totalTime).toBeCloseTo(0.2, 6);
    for (const [i, ev] of travels(settled.timeline).entries()) {
      expect(ev.duration - travels(none.timeline)[i].duration).toBeCloseTo(
        0.1,
        6,
      );
    }
  });

  it("holds only once at the end of a chain", () => {
    const none = run(constantStart, lines, chained("a", "b"), {
      pathSettleTime: 0,
    });
    const settled = run(constantStart, lines, chained("a", "b"), {
      pathSettleTime: 0.1,
    });
    expect(settled.totalTime - none.totalTime).toBeCloseTo(0.1, 6);
  });

  it("is a small optimistic default", () => {
    expect(DEFAULT_SETTINGS.pathSettleTime).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.pathSettleTime).toBeLessThanOrEqual(0.1);
  });

  it("keeps the robot at the end of the path while it settles", () => {
    const [ev] = travels(
      run(constantStart, [lines[0]], steps("a"), { pathSettleTime: 0.5 })
        .timeline,
    );
    expect(ev.duration).toBeGreaterThan(ev.motionProfile!.at(-1)! + 0.4);
  });
});

describe("top speed by direction of travel", () => {
  const forwardFast = { xVelocity: 30, yVelocity: 15, maxVelocity: 40 };
  const topSpeed = (end: Point, over: Partial<Settings>, lines: Line[]) =>
    Math.max(
      ...travels(
        run(constantStart, lines, steps(lines[0].id!), over).timeline,
      ).map((e) => Math.max(...e.velocityProfile!)),
    );
  const east = [line("a", constant(130, 10))];
  const north = [line("a", constant(10, 130))];

  it("is full speed in every direction when forward and strafe match", () => {
    expect(speedAtAngle({ ...base, xVelocity: 30, yVelocity: 30 })).toBeNull();
    expect(topSpeed(constantStart, forwardFast, east)).toBeGreaterThan(39);
    expect(
      topSpeed(constantStart, { ...forwardFast, yVelocity: 30 }, north),
    ).toBeGreaterThan(39);
  });

  it("is slower sideways than forwards", () => {
    // The robot faces east (0 degrees): east is forward, north is sideways.
    const forward = topSpeed(constantStart, forwardFast, east);
    const sideways = topSpeed(constantStart, forwardFast, north);
    expect(forward).toBeGreaterThan(39);
    // Strafe is half of forward speed: half the top speed.
    expect(sideways).toBeCloseTo(20, 0);
  });

  it("takes longer to drive sideways", () => {
    const time = (lines: Line[]) =>
      run(constantStart, lines, steps("a"), forwardFast).totalTime;
    expect(time(north)).toBeGreaterThan(time(east) * 1.4);
  });

  it("blends between the two on a diagonal", () => {
    const diagonal = [line("a", constant(100, 100))];
    const speed = topSpeed(constantStart, forwardFast, diagonal);
    expect(speed).toBeGreaterThan(15);
    expect(speed).toBeLessThan(40);
  });

  it("uses forward speed when the robot faces the way it travels", () => {
    const lines = [line("a", tangential(10, 130))];
    const speed = Math.max(
      ...travels(
        run(tangentStart, lines, steps("a"), forwardFast).timeline,
      ).flatMap((e) => e.velocityProfile!),
    );
    expect(speed).toBeGreaterThan(39);
  });

  it("scales each step by the angle between travel and heading", () => {
    const scale = speedAtAngle({ ...base, xVelocity: 30, yVelocity: 15 })!;
    expect(scale(0)).toBeCloseTo(1);
    expect(scale(180)).toBeCloseTo(1);
    expect(scale(90)).toBeCloseTo(0.5);
    // Pedro's formula, which is slowest in between the two axes.
    expect(scale(45)).toBeCloseTo(0.4714, 3);

    const step = (direction: number): PathStep => ({
      deltaLength: 1,
      radius: Infinity,
      rotation: 0,
      heading: 0,
      direction,
    });
    const scales = stepSpeedScales([step(0), step(90)], [0, 0, 0], {
      ...base,
      xVelocity: 30,
      yVelocity: 15,
    })!;
    expect(scales[0]).toBeCloseTo(1);
    expect(scales[1]).toBeCloseTo(0.5);
    expect(stepSpeedScales([step(0)], [0, 0], base)).toBeNull();
  });

  it("is limited the other way round when strafing is faster", () => {
    const scale = speedAtAngle({ ...base, xVelocity: 15, yVelocity: 30 })!;
    expect(scale(0)).toBeCloseTo(0.5);
    expect(scale(90)).toBeCloseTo(1);
  });
});

describe("curves", () => {
  it("doesn't slow the robot for grip: friction only drives the slip warning", () => {
    const hairpin = [
      line("a", constant(50, 12), [
        { x: 90, y: 10 },
        { x: 90, y: 14 },
      ]),
    ];
    const total = (kFriction: number) =>
      run(constantStart, hairpin, steps("a"), { kFriction, aVelocity: 100 })
        .totalTime;
    expect(total(0)).toBeCloseTo(total(0.4), 9);
    expect(total(1)).toBeCloseTo(total(0.05), 9);
  });

  it("only turns the robot with a curve when its heading follows the path", () => {
    const turnRate = { aVelocity: 0.5, kFriction: 0 };
    const total = (start: Point, end: Partial<Point>) =>
      run(
        start,
        [
          line("a", end, [
            { x: 90, y: 10 },
            { x: 90, y: 60 },
          ]),
        ],
        steps("a"),
        turnRate,
      ).totalTime;
    const facingFixed = total(constantStart, constant(10, 60));
    const followingPath = total(tangentStart, tangential(10, 60));
    expect(followingPath).toBeGreaterThan(facingFixed);
  });
});

describe("heading progress along a path by version", () => {
  // Control points that make the curve parameter uneven along the path.
  const lines = [
    line("a", { x: 130, y: 130, heading: "linear", startDeg: 0, endDeg: 90 }, [
      { x: 15, y: 20 },
      { x: 20, y: 130 },
    ]),
  ];
  const headings = (version: "v3" | "v2") =>
    travels(
      run(constantStart, lines, steps("a"), {
        pedroVersion: version,
        aVelocity: 100,
      }).timeline,
    )[0].headingProfile!;

  it("differs between v2 (curve parameter) and v3 (distance)", () => {
    const v3 = headings("v3");
    const v2 = headings("v2");
    expect(v3.length).toBe(v2.length);
    const mid = Math.floor(v3.length / 2);
    expect(Math.abs(v3[mid] - v2[mid])).toBeGreaterThan(2);
  });

  it("starts and ends at the same headings either way", () => {
    for (const version of ["v3", "v2"] as const) {
      const profile = headings(version);
      expect(profile[0]).toBeCloseTo(0, 3);
      expect(profile.at(-1)).toBeCloseTo(90, 3);
    }
  });

  it("is steady between steps in both", () => {
    for (const version of ["v3", "v2"] as const) {
      const profile = headings(version);
      for (let i = 1; i < profile.length; i++) {
        expect(profile[i]).toBeGreaterThanOrEqual(profile[i - 1] - 1e-9);
      }
    }
  });

  it("moves to the next chained path at its end in v2, but early in v3", () => {
    const corner = [line("a", constant(80, 10)), line("b", constant(80, 100))];
    const tail = (version: "v3" | "v2") => {
      const [first] = travels(
        run(constantStart, corner, chained("a", "b"), { pedroVersion: version })
          .timeline,
      );
      return first.motionProfile!.at(-1)! - first.duration;
    };
    expect(tail("v3")).toBeGreaterThan(0.1);
    expect(tail("v2")).toBeCloseTo(0, 6);
  });
});

describe("turning before an unchained path", () => {
  const lines = [
    line("a", constant(90, 10, 0)),
    line("b", constant(90, 80, 90)),
  ];
  const timeline = (over: Partial<Settings>) =>
    run(constantStart, lines, steps("a", "b"), over);
  const turns = (over: Partial<Settings>) =>
    timeline(over).timeline.filter((e) => e.type === "wait");

  it("drives while it turns by default, as Pedro does", () => {
    expect(DEFAULT_SETTINGS.stopToTurn).toBe(false);
    expect(turns({})).toHaveLength(0);
  });

  it("stops to turn first when told to", () => {
    expect(turns({ stopToTurn: true })).toHaveLength(1);
    expect(timeline({ stopToTurn: false }).totalTime).toBeLessThan(
      timeline({ stopToTurn: true }).totalTime,
    );
  });

  it("still ends the path facing the way it should", () => {
    const [, second] = travels(timeline({ stopToTurn: false }).timeline);
    expect(second.headingProfile!.at(-1)).toBeCloseTo(90, 3);
    // It started the path still facing the way the first one ended.
    expect(second.headingProfile![0]).toBeCloseTo(0, 3);
  });

  it("doesn't change a path that starts the way the last one ended", () => {
    const same = [
      line("a", constant(90, 10, 0)),
      line("b", constant(90, 80, 0)),
    ];
    const total = (over: Partial<Settings>) =>
      run(constantStart, same, steps("a", "b"), over).totalTime;
    expect(total({ stopToTurn: false })).toBeCloseTo(total({}), 9);
  });
});

describe("braking", () => {
  it("brakes at a constant rate unless coefficients are given", () => {
    const s = { ...base, maxDeceleration: 20 };
    expect(brakingDistance(20, s)).toBeCloseTo(10);
    expect(speedToSlowWithin(10, 0, s)).toBeCloseTo(20);
    // The same as before: v^2 = v0^2 + 2ad.
    expect(speedToSlowWithin(10, 10, s)).toBeCloseTo(Math.sqrt(100 + 400));
  });

  it("uses quadratic and linear terms when given", () => {
    const s = { ...base, brakingQuadratic: 0.01, brakingLinear: 0.2 };
    expect(brakingDistance(20, s)).toBeCloseTo(0.01 * 400 + 0.2 * 20);
  });

  it("works out the speed that can be braked from, as the inverse", () => {
    const s = { ...base, brakingQuadratic: 0.01, brakingLinear: 0.2 };
    for (const distance of [1, 8, 30]) {
      const v = speedToSlowWithin(distance, 0, s);
      expect(brakingDistance(v, s)).toBeCloseTo(distance, 6);
    }
    // Slowing to a speed rather than a stop.
    const v = speedToSlowWithin(10, 12, s);
    expect(brakingDistance(v, s) - brakingDistance(12, s)).toBeCloseTo(10, 6);
  });

  it("handles a linear term alone", () => {
    const s = { ...base, brakingLinear: 0.5 };
    expect(speedToSlowWithin(5, 0, s)).toBeCloseTo(10);
  });

  it("starts braking earlier when the robot takes longer to stop", () => {
    const profile = (over: Partial<Settings>) => {
      const steps: PathStep[] = Array.from({ length: 100 }, () => ({
        deltaLength: 1,
        radius: Infinity,
        rotation: 0,
        heading: 0,
      }));
      return calculateMotionProfileDetailed(steps, { ...base, ...over }, 0, 0)
        .velocityProfile;
    };
    const constantRate = profile({});
    const slowBraking = profile({ brakingQuadratic: 0.05, brakingLinear: 0 });
    // Ten inches from the end, the slow-braking robot has to be going slower.
    expect(slowBraking[90]).toBeLessThan(constantRate[90]);
    expect(slowBraking.at(-1)).toBeCloseTo(0);
  });

  it("changes where a chained path is handed over", () => {
    const corner = [
      line("a", constant(120, 10)),
      line("b", constant(120, 100)),
    ];
    const handover = (over: Partial<Settings>) =>
      travels(run(constantStart, corner, chained("a", "b"), over).timeline)[0]
        .duration;
    expect(handover({ brakingQuadratic: 0.05 })).toBeLessThan(handover({}));
  });
});

describe("the new settings", () => {
  it("keep their defaults for older saved settings", () => {
    const merged = mergeSettings({ maxVelocity: 50 });
    expect(merged).toMatchObject({
      pedroVersion: "v3",
      stopToTurn: false,
      brakingQuadratic: 0,
      brakingLinear: 0,
      pathSettleTime: 0.05,
      translationalP: 0.1,
    });
  });

  it("are kept when saved", () => {
    const merged = mergeSettings({
      pedroVersion: "v2",
      pathSettleTime: 0.2,
      stopToTurn: false,
      brakingQuadratic: 0.02,
    });
    expect(merged).toMatchObject({
      pedroVersion: "v2",
      pathSettleTime: 0.2,
      stopToTurn: false,
      brakingQuadratic: 0.02,
    });
  });

  it("ignore values of the wrong type", () => {
    expect(mergeSettings({ pathSettleTime: "slow" }).pathSettleTime).toBe(0.05);
    expect(mergeSettings({ stopToTurn: "yes" }).stopToTurn).toBe(false);
  });

  it("drop settings that were removed, when an older save still has them", () => {
    const merged = mergeSettings({
      slowForCurves: true,
      headingResponseTime: 0.5,
      maxVelocity: 55,
    });
    expect("slowForCurves" in merged).toBe(false);
    expect("headingResponseTime" in merged).toBe(false);
    expect(merged.maxVelocity).toBe(55);
  });
});
