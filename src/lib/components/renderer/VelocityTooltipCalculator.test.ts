// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { calculateVelocityTooltip } from "./VelocityTooltipCalculator";
import type { Line, Point, TimelineEvent } from "../../../types";

describe("VelocityTooltipCalculator", () => {
  const startPoint: Point = { x: 0, y: 0, heading: "tangential" };
  const lines: Line[] = [
    {
      id: "line-1",
      color: "#ff0000",
      endPoint: { x: 10, y: 0, heading: "tangential" },
      controlPoints: [],
    },
  ];

  it("returns visible: false when timeline is missing or empty", () => {
    expect(
      calculateVelocityTooltip({
        rawInchX: 5,
        rawInchY: 0,
        lines,
        startPoint,
        timeline: [],
        clientX: 100,
        clientY: 200,
      }),
    ).toEqual({ visible: false });

    expect(
      calculateVelocityTooltip({
        rawInchX: 5,
        rawInchY: 0,
        lines,
        startPoint,
        timeline: undefined,
        clientX: 100,
        clientY: 200,
      }),
    ).toEqual({ visible: false });
  });

  it("returns visible: false when point is too far from line (snapThreshold)", () => {
    const timeline = [
      {
        type: "travel",
        lineIndex: 0,
        startTime: 0,
        duration: 2,
        velocityProfile: [10, 20, 30],
      },
    ] as TimelineEvent[];

    const result = calculateVelocityTooltip({
      rawInchX: 5,
      rawInchY: 10, // 10 inches away, well beyond 0.5 snap threshold
      lines,
      startPoint,
      timeline,
      clientX: 100,
      clientY: 200,
      snapThreshold: 0.5,
    });

    expect(result.visible).toBe(false);
  });

  it("calculates tooltip values when close to line", () => {
    const timeline = [
      {
        type: "travel",
        lineIndex: 0,
        startTime: 1,
        duration: 2,
        velocityProfile: [10, 20, 30],
      },
    ] as TimelineEvent[];

    // Midpoint: (5, 0.1) is 0.1 inch away from y=0
    const result = calculateVelocityTooltip({
      rawInchX: 5,
      rawInchY: 0.1,
      lines,
      startPoint,
      timeline,
      clientX: 150,
      clientY: 250,
      snapThreshold: 0.5,
    });

    expect(result.visible).toBe(true);
    expect(result.x).toBe(150);
    expect(result.y).toBe(250);
    expect(result.velocity).toBe(20);
    expect(result.time).toBeCloseTo(2); // 1 + 0.5 * 2 = 2
    expect(result.distance).toBeCloseTo(5); // 0 + 10 * 0.5 = 5
  });

  it("measures earlier curved paths along the curve, not straight across", () => {
    // A half-loop out to y=20 and back: ends 20" from where it started but
    // is much longer than that.
    const curved: Line[] = [
      {
        id: "curve",
        color: "#f00",
        endPoint: { x: 20, y: 0, heading: "tangential" },
        controlPoints: [
          { x: 0, y: 20 },
          { x: 20, y: 20 },
        ],
      },
      {
        id: "straight",
        color: "#f00",
        endPoint: { x: 30, y: 0, heading: "tangential" },
        controlPoints: [],
      },
    ];
    const timeline = [
      {
        type: "travel",
        lineIndex: 0,
        startTime: 0,
        endTime: 2,
        duration: 2,
        velocityProfile: [1, 1],
      },
      {
        type: "travel",
        lineIndex: 1,
        startTime: 2,
        endTime: 3,
        duration: 1,
        velocityProfile: [1, 1],
      },
    ] as TimelineEvent[];

    const result = calculateVelocityTooltip({
      rawInchX: 25,
      rawInchY: 0,
      lines: curved,
      startPoint,
      timeline,
      clientX: 0,
      clientY: 0,
    });

    expect(result.visible).toBe(true);
    // 40" around the curve plus 5" into the straight; straight across
    // would give 20 + 5.
    expect(result.distance).toBeCloseTo(45, 0);
  });

  it("reads the time from the motion profile, so it matches playback", () => {
    // Slow start: the robot needs 3 of its 4 seconds for the first half.
    const timeline = [
      {
        type: "travel",
        lineIndex: 0,
        startTime: 1,
        endTime: 5,
        duration: 4,
        velocityProfile: [0, 5, 10],
        motionProfile: [0, 3, 4],
      },
    ] as TimelineEvent[];

    const result = calculateVelocityTooltip({
      rawInchX: 5,
      rawInchY: 0,
      lines,
      startPoint,
      timeline,
      clientX: 0,
      clientY: 0,
    });

    expect(result.time).toBeCloseTo(4);
  });
  describe("where the robot doesn't drive a path", () => {
    const at = (rawInchX: number, timeline: TimelineEvent[]) =>
      calculateVelocityTooltip({
        rawInchX,
        rawInchY: 0,
        lines,
        startPoint,
        timeline,
        clientX: 0,
        clientY: 0,
      });
    const travel = (extra: Partial<TimelineEvent>) =>
      ({
        type: "travel",
        lineIndex: 0,
        startTime: 0,
        endTime: 2,
        duration: 2,
        velocityProfile: [10, 20, 30],
        ...extra,
      }) as TimelineEvent;

    it("shows nothing on the end of a path handed over early", () => {
      const timeline = [travel({ drivenFrom: 0, drivenTo: 0.6 })];
      expect(at(5, timeline).visible).toBe(true);
      expect(at(8, timeline)).toEqual({ visible: false });
    });

    it("shows nothing on the start of a path picked up after a swing", () => {
      const timeline = [travel({ drivenFrom: 0.4, drivenTo: 1 })];
      expect(at(2, timeline)).toEqual({ visible: false });
      expect(at(8, timeline).visible).toBe(true);
    });

    it("counts the distance only from where the path is picked up", () => {
      const timeline = [travel({ drivenFrom: 0.4, drivenTo: 1 })];
      expect(at(5, timeline).distance).toBeCloseTo(1);
    });

    it("counts the route of a swing as distance for the paths after it", () => {
      const swing = {
        type: "recovery",
        lineIndex: 0,
        startTime: 0,
        endTime: 1,
        duration: 1,
        trace: {
          time: [0, 1],
          x: [0, 3],
          y: [0, 4],
          speed: [0, 0],
          heading: [0, 0],
        },
      } as TimelineEvent;
      const after = travel({ startTime: 1, endTime: 3 });
      expect(at(5, [swing, after]).distance).toBeCloseTo(5 + 5);
    });
  });
});
