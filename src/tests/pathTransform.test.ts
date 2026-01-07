// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  mirrorPointHeading,
  mirrorPathData,
  reversePathData,
} from "../utils/pathTransform";
import type { Point, Line, Shape, SequenceItem } from "../types";

describe("pathTransform", () => {
  describe("mirrorPointHeading", () => {
    it("should mirror linear heading", () => {
      const point: Point = {
        x: 0,
        y: 0,
        heading: "linear",
        startDeg: 10,
        endDeg: 20,
      };
      const mirrored = mirrorPointHeading(point);
      expect(mirrored.startDeg).toBe(170); // 180 - 10
      expect(mirrored.endDeg).toBe(160); // 180 - 20
    });

    it("should mirror constant heading", () => {
      const point: Point = {
        x: 0,
        y: 0,
        heading: "constant",
        degrees: 45,
      };
      const mirrored = mirrorPointHeading(point);
      expect(mirrored.degrees).toBe(135); // 180 - 45
    });

    it("should not change tangential heading", () => {
      const point: Point = {
        x: 0,
        y: 0,
        heading: "tangential",
        reverse: false,
      };
      const mirrored = mirrorPointHeading(point);
      expect(mirrored).toEqual(point);
    });
  });

  describe("mirrorPathData", () => {
    it("should mirror start point x coordinate and heading", () => {
      const data = {
        startPoint: { x: 10, y: 20, heading: "constant", degrees: 10 } as Point,
        lines: [],
        shapes: [],
      };
      const mirrored = mirrorPathData(data);
      expect(mirrored.startPoint.x).toBe(134); // 144 - 10
      expect(mirrored.startPoint.y).toBe(20);
      expect(mirrored.startPoint.degrees).toBe(170); // 180 - 10
    });

    it("should mirror line end points and control points", () => {
      const data = {
        startPoint: { x: 0, y: 0, heading: "tangential" } as Point,
        lines: [
          {
            endPoint: {
              x: 20,
              y: 30,
              heading: "linear",
              startDeg: 0,
              endDeg: 90,
            } as Point,
            controlPoints: [
              { x: 5, y: 5 },
              { x: 15, y: 15 },
            ],
            id: "line1",
          } as Line,
        ],
        shapes: [],
      };
      const mirrored = mirrorPathData(data);
      const line = mirrored.lines[0];

      expect(line.endPoint.x).toBe(124); // 144 - 20
      expect(line.endPoint.y).toBe(30);
      expect(line.endPoint.startDeg).toBe(180); // 180 - 0
      expect(line.endPoint.endDeg).toBe(90); // 180 - 90

      expect(line.controlPoints[0].x).toBe(139); // 144 - 5
      expect(line.controlPoints[0].y).toBe(5);
      expect(line.controlPoints[1].x).toBe(129); // 144 - 15
      expect(line.controlPoints[1].y).toBe(15);
    });

    it("should mirror shape vertices", () => {
      const data = {
        startPoint: { x: 0, y: 0, heading: "tangential" } as Point,
        lines: [],
        shapes: [
          {
            type: "polygon",
            vertices: [
              { x: 10, y: 10 },
              { x: 20, y: 20 },
            ],
            id: "shape1",
            color: "red",
            fillColor: "blue",
            name: "Shape",
          } as Shape,
        ],
      };
      const mirrored = mirrorPathData(data);
      const shape = mirrored.shapes[0];

      expect(shape.vertices[0].x).toBe(134); // 144 - 10
      expect(shape.vertices[1].x).toBe(124); // 144 - 20
    });

    it("should handle missing optional arrays", () => {
      const data = {
        startPoint: { x: 0, y: 0, heading: "tangential" } as Point,
        lines: undefined as unknown as Line[],
        shapes: undefined as unknown as Shape[],
      };
      // Should not throw
      const mirrored = mirrorPathData(data);
      expect(mirrored.startPoint).toBeDefined();
    });
  });

  describe("reversePathData", () => {
    it("should return original data if no lines exist", () => {
      const data = {
        startPoint: { x: 0, y: 0, heading: "tangential" } as Point,
        lines: [],
      };
      const reversed = reversePathData(data);
      expect(reversed).toEqual(data);
    });

    it("should reverse a single line path", () => {
      const data = {
        startPoint: { x: 0, y: 0, heading: "tangential" } as Point,
        lines: [
          {
            endPoint: {
              x: 100,
              y: 100,
              heading: "constant",
              degrees: 90,
            } as Point,
            controlPoints: [
              { x: 25, y: 25 },
              { x: 75, y: 75 },
            ],
            id: "line1",
            waitBefore: 1,
            waitAfter: 2,
            waitBeforeName: "w1",
            waitAfterName: "w2",
          } as unknown as Line,
        ],
        sequence: [{ kind: "path", lineId: "line1" }] as SequenceItem[],
      };

      const reversed = reversePathData(data);

      // New start point is old end point
      expect(reversed.startPoint.x).toBe(100);
      expect(reversed.startPoint.heading).toBe("constant");
      expect(reversed.startPoint.degrees).toBe(90);

      expect(reversed.lines).toHaveLength(1);
      const line = reversed.lines[0];

      // New end point is old start point
      expect(line.endPoint.x).toBe(0);
      expect(line.endPoint.y).toBe(0);
      expect(line.endPoint.heading).toBe("tangential");

      // Control points reversed
      expect(line.controlPoints[0]).toEqual({ x: 75, y: 75 });
      expect(line.controlPoints[1]).toEqual({ x: 25, y: 25 });

      // Waits swapped
      expect(line.waitBefore).toBe(2);
      expect(line.waitAfter).toBe(1);
      expect(line.waitBeforeName).toBe("w2");
      expect(line.waitAfterName).toBe("w1");

      // Sequence reversed
      expect((reversed.sequence[0] as any).lineId).toBe("line1");
    });

    it("should reverse multiple lines correctly", () => {
      // P0 -> L1 -> P1 -> L2 -> P2
      const data = {
        startPoint: {
          x: 0,
          y: 0,
          heading: "tangential",
          id: "P0",
        } as unknown as Point,
        lines: [
          {
            id: "L1",
            endPoint: {
              x: 10,
              y: 10,
              heading: "tangential",
              id: "P1",
            } as unknown as Point,
            controlPoints: [{ x: 1, y: 1 }],
            color: "blue",
          } as Line,
          {
            id: "L2",
            endPoint: {
              x: 20,
              y: 20,
              heading: "tangential",
              id: "P2",
            } as unknown as Point,
            controlPoints: [{ x: 2, y: 2 }],
            color: "green",
          } as Line,
        ],
      };

      const reversed = reversePathData(data);

      // Expected: P2 -> L2(rev) -> P1 -> L1(rev) -> P0

      expect(reversed.startPoint.x).toBe(20);

      expect(reversed.lines).toHaveLength(2);

      // First new line (was L2)
      expect(reversed.lines[0].id).toBe("L2");
      expect(reversed.lines[0].endPoint.x).toBe(10); // Ends at P1

      // Second new line (was L1)
      expect(reversed.lines[1].id).toBe("L1");
      expect(reversed.lines[1].endPoint.x).toBe(0); // Ends at P0
    });

    it("should swap linear heading start/end degrees on new start point and end points", () => {
      const data = {
        startPoint: {
          x: 0,
          y: 0,
          heading: "linear",
          startDeg: 10,
          endDeg: 20,
        } as Point,
        lines: [
          {
            endPoint: {
              x: 100,
              y: 100,
              heading: "linear",
              startDeg: 30,
              endDeg: 40,
            } as Point,
            controlPoints: [],
            id: "line1",
            color: "red",
          } as Line,
        ],
      };

      const reversed = reversePathData(data);

      // New Start Point (was old end point)
      // Original End Point: 30 -> 40. Reversed: 40 -> 30
      expect(reversed.startPoint.startDeg).toBe(40);
      expect(reversed.startPoint.endDeg).toBe(30);

      // New Line End Point (was old start point)
      // Original Start Point: 10 -> 20. Reversed: 20 -> 10
      expect(reversed.lines[0].endPoint.startDeg).toBe(20);
      expect(reversed.lines[0].endPoint.endDeg).toBe(10);
    });

    it("should handle sequence reversal", () => {
      const data = {
        startPoint: { x: 0, y: 0, heading: "tangential" } as Point,
        lines: [
          {
            id: "L1",
            endPoint: {
              x: 1,
              y: 1,
              heading: "tangential",
              reverse: false,
            },
            controlPoints: [],
            color: "blue",
          } as Line,
          {
            id: "L2",
            endPoint: {
              x: 2,
              y: 2,
              heading: "tangential",
              reverse: false,
            },
            controlPoints: [],
            color: "green",
          } as Line,
        ],
        sequence: [
          { kind: "path", lineId: "L1" },
          { kind: "wait", id: "W1" },
          { kind: "path", lineId: "L2" },
        ] as SequenceItem[],
      };

      const reversed = reversePathData(data);

      expect(reversed.sequence).toHaveLength(3);
      expect((reversed.sequence[0] as any).lineId).toBe("L2");
      expect((reversed.sequence[1] as any).id).toBe("W1");
      expect((reversed.sequence[2] as any).lineId).toBe("L1");
    });
  });
});
