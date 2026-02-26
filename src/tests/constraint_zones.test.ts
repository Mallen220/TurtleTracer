import { describe, it, expect, beforeEach } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import type { Point, Line, Settings, SequenceItem, Shape } from "../types";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { SequencePathItem } from "../types";

beforeEach(() => {
  actionRegistry.reset();
  registerCoreUI();
});

const pathKind = (): SequencePathItem["kind"] =>
  (actionRegistry.getAll().find((a) => a.isPath)
    ?.kind as SequencePathItem["kind"]) ?? "path";

describe("Constraint Zones", () => {
  const defaultSettings: Settings = {
    xVelocity: 10,
    yVelocity: 10,
    aVelocity: Math.PI / 2,
    maxVelocity: 50,
    maxAcceleration: 20,
    maxDeceleration: 20,
    fieldMap: "decode.webp",
    kFriction: 0,
    rLength: 18,
    rWidth: 18,
    safetyMargin: 1,
    theme: "auto",
  };

  const startPoint: Point = {
    x: 0,
    y: 0,
    heading: "constant",
    degrees: 0,
  };

  it("reduces velocity in constraint zone", () => {
    // Path from (0,0) to (100,0). Length 100.
    const lines: Line[] = [
      {
        id: "line1",
        endPoint: {
          x: 100,
          y: 0,
          heading: "constant",
          degrees: 0,
        },
        controlPoints: [],
        color: "#fff",
      },
    ];

    // Constraint zone from x=20 to x=80, full height.
    // Max velocity 10 (vs 50 global).
    const constraintZone: Shape = {
      id: "zone1",
      type: "constraint-zone",
      color: "red",
      fillColor: "red",
      vertices: [
        { x: 20, y: -50 },
        { x: 80, y: -50 },
        { x: 80, y: 50 },
        { x: 20, y: 50 },
      ],
      constraints: {
        maxVelocity: 10,
      },
    };

    // Calculate without constraint
    const resultNoConstraint = calculatePathTime(startPoint, lines, defaultSettings);
    // Max vel 50. Accel 20.
    // Time to max vel: 50/20 = 2.5s. Dist: 0.5*20*2.5^2 = 62.5.
    // Doesn't reach max speed in half distance (50).
    // Reachable peak vel: sqrt(2*20*50) = sqrt(2000) = 44.7.
    // Time = 2 * sqrt(100/20) = 2 * 2.23 = 4.47s.

    // Calculate with constraint
    const resultWithConstraint = calculatePathTime(
      startPoint,
      lines,
      defaultSettings,
      undefined,
      undefined,
      [constraintZone]
    );

    // Should be slower.
    expect(resultWithConstraint.totalTime).toBeGreaterThan(resultNoConstraint.totalTime);

    // Verify velocity profile
    // Find event
    const event = resultWithConstraint.timeline[0];
    expect(event).toBeDefined();
    expect(event.velocityProfile).toBeDefined();

    const profile = event.velocityProfile!;
    // In the middle of the path (around index 50/100), velocity should be <= 10.
    // We use 100 samples approx.
    const midIndex = Math.floor(profile.length / 2);
    expect(profile[midIndex]).toBeLessThanOrEqual(10.1); // Allow small floating point error
    expect(profile[midIndex]).toBeGreaterThan(0);
  });

  it("limits acceleration in constraint zone", () => {
    // Path from (0,0) to (20,0). Short path.
    const lines: Line[] = [
      {
        id: "line1",
        endPoint: {
          x: 20,
          y: 0,
          heading: "constant",
          degrees: 0,
        },
        controlPoints: [],
        color: "#fff",
      },
    ];

    // Constraint zone covering entire path
    // Max Accel 1 (vs 20 global).
    const constraintZone: Shape = {
      id: "zone1",
      type: "constraint-zone",
      color: "red",
      fillColor: "red",
      vertices: [
        { x: -10, y: -50 },
        { x: 110, y: -50 },
        { x: 110, y: 50 },
        { x: -10, y: 50 },
      ],
      constraints: {
        maxAcceleration: 1,
      },
    };

    const result = calculatePathTime(
      startPoint,
      lines,
      defaultSettings,
      undefined,
      undefined,
      [constraintZone]
    );

    // Distance 20. Max Accel 1.
    // Time = 2 * sqrt(20/1) = 2 * 4.47 = 8.94s.
    expect(result.totalTime).toBeCloseTo(8.94, 1);
  });
});
