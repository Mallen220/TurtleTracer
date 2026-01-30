// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, beforeEach } from "vitest";
import { PathOptimizer } from "../utils/pathOptimizer";
import type { Line, Point, SequenceItem, Settings, Shape } from "../types";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { SequencePathItem } from "../types";

const pathKind = (): SequencePathItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isPath)
    ?.kind as SequencePathItem["kind"]) ?? "path";

describe("PathOptimizer Keep-In Zones", () => {
  let startPoint: Point;
  let lines: Line[];
  let settings: Settings;
  let sequence: SequenceItem[];
  let shapes: Shape[];

  beforeEach(() => {
    // Ensure core actions are registered for tests that rely on kinds
    actionRegistry.reset();
    registerCoreUI();

    startPoint = {
      x: 10,
      y: 10,
      heading: "constant",
      degrees: 0,
    };

    lines = [
      {
        id: "line1",
        endPoint: {
          x: 40,
          y: 10,
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
      rLength: 10,
      rWidth: 10,
      safetyMargin: 0, // No safety margin for simpler calculation
      maxVelocity: 50,
      maxAcceleration: 20,
      fieldMap: "centerstage",
      theme: "dark",
      optimizationIterations: 10,
      optimizationPopulationSize: 10,
      validateFieldBoundaries: false, // Disable boundary checks to focus on Keep-In
    };

    sequence = [
      {
        kind: pathKind(),
        lineId: "line1",
      },
    ];

    shapes = [];
  });

  it("should report violation if robot is outside keep-in zone", () => {
    // Define a keep-in zone far away
    shapes = [
      {
        id: "keepin1",
        vertices: [
          { x: 80, y: 80 },
          { x: 100, y: 80 },
          { x: 100, y: 100 },
          { x: 80, y: 100 },
        ],
        color: "green",
        fillColor: "green",
        type: "keep-in",
        visible: true,
      },
    ];

    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    );

    // Use getCollisions directly
    const collisions = optimizer.getCollisions();

    expect(collisions.length).toBeGreaterThan(0);
    expect(collisions.some((c) => c.type === "keep-in")).toBe(true);
  });

  it("should NOT report violation if robot is fully inside keep-in zone", () => {
    // Define a keep-in zone covering the path (0,0) to (50,50)
    // Robot is at y=10, moves x=10->40. Size 10x10.
    // Robot extents: y: 5 to 15. x: 5 to 45 (approx).
    // Zone: 0,0 to 100,100
    shapes = [
      {
        id: "keepin1",
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        color: "green",
        fillColor: "green",
        type: "keep-in",
        visible: true,
      },
    ];

    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    );

    const collisions = optimizer.getCollisions();

    expect(collisions.length).toBe(0);
  });

  it("should report violation if robot leaves keep-in zone", () => {
    // Zone covers start but not end
    // Robot moves x=10->40. Zone ends at x=25.
    shapes = [
      {
        id: "keepin1",
        vertices: [
          { x: 0, y: 0 },
          { x: 25, y: 0 },
          { x: 25, y: 100 },
          { x: 0, y: 100 },
        ],
        color: "green",
        fillColor: "green",
        type: "keep-in",
        visible: true,
      },
    ];

    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    );

    const collisions = optimizer.getCollisions();

    expect(collisions.length).toBeGreaterThan(0);
    expect(collisions.some((c) => c.type === "keep-in")).toBe(true);
  });

  it("should prioritize checking against multiple keep-in zones (union behavior check)", () => {
    // If we have two disjoint zones, can the robot jump between them? No.
    // Can the robot be in one OR the other? Yes.
    // Test: Robot starts in Zone A, ends in Zone B.
    // Path crosses the gap. Should fail in the gap.

    lines[0].endPoint.x = 80;
    // Gap between x=40 and x=60.
    shapes = [
      {
        id: "zoneA",
        vertices: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 100 },
          { x: 0, y: 100 },
        ],
        color: "green",
        fillColor: "green",
        type: "keep-in",
        visible: true,
      },
      {
        id: "zoneB",
        vertices: [
          { x: 60, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 60, y: 100 },
        ],
        color: "green",
        fillColor: "green",
        type: "keep-in",
        visible: true,
      },
    ];

    const optimizer = new PathOptimizer(
      startPoint,
      lines,
      settings,
      sequence,
      shapes,
    );

    const collisions = optimizer.getCollisions();

    // Should have collisions in the gap
    // Collision might start before 40 (due to robot width) and end after 60
    expect(collisions.length).toBeGreaterThan(0);
    expect(
      collisions.some(
        (c) =>
          c.type === "keep-in" &&
          // Check for overlap with the gap [40, 60]
          c.x < 60 &&
          (c.endX ?? c.x) > 40,
      ),
    ).toBe(true);
  });
});
