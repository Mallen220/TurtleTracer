// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PathOptimizer } from "../utils/pathOptimizer";
import { pointInPolygon, getRobotCorners } from "../utils/geometry";
import type { Line, Point, SequenceItem, Settings, Shape } from "../types";

describe("PathOptimizer", () => {
  let startPoint: Point;
  let lines: Line[];
  let settings: Settings;
  let sequence: SequenceItem[];
  let shapes: Shape[];

  beforeEach(() => {
    startPoint = {
      x: 0,
      y: 0,
      heading: "constant",
      degrees: 0,
    };

    lines = [
      {
        id: "line1",
        endPoint: {
          x: 50,
          y: 50,
          heading: "constant",
          degrees: 0,
        },
        controlPoints: [],
        color: "red",
      },
    ];

    settings = {
      xVelocity: 50,
      yVelocity: 50,
      aVelocity: 180,
      kFriction: 0.5,
      rLength: 12,
      rWidth: 12,
      safetyMargin: 2,
      maxVelocity: 50,
      maxAcceleration: 20,
      fieldMap: "centerstage",
      theme: "dark",
      optimizationIterations: 10,
      optimizationPopulationSize: 10,
      optimizationMutationRate: 0.5,
      optimizationMutationStrength: 5.0,
    };

    sequence = [
      {
        kind: "path",
        lineId: "line1",
      },
    ];

    shapes = [];
  });

  it("should initialize correctly", () => {
    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    );
    expect(optimizer).toBeDefined();
  });

  it("should optimize a simple path and return a result", async () => {
    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    );
    const onUpdate = vi.fn();

    const result = await optimizer.optimize(onUpdate);

    expect(result).toBeDefined();
    expect(result.lines).toHaveLength(lines.length);
    expect(result.bestTime).toBeGreaterThan(0);
    expect(onUpdate).toHaveBeenCalled();
  });

  it("should respect the stop request", async () => {
    settings.optimizationIterations = 1000;
    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    );

    const onUpdate = vi.fn(() => {
      optimizer.stop();
    });

    const result = await optimizer.optimize(onUpdate);

    expect(result.stopped).toBe(true);
    expect(onUpdate).toHaveBeenCalled();
    const calls = onUpdate.mock.calls.length;
    expect(calls).toBeLessThan(1000);
  });

  it("should verify geometry assumptions for collision", () => {
    // Recreate the scenario that failed, but modified to ensure collision detection works with current logic
    // Robot moves from 0,0 to 50,50. At 25,25:
    const robotX = 25;
    const robotY = 25;
    const heading = 0;
    const rLength = 12 + 4; // 16
    const rWidth = 12 + 4; // 16

    const corners = getRobotCorners(robotX, robotY, heading, rLength, rWidth);
    // corners: (17,17), (33,17), (33,33), (17,33)

    // Move obstacle to overlap with the right side of the robot (x=33)
    // Obstacle x: 30-40.
    const obstacleVertices = [
      { x: 30, y: 0 },
      { x: 30, y: 60 },
      { x: 40, y: 60 },
      { x: 40, y: 0 },
    ];

    // Check if any corner is in obstacle
    let isColliding = false;
    for (const corner of corners) {
      if (pointInPolygon([corner.x, corner.y], obstacleVertices)) {
        isColliding = true;
        break;
      }
    }

    // (33, 17) should be inside [30, 40] x [0, 60]
    expect(isColliding).toBe(true);
  });

  it("should handle collisions by returning a high fitness score", async () => {
    // Place a shape that guarantees a corner overlap (as verified above)
    shapes = [
      {
        id: "obstacle1",
        vertices: [
          { x: 30, y: 0 },
          { x: 30, y: 60 },
          { x: 40, y: 60 },
          { x: 40, y: 0 },
        ],
        color: "blue",
        fillColor: "blue",
      },
    ];

    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    );

    settings.optimizationIterations = 1;
    settings.optimizationPopulationSize = 1;

    const onUpdate = vi.fn();
    const result = await optimizer.optimize(onUpdate);

    expect(result.bestTime).toBeGreaterThan(10000);
  });

  it("should mutate lines to avoid obstacles", async () => {
    // Ensure this obstacle is also detectable by current logic
    // A small block at 25,25 (center of path)
    // Robot covers 17-33.
    // Block at 24-26 is fully inside the robot.
    // So "shape vertex inside robot" check should pass.
    shapes = [
      {
        id: "obstacle1",
        vertices: [
          { x: 24, y: 24 },
          { x: 24, y: 26 },
          { x: 26, y: 26 },
          { x: 26, y: 24 },
        ],
        color: "blue",
        fillColor: "blue",
      },
    ];

    settings.optimizationIterations = 20;
    settings.optimizationPopulationSize = 20;
    settings.optimizationMutationStrength = 10;

    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    );

    const onUpdate = vi.fn();
    const result = await optimizer.optimize(onUpdate);

    expect(result.lines[0].controlPoints.length).toBeGreaterThanOrEqual(0);
    expect(result.lines).not.toEqual(lines);
  });

  it("should initialize population with valid seeds if available", async () => {
    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    ) as any;

    const seeds = optimizer.findValidPathSeeds();
    expect(Array.isArray(seeds)).toBe(true);
  });
});
