// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { mirrorPathData, reversePathData } from "../../utils/pathTransform";
import type {
  Point,
  Line,
  Shape,
  SequenceItem,
  ControlPoint,
} from "../../types";

// Generators
const pointGenerator = fc.record({
  x: fc.double({ min: -100, max: 244, noNaN: true }), // Field is 144, give some buffer
  y: fc.double({ min: -100, max: 244, noNaN: true }),
  heading: fc.constantFrom("linear", "constant", "tangential"),
  // Include optional properties that might be present
  startDeg: fc.double({ min: -360, max: 360, noNaN: true }),
  endDeg: fc.double({ min: -360, max: 360, noNaN: true }),
  degrees: fc.double({ min: -360, max: 360, noNaN: true }),
}) as unknown as fc.Arbitrary<Point>;

const controlPointGenerator = fc.record({
  x: fc.double({ min: -100, max: 244, noNaN: true }),
  y: fc.double({ min: -100, max: 244, noNaN: true }),
}) as unknown as fc.Arbitrary<ControlPoint>;

const lineGenerator = fc.record({
  id: fc.uuid(),
  endPoint: pointGenerator,
  controlPoints: fc.array(controlPointGenerator, { maxLength: 5 }),
  waitBefore: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), {
    nil: undefined,
  }),
  waitAfter: fc.option(fc.double({ min: 0, max: 100, noNaN: true }), {
    nil: undefined,
  }),
  waitBeforeName: fc.option(fc.string(), { nil: undefined }),
  waitAfterName: fc.option(fc.string(), { nil: undefined }),
}) as unknown as fc.Arbitrary<Line>;

const shapeGenerator = fc.record({
  id: fc.uuid(),
  type: fc.constant("polygon"),
  vertices: fc.array(
    fc.record({ x: fc.double({ noNaN: true }), y: fc.double({ noNaN: true }) }),
  ),
  color: fc.string(),
  name: fc.string(),
}) as unknown as fc.Arbitrary<Shape>;

const pathDataGenerator = fc.record({
  startPoint: pointGenerator,
  lines: fc.array(lineGenerator, { maxLength: 10 }),
  shapes: fc.array(shapeGenerator, { maxLength: 5 }),
  sequence: fc.option(
    fc.array(
      fc.record({ type: fc.constantFrom("path", "wait"), id: fc.string() }),
      { maxLength: 20 },
    ),
    { nil: undefined },
  ),
});

describe("pathTransform fuzz tests", () => {
  it("mirrorPathData should be an involution (f(f(x)) = x)", () => {
    fc.assert(
      fc.property(pathDataGenerator, (data: any) => {
        // First mirror
        const m1 = mirrorPathData(data);
        // Second mirror
        const m2 = mirrorPathData(m1);

        // JSON cycle to normalize both original and result
        const normalize = (o: any) => JSON.parse(JSON.stringify(o));

        const original = normalize(data);
        const doubleMirrored = normalize(m2);

        // Check core properties
        expect(doubleMirrored.startPoint.x).toBeCloseTo(original.startPoint.x);
        expect(doubleMirrored.startPoint.y).toBeCloseTo(original.startPoint.y);

        if (original.lines.length > 0) {
          expect(doubleMirrored.lines.length).toBe(original.lines.length);
          expect(doubleMirrored.lines[0].endPoint.x).toBeCloseTo(
            original.lines[0].endPoint.x,
          );
        }
      }),
    );
  });

  it("reversePathData should be an involution (f(f(x)) = x) for path geometry", () => {
    fc.assert(
      fc.property(pathDataGenerator, (data: any) => {
        // Only run if we have lines, otherwise reverse returns original
        if (!data.lines || data.lines.length === 0) return true;

        const r1 = reversePathData(data);
        const r2 = reversePathData(r1);

        const normalize = (o: any) => JSON.parse(JSON.stringify(o));
        const original = normalize(data);
        const doubleReversed = normalize(r2);

        // We verify that we got back to the start state
        expect(doubleReversed.startPoint.x).toBeCloseTo(original.startPoint.x);

        if (original.lines.length > 0) {
          expect(doubleReversed.lines[0].id).toBe(original.lines[0].id);
          expect(doubleReversed.lines[0].endPoint.x).toBeCloseTo(
            original.lines[0].endPoint.x,
          );
        }
      }),
    );
  });
});
