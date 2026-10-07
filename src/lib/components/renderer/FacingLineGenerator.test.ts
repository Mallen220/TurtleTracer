// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { scaleLinear } from "d3";
import {
  generateFacingLineElements,
  type PlayheadContext,
} from "./FacingLineGenerator";
import type {
  Line,
  PiecewiseSegment,
  Point,
  TimelineEvent,
} from "../../../types";

// Screen coordinates are field inches doubled, with y pointing down.
const x = scaleLinear().domain([0, 144]).range([0, 288]);
const y = scaleLinear().domain([0, 144]).range([288, 0]);

const line = (endPoint: Partial<Point>, over: Partial<Line> = {}): Line => ({
  id: "a",
  endPoint: { x: 100, y: 10, heading: "tangential", ...endPoint } as Point,
  controlPoints: [],
  color: "#ff0000",
  ...over,
});

const travel = (over: Partial<TimelineEvent> = {}): TimelineEvent => ({
  type: "travel",
  startTime: 0,
  endTime: 10,
  duration: 10,
  lineIndex: 0,
  ...over,
});

function context(over: Partial<PlayheadContext> = {}): PlayheadContext {
  return {
    x,
    y,
    timePrediction: {
      totalTime: 10,
      segmentTimes: [],
      totalDistance: 0,
      timeline: [travel()],
    },
    percent: 50,
    robotXY: { x: 20, y: 30 },
    ...over,
  };
}

const facing = (over: Partial<Point> = {}) =>
  line({ heading: "facingPoint", targetX: 60, targetY: 70, ...over } as any);

describe("generateFacingLineElements", () => {
  it("draws a line from the robot to the point it is facing, in the path's colour", () => {
    expect(generateFacingLineElements([facing()], context())).toEqual([
      { x1: 40, y1: 288 - 60, x2: 120, y2: 288 - 140, color: "#ff0000" },
    ]);
  });

  it("defaults to the middle of the field when the target isn't set, and to a blue line", () => {
    const l = facing({ targetX: undefined, targetY: undefined });
    l.color = "";
    expect(generateFacingLineElements([l], context())).toEqual([
      { x1: 40, y1: 228, x2: 144, y2: 144, color: "#60a5fa" },
    ]);
  });

  it("draws nothing for other heading modes", () => {
    const tangential = line({ heading: "tangential" });
    expect(generateFacingLineElements([tangential], context())).toEqual([]);
  });

  it("draws nothing without a robot position or a timeline", () => {
    const lines = [facing()];
    expect(
      generateFacingLineElements(lines, context({ robotXY: null })),
    ).toEqual([]);
    expect(
      generateFacingLineElements(lines, context({ timePrediction: null })),
    ).toEqual([]);
    expect(
      generateFacingLineElements(
        lines,
        context({
          timePrediction: {
            totalTime: 0,
            segmentTimes: [],
            totalDistance: 0,
            timeline: [],
          },
        }),
      ),
    ).toEqual([]);
  });

  it("draws nothing while the robot is waiting, or when the path can't be found", () => {
    const waiting: TimelineEvent = { ...travel(), type: "wait" };
    const asWait = context({
      timePrediction: {
        totalTime: 10,
        segmentTimes: [],
        totalDistance: 0,
        timeline: [waiting],
      },
    });
    expect(generateFacingLineElements([facing()], asWait)).toEqual([]);
    expect(generateFacingLineElements([], context())).toEqual([]);
  });

  it("uses the path carried by the event, which is what macros provide", () => {
    const fromEvent = facing({ targetX: 10, targetY: 10 });
    const ctx = context({
      timePrediction: {
        totalTime: 10,
        segmentTimes: [],
        totalDistance: 0,
        timeline: [travel({ line: fromEvent })],
      },
    });
    expect(generateFacingLineElements([], ctx)[0]).toMatchObject({
      x2: 20,
      y2: 288 - 20,
    });
  });

  it("uses the chain's target when a global heading applies", () => {
    const root = line(
      {},
      { globalHeading: "facingPoint", globalTargetX: 30, globalTargetY: 40 },
    );
    const ctx = context({
      timePrediction: {
        totalTime: 10,
        segmentTimes: [],
        totalDistance: 0,
        timeline: [
          travel({
            isGlobalOverride: true,
            globalHeading: "facingPoint",
            rootLine: root,
          }),
        ],
      },
    });
    // The path's own heading (tangential) is ignored in favour of the chain's.
    expect(generateFacingLineElements([line({})], ctx)).toEqual([
      { x1: 40, y1: 228, x2: 60, y2: 288 - 80, color: "#ff0000" },
    ]);
  });

  it("draws nothing when the chain's global heading isn't facingPoint", () => {
    const root = line({}, { globalHeading: "constant" });
    const ctx = context({
      timePrediction: {
        totalTime: 10,
        segmentTimes: [],
        totalDistance: 0,
        timeline: [
          travel({
            isGlobalOverride: true,
            globalHeading: "constant",
            rootLine: root,
          }),
        ],
      },
    });
    expect(generateFacingLineElements([facing()], ctx)).toEqual([]);
  });

  describe("piecewise headings", () => {
    const segments: PiecewiseSegment[] = [
      { tStart: 0, tEnd: 0.4, heading: "constant", degrees: 10 },
      {
        tStart: 0.4,
        tEnd: 1,
        heading: "facingPoint",
        targetX: 50,
        targetY: 20,
      },
    ];
    const piecewise = () => line({ heading: "piecewise", segments } as any);

    it("shows the facing line only while a facingPoint segment is active", () => {
      const at = (percent: number) =>
        generateFacingLineElements([piecewise()], context({ percent }));
      expect(at(20)).toEqual([]); // inside the constant segment
      expect(at(70)).toEqual([
        { x1: 40, y1: 228, x2: 100, y2: 288 - 40, color: "#ff0000" },
      ]);
    });

    it("defaults a segment's missing target to the middle of the field", () => {
      const l = line({
        heading: "piecewise",
        segments: [{ tStart: 0, tEnd: 1, heading: "facingPoint" }],
      } as any);
      expect(generateFacingLineElements([l], context())[0]).toMatchObject({
        x2: 144,
        y2: 144,
      });
    });

    it("takes the segments from the chain's first path when the heading is global", () => {
      const root = line(
        {},
        { globalHeading: "piecewise", globalSegments: segments },
      );
      const ctx = context({
        percent: 80,
        timePrediction: {
          totalTime: 10,
          segmentTimes: [],
          totalDistance: 0,
          timeline: [
            travel({
              isGlobalOverride: true,
              globalHeading: "piecewise",
              rootLine: root,
            }),
          ],
        },
      });
      expect(generateFacingLineElements([line({})], ctx)[0]).toMatchObject({
        x2: 100,
      });
    });

    it("shows nothing if no segment covers the current moment", () => {
      const l = line({
        heading: "piecewise",
        segments: [
          {
            tStart: 0,
            tEnd: 0.1,
            heading: "facingPoint",
            targetX: 1,
            targetY: 1,
          },
        ],
      } as any);
      expect(generateFacingLineElements([l], context({ percent: 90 }))).toEqual(
        [],
      );
    });

    it("treats an event with no duration as finished", () => {
      const l = piecewise();
      const ctx = context({
        percent: 0,
        timePrediction: {
          totalTime: 0,
          segmentTimes: [],
          totalDistance: 0,
          timeline: [travel({ startTime: 0, endTime: 0, duration: 0 })],
        },
      });
      // t is taken as 1, which falls in the last (facingPoint) segment.
      expect(generateFacingLineElements([l], ctx)).toHaveLength(1);
    });
  });
});
