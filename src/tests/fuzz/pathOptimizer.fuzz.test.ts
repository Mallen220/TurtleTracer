// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { PathOptimizer } from "../../utils/pathOptimizer";
import type { Line, Point, SequenceItem, Settings, Shape } from "../../types";
import { FIELD_SIZE } from "../../config";

describe("PathOptimizer Fuzzing", () => {
  // Arbitrary for Point
  const pointArb = fc.record({
    x: fc.double({ min: 0, max: FIELD_SIZE }),
    y: fc.double({ min: 0, max: FIELD_SIZE }),
    heading: fc.constantFrom(
      "constant" as const,
      "linear" as const,
      "tangential" as const,
    ),
    degrees: fc.double({ min: -360, max: 360 }),
    startDeg: fc.double({ min: -360, max: 360 }),
    endDeg: fc.double({ min: -360, max: 360 }),
    reverse: fc.boolean(),
  });

  // Arbitrary for Line
  const lineArb = fc.record({
    id: fc.uuid(),
    name: fc.string(),
    controlPoints: fc.array(
      fc.record({
        x: fc.double({ min: 0, max: FIELD_SIZE }),
        y: fc.double({ min: 0, max: FIELD_SIZE }),
      }),
      { maxLength: 2 },
    ),
    endPoint: pointArb,
    locked: fc.boolean(),
  });

  // Arbitrary for Settings
  const settingsArb = fc.record({
    rLength: fc.double({ min: 1, max: 20 }),
    rWidth: fc.double({ min: 1, max: 20 }),
    safetyMargin: fc.double({ min: 0, max: 10 }),
    optimizationIterations: fc.constant(2), // Keep iterations low for performance
    optimizationPopulationSize: fc.constant(5),
    maxVelocity: fc.double({ min: 10, max: 100 }),
    maxAcceleration: fc.double({ min: 10, max: 100 }),
    maxAngularVelocity: fc.double({ min: 1, max: 10 }),
    maxAngularAcceleration: fc.double({ min: 1, max: 10 }),
  });

  // Arbitrary for Shape (Obstacle)
  const shapeArb = fc.record({
    id: fc.uuid(),
    vertices: fc.array(
      fc.record({
        x: fc.double({ min: 0, max: FIELD_SIZE }),
        y: fc.double({ min: 0, max: FIELD_SIZE }),
      }),
      { minLength: 3, maxLength: 5 },
    ),
  });

  it("should calculate collisions without crashing on random inputs", () => {
    fc.assert(
      fc.property(
        pointArb,
        fc.array(lineArb, { maxLength: 3 }),
        settingsArb,
        fc.array(shapeArb, { maxLength: 3 }),
        (startPoint, lines, settings, shapes) => {
          const sequence: SequenceItem[] = lines.map((l) => ({
            kind: "path",
            lineId: l.id,
          }));

          // Cast types to satisfy TS (fast-check types vs app types)
          const optimizer = new PathOptimizer(
            startPoint as any,
            lines as any,
            settings as any,
            sequence,
            shapes as any,
          );

          try {
            const collisions = optimizer.getCollisions();
            expect(Array.isArray(collisions)).toBe(true);

            collisions.forEach((c) => {
              expect(c.x).toBeTypeOf("number");
              expect(c.y).toBeTypeOf("number");
              expect(c.time).toBeTypeOf("number");
            });
          } catch (e) {
            // We want to catch unexpected crashes, but timeouts or logic errors are what we look for
            throw e;
          }
        },
      ),
      { numRuns: 20, timeout: 5000 }, // Limit runs and timeout
    );
  });

  it("should complete optimization cycle without crashing", async () => {
    await fc.assert(
      fc.asyncProperty(
        pointArb,
        fc.array(lineArb, { minLength: 1, maxLength: 2 }),
        settingsArb,
        fc.array(shapeArb, { maxLength: 2 }),
        async (startPoint, lines, settings, shapes) => {
          // Ensure valid IDs for sequence
          lines.forEach((l, i) => (l.id = `line-${i}`));
          const sequence: SequenceItem[] = lines.map((l) => ({
            kind: "path",
            lineId: l.id,
          }));

          const optimizer = new PathOptimizer(
            startPoint as any,
            lines as any,
            settings as any,
            sequence,
            shapes as any,
          );

          // Mock onUpdate callback
          const onUpdate = () => {};

          const result = await optimizer.optimize(onUpdate);

          expect(result).toHaveProperty("lines");
          expect(result).toHaveProperty("bestTime");
          expect(result.bestTime).toBeGreaterThan(0);
        },
      ),
      { numRuns: 5, timeout: 10000 }, // Very few runs as optimization is slow
    );
  });
});
