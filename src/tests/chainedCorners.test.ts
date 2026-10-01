// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { get } from "svelte/store";
import { calculatePathTime } from "../utils/timeCalculator";
import {
  findSharpJunctions,
  travelDirections,
} from "../utils/timeCalculator/chainMeta";
import { computePathStatistics } from "../utils/pathStatistics";
import { validatePath } from "../utils/validation";
import { robotPoseDuring } from "../utils/animation";
import { collisionMarkers } from "../stores";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type {
  Line,
  Point,
  SequenceItem,
  Settings,
  TimelineEvent,
} from "../types";

beforeAll(() => registerCoreUI());

const settings = { ...DEFAULT_SETTINGS } as Settings;
const start: Point = {
  x: 10,
  y: 10,
  heading: "constant",
  degrees: 90,
} as Point;

/** A path ending at (x, y) that keeps the robot facing `degrees`. */
const line = (
  id: string,
  x: number,
  y: number,
  controlPoints: { x: number; y: number }[] = [],
  degrees = 90,
): Line => ({
  id,
  name: id,
  endPoint: { x, y, heading: "constant", degrees } as Point,
  controlPoints,
  color: "#0af",
});

/** Every path after the first continues the chain. */
const chain = (...ids: string[]): SequenceItem[] =>
  ids.map((lineId, i) => ({
    kind: "path",
    lineId,
    ...(i > 0 ? { isChain: true } : {}),
  }));

const apart = (...ids: string[]): SequenceItem[] =>
  ids.map((lineId) => ({ kind: "path", lineId }));

const timelineOf = (
  lines: Line[],
  sequence: SequenceItem[],
  over: Partial<Settings> = {},
) =>
  calculatePathTime(start, lines, { ...settings, ...over }, sequence)
    .timeline as TimelineEvent[];

const travels = (timeline: TimelineEvent[]) =>
  timeline.filter((e) => e.type === "travel");
const recoveries = (timeline: TimelineEvent[]) =>
  timeline.filter((e) => e.type === "recovery");

// Out along the top, then straight back: the direction of travel reverses.
const reversal = [line("out", 80, 10), line("back", 20, 10)];
// Out, then a path that turns a quarter turn.
const cornerPaths = [line("out", 70, 10), line("up", 70, 120)];
// Out, then on in the same direction.
const straightOn = [line("out", 60, 10), line("on", 120, 10)];
// Out, then a path that bends only a little.
const gentle = [line("out", 60, 10), line("on", 130, 18)];

describe("speed through a chained joint", () => {
  it("carries its speed through a joint where the path carries straight on", () => {
    const events = timelineOf(straightOn, chain("out", "on"));
    expect(recoveries(events)).toHaveLength(0);
    const [out, on] = travels(events);
    const joint = out.velocityProfile!.at(-1)!;
    expect(joint).toBeGreaterThan(settings.maxVelocity * 0.9);
    expect(on.velocityProfile![0]).toBeCloseTo(joint, 5);
  });

  it("drives straight through a small bend without leaving the path", () => {
    expect(recoveries(timelineOf(gentle, chain("out", "on")))).toHaveLength(0);
  });

  it("swings off the path at a sharp turn instead of slowing for it", () => {
    const events = timelineOf(cornerPaths, chain("out", "up"));
    expect(events.map((e) => e.type)).toEqual(["travel", "recovery", "travel"]);

    // The first path is driven at full speed right up to the handover.
    const [out] = travels(events);
    expect(Math.max(...out.velocityProfile!)).toBeCloseTo(
      settings.maxVelocity,
      1,
    );
    const [recovery] = recoveries(events);
    expect(recovery.overshoot).toBeGreaterThan(2);
    expect(Math.max(...recovery.trace!.speed)).toBeGreaterThan(
      settings.maxVelocity * 0.5,
    );
  });

  it("hands a path over early, leaving the last part of it undriven", () => {
    const [out] = travels(timelineOf(cornerPaths, chain("out", "up")));
    const profile = out.motionProfile!;
    // The profile carries on past the time the robot is on this path.
    expect(profile.at(-1)!).toBeGreaterThan(out.duration);
    expect(out.duration).toBeGreaterThan(0);
  });

  it("starts the next path part way along once the robot is back on it", () => {
    const events = timelineOf(cornerPaths, chain("out", "up"));
    const [, up] = travels(events);
    // The steps before the robot joined are not driven.
    expect(up.motionProfile![0]).toBeLessThan(0);
    expect(up.motionProfile!.at(-2)!).toBeGreaterThan(0);
    // It joins moving along the path, not from rest.
    const joined = up.motionProfile!.findIndex((t) => t >= 0);
    expect(up.velocityProfile![joined]).toBeGreaterThan(5);
  });

  it("takes longer to get round a sharp corner than to go straight on", () => {
    const total = (lines: Line[]) =>
      calculatePathTime(start, lines, settings, chain("out", lines[1].id!))
        .totalTime;
    const corner = total([line("out", 70, 10), line("b", 70, 70)]);
    const onward = total([line("out", 70, 10), line("b", 130, 10)]);
    expect(corner).toBeGreaterThan(onward);
  });

  it("takes longer when the corner is sharper", () => {
    const total = (x: number, y: number) =>
      calculatePathTime(
        start,
        [line("out", 70, 10), line("b", x, y)],
        settings,
        chain("out", "b"),
      ).totalTime;
    // Same length paths, turning by 45, 90 and 180 degrees.
    expect(total(70 + 42, 10 + 42)).toBeLessThan(total(70, 70));
    expect(total(70, 70)).toBeLessThan(total(10, 10));
  });

  it("is continuous: each event starts where the one before ended", () => {
    const events = timelineOf(cornerPaths, chain("out", "up"));
    for (let i = 1; i < events.length; i++) {
      expect(events[i].startTime).toBeCloseTo(events[i - 1].endTime, 9);
    }
  });

  it("never jumps: the robot's position is continuous through the recovery", () => {
    const lines = cornerPaths;
    const events = timelineOf(lines, chain("out", "up"));
    for (let i = 1; i < events.length; i++) {
      const before = robotPoseDuring(
        events[i - 1],
        events[i - 1].endTime,
        lines,
        start,
      )!;
      const after = robotPoseDuring(
        events[i],
        events[i].startTime,
        lines,
        start,
      )!;
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(
        1.5,
      );
    }
  });

  it("puts the robot off the path during the recovery", () => {
    const events = timelineOf(cornerPaths, chain("out", "up"));
    const [recovery] = recoveries(events);
    const middle = (recovery.startTime + recovery.endTime) / 2;
    const pose = robotPoseDuring(recovery, middle, cornerPaths, start)!;
    // The second path runs straight up x = 70; the robot is east of it.
    expect(Math.abs(pose.x - 70)).toBeGreaterThan(1);
  });

  it("turns toward the next path's heading while recovering", () => {
    const lines = [line("out", 70, 10), line("up", 70, 120, [], 180)];
    const events = timelineOf(lines, chain("out", "up"));
    const [recovery] = recoveries(events);
    expect(recovery.startHeading).toBeCloseTo(90);
    expect(recovery.targetHeading).toBeGreaterThan(130);
    const halfway = (recovery.startTime + recovery.endTime) / 2;
    const heading = robotPoseDuring(recovery, halfway, lines, start)!.heading;
    expect(heading).toBeGreaterThan(90);
    expect(heading).toBeLessThan(recovery.targetHeading!);
  });

  it("doesn't chain paths that aren't chained: it stops at the end of each", () => {
    const events = timelineOf(cornerPaths, apart("out", "up"));
    expect(recoveries(events)).toHaveLength(0);
    const [out, up] = travels(events);
    expect(out.velocityProfile!.at(-1)).toBeCloseTo(0, 5);
    expect(up.velocityProfile![0]).toBe(0);
  });

  it("starts and ends a chain at rest", () => {
    const events = travels(timelineOf(cornerPaths, chain("out", "up")));
    expect(events[0].velocityProfile![0]).toBe(0);
    expect(events.at(-1)!.velocityProfile!.at(-1)).toBeLessThan(1e-6);
  });

  it("never speeds up or slows down faster than the limits while on a path", () => {
    const curved = [
      line("a", 70, 60, [{ x: 70, y: 10 }]),
      line("b", 20, 100, [{ x: 70, y: 100 }]),
      line("c", 120, 120),
    ];
    for (const ev of travels(timelineOf(curved, chain("a", "b", "c")))) {
      const v = ev.velocityProfile!;
      const t = ev.motionProfile!;
      for (let i = 0; i < v.length - 1; i++) {
        const dt = t[i + 1] - t[i];
        if (dt < 1e-6) continue;
        const accel = (v[i + 1] - v[i]) / dt;
        expect(accel).toBeLessThan((settings.maxAcceleration ?? 0) * 1.1);
        expect(-accel).toBeLessThan((settings.maxDeceleration ?? 0) * 1.1);
      }
    }
  });

  it("copes with a chain of very short paths", () => {
    const tiny = [
      line("a", 12, 10),
      line("b", 12, 12),
      line("c", 10, 12),
      line("d", 10, 10),
    ];
    const events = timelineOf(tiny, chain("a", "b", "c", "d"));
    const total = events.at(-1)!.endTime;
    expect(Number.isFinite(total)).toBe(true);
    for (const e of events) expect(Number.isFinite(e.duration)).toBe(true);
  });

  it("recovers at every sharp joint of a longer chain", () => {
    const zigzag = [
      line("a", 70, 10),
      line("b", 70, 70),
      line("c", 20, 70),
      line("d", 20, 130),
    ];
    const events = timelineOf(zigzag, chain("a", "b", "c", "d"));
    expect(recoveries(events)).toHaveLength(3);
    expect(travels(events)).toHaveLength(4);
  });
});

describe("recovery results are reused without going stale", () => {
  const total = (over: Partial<Settings> = {}) =>
    calculatePathTime(
      start,
      cornerPaths,
      { ...settings, ...over },
      chain("out", "up"),
    ).totalTime;

  it("gives the same answer when asked again", () => {
    expect(total()).toBe(total());
  });

  it("notices a change to the robot's settings", () => {
    const base = total();
    expect(total({ maxDeceleration: 12 })).not.toBeCloseTo(base, 2);
    expect(total({ maxVelocity: 20 })).not.toBeCloseTo(base, 2);
    // ...and goes back when the setting does.
    expect(total()).toBe(base);
  });

  it("notices a change to the path after the corner", () => {
    const time = (x: number) =>
      calculatePathTime(
        start,
        [line("out", 70, 10), line("up", x, 120)],
        settings,
        chain("out", "up"),
      ).totalTime;
    const first = time(70);
    expect(time(40)).not.toBeCloseTo(first, 2);
    expect(time(70)).toBe(first);
  });

  it("gives separate timelines their own events", () => {
    const events = timelineOf(cornerPaths, chain("out", "up"));
    const again = timelineOf(cornerPaths, chain("out", "up"));
    expect(recoveries(again)[0].duration).toBe(recoveries(events)[0].duration);
    expect(recoveries(again)[0]).not.toBe(recoveries(events)[0]);
  });
});

describe("chainMeta helpers", () => {
  it("finds the way a path leaves and arrives from its control points", () => {
    const l = line("a", 50, 50, [{ x: 10, y: 50 }]);
    const d = travelDirections({ x: 10, y: 10 } as Point, l)!;
    expect(d.start).toBeCloseTo(90);
    expect(d.end).toBeCloseTo(0);
  });

  it("ignores control points that sit on an end of the path", () => {
    const l = line("a", 50, 10, [{ x: 10, y: 10 }]);
    expect(travelDirections({ x: 10, y: 10 } as Point, l)!.start).toBeCloseTo(
      0,
    );
  });

  it("has no direction for a path with no length", () => {
    expect(travelDirections({ x: 10, y: 10 } as Point, line("a", 10, 10))).toBe(
      null,
    );
  });

  it("flags only chained joints that turn sharply", () => {
    const joints = findSharpJunctions(start, reversal, chain("out", "back"));
    expect(joints).toHaveLength(1);
    expect(joints[0]).toMatchObject({ lineIndex: 1, x: 80, y: 10 });
    expect(joints[0].turnDegrees).toBeCloseTo(180);

    expect(findSharpJunctions(start, straightOn, chain("out", "on"))).toEqual(
      [],
    );
  });

  it("doesn't flag a sharp turn between paths that aren't chained", () => {
    expect(findSharpJunctions(start, reversal, apart("out", "back"))).toEqual(
      [],
    );
  });
});

describe("Path Statistics for chains", () => {
  const stats = (lines: Line[], ids: string[], over: Partial<Settings> = {}) =>
    computePathStatistics(start, lines, chain(...ids), {
      ...settings,
      ...over,
    });

  it("warns about a sharp turn, including how far the robot swings", () => {
    const { insights } = stats(cornerPaths, ["out", "up"]);
    const sharp = insights.filter((i) => i.message.startsWith("Sharp"));
    expect(sharp).toHaveLength(1);
    expect(sharp[0].type).toBe("warning");
    expect(sharp[0].message).toContain("90°");
    expect(sharp[0].message).toMatch(/swing about \d+\.\d in past the path/);
    expect(sharp[0].value).toBeGreaterThan(2);
    expect(sharp[0].endTime!).toBeGreaterThan(sharp[0].startTime);
  });

  it("has no sharp-turn warning when the chain carries on", () => {
    const { insights } = stats(straightOn, ["out", "on"]);
    expect(insights.some((i) => i.message.startsWith("Sharp"))).toBe(false);
  });

  it("shows the time off the path as its own row, so times add up", () => {
    const result = stats(cornerPaths, ["out", "up"]);
    expect(result.segments.map((s) => s.name)).toEqual([
      "out",
      "Overshoot recovery",
      "up",
    ]);
    const sum = result.segments.reduce((total, s) => total + s.time, 0);
    expect(sum).toBeCloseTo(result.totalTime, 6);
  });

  it("doesn't draw the speed dropping to zero at a joint the robot drives through", () => {
    const { velocityData, segments } = stats(straightOn, ["out", "on"]);
    const jointTime = segments[0].time;
    const atJoint = velocityData.filter(
      (p) => Math.abs(p.time - jointTime) < 1e-6,
    );
    expect(atJoint.length).toBeGreaterThan(0);
    for (const p of atJoint) expect(p.value).toBeGreaterThan(20);
  });

  it("graphs the speed through the recovery, never above the maximum", () => {
    const { velocityData, segments } = stats(cornerPaths, ["out", "up"]);
    const from = segments[0].time;
    const to = from + segments[1].time;
    const during = velocityData.filter((p) => p.time > from && p.time < to);
    expect(during.length).toBeGreaterThan(5);
    for (const p of during) {
      expect(p.value).toBeLessThanOrEqual(settings.maxVelocity + 1);
    }
  });

  it("graphs the robot coming nearly to a stop to reverse", () => {
    const { velocityData, segments } = stats(reversal, ["out", "back"]);
    const from = segments[0].time;
    const to = from + segments[1].time;
    const during = velocityData.filter((p) => p.time > from && p.time < to);
    expect(Math.min(...during.map((p) => p.value))).toBeLessThan(5);
  });

  it("reports no acceleration warning for a normal chain", () => {
    for (const [lines, ids] of [
      [reversal, ["out", "back"]],
      [cornerPaths, ["out", "up"]],
      [straightOn, ["out", "on"]],
    ] as [Line[], string[]][]) {
      const { insights } = stats(lines, ids);
      expect(insights.some((i) => i.message.startsWith("Acceleration"))).toBe(
        false,
      );
    }
  });

  it("doesn't blame the robot for limits the profile was built with", () => {
    const { insights } = stats(straightOn, ["out", "on"], {
      maxAcceleration: 5,
      maxDeceleration: 5,
    });
    expect(insights.some((i) => i.message.startsWith("Acceleration"))).toBe(
      false,
    );
  });
});

describe("Sharp corner validation marker", () => {
  beforeEach(() => collisionMarkers.set([]));
  const validate = (lines: Line[], ids: string[]) => {
    validatePath(start, lines, settings, chain(...ids), [], true);
    return get(collisionMarkers);
  };

  it("marks where chained paths turn sharply", () => {
    const markers = validate(reversal, ["out", "back"]);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      type: "sharp-corner",
      x: 80,
      y: 10,
      segmentIndex: 1,
    });
  });

  it("adds nothing for a smooth chain", () => {
    expect(validate(straightOn, ["out", "on"])).toEqual([]);
  });

  it("checks the robot's detour against the field edge and obstacles", () => {
    // A corner near the edge of the field: the robot swings out past it.
    const lines = [line("out", 130, 100), line("up", 130, 140)];
    const markers = validate(lines, ["out", "up"]);
    expect(markers.some((m) => m.type === "boundary")).toBe(true);
  });
});
