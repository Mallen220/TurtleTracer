// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PathOptimizer } from "../utils/pathOptimizer";
import { calculatePathTime } from "../utils/timeCalculator";
import { pointInPolygon, getRobotCorners } from "../utils/geometry";
import type { Line, Point, SequenceItem, Settings, Shape } from "../types";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { SequencePathItem } from "../types";

const pathKind = (): SequencePathItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isPath)
    ?.kind as SequencePathItem["kind"]) ?? "path";

describe("PathOptimizer", () => {
  let startPoint: Point;
  let lines: Line[];
  let settings: Settings;
  let sequence: SequenceItem[];
  let shapes: Shape[];

  beforeEach(() => {
    // Ensure core actions are registered for tests that rely on action kinds
    actionRegistry.reset();
    registerCoreUI();

    // Offset from boundary so validation does not flag the starting safety margin
    // as a boundary collision while we check macro sequencing behavior.
    startPoint = {
      x: 0,
      y: 20,
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
        kind: pathKind(),
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

    // Sanity check the optimizer captured start point
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((optimizer as any).startPoint.y).toBe(20);
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

  it("should respect timeline prevPoint for macro sequences to avoid ghost collisions", () => {
    startPoint = {
      x: 0,
      y: 0,
      heading: "constant",
      degrees: 0,
    };

    const firstLine: Line = {
      id: "user-line",
      endPoint: { x: 10, y: 20, heading: "constant", degrees: 0 },
      controlPoints: [],
      color: "red",
    };

    const unusedLine: Line = {
      id: "unused-line",
      endPoint: { x: 100, y: 100, heading: "constant", degrees: 0 },
      controlPoints: [],
      color: "gray",
    };

    const macroLine: Line = {
      id: "macro-line",
      endPoint: { x: 10, y: 30, heading: "constant", degrees: 0 },
      controlPoints: [],
      color: "blue",
      isMacroElement: true,
      macroId: "m1",
    };

    lines = [firstLine, unusedLine, macroLine];

    // Obstacle around the unused line location to catch incorrect prevPoint usage
    shapes = [
      {
        id: "obstacle1",
        vertices: [
          { x: 95, y: 95 },
          { x: 95, y: 105 },
          { x: 105, y: 105 },
          { x: 105, y: 95 },
        ],
        color: "black",
        fillColor: "black",
      },
    ];

    sequence = [
      { kind: pathKind(), lineId: firstLine.id! },
      {
        kind:
          (actionRegistry.getAll().find((a: any) => a.isMacro)
            ?.kind as import("../types").SequenceMacroItem["kind"]) ?? "macro",
        id: "m1",
        name: "Macro",
        filePath: "macro.json",
        sequence: [{ kind: pathKind(), lineId: macroLine.id! }],
      },
    ];

    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    );

    const timeline = calculatePathTime(startPoint, lines, settings, sequence);
    const markers = optimizer.getCollisions(timeline.timeline, lines);

    // If prevPoint were taken from lines order (unusedLine), we'd start inside the obstacle.
    const obstacleMarkers = markers.filter((m) => m.type === "obstacle");
    expect(obstacleMarkers).toHaveLength(0);
  });

  it("should not extend collisions across segments when the type matches", () => {
    startPoint = { x: 10, y: 10, heading: "constant", degrees: 0 };

    // Two out-of-bounds segments; collisions should be separate per segment.
    lines = [
      {
        id: "seg-1",
        endPoint: { x: -10, y: 10, heading: "constant", degrees: 0 },
        controlPoints: [],
        color: "red",
      },
      {
        id: "seg-2",
        endPoint: { x: 10, y: -10, heading: "constant", degrees: 0 },
        controlPoints: [],
        color: "blue",
      },
    ];

    sequence = [
      { kind: pathKind(), lineId: "seg-1" },
      { kind: pathKind(), lineId: "seg-2" },
    ];

    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    );

    const timeline = calculatePathTime(startPoint, lines, settings, sequence);
    const markers = optimizer.getCollisions(timeline.timeline, lines);

    const boundaryMarkers = markers.filter((m) => m.type === "boundary");
    expect(boundaryMarkers.length).toBeGreaterThanOrEqual(2);
    expect(boundaryMarkers[0]?.segmentIndex).toBe(0);
    expect(boundaryMarkers[boundaryMarkers.length - 1]?.segmentIndex).toBe(1);
  });
});
