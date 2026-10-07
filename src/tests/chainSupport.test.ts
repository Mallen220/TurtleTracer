// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import {
  drivenLength,
  drivenRange,
  pathTimings,
} from "../utils/timeCalculator/drivenRange";
import { chainCornerIssues } from "../utils/timeCalculator/chainIssues";
import {
  CHAIN_STEPS,
  clearRecoveryCache,
  handoverStep,
  headingsAlong,
  idealHeadings,
  recoverFromHandover,
} from "../utils/timeCalculator/chainHandover";
import { turnToward } from "../utils/timeCalculator/headingProfile";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, Settings, TimelineEvent } from "../types";
import type { PathStep } from "../utils/timeCalculator/types";
import {
  chained,
  recoveriesIn,
  separately,
  travelsIn,
} from "./helpers/sequences";

beforeAll(() => registerCoreUI());

const settings = { ...DEFAULT_SETTINGS } as Settings;
const start = { x: 10, y: 10, heading: "tangential" } as Point;
const line = (id: string, x: number, y: number): Line => ({
  id,
  name: id,
  endPoint: { x, y, heading: "tangential" } as Point,
  controlPoints: [],
  color: "#0af",
});

// East along the wall, then straight back north: a right-angle chained corner.
const lines = [line("a", 100, 10), line("b", 100, 100)];
const sequence = chained("a", "b");
const run = (over: Partial<Settings> = {}, ls = lines, seq = sequence) =>
  calculatePathTime(start, ls, { ...settings, ...over }, seq).timeline;

describe("drivenRange", () => {
  const travel = (extra: Partial<TimelineEvent>) =>
    ({ type: "travel", ...extra }) as TimelineEvent;

  it("covers the whole line unless the event says otherwise", () => {
    expect(drivenRange(travel({}))).toEqual({ from: 0, to: 1 });
    expect(drivenLength(travel({}), 50)).toBe(50);
  });

  it("covers only the part the event drives", () => {
    const event = travel({ drivenFrom: 0.2, drivenTo: 0.9 });
    expect(drivenRange(event)).toEqual({ from: 0.2, to: 0.9 });
    expect(drivenLength(event, 100)).toBeCloseTo(70);
  });

  it("never reports a negative length", () => {
    expect(drivenLength(travel({ drivenFrom: 0.8, drivenTo: 0.5 }), 100)).toBe(
      0,
    );
  });

  it("stops the first path of a chain short of its end", () => {
    const [first, second] = travelsIn(run());
    expect(first.drivenFrom ?? 0).toBe(0);
    expect(first.drivenTo!).toBeLessThan(1);
    expect(second.drivenTo ?? 1).toBe(1);
  });
});

describe("pathTimings", () => {
  it("adds the swing onto a path so the times add up to the whole run", () => {
    const timeline = run();
    const timings = pathTimings(timeline, lines);
    expect(recoveriesIn(timeline)).toHaveLength(1);
    const a = timings.get("a")!;
    const b = timings.get("b")!;
    expect(b.swingTime).toBeGreaterThan(0);
    expect(a.swingTime).toBe(0);
    expect(a.duration + b.duration).toBeCloseTo(timeline.at(-1)!.endTime, 6);
  });

  it("ignores waits and events for paths that don't exist", () => {
    const timeline = [
      { type: "wait", startTime: 0, endTime: 1, duration: 1 },
      { type: "travel", lineIndex: 7, startTime: 1, endTime: 2, duration: 1 },
    ] as TimelineEvent[];
    expect(pathTimings(timeline, lines).size).toBe(0);
  });
});

describe("chainCornerIssues", () => {
  const issues = (over: Partial<Settings> = {}) =>
    chainCornerIssues(run(over), start, lines, sequence, {
      ...settings,
      ...over,
    } as Settings);

  it("reports a sharp corner once, with one message", () => {
    const found = issues();
    expect(found).toHaveLength(1);
    expect(found[0].message).toMatch(/^Sharp chained corner \(90°\)/);
    expect(found[0].valueLabel).toMatch(/^Swing: |^Missed by: /);
    expect(found[0].lineIndex).toBe(1);
  });

  it("says nothing when the paths are not chained", () => {
    const apart = separately("a", "b");
    expect(
      chainCornerIssues(run({}, lines, apart), start, lines, apart, settings),
    ).toEqual([]);
  });

  it("calls a robot that never gets back on the path an error, and mentions a very low P", () => {
    const [found] = issues({ translationalP: 0.01 });
    expect(found.severity).toBe("error");
    expect(found.message).toContain("translational P (0.01) is very low");
  });
});

describe("handoverStep", () => {
  const steps = Array.from(
    { length: 100 },
    () => ({ deltaLength: 1 }) as PathStep,
  );
  const speeds = steps.map(() => 40);

  it("hands over once the robot couldn't stop before the end", () => {
    const step = handoverStep(steps, speeds, 0, settings, 90);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(steps.length);
  });

  it("drives a turn too small to matter right to the end", () => {
    expect(handoverStep(steps, speeds, 0, settings, 5)).toBe(steps.length);
  });

  it("waits until the end on Pedro v2", () => {
    expect(
      handoverStep(steps, speeds, 0, { ...settings, pedroVersion: "v2" }, 90),
    ).toBe(steps.length);
  });
});

describe("recoverFromHandover", () => {
  const input = () => ({
    line: lines[0],
    prevPoint: start,
    nextLine: lines[1],
    stepCount: CHAIN_STEPS,
    endStep: 80,
    speed: 40,
    settings,
    nextIsLast: true,
  });

  it("gives the same answer again without simulating it again", () => {
    clearRecoveryCache();
    expect(recoverFromHandover(input())).toBe(recoverFromHandover(input()));
  });

  it("simulates again once the cache has been cleared", () => {
    const first = recoverFromHandover(input());
    clearRecoveryCache();
    const second = recoverFromHandover(input());
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("has no answer for a line with no direction", () => {
    const stuck = { ...lines[0], endPoint: { ...start } as Point };
    expect(recoverFromHandover({ ...input(), line: stuck })).toBeNull();
  });
});

describe("turnToward and headingsAlong", () => {
  it("turns toward the target, by no more than the limit", () => {
    expect(turnToward(0, 90, 10)).toBe(10);
    expect(turnToward(0, -90, 10)).toBe(-10);
    expect(turnToward(0, 4, 10)).toBe(4);
    expect(turnToward(50, 50, 10)).toBe(50);
  });

  it("follows the wanted heading no faster than the robot can turn", () => {
    const rate = (settings.aVelocity * 180) / Math.PI;
    const times = [0, 0.1, 0.2, 0.3];
    const wanted = Array.from({ length: 10 }, () => 180);
    const headings = headingsAlong(times, [0, 1, 2, 3], wanted, 0, settings);
    expect(headings[0]).toBe(0);
    for (let i = 1; i < headings.length; i++) {
      expect(headings[i] - headings[i - 1]).toBeLessThanOrEqual(
        rate * 0.1 + 1e-9,
      );
    }
    expect(headings[3]).toBeGreaterThan(0);
  });
});

describe("idealHeadings", () => {
  it("gives the heading wanted at every step, however sharply it changes", () => {
    const flip: Line = {
      ...lines[1],
      endPoint: { x: 100, y: 100, heading: "constant", degrees: 270 } as Point,
    };
    const wanted = idealHeadings({
      line: flip,
      prevPoint: lines[0].endPoint,
      chainMeta: undefined,
      currentHeading: 0,
      settings: { ...settings, aVelocity: 0.1 },
    });
    expect(wanted).toHaveLength(CHAIN_STEPS + 1);
    // A robot turning at 0.1 rad/s couldn't be anywhere near 270 degrees by now.
    const jump = Math.max(
      ...wanted.slice(1).map((h, i) => Math.abs(h - wanted[i])),
    );
    expect(jump).toBeGreaterThan(5);
  });
});
