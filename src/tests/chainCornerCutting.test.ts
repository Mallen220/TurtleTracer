// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { calculatePathTime, type TimeOptions } from "../utils/timeCalculator";
import { simulateRecovery } from "../utils/timeCalculator/chainRecovery";
import { computePathStatistics } from "../utils/pathStatistics";
import { robotPoseDuring } from "../utils/animation";
import { PathOptimizer } from "../utils/pathOptimizer";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings } from "../types";
import { recoveriesIn } from "./helpers/sequences";

beforeAll(() => registerCoreUI());
afterEach(() => vi.restoreAllMocks());

const settings = { ...DEFAULT_SETTINGS } as Settings;

// The path an optimizer returned that skipped the point its two paths join at.
const start = {
  x: 9,
  y: 25,
  heading: "linear",
  startDeg: -18.6,
  endDeg: 110.2,
} as Point;
const joint = { x: 60, y: 25 };
const cutting: Line[] = [
  {
    id: "a",
    name: "DriveToShoot",
    endPoint: { ...joint, heading: "tangential" } as Point,
    controlPoints: [
      { x: 31.223348587461064, y: 17.521152211483454 },
      { x: 34.93483060692139, y: 39.60435941222087 },
    ],
    color: "#8CD6B8",
  },
  {
    id: "b",
    name: "",
    endPoint: {
      x: 61.71824836265571,
      y: 116.0935132271735,
      heading: "tangential",
    } as Point,
    controlPoints: [{ x: 92.75265334165229, y: 31.94468959216411 }],
    color: "#8C7CAA",
    isChain: true,
  },
];
const sequence: SequenceItem[] = [
  { kind: "path", lineId: "a" },
  { kind: "path", lineId: "b", isChain: true },
];

const run = (
  lines: Line[],
  over: Partial<Settings> = {},
  options: TimeOptions = {},
) =>
  calculatePathTime(start, lines, { ...settings, ...over }, sequence, options);
const recoveries = recoveriesIn;

/** The closest the robot gets to `point` over the whole run, in inches. */
function closestApproach(
  lines: Line[],
  options: TimeOptions,
  point: { x: number; y: number },
) {
  const { timeline, totalTime } = run(lines, {}, options);
  let closest = Infinity;
  for (let t = 0; t <= totalTime; t += 0.02) {
    const event = timeline.find((e) => t >= e.startTime && t <= e.endTime)!;
    const pose = robotPoseDuring(event, t, lines, start)!;
    closest = Math.min(closest, Math.hypot(pose.x - point.x, pose.y - point.y));
  }
  return closest;
}

describe("a robot handed over early cuts the corner", () => {
  it("reports how close it gets to the point the paths join at", () => {
    const [recovery] = recoveries(run(cutting).timeline);
    expect(recovery.missedBy).toBeGreaterThan(5);
    // That agrees with where the robot actually goes.
    expect(closestApproach(cutting, {}, joint)).toBeCloseTo(
      recovery.missedBy!,
      0,
    );
  });

  it("warns in Path Statistics, naming the point", () => {
    const { insights } = computePathStatistics(
      start,
      cutting,
      sequence,
      settings,
    );
    const warning = insights.find((i) =>
      i.message.startsWith("The robot cuts this chained corner"),
    )!;
    expect(warning.type).toBe("warning");
    expect(warning.message).toContain("(60.0, 25.0)");
    expect(warning.value).toBeGreaterThan(5);
  });

  it("doesn't warn about a corner it gets to", () => {
    const straightOn: Line[] = [
      {
        id: "a",
        name: "",
        endPoint: { x: 60, y: 25, heading: "tangential" } as Point,
        controlPoints: [],
        color: "#000",
      },
      {
        id: "b",
        name: "",
        endPoint: { x: 120, y: 25, heading: "tangential" } as Point,
        controlPoints: [],
        color: "#000",
        isChain: true,
      },
    ];
    const { insights } = computePathStatistics(
      start,
      straightOn,
      sequence,
      settings,
    );
    expect(
      insights.some((i) => i.message.includes("cuts this chained corner")),
    ).toBe(false);
  });

  it("is measured for a simple quarter turn", () => {
    const path = Array.from({ length: 101 }, (_, i) => ({ x: 60, y: i * 1.3 }));
    const cut = simulateRecovery({
      position: { x: 34, y: 0 },
      velocity: { x: 40, y: 0 },
      path,
      settings,
    });
    expect(cut.junctionMiss).toBeGreaterThan(3);
    // Brought to a stop right at the join, it gets there.
    const reverse = simulateRecovery({
      position: { x: 34, y: 0 },
      velocity: { x: 40, y: 0 },
      path: Array.from({ length: 101 }, (_, i) => ({ x: 60 - i * 0.5, y: 0 })),
      settings,
    });
    expect(reverse.junctionMiss).toBeLessThan(2);
  });
});

describe("timing chained paths without the corner correction", () => {
  it("has the robot follow the path exactly, through the point", () => {
    const { timeline } = run(cutting, {}, { chainCorrection: false });
    expect(recoveries(timeline)).toHaveLength(0);
    expect(
      closestApproach(cutting, { chainCorrection: false }, joint),
    ).toBeLessThan(1);
  });

  it("slows down for a sharp corner, since it can't change direction at speed", () => {
    const quarterTurn: Line[] = [
      {
        id: "a",
        name: "",
        endPoint: { x: 70, y: 25, heading: "tangential" } as Point,
        controlPoints: [],
        color: "#000",
      },
      {
        id: "b",
        name: "",
        endPoint: { x: 70, y: 110, heading: "tangential" } as Point,
        controlPoints: [],
        color: "#000",
        isChain: true,
      },
    ];
    const out = calculatePathTime(start, quarterTurn, settings, sequence, {
      chainCorrection: false,
    }).timeline.find((e) => e.type === "travel")!;
    // Turning a right angle at the join: stopped there.
    expect(out.velocityProfile!.at(-1)!).toBeLessThan(1);
    expect(Math.max(...out.velocityProfile!)).toBeGreaterThan(20);
  });

  it("slows partway for a corner that turns partway", () => {
    const out = run(cutting, {}, { chainCorrection: false }).timeline.find(
      (e) => e.type === "travel",
    )!;
    expect(out.velocityProfile!.at(-1)!).toBeGreaterThan(10);
    expect(out.velocityProfile!.at(-1)!).toBeLessThan(35);
  });

  it("carries speed through a corner that goes straight on", () => {
    const straightOn: Line[] = [
      {
        id: "a",
        name: "",
        endPoint: { x: 60, y: 25, heading: "tangential" } as Point,
        controlPoints: [],
        color: "#000",
      },
      {
        id: "b",
        name: "",
        endPoint: { x: 130, y: 25, heading: "tangential" } as Point,
        controlPoints: [],
        color: "#000",
        isChain: true,
      },
    ];
    const [first] = calculatePathTime(start, straightOn, settings, sequence, {
      chainCorrection: false,
    }).timeline;
    expect(first.velocityProfile!.at(-1)!).toBeGreaterThan(30);
  });

  it("is on unless told otherwise, and is not one of the robot's settings", () => {
    expect(recoveries(run(cutting).timeline)).toHaveLength(1);
    expect(
      recoveries(run(cutting, {}, { chainCorrection: true }).timeline),
    ).toHaveLength(1);
    expect("chainCorrection" in DEFAULT_SETTINGS).toBe(false);
  });
});

describe("the optimizer can't gain time by skipping a point", () => {
  /** A repeatable stand-in for Math.random. */
  function seeded() {
    let seed = 12345;
    vi.spyOn(Math, "random").mockImplementation(() => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    });
  }
  const optimizerSettings = {
    ...settings,
    optimizationIterations: 40,
    optimizationPopulationSize: 40,
  } as Settings;

  it("finds a path that gets to the join point", async () => {
    seeded();
    const result = await new PathOptimizer(
      start,
      cutting,
      optimizerSettings,
      sequence,
    ).optimize(() => {});
    const [recovery] = recoveries(
      calculatePathTime(start, result.lines, optimizerSettings, sequence)
        .timeline,
    );
    // Within a few inches of the point (or no recovery at all).
    expect(recovery?.missedBy ?? 0).toBeLessThan(6);
    // And it still reports the real time of the path.
    expect(result.bestTime).toBeCloseTo(
      calculatePathTime(start, result.lines, optimizerSettings, sequence)
        .totalTime,
      6,
    );
  });

  it("can instead optimize as if the robot follows each path exactly", async () => {
    seeded();
    const result = await new PathOptimizer(
      start,
      cutting,
      optimizerSettings,
      sequence,
      [],
      { chainCorrection: false },
    ).optimize(() => {});
    const ideal = calculatePathTime(
      start,
      result.lines,
      optimizerSettings,
      sequence,
      { chainCorrection: false },
    );
    // Its time is the exact-following time, with no corner correction in it.
    expect(result.bestTime).toBeCloseTo(ideal.totalTime, 6);
    expect(recoveries(ideal.timeline)).toHaveLength(0);
  });

  it("doesn't change the settings it was given", () => {
    const given = { ...optimizerSettings };
    new PathOptimizer(start, cutting, given, sequence, [], {
      chainCorrection: false,
    });
    expect(given).toEqual(optimizerSettings);
  });
});
