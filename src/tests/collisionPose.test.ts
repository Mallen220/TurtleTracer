// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { PathOptimizer } from "../utils/pathOptimizer";
import { polygonsOverlap } from "../utils/geometry";
import { calculatePathTime } from "../utils/timeCalculator";
import { calculateRobotState } from "../utils/animation";
import { generateCollisionElements } from "../lib/components/renderer/CollisionMarkerGenerator";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line, Point, Settings, Shape, TimelineEvent } from "../types";
import * as d3 from "d3";

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  rLength: 30,
  rWidth: 10,
  safetyMargin: 0,
  validateFieldBoundaries: false,
};
const start: Point = { x: 20, y: 20, heading: "constant", degrees: 0 };

// A small square 10 inches up and right of (72, 72).
const obstacle: Shape = {
  id: "o",
  name: "o",
  type: "obstacle",
  color: "#f00",
  fillColor: "#f00",
  vertices: [
    { x: 81, y: 81 },
    { x: 83, y: 81 },
    { x: 83, y: 83 },
    { x: 81, y: 83 },
  ],
} as Shape;

const parkedAt = (heading: number): TimelineEvent[] => [
  {
    type: "wait",
    duration: 1,
    startTime: 0,
    endTime: 1,
    atPoint: { x: 72, y: 72, heading: "constant", degrees: heading },
    startHeading: heading,
    targetHeading: heading,
  } as TimelineEvent,
];

describe("collision checking uses the robot's real pose", () => {
  it("points a long robot the right way when checking obstacles", () => {
    const optimizer = new PathOptimizer(start, [], settings, [], [obstacle]);
    // At 45 degrees the robot's length reaches the obstacle; at -45 it doesn't.
    expect(optimizer.getCollisions(parkedAt(45), [])).toHaveLength(1);
    expect(optimizer.getCollisions(parkedAt(-45), [])).toHaveLength(0);
  });

  it("puts the robot where the animation shows it", () => {
    const lines: Line[] = [
      {
        id: "a",
        endPoint: { x: 120, y: 90, heading: "linear", startDeg: 0, endDeg: 90 },
        controlPoints: [{ x: 60, y: 110 }],
        color: "#fff",
      },
    ];
    const { timeline, totalTime } = calculatePathTime(start, lines, settings, [
      { kind: "path", lineId: "a" },
    ]);
    // A thin obstacle across the path; report where the robot first hits it.
    const wall: Shape = {
      ...obstacle,
      vertices: [
        { x: 70, y: 0 },
        { x: 71, y: 0 },
        { x: 71, y: 144 },
        { x: 70, y: 144 },
      ],
    };
    const optimizer = new PathOptimizer(start, lines, settings, [], [wall]);
    const [hit] = optimizer.getCollisions(timeline, lines);
    expect(hit).toBeDefined();

    const identity = d3.scaleLinear();
    const shown = calculateRobotState(
      (hit.time / totalTime) * 100,
      timeline,
      lines,
      start,
      identity,
      identity,
    );
    expect(hit.x).toBeCloseTo(shown.x, 6);
    expect(hit.y).toBeCloseTo(shown.y, 6);
  });
});

describe("collision ranges on the field", () => {
  it("highlight the stretch of path the robot covered in that time", () => {
    // 4 seconds for 10 inches, with the first half taking 3 of them.
    const line: Line = {
      id: "l",
      color: "#fff",
      endPoint: { x: 10, y: 0, heading: "constant", degrees: 0 },
      controlPoints: [],
    };
    const origin: Point = { x: 0, y: 0, heading: "constant", degrees: 0 };
    const travel: TimelineEvent = {
      type: "travel",
      lineIndex: 0,
      line,
      prevPoint: origin,
      startTime: 0,
      endTime: 4,
      duration: 4,
      motionProfile: [0, 3, 4],
    };
    const identity = d3.scaleLinear();
    const [group] = generateCollisionElements(
      [{ x: 0, y: 0, time: 0, endTime: 3 }],
      [line],
      origin,
      {
        timeline: [travel],
        totalTime: 4,
        segmentTimes: [4],
        totalDistance: 10,
      },
      { x: identity, y: identity, uiLength: (v) => v },
    );

    const path = group.children[0] as unknown as { vertices: { x: number }[] };
    expect(path.vertices.at(-1)!.x).toBeCloseTo(5);
  });
});

describe("polygonsOverlap", () => {
  const square = (x: number, y: number, size: number) => [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];

  it("sees a thin wall crossing the middle of a box", () => {
    const wall = [
      { x: 4.5, y: -10 },
      { x: 5.5, y: -10 },
      { x: 5.5, y: 20 },
      { x: 4.5, y: 20 },
    ];
    expect(polygonsOverlap(square(0, 0, 10), wall)).toBe(true);
  });

  it("sees one polygon inside another, and separate ones apart", () => {
    expect(polygonsOverlap(square(0, 0, 10), square(2, 2, 1))).toBe(true);
    expect(polygonsOverlap(square(0, 0, 10), square(20, 20, 5))).toBe(false);
  });
});
