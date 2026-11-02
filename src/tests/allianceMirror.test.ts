// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Mirroring a project for the preview matches TurtleTracerLib's FieldMirror.
import { describe, it, expect } from "vitest";
import {
  mirrorDegrees,
  mirrorLine,
  mirrorPoint,
  mirrorRobotHeading,
  type FieldMirror,
} from "../utils/allianceMirror";
import type { Line, Point } from "../types";

const field = (axes: FieldMirror["axes"]): FieldMirror => ({
  axes,
  width: 144,
  height: 144,
});

describe("headings", () => {
  it("match FieldMirror for each axis", () => {
    expect(mirrorDegrees(30, field("BOTH"))).toBe(-150);
    expect(mirrorDegrees(30, field("X"))).toBe(150);
    expect(mirrorDegrees(30, field("Y"))).toBe(-30);
    expect(mirrorDegrees(90, field("BOTH"))).toBe(-90);
  });

  it("mirror the playback robot, whose heading is the negative of the field's", () => {
    // Field heading 30° is stored as -30 for drawing; mirrored (X) it's 150°.
    expect(mirrorRobotHeading(-30, field("X"))).toBe(-150);
    expect(mirrorRobotHeading(-30, field("BOTH"))).toBe(150);
  });
});

describe("points and paths", () => {
  it("moves a point and its heading settings", () => {
    const p = mirrorPoint(
      { x: 10, y: 20, heading: "linear", startDeg: 0, endDeg: 90 } as Point,
      field("BOTH"),
    );
    expect(p).toMatchObject({ x: 134, y: 124, startDeg: -180, endDeg: -90 });

    const facing = mirrorPoint(
      {
        x: 10,
        y: 20,
        heading: "facingPoint",
        targetX: 72,
        targetY: 100,
      } as Point,
      field("X"),
    );
    expect(facing).toMatchObject({ x: 134, y: 20, targetX: 72, targetY: 100 });
  });

  it("moves a path's control points, piecewise and chain headings, and pose markers", () => {
    const line = {
      id: "a",
      endPoint: {
        x: 40,
        y: 30,
        heading: "piecewise",
        segments: [{ tStart: 0, tEnd: 1, heading: "constant", degrees: 45 }],
      },
      controlPoints: [{ x: 20, y: 10 }],
      color: "red",
      globalHeading: "constant",
      globalDegrees: 10,
      eventMarkers: [
        {
          id: "m",
          name: "Drop",
          type: "pose",
          position: 0,
          poseX: 30,
          poseY: 40,
          poseHeading: 0,
        },
      ],
    } as unknown as Line;
    const m = mirrorLine(line, field("Y"));
    expect(m.endPoint).toMatchObject({ x: 40, y: 114 });
    expect((m.endPoint as any).segments[0].degrees).toBe(-45);
    expect(m.controlPoints[0]).toEqual({ x: 20, y: 134 });
    expect(m.globalDegrees).toBe(-10);
    expect(m.eventMarkers![0]).toMatchObject({
      poseX: 30,
      poseY: 104,
      poseHeading: 0,
    });
    expect("startPoint" in m).toBe(false);
    // The project's own path is untouched.
    expect(line.endPoint.y).toBe(30);
  });
});

describe("timeline", () => {
  it("draws the mirrored path with the same timing", async () => {
    const { mirrorTimePrediction } = await import("../utils/allianceMirror");
    const prediction = {
      totalTime: 2,
      segmentTimes: [2],
      totalDistance: 51,
      timeline: [
        {
          type: "travel",
          duration: 2,
          startTime: 0,
          endTime: 2,
          line: {
            id: "a",
            endPoint: { x: 60, y: 25, heading: "tangential" },
            controlPoints: [],
            color: "red",
          },
          prevPoint: { x: 9, y: 25, heading: "tangential" },
          velocityProfile: [0, 10, 0],
        },
        {
          type: "wait",
          duration: 1,
          startTime: 2,
          endTime: 3,
          atPoint: { x: 60, y: 25 },
        },
      ],
    } as any;
    const m = mirrorTimePrediction(prediction, field("BOTH"));
    expect(m.timeline[0].line.endPoint).toMatchObject({ x: 84, y: 119 });
    expect(m.timeline[0].prevPoint).toMatchObject({ x: 135, y: 119 });
    expect(m.timeline[0].velocityProfile).toEqual([0, 10, 0]);
    expect(m.timeline[1].atPoint).toEqual({ x: 84, y: 119 });
    expect(m.totalTime).toBe(2);
    expect(mirrorTimePrediction(null, field("BOTH"))).toBeNull();
  });
});
