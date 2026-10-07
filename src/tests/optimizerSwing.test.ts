// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { PathOptimizer } from "../utils/pathOptimizer";
import { calculatePathTime } from "../utils/timeCalculator";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings, Shape } from "../types";

beforeAll(() => registerCoreUI());

const settings = {
  ...DEFAULT_SETTINGS,
  optimizationIterations: 5,
  optimizationPopulationSize: 10,
} as Settings;

const start = { x: 30, y: 30, heading: "constant", degrees: 90 } as Point;

const line = (id: string, x: number, y: number, locked = false): Line => ({
  id,
  name: id,
  endPoint: { x, y, heading: "constant", degrees: 90 } as Point,
  controlPoints: [],
  color: "#0af",
  locked,
});

const chain: SequenceItem[] = [
  { kind: "path", lineId: "out" },
  { kind: "path", lineId: "up", isChain: true },
];

// A chain whose quarter turn sits against the right edge of the field: the
// robot carries on past the second path and leaves the field.
const nearEdge = (locked: boolean) => [
  line("out", 130, 30, locked),
  line("up", 130, 100, locked),
];
// The same chain well inside the field.
const inside = (locked: boolean) => [
  line("out", 70, 30, locked),
  line("up", 70, 100, locked),
];

const wall: Shape = {
  id: "wall",
  name: "Wall",
  type: "obstacle",
  vertices: [
    { x: 60, y: 20 },
    { x: 64, y: 20 },
    { x: 64, y: 40 },
    { x: 60, y: 40 },
  ],
  color: "#000",
  fillColor: "#f00",
} as Shape;

const optimizer = (lines: Line[], shapes: Shape[] = []) =>
  new PathOptimizer(start, lines, settings, chain, shapes);

describe("optimizing a path whose swing at a chained corner hits something", () => {
  it("marks those collisions as happening off the path", () => {
    const lines = nearEdge(true);
    const { timeline } = calculatePathTime(start, lines, settings, chain);
    const markers = optimizer(lines).getCollisions(timeline, lines);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((m) => m.offPath)).toBe(true);
    expect(markers.every((m) => m.type === "boundary")).toBe(true);
  });

  it("doesn't mark collisions on the path itself as off the path", () => {
    const lines = nearEdge(false);
    const { timeline } = calculatePathTime(start, lines, settings, chain);
    const markers = optimizer(lines, [wall]).getCollisions(timeline, lines);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.some((m) => !m.offPath)).toBe(true);
  });

  it("still returns the path, with its real time, instead of failing", async () => {
    const lines = nearEdge(true);
    const result = await optimizer(lines).optimize(() => {});
    expect(result.error).toBeUndefined();
    expect(result.bestTime).toBeLessThan(10000);
    expect(result.bestTime).toBeCloseTo(
      calculatePathTime(start, lines, settings, chain).totalTime,
      6,
    );
  });

  it("still fails when the path itself collides", async () => {
    const lines = nearEdge(true);
    const result = await optimizer(lines, [wall]).optimize(() => {});
    expect(result.bestTime).toBeGreaterThanOrEqual(10000);
  });

  it("still optimizes a chain with a sharp corner", async () => {
    const result = await optimizer(inside(false)).optimize(() => {});
    expect(result.bestTime).toBeLessThan(10000);
    expect(result.lines).toHaveLength(2);
  });
});
