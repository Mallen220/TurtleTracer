// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  isPointInBox,
  findPointsInBox,
  calculateBoxBounds,
  calculateBoxPixelDimensions,
  extractFirstSelectedLineId,
} from "./BoxSelection";
import type { Line, Point, Shape } from "../../../types";

describe("BoxSelection", () => {
  it("correctly identifies whether a point is inside a bounding box", () => {
    expect(isPointInBox(5, 5, 0, 10, 0, 10)).toBe(true);
    expect(isPointInBox(0, 0, 0, 10, 0, 10)).toBe(true);
    expect(isPointInBox(10, 10, 0, 10, 0, 10)).toBe(true);
    expect(isPointInBox(-1, 5, 0, 10, 0, 10)).toBe(false);
    expect(isPointInBox(5, 11, 0, 10, 0, 10)).toBe(false);
  });

  it("finds start point, line endpoints, control points, event markers, and obstacle vertices in box", () => {
    const startPoint: Point = { x: 5, y: 5, heading: "tangential" };
    const lines: Line[] = [
      {
        id: "line-1",
        color: "#ff0000",
        endPoint: { x: 15, y: 15, heading: "tangential" },
        controlPoints: [
          { x: 8, y: 8 },
          { x: 25, y: 25 },
        ],
        eventMarkers: [
          {
            id: "em-1",
            position: 0.5,
            type: "pose",
            poseX: 6,
            poseY: 6,
            name: "m1",
          },
          {
            id: "em-2",
            position: 0.8,
            type: "pose",
            poseX: 50,
            poseY: 50,
            name: "m2",
          },
        ],
      },
      {
        id: "line-2",
        color: "#0000ff",
        endPoint: { x: 30, y: 30, heading: "tangential" },
        controlPoints: [],
      },
    ];
    const shapes: Shape[] = [
      {
        id: "shape-1",
        name: "Obstacle 1",
        color: "#000",
        fillColor: "#fff",
        vertices: [
          { x: 7, y: 7 },
          { x: 40, y: 40 },
        ],
      },
    ];

    // Box from 0 to 20 on both X and Y
    const selected = findPointsInBox(startPoint, lines, shapes, 0, 20, 0, 20);

    expect(selected).toContain("point-0-0"); // start point (5, 5)
    expect(selected).toContain("point-1-0"); // line 1 end point (15, 15)
    expect(selected).toContain("point-1-1"); // line 1 control point 1 (8, 8)
    expect(selected).not.toContain("point-1-2"); // line 1 control point 2 (25, 25) - out of box
    expect(selected).toContain("event-0-0"); // event marker 1 (6, 6)
    expect(selected).not.toContain("event-0-1"); // event marker 2 (50, 50) - out of box
    expect(selected).not.toContain("point-2-0"); // line 2 end point (30, 30) - out of box
    expect(selected).toContain("obstacle-0-0"); // obstacle vertex 1 (7, 7)
    expect(selected).not.toContain("obstacle-0-1"); // obstacle vertex 2 (40, 40) - out of box
  });

  it("calculates box bounds and checks hasArea correctly", () => {
    const b1 = calculateBoxBounds({ x: 10, y: 10 }, { x: 10.2, y: 10.3 });
    expect(b1.hasArea).toBe(false);

    const b2 = calculateBoxBounds({ x: 20, y: 30 }, { x: 10, y: 10 });
    expect(b2.minX).toBe(10);
    expect(b2.maxX).toBe(20);
    expect(b2.minY).toBe(10);
    expect(b2.maxY).toBe(30);
    expect(b2.hasArea).toBe(true);
  });

  it("calculates box pixel dimensions and center", () => {
    const scale = (v: number) => v * 10;
    const dims = calculateBoxPixelDimensions(
      { minX: 5, maxX: 15, minY: 10, maxY: 20 },
      scale,
      scale,
    );
    expect(dims.width).toBe(100);
    expect(dims.height).toBe(100);
    expect(dims.centerX).toBe(100);
    expect(dims.centerY).toBe(150);
  });

  it("extracts the first selected line ID", () => {
    const lines: Line[] = [
      {
        id: "line-A",
        color: "#ff0000",
        controlPoints: [],
        endPoint: { x: 0, y: 0, heading: "tangential" },
      },
      {
        id: "line-B",
        color: "#0000ff",
        controlPoints: [],
        endPoint: { x: 1, y: 1, heading: "tangential" },
      },
    ];

    expect(extractFirstSelectedLineId(["point-0-0"], lines)).toBeNull();
    expect(extractFirstSelectedLineId(["obstacle-0-0"], lines)).toBeNull();
    expect(extractFirstSelectedLineId(["point-2-1", "point-1-0"], lines)).toBe(
      "line-B",
    );
  });

  it("creates box selection shape with correct styles and dimensions", async () => {
    const { createBoxSelectionShape } = await import("./BoxSelection");
    const shape = createBoxSelectionShape(
      { x: 10, y: 20 },
      (v) => v * 2,
      (v) => v * 3,
    );
    expect(shape).toBeDefined();
    expect(shape.fill).toBe("rgba(59, 130, 246, 0.2)");
    expect(shape.stroke).toBe("#3b82f6");
    expect(shape.linewidth).toBe(1);
    expect(shape.translation.x).toBe(20);
    expect(shape.translation.y).toBe(60);
  });
});
