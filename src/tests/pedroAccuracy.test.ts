// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import { robotPoseDuring } from "../utils/animation";
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

describe("letting go at the end of a path", () => {
  const lines = [line("a", constant(90, 10)), line("b", constant(90, 80))];
  const first = (over: Partial<Settings>, sequence = steps("a", "b")) =>
    travels(run(constantStart, lines, sequence, over).timeline)[0];
  /** When the robot is 0.975 of the way along the first path. */
  const at975 = (over: Partial<Settings>) => {
    const ev = first(over);
    const v = ev.velocityProfile!;
    const t = ev.motionProfile!;
    const i = Math.floor(0.975 * (t.length - 1));
    const f = 0.975 * (t.length - 1) - i;
    const vf = Math.sqrt(v[i] ** 2 + f * (v[i + 1] ** 2 - v[i] ** 2));
    return t[i] + ((f * (v[i] + v[i + 1])) / (v[i] + vf)) * (t[i + 1] - t[i]);
  };

  it("lets go 0.975 of the way along, plus the settle time", () => {
    // The robot is still braking then, so the timeout is what ends the hold.
    for (const pathSettleTime of [0, 0.1]) {
      expect(first({ pathSettleTime }).duration).toBeCloseTo(
        at975({ pathSettleTime }) + pathSettleTime,
        6,
      );
    }
  });

  it("holds only once at the end of a chain", () => {
    // A wait after it, so the chain isn't the last thing the robot does.
    const sequence: SequenceItem[] = [
      ...chained("a", "b"),
      { kind: "wait", id: "w", name: "", durationMs: 500 },
    ];
    const total = (pathSettleTime: number) =>
      run(constantStart, lines, sequence, { pathSettleTime }).totalTime;
    expect(total(0.1) - total(0)).toBeCloseTo(0.1, 6);
  });

  it("holds the last path until the robot gets to its end", () => {
    const [ev] = travels(run(constantStart, [lines[0]], steps("a")).timeline);
    expect(ev.duration).toBeCloseTo(ev.motionProfile!.at(-1)!, 6);
  });

  it("defaults to Pedro's 100 ms timeout", () => {
    expect(DEFAULT_SETTINGS.pathSettleTime).toBe(0.1);
  });

  it("lets go as soon as the robot has settled, if that's before the timeout", () => {
    const ev = first({ pathSettleTime: 5 }, steps("a"));
    expect(ev.duration).toBeCloseTo(ev.motionProfile!.at(-1)!, 6);
  });

  it("starts the next step while the robot is still on its way to the end", () => {
    const events = run(constantStart, lines, steps("a", "b"), {}).timeline;
    const [out] = travels(events);
    expect(out.duration).toBeLessThan(out.motionProfile!.at(-1)!);
    // It is drawn finishing the path as the next step begins, without a jump.
    const next = events[events.indexOf(out) + 1];
    expect(next.lag).toBeDefined();
    const before = robotPoseDuring(
      out,
      out.endTime - 1e-6,
      lines,
      constantStart,
    )!;
    const after = robotPoseDuring(next, next.startTime, lines, constantStart)!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(
      0.05,
    );
  });

  it("carries its speed into a path that goes on the same way", () => {
    const straight = [
      line("a", constant(60, 10)),
      line("b", constant(110, 10)),
    ];
    const [, second] = travels(
      run(constantStart, straight, steps("a", "b")).timeline,
    );
    expect(second.velocityProfile![0]).toBeGreaterThan(1);
  });

  it("sheds that speed first when the next path heads back", () => {
    const back = [line("a", constant(60, 10)), line("b", constant(20, 10))];
    const [, second] = travels(
      run(constantStart, back, steps("a", "b")).timeline,
    );
    expect(second.velocityProfile![0]).toBe(0);
    expect(second.motionProfile![0]).toBeGreaterThan(0);
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
  it("doesn't slow the robot for grip on a bend it can follow", () => {
    const arc = [
      line("a", constant(100, 60), [
        { x: 90, y: 10 },
        { x: 90, y: 40 },
      ]),
    ];
    const total = (kFriction: number) =>
      run(constantStart, arc, steps("a"), { kFriction, aVelocity: 100 })
        .totalTime;
    expect(total(0)).toBeCloseTo(total(0.4), 9);
    expect(total(1)).toBeCloseTo(total(0.05), 9);
  });

  it("doesn't slow the robot for a hairpin either: Pedro has no limit for bends, so it runs wide", () => {
    const hairpin = [
      line("a", constant(50, 12), [
        { x: 90, y: 10 },
        { x: 90, y: 14 },
      ]),
    ];
    const travel = run(constantStart, hairpin, steps("a"), {
      kFriction: 0.4,
      aVelocity: 100,
    }).timeline.find((e) => e.type === "travel")!;
    // It reaches the bend at speed, and the tyres can't hold it.
    expect(Math.max(...travel.velocityProfile!)).toBeGreaterThan(
      base.maxVelocity * 0.9,
    );
    expect(travel.excursion!.maxOffset).toBeGreaterThan(2.5);
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

describe("heading progress along a path", () => {
  // Control points that make the curve parameter uneven along the path.
  const lines = [
    line("a", { x: 130, y: 130, heading: "linear", startDeg: 0, endDeg: 90 }, [
      { x: 15, y: 20 },
      { x: 20, y: 130 },
    ]),
  ];
  const headings = () =>
    travels(
      run(constantStart, lines, steps("a"), { aVelocity: 100 }).timeline,
    )[0].headingProfile!;

  it("starts and ends at the headings it is given", () => {
    const profile = headings();
    expect(profile[0]).toBeCloseTo(0, 3);
    expect(profile.at(-1)).toBeCloseTo(90, 3);
  });

  it("is steady between steps", () => {
    const profile = headings();
    for (let i = 1; i < profile.length; i++) {
      expect(profile[i]).toBeGreaterThanOrEqual(profile[i - 1] - 1e-9);
    }
  });

  it("moves to the next chained path before the end of this one", () => {
    const corner = [line("a", constant(80, 10)), line("b", constant(80, 100))];
    const [first] = travels(
      run(constantStart, corner, chained("a", "b")).timeline,
    );
    expect(first.motionProfile!.at(-1)! - first.duration).toBeGreaterThan(0.1);
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

  it("turns on the spot until it is within 11.25° of the heading, as Pedro does", () => {
    // Pedro puts turning before driving past its headingDeviationTolerance.
    expect(DEFAULT_SETTINGS.stopToTurn).toBe(false);
    const [turn] = turns({});
    expect(turns({})).toHaveLength(1);
    expect(turn.targetHeading! - turn.startHeading!).toBeCloseTo(90 - 11.25, 6);
  });

  it("is still turning when it sets off, so the turn doesn't slow to a stop", () => {
    // From rest at up to 2 rad/s, speeding up at 4 rad/s²: 0.5 s and 0.5 rad
    // to get to full speed, the rest at full speed, and no slowing down.
    const [turn] = turns({ aVelocity: 2, maxAngularAcceleration: 4 });
    const angle = ((90 - 11.25) * Math.PI) / 180;
    expect(turn.duration).toBeCloseTo(0.5 + (angle - 0.5) / 2, 6);
  });

  it("matches the robot's turns before three recorded paths", () => {
    // Oct 24 telemetry: 128°, 179° and 35° off, turned at 210°/s with about
    // 23 rad/s² to get going, within 11.25° after 0.64, 0.90 and 0.21 s.
    const settings = {
      aVelocity: (210 * Math.PI) / 180,
      maxAngularAcceleration: 23,
    };
    // The first path starts facing its own heading, so turn on a second one.
    const turnFor = (degrees: number) =>
      run(
        constantStart,
        [line("a", constant(80, 10, 0)), line("b", constant(80, 60, degrees))],
        steps("a", "b"),
        settings,
      ).timeline.find((e) => e.type === "wait")!.duration;
    expect(turnFor(128)).toBeCloseTo(0.64, 1);
    expect(turnFor(179)).toBeCloseTo(0.9, 1);
    expect(turnFor(35)).toBeCloseTo(0.21, 1);
  });

  it("stops to turn all the way first when told to", () => {
    const [turn] = turns({ stopToTurn: true });
    expect(turn.targetHeading! - turn.startHeading!).toBeCloseTo(90, 6);
    expect(timeline({ stopToTurn: false }).totalTime).toBeLessThan(
      timeline({ stopToTurn: true }).totalTime,
    );
  });

  it("finishes the turn as it drives and ends facing the way it should", () => {
    const [, second] = travels(timeline({}).timeline);
    expect(second.headingProfile![0]).toBeCloseTo(90 - 11.25, 3);
    expect(second.headingProfile!.at(-1)).toBeCloseTo(90, 3);
  });

  it("turns clockwise when the path wants it facing exactly the other way", () => {
    const opposite = [
      line("a", constant(90, 10, 0)),
      line("b", constant(10, 10, 180)),
    ];
    const turn = run(constantStart, opposite, steps("a", "b")).timeline.find(
      (e) => e.type === "wait",
    )!;
    expect(turn.targetHeading! - turn.startHeading!).toBeLessThan(0);
  });

  it("doesn't turn first within 11.25° of the heading", () => {
    const close = [
      line("a", constant(90, 10, 0)),
      line("b", constant(90, 80, 10)),
    ];
    const events = run(constantStart, close, steps("a", "b")).timeline;
    expect(events.filter((e) => e.type === "wait")).toHaveLength(0);
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
      stopToTurn: false,
      brakingQuadratic: 0,
      brakingLinear: 0,
      pathSettleTime: 0.1,
      translationalP: 0.1,
    });
  });

  it("are kept when saved", () => {
    const merged = mergeSettings({
      pathSettleTime: 0.2,
      stopToTurn: false,
      brakingQuadratic: 0.02,
    });
    expect(merged).toMatchObject({
      pathSettleTime: 0.2,
      stopToTurn: false,
      brakingQuadratic: 0.02,
    });
  });

  it("drop the Pedro version older settings saved", () => {
    expect(mergeSettings({ pedroVersion: "v2" })).not.toHaveProperty(
      "pedroVersion",
    );
  });

  it("ignore values of the wrong type", () => {
    expect(mergeSettings({ pathSettleTime: "slow" }).pathSettleTime).toBe(0.1);
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
