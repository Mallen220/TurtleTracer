// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// A reversed linear heading turns the long way round. Pedro calls that
// `Interpolator.longLinear`; its `.reverse()` instead adds 180° to the heading.
import { describe, it, expect } from "vitest";
import blueton from "./fixtures/Blueton.turt.json";
import { linearHeadingSweep } from "../utils/math";
import { normalizeLines } from "../lib/projectStore";
import { normalizeStartPoint } from "../utils/ppFormat";
import { generateJavaCode } from "../lib/exporters/javaExporter";
import { readPedroJava } from "../utils/javaImporter/pedroReader";
import { splitPathAtPercent } from "../utils/pathEditing";
import { calculatePathTime } from "../utils/timeCalculator";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Line, Point, SequenceItem, Settings } from "../types";

describe("linearHeadingSweep", () => {
  // Measured from Pedro core 3.0.2's Interpolator.linear and longLinear.
  it.each([
    [180, 270, 90, -270],
    [270, 180, -90, 270],
    [0, 90, 90, -270],
    [350, 10, 20, -340],
    [10, 350, -20, 340],
    [0, 180, -180, -180],
    [180, 0, -180, -180],
    [90, 270, -180, -180],
    [45, 45, 0, -360],
  ])("%d° to %d° turns %d°, or %d° the long way", (from, to, short, long) => {
    expect(linearHeadingSweep(from, to)).toBe(short);
    expect(linearHeadingSweep(from, to, true)).toBe(long);
  });
});

describe("exporting a reversed linear heading", () => {
  const start = { x: 0, y: 0, heading: "constant", degrees: 180 } as Point;
  const pathTo = (endPoint: Partial<Point>): Line => ({
    id: "L",
    name: "Turn",
    endPoint: { x: 40, y: 0, ...endPoint } as Point,
    controlPoints: [],
    color: "red",
  });
  const longWay = pathTo({
    heading: "linear",
    startDeg: 180,
    endDeg: 270,
    reverse: true,
  });

  it("writes longLinear, which turns the way the field shows", async () => {
    const code = await generateJavaCode(start, [longWay], true);
    expect(code).toContain(
      "Interpolator.longLinear(Math.toRadians(180), Math.toRadians(270))",
    );
    expect(code).not.toContain(".reverse()");
  });

  it("reads back as the same heading", async () => {
    const code = await generateJavaCode(start, [longWay], true);
    expect(readPedroJava(code).project.lines[0]!.endPoint).toMatchObject({
      heading: "linear",
      startDeg: 180,
      endDeg: 270,
      reverse: true,
    });
  });

  it("does not reverse a piecewise heading as a whole", async () => {
    // The app can't show or edit a piecewise-wide reverse, and doesn't
    // simulate one, so the robot shouldn't act on it either.
    const code = await generateJavaCode(
      start,
      [
        pathTo({
          heading: "piecewise",
          reverse: true,
          segments: [
            { tStart: 0, tEnd: 0.5, heading: "tangential", reverse: true },
            { tStart: 0.5, tEnd: 1, heading: "constant", degrees: 90 },
          ],
        } as Partial<Point>),
      ],
      true,
    );
    expect(code).toContain("Interpolator.tangent.reverse()");
    expect(code).not.toMatch(/\n\s*\.reverse\(\)\)/);
  });
});

// Blueton keeps its headings on the line, as the Pedro Visualizer writes
// them, so it's read the way that reads them: reverse only on tangents and
// non-constant piecewise segments, and the hive path's last segment carrying
// on from where the reversed tangent before it ends.
describe("Blueton, read as the Pedro Visualizer reads it", () => {
  const lines = normalizeLines(blueton.lines as unknown as Line[]);
  const start = normalizeStartPoint(blueton.startPoint as unknown as Point);
  const sequence = blueton.sequence as SequenceItem[];
  const byName = (name: string) => lines.find((l) => l.name === name)!;

  it("ignores reverse where the Visualizer does", () => {
    expect(byName("RunToFlower").endPoint).toMatchObject({
      heading: "linear",
      startDeg: 180,
      endDeg: 270,
    });
    expect(byName("ReturnFromFlower").endPoint).toMatchObject({
      heading: "linear",
      startDeg: 270,
      endDeg: 180,
    });
    expect(byName("Park").endPoint).toMatchObject({
      heading: "constant",
      degrees: 180,
    });
    for (const name of ["RunToFlower", "ReturnFromFlower", "Park"]) {
      expect(byName(name).endPoint.reverse, name).toBeFalsy();
    }
    const hive = byName("TravelThroughHive").endPoint as Point & {
      segments: Record<string, unknown>[];
    };
    expect(hive.reverse).toBeFalsy();
    expect(hive.segments.map((s) => [s.heading, !!s.reverse])).toEqual([
      ["constant", false],
      ["tangential", true],
      ["linear", false],
    ]);
    // Continues from the previous segment: a Prev start.
    expect(hive.segments[2]!.startDeg).toBeUndefined();
    expect(hive.segments[2]!.endDeg).toBe(180);
  });

  it("exports short turns, the hive's last one starting where the tangent ends", async () => {
    const code = await generateJavaCode(start, lines, true, sequence);
    expect(code).toContain(".linear(Math.toRadians(180), Math.toRadians(270))");
    expect(code).toContain(".linear(Math.toRadians(270), Math.toRadians(180))");
    expect(code).toContain(".constant(Math.toRadians(180))");
    expect(code).toMatch(
      /\.until\(\s*1,\s*Interpolator\.linear\(\s*Math\.toRadians\(89\.7\d*\),\s*Math\.toRadians\(180\)\s*\)/,
    );
    expect(code).not.toContain("longLinear");
  });

  it("reaches each path's end heading, turning the short way", () => {
    // The team's measured speeds; turning is left at the default 100°/s.
    const settings = {
      ...DEFAULT_SETTINGS,
      xVelocity: 61,
      yVelocity: 48,
      maxVelocity: 61,
      translationalP: 0.2,
    } as Settings;
    const travel = calculatePathTime(
      start,
      lines,
      settings,
      sequence,
    ).timeline.filter((e) => e.type === "travel");
    const ends = travel.map((e) => {
      const h = e.headingProfile!.at(-1)!;
      return Math.round(((h % 360) + 360) % 360);
    });
    expect(ends).toEqual([0, 180, 270, 180, 180]);
    // 180° to 270° counter-clockwise, then back clockwise. Pedro lets go of
    // each path a little short of its heading, so a turn is up to 11.25°
    // more than the path itself asks for.
    const turn = (i: number) =>
      travel[i]!.headingProfile!.at(-1)! - travel[i]!.headingProfile![0]!;
    expect(turn(2)).toBeGreaterThanOrEqual(90);
    expect(turn(2)).toBeLessThan(90 + 11.25);
    expect(turn(3)).toBeLessThan(-90 + 11.25);
    expect(turn(3)).toBeGreaterThan(-90 - 11.25);
  });
});

describe("reading reversed headings from code", () => {
  const read = (heading: string) =>
    readPedroJava(`
      class Auto {
        Pose a = new Pose(0, 0, 0);
        Pose b = new Pose(40, 0, 0);
        Path p = line(a, b).heading(${heading});
        void start() { follower.follow(p); }
      }
    `).project.lines[0]!.endPoint;

  it("reads longLinear as a reversed linear heading", () => {
    expect(
      read("Interpolator.longLinear(Math.toRadians(180), Math.toRadians(270))"),
    ).toMatchObject({
      heading: "linear",
      startDeg: 180,
      endDeg: 270,
      reverse: true,
    });
  });

  it("reads linear(...).reverse() as the short turn, facing the other way", () => {
    const h = read(
      "Interpolator.linear(Math.toRadians(180), Math.toRadians(270)).reverse()",
    );
    expect(h).toMatchObject({ heading: "linear", startDeg: 0, endDeg: 90 });
    expect(h.reverse).toBeFalsy();
  });

  it("keeps the reverse on a piecewise segment", () => {
    expect(
      read(
        "Interpolator.piecewise().until(0.5, Interpolator.tangent.reverse()).until(1, Interpolator.longLinear(0, Math.PI))",
      ),
    ).toMatchObject({
      heading: "piecewise",
      segments: [
        { tStart: 0, tEnd: 0.5, heading: "tangential", reverse: true },
        { tStart: 0.5, tEnd: 1, heading: "linear", reverse: true },
      ],
    });
  });

  it("turns each segment round when a whole piecewise heading is reversed", () => {
    const h = read(
      "Interpolator.piecewise().until(0.5, Interpolator.tangent).until(1, Interpolator.linear(0, Math.PI / 2)).reverse()",
    ) as Point & { segments: Record<string, unknown>[] };
    expect(h.segments[0]).toMatchObject({
      heading: "tangential",
      reverse: true,
    });
    expect(h.segments[1]).toMatchObject({
      heading: "linear",
      startDeg: 180,
      endDeg: -90,
    });
    expect(h.segments[1]!.reverse).toBeFalsy();
  });
});

describe("splitting a reversed linear heading", () => {
  it("keeps turning the long way round", () => {
    const line: Line = {
      id: "L",
      endPoint: {
        x: 100,
        y: 0,
        heading: "linear",
        startDeg: 180,
        endDeg: 270,
        reverse: true,
      } as Point,
      controlPoints: [],
      color: "red",
    };
    const prediction = {
      totalTime: 10,
      timeline: [
        {
          type: "travel",
          startTime: 0,
          endTime: 10,
          lineIndex: 0,
          duration: 10,
          prevPoint: { x: 0, y: 0 },
        },
      ],
    } as any;
    // Eased time: 25% of the way through is 12.5% along the path.
    const [first, second] = splitPathAtPercent(
      25,
      prediction,
      [line],
      [{ kind: "path", lineId: "L" }],
    )!.lines;
    const a = first!.endPoint as Point & { startDeg: number; endDeg: number };
    const b = second!.endPoint as Point & { startDeg: number; endDeg: number };
    expect(a.endDeg).toBeCloseTo(180 - 270 * 0.125);
    expect(b.startDeg).toBeCloseTo(a.endDeg);
    // 33.75° then 236.25°, together the original 270° clockwise.
    const total =
      linearHeadingSweep(a.startDeg, a.endDeg, a.reverse) +
      linearHeadingSweep(b.startDeg, b.endDeg, b.reverse);
    expect(total).toBeCloseTo(-270);
  });
});
