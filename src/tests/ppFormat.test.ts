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
    expect(
      upgrade({ type: "constant", reverse: true, degrees: 5 }),
    ).toMatchObject({
      heading: "constant",
      degrees: 5,
      reverse: true,
    });
    expect(upgrade({ type: "tangential", reverse: false })).toMatchObject({
      heading: "tangential",
    });
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
