// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { calculatePathTime } from "../../utils/timeCalculator";
import { computePathStatistics } from "../../utils/pathStatistics";
import { robotPoseDuring } from "../../utils/animation";
import { PathOptimizer } from "../../utils/pathOptimizer";
import { validatePath } from "../../utils/validation";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import { registerCoreUI } from "../../lib/coreRegistrations";
import type {
  Line,
  Point,
  SequenceItem,
  Settings,
  TimelineEvent,
} from "../../types";

beforeAll(() => registerCoreUI());

// More runs find more: try FUZZ_RUNS=2000. The default keeps the suite quick.
const RUNS = Number(process.env.FUZZ_RUNS ?? 80);
// A fixed seed keeps the suite repeatable; FUZZ_SEED tries others.
const SEED = Number(process.env.FUZZ_SEED ?? 20260930);

// Mostly anywhere on the field, but often right at an edge or the middle, and
// often exactly on top of another point.
const coord = fc.oneof(
  { weight: 6, arbitrary: fc.double({ min: 2, max: 142, noNaN: true }) },
  { weight: 2, arbitrary: fc.constantFrom(0, 2, 72, 142, 144) },
);
const degrees = fc.double({ min: -360, max: 360, noNaN: true });

const headingArb = fc.oneof(
  fc.record({
    heading: fc.constant("tangential" as const),
    reverse: fc.boolean(),
  }),
  fc.record({ heading: fc.constant("constant" as const), degrees }),
  fc.record({
    heading: fc.constant("linear" as const),
    startDeg: degrees,
    endDeg: degrees,
    reverse: fc.boolean(),
  }),
  fc.record({
    heading: fc.constant("facingPoint" as const),
    targetX: coord,
    targetY: coord,
  }),
  fc.record({
    heading: fc.constant("piecewise" as const),
    segments: fc.constant([
      { tStart: 0, tEnd: 0.5, heading: "tangential" as const },
      { tStart: 0.5, tEnd: 1, heading: "constant" as const, degrees: 45 },
    ]),
  }),
);

const pointArb = fc
  .tuple(coord, coord, headingArb)
  .map(([x, y, h]) => ({ x, y, ...h }) as unknown as Point);

const lineArb = fc.record({
  end: pointArb,
  controlPoints: fc.array(fc.record({ x: coord, y: coord }), { maxLength: 3 }),
  chained: fc.boolean(),
  waitBefore: fc.integer({ min: 0, max: 5 }),
  // A heading for the whole chain, set on the path that starts it.
  global: fc.oneof(
    { weight: 3, arbitrary: fc.constant(undefined) },
    fc.constant({ globalHeading: "tangential" as const }),
    fc.record({
      globalHeading: fc.constant("constant" as const),
      globalDegrees: degrees,
    }),
    fc.record({
      globalHeading: fc.constant("linear" as const),
      globalStartDeg: degrees,
      globalEndDeg: degrees,
    }),
    fc.constant({ globalHeading: "none" as const }),
  ),
  // Whether the path is inside a macro.
  inMacro: fc.boolean(),
  hidden: fc.boolean(),
});

const projectArb = fc.record({
  start: pointArb,
  lines: fc.array(lineArb, { minLength: 1, maxLength: 6 }),
});

const settingsArb = fc.record({
  maxVelocity: fc.double({ min: 2, max: 100, noNaN: true }),
  maxAcceleration: fc.double({ min: 0.5, max: 100, noNaN: true }),
  maxDeceleration: fc.oneof(
    fc.double({ min: 5, max: 100, noNaN: true }),
    fc.constant(0),
  ),
  aVelocity: fc.double({ min: 0.2, max: 8, noNaN: true }),
  xVelocity: fc.double({ min: 5, max: 80, noNaN: true }),
  yVelocity: fc.double({ min: 5, max: 80, noNaN: true }),
  pathSettleTime: fc.oneof(
    fc.double({ min: 0, max: 0.3, noNaN: true }),
    fc.constant(0),
  ),
  pedroVersion: fc.constantFrom("v3" as const, "v2" as const),
  stopToTurn: fc.boolean(),
  translationalP: fc.oneof(
    fc.double({ min: 0, max: 1.5, noNaN: true }),
    fc.constantFrom(5, 100, 1e4, 1e6),
  ),
  brakingQuadratic: fc.constantFrom(0, 0.01, 0.03),
  brakingLinear: fc.constantFrom(0, 0.1, 0.3),
  kFriction: fc.double({ min: 0, max: 1, noNaN: true }),
});

type Project = {
  start: Point;
  lines: Line[];
  sequence: SequenceItem[];
};

type ArbValue<A> = A extends fc.Arbitrary<infer T> ? T : never;

function build(p: ArbValue<typeof projectArb>): Project {
  const lines: Line[] = [];
  const sequence: SequenceItem[] = [];
  p.lines.forEach((l, i) => {
    const id = `l${i}`;
    lines.push({
      id,
      name: id,
      endPoint: l.end,
      controlPoints: l.controlPoints,
      color: "#000",
      ...(l.hidden ? { hidden: true } : {}),
      ...(l.global ?? {}),
    });
    if (l.waitBefore === 1) {
      sequence.push({ kind: "wait", id: `w${i}`, name: "w", durationMs: 300 });
    } else if (l.waitBefore === 2) {
      sequence.push({ kind: "rotate", id: `r${i}`, name: "r", degrees: 90 });
    }
    // A path chains to the one before it only if nothing sits between them.
    const chained =
      l.chained &&
      i > 0 &&
      l.waitBefore <= 2 &&
      sequence.at(-1)?.kind === "path";
    const step: SequenceItem = {
      kind: "path",
      lineId: id,
      ...(chained ? { isChain: true } : {}),
    };
    // A macro holds its own steps. A path chained to the one before it stays
    // out of one, as the first step inside a macro can't be chained.
    if (l.inMacro && !chained) {
      sequence.push({
        kind: "macro",
        id: `m${i}`,
        name: `Macro ${i}`,
        filePath: `m${i}.turt`,
        sequence: [step],
      } as SequenceItem);
    } else {
      sequence.push(step);
    }
  });
  return { start: p.start, lines, sequence };
}

const settingsOf = (over: Partial<Settings>): Settings =>
  ({ ...DEFAULT_SETTINGS, ...over }) as Settings;

function everyNumber(value: unknown, path: string, bad: string[]) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) bad.push(path);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => everyNumber(v, `${path}[${i}]`, bad));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (
        k === "line" ||
        k === "rootLine" ||
        k === "prevPoint" ||
        k === "atPoint"
      )
        continue;
      everyNumber(v, `${path}.${k}`, bad);
    }
  }
}

const motionEvents = (timeline: TimelineEvent[]) =>
  timeline.filter((e) => e.type !== "macro");

const assertProp = <T>(arb: fc.Arbitrary<T>, f: (v: T) => void) =>
  fc.assert(
    fc.property(arb, (v) => {
      f(v);
      return true;
    }),
    { numRuns: RUNS, seed: SEED },
  );

const both = fc.tuple(projectArb, settingsArb);

describe("timeline fuzzing", () => {
  it("has only finite numbers", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const result = calculatePathTime(start, lines, settingsOf(s), sequence);
      const bad: string[] = [];
      everyNumber(result.totalTime, "total", bad);
      everyNumber(result.timeline, "timeline", bad);
      expect(bad.slice(0, 3)).toEqual([]);
      expect(result.totalTime).toBeGreaterThanOrEqual(0);
    });
  });

  it("runs its events one after another", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const { timeline } = calculatePathTime(
        start,
        lines,
        settingsOf(s),
        sequence,
      );
      const events = motionEvents(timeline);
      for (let i = 1; i < events.length; i++) {
        expect(events[i].startTime).toBeCloseTo(events[i - 1].endTime, 6);
        expect(events[i].duration).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it("never moves the robot faster than its top speed", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const settings = settingsOf(s);
      const { timeline, totalTime } = calculatePathTime(
        start,
        lines,
        settings,
        sequence,
      );
      const dt = 0.02;
      let previous: { x: number; y: number } | null = null;
      for (let t = 0; t <= totalTime; t += dt) {
        const event = motionEvents(timeline).find(
          (e) => t >= e.startTime && t <= e.endTime,
        );
        if (!event) continue;
        const pose = robotPoseDuring(event, t, lines, start);
        if (!pose) continue;
        if (previous) {
          const step = Math.hypot(pose.x - previous.x, pose.y - previous.y);
          // Allow for the step across an event boundary.
          expect(step).toBeLessThan(settings.maxVelocity * dt * 1.6 + 0.3);
        }
        previous = pose;
      }
    });
  });

  it("keeps speeds within the limits", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const settings = settingsOf(s);
      const { timeline } = calculatePathTime(start, lines, settings, sequence);
      for (const e of timeline) {
        for (const v of e.velocityProfile ?? []) {
          expect(v).toBeGreaterThanOrEqual(-1e-9);
          expect(v).toBeLessThanOrEqual(settings.maxVelocity * 1.0001);
        }
        for (const v of e.trace?.speed ?? []) {
          expect(v).toBeLessThanOrEqual(settings.maxVelocity * 1.01 + 1e-6);
        }
      }
    });
  });

  it("is consistent with and without chain correction", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const { timeline, totalTime } = calculatePathTime(
        start,
        lines,
        settingsOf(s),
        sequence,
        { chainCorrection: false },
      );
      expect(timeline.some((e) => e.type === "recovery")).toBe(false);
      expect(Number.isFinite(totalTime)).toBe(true);
    });
  });

  it("gives statistics that add up", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const settings = settingsOf(s);
      const stats = computePathStatistics(start, lines, sequence, settings);
      const bad: string[] = [];
      everyNumber(stats.segments, "segments", bad);
      everyNumber(stats.velocityData, "velocityData", bad);
      everyNumber(
        stats.insights.map((i) => [i.startTime, i.endTime ?? 0, i.value ?? 0]),
        "insights",
        bad,
      );
      expect(bad.slice(0, 3)).toEqual([]);
      const sum = stats.segments.reduce((total, seg) => total + seg.time, 0);
      expect(sum).toBeCloseTo(stats.totalTime, 5);
    });
  });

  it("heads smoothly: the robot never turns faster than it can", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const settings = settingsOf(s);
      const { timeline, totalTime } = calculatePathTime(
        start,
        lines,
        settings,
        sequence,
      );
      const dt = 0.02;
      const turnRate = (Math.max(settings.aVelocity, 0.001) * 180) / Math.PI;
      let previous: number | null = null;
      for (let t = 0; t <= totalTime; t += dt) {
        const event = motionEvents(timeline).find(
          (e) => t >= e.startTime && t <= e.endTime,
        );
        const pose = event && robotPoseDuring(event, t, lines, start);
        if (!pose) continue;
        if (previous !== null) {
          let turned = Math.abs(((pose.heading - previous + 540) % 360) - 180);
          if (Number.isNaN(turned)) turned = Infinity;
          // Generous: speed-ups in a turn's trapezoid and the step across an
          // event boundary can exceed the plain rate for a frame.
          expect(turned).toBeLessThanOrEqual(turnRate * dt * 3 + 2 + 1e-6);
        }
        previous = pose.heading;
      }
    });
  });

  it("never speeds up or slows down faster than the limits", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const settings = settingsOf(s);
      const accel = settings.maxAcceleration;
      // With braking coefficients, braking follows those rather than the max.
      const decel =
        settings.brakingQuadratic || settings.brakingLinear
          ? Infinity
          : settings.maxDeceleration || settings.maxAcceleration;
      const { timeline } = calculatePathTime(start, lines, settings, sequence);
      for (const e of timeline) {
        const v = e.velocityProfile;
        const t = e.motionProfile;
        if (!v || !t) continue;
        for (let i = 0; i < v.length - 1; i++) {
          const dt = t[i + 1] - t[i];
          // Steps skipped by a robot joining part way along take no time.
          if (dt < 1e-6) continue;
          const change = (v[i + 1] - v[i]) / dt;
          expect(change).toBeLessThan(accel * 1.15 + 1e-3);
          expect(-change).toBeLessThan(decel * 1.15 + 1e-3);
        }
      }
    });
  });

  it("stops at the end of every path that isn't handed over", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const { timeline } = calculatePathTime(
        start,
        lines,
        settingsOf(s),
        sequence,
      );
      const motion = motionEvents(timeline);
      motion.forEach((e, i) => {
        if (e.type !== "travel" || !e.velocityProfile) return;
        const next = motion[i + 1];
        const handsOver = next?.type === "recovery";
        const chainedOn =
          next?.type === "travel" &&
          next.velocityProfile &&
          next.velocityProfile[next.motionProfile!.findIndex((t) => t >= 0)] >
            1e-6;
        if (!handsOver && !chainedOn) {
          expect(e.velocityProfile.at(-1)!).toBeLessThan(1e-6);
        }
      });
    });
  });

  it("drives every path in the sequence once", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const { timeline } = calculatePathTime(
        start,
        lines,
        settingsOf(s),
        sequence,
      );
      const drives = timeline
        .filter((e) => e.type === "travel")
        .map((e) => e.lineIndex);
      expect(drives).toEqual(lines.map((_, i) => i));
    });
  });

  it("keeps recoveries believable", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const settings = settingsOf(s);
      const { timeline } = calculatePathTime(start, lines, settings, sequence);
      for (const e of timeline) {
        if (e.type !== "recovery") continue;
        const { time, x, y, speed, heading } = e.trace!;
        expect(heading).toHaveLength(time.length);
        expect(e.duration).toBeCloseTo(time.at(-1)!, 6);
        // The robot can't get further than its top speed allows.
        const travelled = Math.hypot(x.at(-1)! - x[0], y.at(-1)! - y[0]);
        expect(travelled).toBeLessThanOrEqual(
          settings.maxVelocity * e.duration * 1.05 + 1,
        );
        expect(Math.max(...speed)).toBeLessThanOrEqual(
          settings.maxVelocity * 1.01 + 1e-6,
        );
        expect(e.missedBy).toBeGreaterThanOrEqual(0);
        expect(e.overshoot).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it("gives the same answer however often, and in whatever order, it is asked", () => {
    assertProp(fc.tuple(both, both), ([[p1, s1], [p2, s2]]) => {
      const a = build(p1);
      const b = build(p2);
      const first = calculatePathTime(
        a.start,
        a.lines,
        settingsOf(s1),
        a.sequence,
      ).totalTime;
      calculatePathTime(b.start, b.lines, settingsOf(s2), b.sequence);
      const again = calculatePathTime(
        a.start,
        a.lines,
        settingsOf(s1),
        a.sequence,
      ).totalTime;
      expect(again).toBe(first);
    });
  });

  it("doesn't change what it's given", () => {
    assertProp(both, ([p, s]) => {
      const { start, lines, sequence } = build(p);
      const settings = settingsOf(s);
      const before = JSON.stringify([start, lines, sequence, settings]);
      calculatePathTime(start, lines, settings, sequence);
      computePathStatistics(start, lines, sequence, settings);
      expect(JSON.stringify([start, lines, sequence, settings])).toBe(before);
    });
  });

  it("can be validated and optimized without breaking", async () => {
    const shape = {
      id: "s",
      name: "s",
      type: "obstacle" as const,
      vertices: [
        { x: 60, y: 60 },
        { x: 80, y: 60 },
        { x: 80, y: 80 },
        { x: 60, y: 80 },
      ],
      color: "#000",
      fillColor: "#f00",
    };
    await fc.assert(
      fc.asyncProperty(both, async ([p, s]) => {
        const { start, lines, sequence } = build(p);
        const settings = {
          ...settingsOf(s),
          optimizationIterations: 3,
          optimizationPopulationSize: 6,
        };
        validatePath(start, lines, settings, sequence, [shape], true);
        const result = await new PathOptimizer(
          start,
          lines,
          settings,
          sequence,
          [shape],
        ).optimize(() => {});
        expect(result.lines).toHaveLength(lines.length);
        // Fixed points stay where they were.
        result.lines.forEach((l, i) => {
          expect(l.endPoint.x).toBe(lines[i].endPoint.x);
          expect(l.endPoint.y).toBe(lines[i].endPoint.y);
        });
        expect(Number.isFinite(result.bestTime)).toBe(true);
      }),
      { numRuns: Math.max(20, Math.floor(RUNS / 2)), seed: SEED },
    );
  }, 120000);
});

// Projects a user's file might hold after hand edits or older versions: the
// same id used twice, steps for paths that are gone, paths with no heading or
// no control points. None of this has to look sensible, only not break.
describe("timeline fuzzing with damaged projects", () => {
  const damaged = fc.record({
    project: projectArb,
    sameIdAs: fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 3 }),
    noHeading: fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 2 }),
    strayStep: fc.boolean(),
    chainFirst: fc.boolean(),
  });

  const damage = (d: ArbValue<typeof damaged>) => {
    const { start, lines, sequence } = build(d.project);
    d.sameIdAs.forEach((n, k) => {
      const target = lines[Math.min(n, lines.length - 1)];
      const copy = lines[Math.min(k + 1, lines.length - 1)];
      if (copy !== target) copy.id = target.id;
    });
    for (const n of d.noHeading) {
      const line = lines[Math.min(n, lines.length - 1)];
      delete (line.endPoint as { heading?: string }).heading;
    }
    if (d.strayStep) sequence.splice(1, 0, { kind: "path", lineId: "gone" });
    // The very first step has nothing to be chained to.
    if (d.chainFirst && sequence[0]?.kind === "path")
      sequence[0].isChain = true;
    return { start, lines, sequence };
  };

  it("doesn't throw, and stays finite", () => {
    assertProp(fc.tuple(damaged, settingsArb), ([d, s]) => {
      const { start, lines, sequence } = damage(d);
      const settings = settingsOf(s);
      const result = calculatePathTime(start, lines, settings, sequence);
      const bad: string[] = [];
      everyNumber(result.totalTime, "total", bad);
      everyNumber(result.timeline, "timeline", bad);
      expect(bad.slice(0, 3)).toEqual([]);
      const stats = computePathStatistics(start, lines, sequence, settings);
      everyNumber(stats.segments, "segments", bad);
      expect(bad.slice(0, 3)).toEqual([]);
      validatePath(start, lines, settings, sequence, [], true);
    });
  });
});
