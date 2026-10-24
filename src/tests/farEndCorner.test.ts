// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { beforeAll, describe, expect, it } from "vitest";
import {
  pathDirectionAt,
  pedroClosestParameter,
} from "../utils/timeCalculator/pedroClosest";
import { calculatePathTime } from "../utils/timeCalculator";
import { chainCornerIssues } from "../utils/timeCalculator/chainIssues";
import { computePathStatistics } from "../utils/pathStatistics";
import { robotPoseDuring } from "../utils/animation";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings } from "../types";

beforeAll(() => registerCoreUI());

const settings = { ...DEFAULT_SETTINGS } as Settings;

// Out along y=25, then a path that leaves north and hooks back round to end
// beside where the first one began, so that its far end is nearer the robot
// than its start for a robot coming along the first path.
const start = { x: 9, y: 25, heading: "tangential", reverse: false } as Point;
const first = (): Line => ({
  id: "a",
  name: "DriveToShoot",
  endPoint: { x: 60, y: 25, heading: "tangential", reverse: false } as Point,
  controlPoints: [],
  color: "#0a5",
});
const hook = (over: Partial<Line> = {}): Line => ({
  id: "b",
  name: "Hook",
  endPoint: {
    x: 27.276229613458323,
    y: 32.87789745730064,
    heading: "tangential",
    reverse: false,
  } as Point,
  controlPoints: [{ x: 58.1, y: 52 }],
  color: "#05a",
  isChain: true,
  ...over,
});
const sequenceOf = (lines: Line[]): SequenceItem[] =>
  lines.map((l) => ({
    kind: "path",
    lineId: l.id!,
    ...(l.isChain ? { isChain: true } : {}),
  }));
const issuesOf = (lines: Line[], over: Partial<Settings> = {}) => {
  const s = { ...settings, ...over };
  const sequence = sequenceOf(lines);
  const { timeline } = calculatePathTime(start, lines, s, sequence);
  return chainCornerIssues(timeline, start, lines, sequence, s);
};
const headings = (lines: Line[]) => {
  const sequence = sequenceOf(lines);
  const { timeline, totalTime } = calculatePathTime(
    start,
    lines,
    settings,
    sequence,
  );
  const out: number[] = [];
  for (let t = 0; t <= totalTime; t += 0.05) {
    const event = timeline.find((e) => t >= e.startTime && t <= e.endTime)!;
    out.push(robotPoseDuring(event, t, lines, start)!.heading);
  }
  return out;
};

describe("where Pedro puts a robot along a path", () => {
  const curve = [
    { x: 60, y: 25 },
    { x: 58.1, y: 52 },
    { x: 27.276229613458323, y: 32.87789745730064 },
  ];

  it("projects onto a straight path, and stops at its ends", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(pedroClosestParameter(line, { x: 4, y: 7 })).toBeCloseTo(0.4);
    expect(pedroClosestParameter(line, { x: -5, y: 1 })).toBe(0);
    expect(pedroClosestParameter(line, { x: 50, y: 1 })).toBe(1);
  });

  it("searches the whole curve, so a path that hooks back can have its far end nearest", () => {
    // Values from Pedro's own algorithm for a robot on y = 25.
    const at = (x: number) => pedroClosestParameter(curve, { x, y: 25 }, 0);
    expect(at(60)).toBeCloseTo(0, 2);
    expect(at(55)).toBeLessThan(0.05);
    expect(at(42)).toBeCloseTo(0.843, 2);
    expect(at(38)).toBeCloseTo(0.917, 2);
    expect(at(34.5)).toBeCloseTo(0.969, 2);
    expect(at(30)).toBeCloseTo(1, 2);
  });

  it("gives the direction a path points in", () => {
    expect(pathDirectionAt(curve, 0)).toBeCloseTo(94, 0);
    expect(pathDirectionAt(curve, 0.97)).toBeCloseTo(-149, 0);
    expect(
      pathDirectionAt(
        [
          { x: 0, y: 0 },
          { x: 0, y: 5 },
        ],
        0.5,
      ),
    ).toBeCloseTo(90);
  });
});

describe("a chained path whose far end is nearest when the robot takes it over", () => {
  it("warns, and says which way Pedro will steer", () => {
    const [issue] = issuesOf([first(), hook()]);
    expect(issue.message).toContain(
      "its far end is nearer the robot than its start",
    );
    expect(issue.message).toMatch(
      /nearest point is \d+% along, where the path points -149°, not the 94°/,
    );
    expect(issue.message).toContain("Unchain the paths");
  });

  it("is one warning for the corner, not two", () => {
    // The 90 degree corner and the far end are reported together.
    const issues = issuesOf([first(), hook()]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("Sharp chained corner");
    expect(issues[0].message).toContain("far end");
  });

  it("is an error when the nearest point is the very end, which Pedro counts as finished", () => {
    // Braking from speed takes longer, so the path is taken over further back.
    const [issue] = issuesOf([first(), hook()], { maxDeceleration: 20 });
    expect(issue.severity).toBe("error");
    expect(issue.message).toContain("treat it as finished at once");
  });

  it("shows in Path Statistics", () => {
    const lines = [first(), hook()];
    const stats = computePathStatistics(
      start,
      lines,
      sequenceOf(lines),
      settings,
    );
    const note = stats.insights.find((i) => i.message.includes("far end"));
    expect(note).toBeDefined();
    expect(note!.type).toBe("warning");
  });

  it("is why the robot turns away first: its heading dips before it climbs", () => {
    const chained = headings([first(), hook()]);
    expect(Math.min(...chained)).toBeLessThan(-20);
  });

  it("goes away when the paths aren't chained, and the heading no longer dips", () => {
    const lines = [first(), hook({ isChain: false })];
    expect(issuesOf(lines)).toHaveLength(0);
    expect(Math.min(...headings(lines))).toBeGreaterThan(-5);
  });

  it("stops the heading dipping with a constant heading, which doesn't follow the nearest point", () => {
    const lines = [
      first(),
      hook({
        endPoint: {
          x: 27.276229613458323,
          y: 32.87789745730064,
          heading: "constant",
          degrees: 90,
        } as Point,
      }),
    ];
    expect(Math.min(...headings(lines))).toBeGreaterThan(-5);
  });

  it("says nothing for a path that leaves the way the robot is going", () => {
    // Out along y=25, then on up and round: its start is the nearest part.
    const bend = hook({
      endPoint: {
        x: 80,
        y: 80,
        heading: "tangential",
        reverse: false,
      } as Point,
      controlPoints: [{ x: 75, y: 40 }],
    });
    expect(
      issuesOf([first(), bend]).every((i) => !i.message.includes("far end")),
    ).toBe(true);
  });
});
