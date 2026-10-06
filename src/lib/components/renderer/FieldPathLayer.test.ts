// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  buildStandardPathElements,
  buildDiffPathElements,
} from "./FieldPathLayer";
import type { Line, Point, TimePrediction } from "../../../types";

describe("FieldPathLayer", () => {
  const startPoint: Point = { x: 0, y: 0, heading: "tangential" };
  const line1: Line = {
    id: "l1",
    color: "#ff0000",
    endPoint: { x: 10, y: 10, heading: "tangential" },
    controlPoints: [],
  };

  const mockCtx: any = {
    x: (v: number) => v,
    y: (v: number) => v,
    uiLength: (v: number) => v,
    settings: {},
    timePrediction: null,
    dimmedIds: [],
    multiSelectedPointIds: [],
  };

  describe("buildStandardPathElements", () => {
    it("returns empty array in diff mode", () => {
      const res = buildStandardPathElements({
        effectiveTimePrediction: null,
        lines: [line1],
        sequencedLines: [line1],
        startPoint,
        isDiffMode: true,
        selectedLineId: null,
        ctx: mockCtx,
      });
      expect(res).toEqual([]);
    });

    it("generates fallback path elements when no simulation timeline", () => {
      const res = buildStandardPathElements({
        effectiveTimePrediction: null,
        lines: [line1],
        sequencedLines: [line1],
        startPoint,
        isDiffMode: false,
        selectedLineId: null,
        ctx: mockCtx,
      });
      expect(res).toBeDefined();
      expect(res.length).toBeGreaterThan(0);
    });

    it("generates timeline travel path elements when timeline exists", () => {
      const timelinePrediction = {
        timeline: [
          {
            type: "travel",
            line: line1,
            prevPoint: startPoint,
          },
        ],
      } as unknown as TimePrediction;

      const res = buildStandardPathElements({
        effectiveTimePrediction: timelinePrediction,
        lines: [line1],
        sequencedLines: [line1],
        startPoint,
        isDiffMode: false,
        selectedLineId: "l1",
        ctx: mockCtx,
      });
      expect(res).toBeDefined();
      expect(res.length).toBeGreaterThan(0);
    });
  });

  describe("velocity heatmap", () => {
    const pathTo = (id: string, x: number): Line => ({
      id,
      color: "#ff0000",
      endPoint: { x, y: 0, heading: "tangential" },
      controlPoints: [],
    });
    const a = pathTo("a", 10);
    const b = pathTo("b", 20);
    const travel = (
      line: Line,
      prevPoint: Point,
      lineIndex: number,
      speed: number,
    ) => ({
      type: "travel",
      line,
      prevPoint,
      lineIndex,
      startTime: lineIndex,
      endTime: lineIndex + 1,
      duration: 1,
      velocityProfile: [speed, speed, speed],
    });
    const heatmapCtx = {
      ...mockCtx,
      settings: { showVelocityHeatmap: true, maxVelocity: 100 },
    };
    const strokesOf = (lines: Line[], events: unknown[]) => {
      const timeline = events as TimePrediction["timeline"];
      const res = buildStandardPathElements({
        effectiveTimePrediction: { timeline } as TimePrediction,
        lines,
        sequencedLines: lines,
        startPoint,
        isDiffMode: false,
        selectedLineId: null,
        ctx: { ...heatmapCtx, timePrediction: { timeline } },
      });
      return new Map(res.map((e) => [e.id, e.stroke]));
    };

    it("colours each path by how fast the robot drives that path", () => {
      // Slow first path, full-speed second path.
      const strokes = strokesOf(
        [a, b],
        [travel(a, startPoint, 0, 0), travel(b, a.endPoint, 1, 100)],
      );
      expect(strokes.get("timeline-path-0-line-1-heatmap-0")).toBe(
        "hsl(120, 100%, 40%)", // green
      );
      expect(strokes.get("timeline-path-1-line-1-heatmap-0")).toBe(
        "hsl(0, 100%, 40%)", // red
      );
    });

    it("leaves macro paths in their own colour", () => {
      const fromMacro = pathTo("macro", 20);
      const strokes = strokesOf(
        [a],
        [travel(a, startPoint, 0, 0), travel(fromMacro, a.endPoint, -1, 100)],
      );
      expect(strokes.get("timeline-path-1-line-1")).toBe("#ff0000");
    });
  });

  describe("recovery paths", () => {
    const prediction = (events: unknown[]) =>
      ({ timeline: events }) as unknown as TimePrediction;
    const build = (events: unknown[]) =>
      buildStandardPathElements({
        effectiveTimePrediction: prediction(events),
        lines: [line1],
        sequencedLines: [line1],
        startPoint,
        isDiffMode: false,
        selectedLineId: null,
        ctx: mockCtx,
      });
    const travel = { type: "travel", line: line1, prevPoint: startPoint };

    it("draws a dashed line for where the robot leaves the path", () => {
      const trace = {
        time: [0, 0.1, 0.2],
        x: [1, 2, 3],
        y: [1, 4, 9],
        speed: [1, 1, 1],
      };
      const base = build([travel]);
      const res = build([travel, { type: "recovery", trace }]);
      expect(res).toHaveLength(base.length + 1);
      const dashed = res.at(-1) as unknown as { dashes: number[]; id: string };
      expect(dashed.dashes.length).toBe(2);
      expect(dashed.id).toBe("recovery-path-1");
    });

    it("draws a long recovery with a limited number of points", () => {
      const n = 800;
      const trace = {
        time: Array.from({ length: n }, (_, i) => i * 0.01),
        x: Array.from({ length: n }, (_, i) => i),
        y: Array.from({ length: n }, (_, i) => i * 2),
        speed: Array.from({ length: n }, () => 1),
      };
      const res = build([travel, { type: "recovery", trace }]);
      const dashed = res.at(-1) as unknown as {
        vertices: { x: number; y: number }[];
      };
      expect(dashed.vertices.length).toBeLessThanOrEqual(40);
      // It still runs from the first point to the last.
      expect(dashed.vertices[0]).toMatchObject({ x: 0, y: 0 });
      expect(dashed.vertices.at(-1)).toMatchObject({
        x: n - 1,
        y: (n - 1) * 2,
      });
    });

    it("skips a recovery with nothing to draw", () => {
      const base = build([travel]);
      expect(build([travel, { type: "recovery" }])).toHaveLength(base.length);
      expect(
        build([
          travel,
          {
            type: "recovery",
            trace: { time: [0], x: [0], y: [0], speed: [0] },
          },
        ]),
      ).toHaveLength(base.length);
    });
  });

  describe("buildDiffPathElements", () => {
    it("returns empty array when diff mode is false", () => {
      const res = buildDiffPathElements({
        isDiffMode: false,
        oldData: null,
        sequencedLines: [line1],
        startPoint,
        diffData: null,
        ctx: mockCtx,
      });
      expect(res).toEqual([]);
    });

    it("builds committed and current paths when diff mode is true", () => {
      const res = buildDiffPathElements({
        isDiffMode: true,
        oldData: {
          lines: [line1],
          startPoint,
        },
        sequencedLines: [line1],
        startPoint,
        diffData: { sameLines: [{ id: "l1" }] },
        ctx: mockCtx,
      });
      expect(res).toBeDefined();
      expect(res.length).toBeGreaterThan(0);
    });
  });
});
