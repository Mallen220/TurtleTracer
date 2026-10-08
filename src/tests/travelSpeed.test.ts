// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator/pathCalculator";
import { travelSpeeds } from "../utils/timeCalculator/travelSpeed";
import { getCurvePoint } from "../utils/math";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { buildStandardPathElements } from "../lib/components/renderer/FieldPathLayer";
import { calculateVelocityTooltip } from "../lib/components/renderer/VelocityTooltipCalculator";
import type {
  BasePoint,
  Line,
  Point,
  Settings,
  TimelineEvent,
  TimePrediction,
} from "../types";

const settings = {
  ...DEFAULT_SETTINGS,
  maxVelocity: 40,
  maxAcceleration: 30,
  maxDeceleration: 30,
} as Settings;
const start: Point = { x: 0, y: 72, heading: "constant", degrees: 0 } as Point;
const straight = (id: string, x: number): Line =>
  ({
    id,
    color: "#ff0000",
    endPoint: { x, y: 72, heading: "constant", degrees: 0 },
    controlPoints: [],
  }) as Line;

/** The travel event for each line, timed by the simulation. */
function simulate(lines: Line[]) {
  const { timeline } = calculatePathTime(start, lines, settings);
  return timeline.filter((e) => e.type === "travel");
}

const curveOf = (event: TimelineEvent): BasePoint[] => [
  event.prevPoint!,
  ...event.line!.controlPoints,
  event.line!.endPoint,
];

describe("travelSpeeds", () => {
  it("matches the physics on a straight drive from rest to rest", () => {
    // 72": speed up for 26.7", cruise at 40 in/s, brake for the last 26.7".
    const [event] = simulate([straight("a", 72)]);
    const speedAt = travelSpeeds(event!, curveOf(event!))!;
    const exact = (s: number) =>
      Math.min(40, Math.sqrt(2 * 30 * s), Math.sqrt(2 * 30 * (72 - s)));
    // The simulation splits a straight path into 10 steps and takes the one
    // where the robot reaches top speed as a steady 36 to 40 in/s, so it's
    // up to about 1 in/s under there; elsewhere it's exact.
    for (let i = 0; i < 100; i++) {
      const t = (i + 0.5) / 100;
      const reachesTop = (t > 0.3 && t < 0.4) || (t > 0.6 && t < 0.7);
      expect(Math.abs(speedAt(t) - exact(t * 72))).toBeLessThan(
        reachesTop ? 1.1 : 0.01,
      );
    }
    // Moving from the start: 3.6" in, it's already doing 14.7 in/s.
    expect(speedAt(0.05)).toBeCloseTo(14.7, 1);
  });

  it("gives speeds that take the time the simulation says", () => {
    const curved: Line = {
      id: "c",
      color: "#ff0000",
      endPoint: { x: 60, y: 120, heading: "tangential" },
      controlPoints: [{ x: 70, y: 70 }],
    } as Line;
    const [event] = simulate([curved]);
    const curve = curveOf(event!);
    const speedAt = travelSpeeds(event!, curve)!;
    const times = event!.motionProfile!;
    const steps = times.length - 1;
    // Each step driven at these speeds, measured finely, against its time.
    // (The first and last steps start or end at a standstill.)
    for (let k = 1; k < steps - 1; k++) {
      let time = 0;
      const pieces = 200;
      for (let j = 0; j < pieces; j++) {
        const a = (k + j / pieces) / steps;
        const b = (k + (j + 1) / pieces) / steps;
        const pa = getCurvePoint(a, curve);
        const pb = getCurvePoint(b, curve);
        time += Math.hypot(pb.x - pa.x, pb.y - pa.y) / speedAt((a + b) / 2);
      }
      expect(time / (times[k + 1]! - times[k]!)).toBeCloseTo(1, 3);
    }
  });

  it("shows a step slowed for a turn at the speed it's driven", () => {
    // 10" in 1 s, though its ends would allow 20 in/s.
    const event = {
      type: "travel",
      velocityProfile: [20, 20],
      motionProfile: [0, 1],
    } as TimelineEvent;
    const speedAt = travelSpeeds(event, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])!;
    expect(speedAt(0.5)).toBeCloseTo(10);
  });

  it("has nothing to say without speeds", () => {
    const event = {
      type: "travel",
      startTime: 0,
      endTime: 1,
      duration: 1,
      velocityProfile: [] as number[],
    } as TimelineEvent;
    expect(travelSpeeds(event, [{ x: 0, y: 0 }])).toBeNull();
  });
});

describe("the heatmap and tooltip show the simulated speed", () => {
  const line = straight("a", 72);
  const [event] = simulate([line]);
  const timeline = [event!] as TimePrediction["timeline"];
  const speedAt = travelSpeeds(event!, curveOf(event!))!;
  const scale = (v: number) => v;
  const ctx = {
    x: scale,
    y: scale,
    uiLength: scale,
    settings: { ...settings, showVelocityHeatmap: true },
    dimmedIds: [],
  } as any;

  it("colours a drive from rest by its speed from the start", () => {
    const elements = buildStandardPathElements({
      effectiveTimePrediction: { timeline } as TimePrediction,
      lines: [line],
      sequencedLines: [line],
      startPoint: start,
      isDiffMode: false,
      selectedLineId: null,
      ctx,
    });
    const hues = elements.map((e) =>
      Number(/hsl\((\d+)/.exec(String(e.stroke))![1]),
    );
    // Not the green of standing still for the first tenth of the path.
    expect(hues[0]).toBeLessThan(120);
    // Every colour is the speed somewhere along the path.
    const expected = new Set(
      Array.from({ length: 100 }, (_, i) =>
        Math.round(120 - (speedAt((i + 0.5) / 100) / 40) * 120),
      ),
    );
    for (const hue of hues) expect(expected.has(hue)).toBe(true);
    // Full speed in the middle.
    expect(hues).toContain(0);
  });

  it("says the same speed in the tooltip", () => {
    const result = calculateVelocityTooltip({
      rawInchX: 9,
      rawInchY: 72,
      lines: [line],
      startPoint: start,
      timeline,
      clientX: 0,
      clientY: 0,
    });
    // The tooltip snaps to the nearest point it finds on the path.
    expect(result.velocity).toBeCloseTo(speedAt(9 / 72), 1);
    expect(result.velocity).toBeCloseTo(Math.sqrt(2 * 30 * 9), 0);
  });
});
