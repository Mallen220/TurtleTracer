// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  buildStandardPathElements,
  buildDiffPathElements,
} from "./FieldPathLayer";
import type { Line, Point } from "../../../types";

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
    percentStore: 0,
    dimmedIds: [],
    multiSelectedPointIds: [],
    robotXY: null,
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
      };

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
