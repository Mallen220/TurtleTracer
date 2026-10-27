// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { normalizeLineHeading, normalizeStartPoint } from "../utils/ppFormat";
import type { Line, Point } from "../types";

const base = {
  id: "l",
  color: "#fff",
  endPoint: { x: 1, y: 2 },
  controlPoints: [],
};
const upgrade = (heading: object) =>
  normalizeLineHeading({ ...base, heading } as unknown as Line).endPoint;

describe(".pp headings stored on the line", () => {
  it("moves line headings onto the end point", () => {
    expect(
      upgrade({ type: "linear", startDeg: 90, endDeg: 180 }),
    ).toMatchObject({
      x: 1,
      heading: "linear",
      startDeg: 90,
      endDeg: 180,
    });
    expect(upgrade({ type: "tangential", reverse: false })).toMatchObject({
      heading: "tangential",
    });
  });

  it("keeps reverse only where the Pedro Visualizer uses it", () => {
    expect(upgrade({ type: "tangential", reverse: true })).toMatchObject({
      heading: "tangential",
      reverse: true,
    });
    // The Visualizer turns a linear heading the short way and holds a
    // constant one, reverse or not.
    const linear = upgrade({
      type: "linear",
      reverse: true,
      startDeg: 180,
      endDeg: 270,
    });
    expect(linear).toMatchObject({ startDeg: 180, endDeg: 270 });
    expect(linear.reverse).toBeUndefined();
    const constant = upgrade({ type: "constant", reverse: true, degrees: 5 });
    expect(constant).toMatchObject({ heading: "constant", degrees: 5 });
    expect(constant.reverse).toBeUndefined();
    const piecewise = upgrade({
      type: "piecewise",
      reverse: true,
      piecewiseHeading: {
        segments: [
          {
            startProgress: 0,
            endProgress: 1,
            interpolationType: "constant",
            reversed: true,
            parameters: { degrees: 5 },
          },
        ],
      },
    });
    expect(piecewise.reverse).toBeUndefined();
    expect(
      (piecewise.segments as { reverse?: boolean }[])[0]!.reverse,
    ).toBeUndefined();
  });

  it("reads a line heading on a line with no end point", () => {
    // The Visualizer's compound paths keep their points on their segments.
    const compound = {
      id: "c",
      kind: "compound",
      heading: { type: "linear", startDeg: 0, endDeg: 90 },
    } as unknown as Line;
    expect(normalizeLineHeading(compound).endPoint).toMatchObject({
      heading: "linear",
      startDeg: 0,
      endDeg: 90,
    });
  });

  it("drops an older reverse left on the end point", () => {
    const line = {
      ...base,
      endPoint: { x: 1, y: 2, heading: "linear", reverse: true },
      heading: { type: "linear", startDeg: 0, endDeg: 90 },
    } as unknown as Line;
    expect(normalizeLineHeading(line).endPoint.reverse).toBeUndefined();
  });

  it("starts a segment that continues from the previous one where it ends", () => {
    const end = upgrade({
      type: "piecewise",
      piecewiseHeading: {
        segments: [
          {
            startProgress: 0,
            endProgress: 0.5,
            interpolationType: "tangential",
            reversed: true,
            continueFromPrevious: true,
          },
          {
            startProgress: 0.5,
            endProgress: 0.8,
            interpolationType: "linear",
            continueFromPrevious: true,
            parameters: { startDeg: 0, endDeg: 180 },
          },
          {
            startProgress: 0.8,
            endProgress: 1,
            interpolationType: "constant",
            continueFromPrevious: true,
            parameters: { degrees: 30 },
          },
        ],
      },
    });
    const [first, second, third] = end.segments as Record<string, unknown>[];
    // A blank (Prev) angle takes the heading the segment before ends at.
    expect(first).toMatchObject({ heading: "tangential", reverse: true });
    expect(second).toMatchObject({ heading: "linear", endDeg: 180 });
    expect(second!.startDeg).toBeUndefined();
    expect(third).toMatchObject({ heading: "constant" });
    expect(third!.degrees).toBeUndefined();
  });

  it("converts piecewise segments", () => {
    const end = upgrade({
      type: "piecewise",
      piecewiseHeading: {
        segments: [
          {
            startProgress: 0,
            endProgress: 0.5,
            interpolationType: "linear",
            reversed: true,
            parameters: { startDeg: 21, endDeg: -12 },
          },
          {
            startProgress: 0.5,
            endProgress: 1,
            interpolationType: "facing-point",
            parameters: { point: { x: 3, y: 4 } },
          },
        ],
      },
    });
    expect(end).toMatchObject({
      heading: "piecewise",
      segments: [
        {
          tStart: 0,
          tEnd: 0.5,
          heading: "linear",
          startDeg: 21,
          endDeg: -12,
          reverse: true,
        },
        {
          tStart: 0.5,
          tEnd: 1,
          heading: "facingPoint",
          targetX: 3,
          targetY: 4,
        },
      ],
    });
  });

  it("leaves headings stored on the end point alone", () => {
    const endPointLayout = {
      ...base,
      endPoint: { x: 1, y: 2, heading: "constant", degrees: 7 },
    } as unknown as Line;
    expect(normalizeLineHeading(endPointLayout)).toBe(endPointLayout);
    const start = {
      x: 0,
      y: 0,
      heading: "linear",
      startDeg: 1,
      endDeg: 2,
    } as Point;
    expect(normalizeStartPoint(start)).toBe(start);
  });

  it("turns headingDeg into a start heading", () => {
    expect(
      normalizeStartPoint({ x: 56, y: 8, headingDeg: 90 } as unknown as Point),
    ).toEqual({ x: 56, y: 8, heading: "linear", startDeg: 90, endDeg: 90 });
  });
});
