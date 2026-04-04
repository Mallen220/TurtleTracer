// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  generateLinesFromDrawing,
  splitPathAtPercent,
} from "../../utils/pathEditing";
import type { Line, Point, SequenceItem } from "../../types";

describe("pathEditing", () => {
  describe("generateLinesFromDrawing", () => {
    it("should return null if less than 2 points", () => {
      expect(
        generateLinesFromDrawing([{ x: 0, y: 0 }], {} as any, [], []),
      ).toBeNull();
    });

    it("should generate bezier curves from drawing points", () => {
      const drawnPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 100, y: 100 },
      ];
      const startPoint = {
        x: 0,
        y: 0,
        locked: false,
        heading: "tangential",
      } as Point;

      const result = generateLinesFromDrawing(drawnPoints, startPoint, [], []);
      expect(result).not.toBeNull();
      expect(result?.lines.length).toBeGreaterThan(0);
      expect(result?.sequence.length).toBeGreaterThan(0);
    });
  });

  describe("splitPathAtPercent", () => {
    it("should return null if time prediction is invalid", () => {
      expect(splitPathAtPercent(50, null as any, [], [])).toBeNull();
      expect(
        splitPathAtPercent(50, { totalTime: 0 } as any, [], []),
      ).toBeNull();
    });

    it("should split a line and sequence properly", () => {
      const timePrediction = {
        totalTime: 10,
        timeline: [
          {
            type: "travel", // <-- changed from "path" to "travel"
            startTime: 0,
            endTime: 10,
            lineIndex: 0,
            sequenceIndex: 0,
            duration: 10,
            prevPoint: { x: 0, y: 0 },
          },
        ],
      } as any;

      const lines = [
        {
          endPoint: { x: 100, y: 100 },
          controlPoints: [
            { x: 33, y: 33, locked: false },
            { x: 66, y: 66, locked: false },
          ],
          heading: 0,
          color: "red",
          locked: false,
          reversed: false,
          power: 1,
          eventMarkers: [],
        },
      ] as any[];

      const sequence = [
        {
          id: "seq1",
          kind: "path",
          lineIndices: [0],
        },
      ] as any[];

      const result = splitPathAtPercent(50, timePrediction, lines, sequence);

      expect(result).not.toBeNull();
      expect(result?.lines.length).toBe(2);
      expect(result?.sequence.length).toBe(2);
    });
  });
});
