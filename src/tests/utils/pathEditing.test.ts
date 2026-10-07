// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  generateLinesFromDrawing,
  splitPathAtPercent,
} from "../../utils/pathEditing";
import type { Line, Point, SequenceItem } from "../../types";

describe("pathEditing", () => {
  describe("generateLinesFromDrawing", () => {
    it("should return null if less than 2 points", () => {
      expect(
        generateLinesFromDrawing([{ x: 0, y: 0 }], {} as any, [], []),
      ).toBeNull();
    });

    it("should generate bezier curves from drawing points", () => {
      const drawnPoints = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 100, y: 100 },
      ];
      const startPoint = {
        x: 0,
        y: 0,
        locked: false,
        heading: "tangential",
      } as Point;

      const result = generateLinesFromDrawing(drawnPoints, startPoint, [], []);
      expect(result).not.toBeNull();
      expect(result?.lines.length).toBeGreaterThan(0);
      expect(result?.sequence.length).toBeGreaterThan(0);
    });
  });

  describe("splitPathAtPercent", () => {
    it("should return null if time prediction is invalid", () => {
      expect(splitPathAtPercent(50, null as any, [], [])).toBeNull();
      expect(
        splitPathAtPercent(50, { totalTime: 0 } as any, [], []),
      ).toBeNull();
    });

    it("should split a line and sequence properly", () => {
      const timePrediction = {
        totalTime: 10,
        timeline: [
          {
            type: "travel", // <-- changed from "path" to "travel"
            startTime: 0,
            endTime: 10,
            lineIndex: 0,
            sequenceIndex: 0,
            duration: 10,
            prevPoint: { x: 0, y: 0 },
          },
        ],
      } as any;

      const lines = [
        {
          endPoint: { x: 100, y: 100 },
          controlPoints: [
            { x: 33, y: 33, locked: false },
            { x: 66, y: 66, locked: false },
          ],
          heading: 0,
          color: "red",
          locked: false,
          reversed: false,
          power: 1,
          eventMarkers: [],
        },
      ] as any[];

      const sequence = [
        {
          id: "seq1",
          kind: "path",
          lineIndices: [0],
        },
      ] as any[];

      const result = splitPathAtPercent(50, timePrediction, lines, sequence);

      expect(result).not.toBeNull();
      expect(result?.lines.length).toBe(2);
      expect(result?.sequence.length).toBe(2);
    });
  });
});

// --- Behaviour of the split and the freehand tool ---

const straightLine = (over: Partial<Line> = {}): Line => ({
  id: "L",
  endPoint: { x: 100, y: 0, heading: "tangential", reverse: false } as Point,
  controlPoints: [],
  color: "red",
  ...over,
});

const travelPrediction = (over: Record<string, unknown> = {}) =>
  ({
    totalTime: 10,
    timeline: [
      {
        type: "travel",
        startTime: 0,
        endTime: 10,
        lineIndex: 0,
        duration: 10,
        prevPoint: { x: 0, y: 0 },
        ...over,
      },
    ],
  }) as any;

const pathStep = (lineId: string): SequenceItem => ({ kind: "path", lineId });

describe("splitPathAtPercent", () => {
  it("splits a straight path where the robot is at that moment", () => {
    // Time is eased, so half way through the time is half way along the path.
    const result = splitPathAtPercent(
      50,
      travelPrediction(),
      [straightLine()],
      [pathStep("L")],
    )!;
    const [first, second] = result.lines;
    expect(first.endPoint.x).toBeCloseTo(50);
    expect(first.endPoint.y).toBeCloseTo(0);
    expect(second.endPoint.x).toBe(100);
    expect(result.splitIndex).toBe(0);
  });

  it("follows the motion profile when there is one", () => {
    // The robot reaches the first step at 8 s of 10, so 5 s in it has
    // covered 5/8 of one of the two steps: t = 0.3125.
    const result = splitPathAtPercent(
      50,
      travelPrediction({ motionProfile: [0, 8, 10] }),
      [straightLine()],
      [pathStep("L")],
    )!;
    expect(result.lines[0].endPoint.x).toBeCloseTo(31.25);
  });

  it("never splits exactly at either end", () => {
    const atStart = splitPathAtPercent(
      0,
      travelPrediction(),
      [straightLine()],
      [],
    )!;
    expect(atStart.lines[0].endPoint.x).toBeCloseTo(0.1, 1);
    const atEnd = splitPathAtPercent(
      100,
      travelPrediction(),
      [straightLine()],
      [],
    )!;
    expect(atEnd.lines[0].endPoint.x).toBeCloseTo(99.9, 1);
  });

  it("returns null when the robot isn't driving a known path", () => {
    const lines = [straightLine()];
    const wait = travelPrediction({ type: "wait" });
    expect(splitPathAtPercent(50, wait, lines, [])).toBeNull();
    expect(
      splitPathAtPercent(50, travelPrediction({ lineIndex: 7 }), lines, []),
    ).toBeNull();
    expect(
      splitPathAtPercent(
        50,
        travelPrediction({ prevPoint: undefined }),
        lines,
        [],
      ),
    ).toBeNull();
    expect(
      splitPathAtPercent(
        50,
        travelPrediction({ lineIndex: undefined }),
        lines,
        [],
      ),
    ).toBeNull();
    // A time outside every event.
    expect(splitPathAtPercent(150, travelPrediction(), lines, [])).toBeNull();
  });

  it("gives the second half the original id and puts a new first half before it", () => {
    const steps = [pathStep("other"), pathStep("L"), pathStep("after")];
    const result = splitPathAtPercent(
      50,
      travelPrediction(),
      [straightLine({ waitBeforeMs: 500, waitAfterMs: 700 })],
      steps,
    )!;
    const [first, second] = result.lines;
    expect(second.id).toBe("L");
    expect(first.id).toBeTruthy();
    expect(first.id).not.toBe("L");
    expect(result.sequence.map((s: any) => s.lineId)).toEqual([
      "other",
      first.id,
      "L",
      "after",
    ]);
    // Each wait stays on the side of the path it belongs to.
    expect(first).toMatchObject({ waitBeforeMs: 500, waitAfterMs: 0 });
    expect(second).toMatchObject({ waitBeforeMs: 0, waitAfterMs: 700 });
  });

  it("keeps a constant heading on the first half", () => {
    const line = straightLine({
      endPoint: { x: 100, y: 0, heading: "constant", degrees: 45 },
    });
    const [first, second] = splitPathAtPercent(
      50,
      travelPrediction(),
      [line],
      [],
    )!.lines;
    expect(first.endPoint).toMatchObject({ heading: "constant", degrees: 45 });
    expect(second.endPoint).toMatchObject({ heading: "constant", degrees: 45 });
  });

  it("splits a linear heading at the split point", () => {
    const line = straightLine({
      endPoint: {
        x: 100,
        y: 0,
        heading: "linear",
        startDeg: 0,
        endDeg: 90,
        locked: false,
      } as Point,
    });
    const [first, second] = splitPathAtPercent(
      50,
      travelPrediction(),
      [line],
      [],
    )!.lines;
    expect(first.endPoint).toMatchObject({
      heading: "linear",
      startDeg: 0,
      endDeg: 45,
    });
    expect(second.endPoint).toMatchObject({
      heading: "linear",
      startDeg: 45,
      endDeg: 90,
    });
  });

  it("keeps the direction of a reversed tangential path", () => {
    const line = straightLine({
      endPoint: { x: 100, y: 0, heading: "tangential", reverse: true } as Point,
    });
    const [first] = splitPathAtPercent(
      50,
      travelPrediction(),
      [line],
      [],
    )!.lines;
    expect(first.endPoint).toMatchObject({
      heading: "tangential",
      reverse: true,
    });
  });

  it("moves event markers to whichever half they fall on, rescaled", () => {
    const marker = (position: number) => ({
      id: `m${position}`,
      name: "m",
      position,
      parameters: [],
    });
    const line = straightLine({
      eventMarkers: [marker(0.25), marker(0.5), marker(0.75)],
    });
    const [first, second] = splitPathAtPercent(
      50,
      travelPrediction(),
      [line],
      [],
    )!.lines;
    expect(first.eventMarkers!.map((m) => m.position)).toEqual([0.5, 1]);
    expect(second.eventMarkers!.map((m) => m.position)).toEqual([0.5]);
  });

  it("divides a curve's control points between the halves", () => {
    const line = straightLine({
      endPoint: {
        x: 100,
        y: 0,
        heading: "tangential",
        reverse: false,
      } as Point,
      controlPoints: [{ x: 30, y: 40 } as Point, { x: 70, y: 40 } as Point],
    });
    const [first, second] = splitPathAtPercent(
      50,
      travelPrediction(),
      [line],
      [],
    )!.lines;
    expect(first.controlPoints).toHaveLength(2);
    expect(second.controlPoints).toHaveLength(2);
    // The curve is symmetric, so it splits at its top.
    expect(first.endPoint.x).toBeCloseTo(50);
    expect(first.endPoint.y).toBeCloseTo(30);
  });
});

describe("generateLinesFromDrawing", () => {
  const start: Point = {
    x: 0,
    y: 0,
    heading: "tangential",
    reverse: false,
  } as Point;
  const arc = (from: number, to: number, radius = 50, cx = 0, cy = 0) => {
    const points = [];
    for (let deg = from; deg <= to; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      points.push({
        x: cx + radius * Math.cos(rad),
        y: cy + radius * Math.sin(rad),
      });
    }
    return points;
  };

  it("draws a straight stroke as one line with no control points", () => {
    const stroke = [0, 10, 20, 30].map((x) => ({ x, y: 0 }));
    const result = generateLinesFromDrawing(stroke, start, [], [])!;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].controlPoints).toEqual([]);
    expect(result.lines[0].endPoint).toMatchObject({ x: 30, y: 0 });
    expect(result.sequence).toEqual([
      { kind: "path", lineId: result.lines[0].id },
    ]);
  });

  it("starts the path where the stroke starts when there is no path yet", () => {
    const stroke = [
      { x: 20, y: 30 },
      { x: 40, y: 30 },
      { x: 60, y: 30 },
    ];
    const result = generateLinesFromDrawing(stroke, start, [], [])!;
    expect(result.startPoint).toMatchObject({ x: 20, y: 30 });
  });

  it("curves a bent stroke with two control points per line", () => {
    const result = generateLinesFromDrawing(arc(0, 90), start, [], [])!;
    expect(result.lines.length).toBeGreaterThan(1);
    for (const line of result.lines) expect(line.controlPoints).toHaveLength(2);
    // The last line ends where the stroke does.
    expect(result.lines.at(-1)!.endPoint.x).toBeCloseTo(0, 5);
    expect(result.lines.at(-1)!.endPoint.y).toBeCloseTo(50, 5);
  });

  it("limits how many lines a wobbly stroke becomes", () => {
    const wobble = Array.from({ length: 120 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 3) * 4,
    }));
    const result = generateLinesFromDrawing(wobble, start, [], [], {
      drawToolTolerance: 0.1,
    })!;
    expect(result.lines.length).toBeLessThanOrEqual(11);
  });

  it("scales control point reach with the tension setting", () => {
    const reach = (drawToolTension: number) => {
      const { lines, startPoint } = generateLinesFromDrawing(
        arc(0, 90),
        start,
        [],
        [],
        { drawToolTolerance: 5, drawToolTension },
      )!;
      const cp = lines[0].controlPoints[0];
      return Math.hypot(cp.x - startPoint.x, cp.y - startPoint.y);
    };
    expect(reach(0.6) / reach(0.2)).toBeCloseTo(3);
  });

  it("continues an existing path, leaving its first curve heading the same way", () => {
    const existing = straightLine({
      id: "a",
      endPoint: { x: 50, y: 0, heading: "tangential", reverse: false } as Point,
      controlPoints: [{ x: 20, y: 0 } as Point],
    });
    // A quarter circle that begins at the end of the existing path.
    const stroke = arc(-90, 0, 50, 50, 50);
    const result = generateLinesFromDrawing(
      stroke,
      start,
      [existing],
      [pathStep("a")],
    )!;
    expect(result.lines[0]).toBe(existing);
    expect(result.sequence[0]).toEqual(pathStep("a"));
    expect(result.sequence.length).toBe(result.lines.length);

    const added = result.lines[1];
    // The path was heading east, so the new curve leaves east: its first
    // control point is level with the join, and further along.
    expect(added.controlPoints[0].y).toBeCloseTo(0);
    expect(added.controlPoints[0].x).toBeGreaterThan(50);
  });

  it("adds a connecting line when the stroke starts away from the path's end", () => {
    const existing = straightLine({ id: "a" });
    const stroke = [
      { x: 100, y: 40 },
      { x: 110, y: 40 },
      { x: 120, y: 40 },
    ];
    const result = generateLinesFromDrawing(stroke, start, [existing], [])!;
    // existing + connector from (100,0) to (100,40) + the stroke itself.
    expect(result.lines).toHaveLength(3);
    expect(result.lines[1].endPoint).toMatchObject({ x: 100, y: 40 });
  });

  it("doesn't add a tiny connector when the stroke starts at the path's end", () => {
    const existing = straightLine({ id: "a" });
    const stroke = [
      { x: 101, y: 0 },
      { x: 110, y: 0 },
      { x: 120, y: 0 },
    ];
    const result = generateLinesFromDrawing(stroke, start, [existing], [])!;
    expect(result.lines).toHaveLength(2);
    expect(result.lines[1].endPoint).toMatchObject({ x: 120, y: 0 });
  });

  it("uses the previous line's end when a path has a single line with no control points", () => {
    const existing = straightLine({ id: "a" });
    const stroke = arc(-90, 0, 50, 100, 50); // starts at (100, 0)
    const result = generateLinesFromDrawing(stroke, start, [existing], [])!;
    // Heading east from the start point (0,0) to (100,0).
    expect(result.lines[1].controlPoints[0].y).toBeCloseTo(0);
  });
});
