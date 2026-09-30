// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { computePathStatistics } from "./pathStatistics";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem } from "../types";

beforeAll(() => registerCoreUI());

const start: Point = { x: 10, y: 10, heading: "tangential" };
const straight: Line = {
  id: "a",
  name: "Out",
  endPoint: { x: 130, y: 10, heading: "tangential" },
  controlPoints: [],
  color: "#f00",
};

describe("computePathStatistics", () => {
  it("lists a row per path and wait with matching totals", () => {
    const sequence: SequenceItem[] = [
      { kind: "path", lineId: "a" },
      { kind: "wait", id: "w", name: "Hold", durationMs: 500 },
    ];
    const stats = computePathStatistics(start, [straight], sequence, {
      ...DEFAULT_SETTINGS,
    });

    expect(stats.segments.map((s) => s.name)).toEqual(["Out", "Hold"]);
    expect(stats.segments[0].length).toBeCloseTo(120);
    expect(stats.segments[1].time).toBeCloseTo(0.5);
    const segmentTime = stats.segments.reduce((sum, s) => sum + s.time, 0);
    expect(segmentTime).toBeCloseTo(stats.totalTime);
  });

  it("reports one insight for each stretch at top speed", () => {
    const stats = computePathStatistics(
      start,
      [straight],
      [{ kind: "path", lineId: "a" }],
      { ...DEFAULT_SETTINGS },
    );
    const topSpeed = stats.insights.filter(
      (i) => i.message === "Max Velocity Reached",
    );
    expect(topSpeed).toHaveLength(1);
    expect(topSpeed[0].endTime!).toBeGreaterThan(topSpeed[0].startTime);
  });
});

describe("computePathStatistics details", () => {
  const settings = { ...DEFAULT_SETTINGS };
  const line = (
    id: string,
    endPoint: Partial<Point>,
    over: Partial<Line> = {},
  ): Line => ({
    id,
    endPoint: { heading: "tangential", ...endPoint } as Point,
    controlPoints: [],
    color: "#00f",
    ...over,
  });
  const steps = (...ids: string[]): SequenceItem[] =>
    ids.map((lineId) => ({ kind: "path", lineId }));

  it("names unnamed paths by their position", () => {
    const stats = computePathStatistics(
      start,
      [line("a", { x: 60, y: 10 }), line("b", { x: 60, y: 60 })],
      steps("a", "b"),
      settings,
    );
    expect(stats.segments.map((s) => s.name)).toEqual(["Path 1", "Path 2"]);
  });

  it("skips steps that refer to paths that don't exist", () => {
    const stats = computePathStatistics(
      start,
      [straight],
      steps("missing", "a"),
      settings,
    );
    expect(stats.segments.map((s) => s.name)).toEqual(["Out"]);
  });

  it("warns of wheel slip on a fast curve, and not without friction", () => {
    const sweeper = line(
      "a",
      { x: 130, y: 100 },
      {
        controlPoints: [{ x: 100, y: 10 } as Point, { x: 130, y: 40 } as Point],
      },
    );
    const fast = {
      ...settings,
      maxVelocity: 80,
      maxAcceleration: 80,
      kFriction: 0.1,
    };
    const withFriction = computePathStatistics(
      start,
      [sweeper],
      steps("a"),
      fast,
    );
    const slip = withFriction.insights.filter((i) =>
      i.message.includes("Wheel Slip"),
    );
    expect(slip.length).toBeGreaterThan(0);
    expect(slip[0]).toMatchObject({ type: "error" });
    expect(slip[0].value).toBeGreaterThan(0.1 * 386.22);
    expect(slip[0].endTime!).toBeGreaterThan(slip[0].startTime);

    const noFriction = computePathStatistics(start, [sweeper], steps("a"), {
      ...fast,
      kFriction: 0,
    });
    expect(
      noFriction.insights.filter((i) => i.message.includes("Wheel Slip")),
    ).toEqual([]);
  });

  it("graphs a turn in place between two paths as angular speed with no linear speed", () => {
    // East, then north: the robot must stop and turn 90 degrees between them.
    const stats = computePathStatistics(
      start,
      [line("a", { x: 60, y: 10 }), line("b", { x: 60, y: 60 })],
      steps("a", "b"),
      settings,
    );
    const turning = stats.angularVelocityData.filter(
      (p, i) => p.value > 0 && stats.velocityData[i].value === 0,
    );
    expect(turning.length).toBeGreaterThan(0);
    // The turn isn't one of the path rows, so its time is what's left over.
    const turnTime =
      stats.totalTime - stats.segments.reduce((sum, row) => sum + row.time, 0);
    expect(turnTime).toBeGreaterThan(0);
    // A quarter turn (pi/2 radians) spread evenly over that time.
    expect(turning[0].value).toBeCloseTo(Math.PI / 2 / turnTime, 3);
  });

  it("reports rotations with the angle turned and waits with their duration", () => {
    const stats = computePathStatistics(
      { ...start, heading: "constant", degrees: 0 } as Point,
      [],
      [
        { kind: "rotate", id: "r", name: "", degrees: 90 },
        { kind: "wait", id: "w", name: "", durationMs: 250 },
      ],
      settings,
    );
    const [turn, pause] = stats.segments;
    expect(turn).toMatchObject({ name: "Rotate", length: 0, maxVel: 0 });
    expect(turn.degrees).toBeCloseTo(90);
    expect(turn.maxAngVel).toBeCloseTo(((Math.PI / 2) * 1) / turn.time, 5);
    expect(pause).toMatchObject({ name: "Wait", time: 0.25, degrees: 0 });
    expect(stats.maxAngularVelocity).toBe(0); // only paths count towards the maxima
  });

  it("assumes constant speed when motion profiling is off", () => {
    const { maxVelocity: _v, maxAcceleration: _a, ...noProfile } = settings;
    const stats = computePathStatistics(
      start,
      [straight],
      steps("a"),
      noProfile as typeof settings,
    );
    const [segment] = stats.segments;
    expect(segment.length).toBeCloseTo(120);
    expect(segment.maxVel).toBeCloseTo(segment.length / segment.time);
    expect(segment.degrees).toBeCloseTo(0);
    expect(stats.maxLinearVelocity).toBeCloseTo(segment.maxVel);
    // Flat graph: two points at the same speed.
    expect(stats.velocityData.filter((p) => p.value > 0)).toHaveLength(2);
  });

  it("reports the top speed and distance for the whole path", () => {
    const stats = computePathStatistics(
      start,
      [straight],
      steps("a"),
      settings,
    );
    expect(stats.totalDistance).toBeCloseTo(120);
    expect(stats.maxLinearVelocity).toBeGreaterThan(0);
    expect(stats.maxLinearVelocity).toBeLessThanOrEqual(
      settings.maxVelocity! * 1.01,
    );
    expect(stats.velocityData[0]).toEqual({ time: 0, value: 0 });
    expect(stats.accelerationData.length).toBe(stats.velocityData.length);
  });
});
